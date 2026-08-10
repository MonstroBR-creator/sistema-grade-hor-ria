/**
 * SERVER.JS — API REST (Express + SQLite) e servidor de arquivos estáticos.
 * Sistema de Gestão de Grade Horária (CEEBJA / EJA)
 * Desenvolvido por RASM Tecnologia
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const banco = require('./db');
const {
  PERFIS_ATRIBUIVEIS,
  PERFIS_GESTAO_USUARIOS,
  PERFIS_EDICAO_GRADE,
  gerarHashSenha,
  conferirSenha,
  gerarToken,
  autenticar,
  exigirPerfil,
  tentativasExcedidas,
  registrarFalha,
  limparTentativas
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');

const DIAS_VALIDOS = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA'];
const AULAS_VALIDAS = [1, 2, 3, 4, 5];

/** Contas que nunca podem ser excluídas pela interface. */
const USUARIOS_PROTEGIDOS = [banco.USUARIO_MESTRE.usuario, 'monstro', 'monstrobr', 'rasmadmin'];

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(FRONTEND_PATH));

/* ==========================================
   UTILITÁRIOS
   ========================================== */

/** Envolve handlers async para que qualquer rejeição caia no tratador de erros. */
const rota = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const soNumeros = (valor) => String(valor ?? '').replace(/\D/g, '');

const paraInteiro = (valor) => {
  const n = Number.parseInt(valor, 10);
  return Number.isInteger(n) ? n : null;
};

/**
 * Detecta violação de unicidade nos dois bancos:
 *   SQLite  → "UNIQUE constraint failed: usuarios.usuario"
 *   Postgres→ "duplicate key value violates unique constraint ..." (código 23505)
 * Comparar com includes('UNIQUE') só funcionava no SQLite: em produção o
 * cadastro duplicado viraria erro 500 em vez de uma mensagem clara.
 */
const ehViolacaoDeUnicidade = (err) =>
  err?.code === '23505' || /unique|duplicate key/i.test(String(err?.message || ''));

/* ==========================================
   1. AUTENTICAÇÃO E LOGIN
   ========================================== */

app.post(
  '/api/login',
  rota(async (req, res) => {
    const { identificador, senha } = req.body || {};

    if (!identificador || !senha) {
      return res.status(400).json({ sucesso: false, mensagem: 'Preencha Usuário/CPF e Senha.' });
    }

    if (tentativasExcedidas(req, identificador)) {
      return res.status(429).json({
        sucesso: false,
        mensagem: 'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.'
      });
    }

    const termoLimpo = String(identificador).trim().toLowerCase();
    const cpfDigitado = soNumeros(termoLimpo);

    // A consulta anterior comparava o texto digitado com a coluna cpf mesmo quando
    // ele não era numérico, o que podia casar a conta errada. Agora a cláusula de
    // CPF só entra quando o identificador realmente contém dígitos.
    const usuario = cpfDigitado
      ? await banco.buscarUm(
          `SELECT id, nome, cpf, usuario, senha_hash, perfil
             FROM usuarios
            WHERE LOWER(usuario) = ? OR (cpf IS NOT NULL AND cpf <> '' AND cpf = ?)
            LIMIT 1`,
          [termoLimpo, cpfDigitado]
        )
      : await banco.buscarUm(
          `SELECT id, nome, cpf, usuario, senha_hash, perfil
             FROM usuarios
            WHERE LOWER(usuario) = ?
            LIMIT 1`,
          [termoLimpo]
        );

    const resultado = usuario
      ? conferirSenha(senha, usuario.senha_hash)
      : { valida: false, legado: false };

    if (!usuario || !resultado.valida) {
      registrarFalha(req, identificador);
      return res.status(401).json({ sucesso: false, mensagem: 'Usuário/CPF ou senha incorretos.' });
    }

    // Migração transparente: contas antigas guardavam a senha em texto puro na
    // coluna `senha_hash`. No primeiro login válido ela vira um hash bcrypt.
    if (resultado.legado) {
      await banco.executar(`UPDATE usuarios SET senha_hash = ? WHERE id = ?`, [
        gerarHashSenha(senha),
        usuario.id
      ]);
      console.log(`🔐 Senha do usuário "${usuario.usuario}" migrada para hash bcrypt.`);
    }

    limparTentativas(req, identificador);

    const dadosPublicos = {
      id: usuario.id,
      nome: usuario.nome,
      usuario: usuario.usuario,
      perfil: usuario.perfil
    };

    return res.json({
      sucesso: true,
      mensagem: 'Acesso autorizado!',
      token: gerarToken(dadosPublicos),
      usuario: dadosPublicos
    });
  })
);

/** Confere se o token ainda é válido (usado pelo front para expirar a sessão). */
app.get('/api/sessao', autenticar, (req, res) => {
  res.json({
    sucesso: true,
    usuario: {
      id: req.usuario.id,
      nome: req.usuario.nome,
      usuario: req.usuario.usuario,
      perfil: req.usuario.perfil
    }
  });
});

/* ==========================================
   2. GESTÃO DE USUÁRIOS (CRUD)
   ========================================== */

const somenteGestores = [autenticar, exigirPerfil(PERFIS_GESTAO_USUARIOS)];

app.get(
  '/api/usuarios',
  somenteGestores,
  rota(async (req, res) => {
    const linhas = await banco.buscarTodos(
      `SELECT id, nome, usuario, cpf, perfil, criado_em FROM usuarios ORDER BY id DESC`
    );
    res.json(linhas);
  })
);

app.post(
  '/api/usuarios',
  somenteGestores,
  rota(async (req, res) => {
    const { nome, usuario, cpf, senha_hash: senha, perfil } = req.body || {};

    if (!nome || !usuario || !senha) {
      return res
        .status(400)
        .json({ sucesso: false, mensagem: 'Nome, usuário e senha são obrigatórios.' });
    }

    const senhaTexto = String(senha).trim();
    if (senhaTexto.length < 6) {
      return res
        .status(400)
        .json({ sucesso: false, mensagem: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const nomeLimpo = String(nome).trim();
    const usuarioLimpo = String(usuario).trim().toLowerCase();

    if (!/^[a-z0-9._-]{3,50}$/.test(usuarioLimpo)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'O login deve ter de 3 a 50 caracteres, usando apenas letras, números, ponto, hífen ou underline.'
      });
    }

    const cpfLimpo = soNumeros(cpf) || null;
    if (cpfLimpo && cpfLimpo.length !== 11) {
      return res.status(400).json({ sucesso: false, mensagem: 'O CPF deve conter 11 dígitos.' });
    }

    const perfilLimpo = String(perfil || 'USUARIO').trim().toUpperCase();

    // O perfil MESTRE não é atribuível: existe uma única conta mestre, criada na
    // instalação do sistema.
    if (!PERFIS_ATRIBUIVEIS.includes(perfilLimpo)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: `Perfil inválido. Escolha um entre: ${PERFIS_ATRIBUIVEIS.join(', ')}.`
      });
    }

    try {
      const resultado = await banco.inserir(
        `INSERT INTO usuarios (nome, usuario, cpf, senha_hash, perfil, criado_em)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [nomeLimpo, usuarioLimpo, cpfLimpo, gerarHashSenha(senhaTexto), perfilLimpo]
      );

      res.status(201).json({
        sucesso: true,
        mensagem: 'Usuário cadastrado com sucesso!',
        id: resultado.id
      });
    } catch (err) {
      if (ehViolacaoDeUnicidade(err)) {
        return res
          .status(409)
          .json({ sucesso: false, mensagem: 'Nome de usuário ou CPF já cadastrado.' });
      }
      throw err;
    }
  })
);

app.delete(
  '/api/usuarios/:id',
  somenteGestores,
  rota(async (req, res) => {
    const id = paraInteiro(req.params.id);
    if (id === null) {
      return res.status(400).json({ sucesso: false, mensagem: 'Identificador inválido.' });
    }

    const alvo = await banco.buscarUm(`SELECT id, usuario, perfil FROM usuarios WHERE id = ?`, [id]);
    if (!alvo) {
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado.' });
    }

    if (USUARIOS_PROTEGIDOS.includes(String(alvo.usuario).toLowerCase())) {
      return res.status(403).json({
        sucesso: false,
        mensagem: `Ação negada: o usuário administrador geral (${alvo.usuario}) é protegido!`
      });
    }

    if (Number(alvo.id) === Number(req.usuario.id)) {
      return res
        .status(403)
        .json({ sucesso: false, mensagem: 'Você não pode excluir a própria conta enquanto está conectado.' });
    }

    // Impede que o sistema fique sem nenhuma conta capaz de gerenciar acessos.
    if (PERFIS_GESTAO_USUARIOS.includes(String(alvo.perfil).toUpperCase())) {
      const marcadores = PERFIS_GESTAO_USUARIOS.map(() => '?').join(', ');
      const { total } = await banco.buscarUm(
        `SELECT COUNT(*) AS total FROM usuarios WHERE UPPER(perfil) IN (${marcadores})`,
        PERFIS_GESTAO_USUARIOS
      );
      if (Number(total) <= 1) {
        return res.status(403).json({
          sucesso: false,
          mensagem: 'Esta é a última conta com permissão de gestão e não pode ser excluída.'
        });
      }
    }

    await banco.executar(`DELETE FROM usuarios WHERE id = ?`, [id]);
    res.json({ sucesso: true, mensagem: 'Usuário excluído com sucesso!' });
  })
);

/* ==========================================
   3. CONSULTAS DA GRADE HORÁRIA E ALOCAÇÕES
   ========================================== */

app.get(
  '/api/turmas',
  autenticar,
  rota(async (req, res) => {
    // As rotas de consulta ignoravam o parâmetro `err` do callback e devolviam
    // sempre `[]` — uma falha de banco aparecia na tela como "nenhuma turma".
    // LOWER() em vez de COLLATE NOCASE: o PostgreSQL não conhece essa colação.
    const linhas = await banco.buscarTodos(
      `SELECT t.id, t.nome_descricao, tu.codigo AS turno_codigo, tu.nome AS turno_nome
         FROM turmas t
         JOIN turnos tu ON t.turno_id = tu.id
        ORDER BY LOWER(t.nome_descricao) ASC`
    );
    res.json(linhas);
  })
);

app.get(
  '/api/alocacoes',
  autenticar,
  rota(async (req, res) => {
    const turmaId = paraInteiro(req.query.turma_id);

    const sql = `
      SELECT a.id AS alocacao_id, a.turma_id, d.nome AS disciplina_nome,
             COALESCE(p.nome, 'A DEFINIR') AS professor_nome, a.tipo
        FROM alocacoes a
        JOIN disciplinas d ON a.disciplina_id = d.id
        LEFT JOIN professores p ON a.professor_id = p.id
       ${turmaId !== null ? 'WHERE a.turma_id = ?' : ''}
       ORDER BY LOWER(d.nome) ASC
    `;

    res.json(await banco.buscarTodos(sql, turmaId !== null ? [turmaId] : []));
  })
);

app.get(
  '/api/grade',
  autenticar,
  rota(async (req, res) => {
    // O turno vem junto porque a detecção de choque de horário depende dele:
    // "1ª aula" é 07:50 na manhã, 13:30 na tarde e 18:15 na noite.
    const linhas = await banco.buscarTodos(
      `SELECT g.id, g.turma_id, g.dia_semana, g.num_aula, g.alocacao_id,
              d.nome AS disciplina_nome, COALESCE(p.nome, 'A DEFINIR') AS professor_nome, a.tipo,
              tu.codigo AS turno_codigo, tu.nome AS turno_nome
         FROM grade_horaria g
         JOIN alocacoes a ON g.alocacao_id = a.id
         JOIN disciplinas d ON a.disciplina_id = d.id
         JOIN turmas t ON g.turma_id = t.id
         JOIN turnos tu ON t.turno_id = tu.id
         LEFT JOIN professores p ON a.professor_id = p.id`
    );
    res.json(linhas);
  })
);

/** Valida e normaliza a posição (turma, dia, aula) recebida do cliente. */
function lerPosicao(origem) {
  const turmaId = paraInteiro(origem.turma_id);
  const numAula = paraInteiro(origem.num_aula);
  const diaSemana = String(origem.dia_semana || '').trim().toUpperCase();

  if (turmaId === null) return { erro: 'Turma inválida.' };
  if (!DIAS_VALIDOS.includes(diaSemana)) return { erro: `Dia da semana inválido: "${diaSemana}".` };
  if (!AULAS_VALIDAS.includes(numAula)) return { erro: `Número de aula inválido: "${origem.num_aula}".` };

  return { turmaId, diaSemana, numAula };
}

app.post(
  '/api/grade',
  autenticar,
  exigirPerfil(PERFIS_EDICAO_GRADE),
  rota(async (req, res) => {
    const posicao = lerPosicao(req.body || {});
    if (posicao.erro) return res.status(400).json({ sucesso: false, mensagem: posicao.erro });

    const alocacaoId = paraInteiro((req.body || {}).alocacao_id);
    if (alocacaoId === null) {
      return res.status(400).json({ sucesso: false, mensagem: 'Alocação inválida.' });
    }

    // Impede gravar na grade de uma turma uma disciplina que pertence a outra.
    const alocacao = await banco.buscarUm(
      `SELECT a.id, a.turma_id, COALESCE(p.nome, 'A DEFINIR') AS professor_nome
         FROM alocacoes a
         LEFT JOIN professores p ON a.professor_id = p.id
        WHERE a.id = ?`,
      [alocacaoId]
    );

    if (!alocacao) {
      return res.status(404).json({ sucesso: false, mensagem: 'Alocação não encontrada.' });
    }

    if (Number(alocacao.turma_id) !== posicao.turmaId) {
      return res
        .status(400)
        .json({ sucesso: false, mensagem: 'Esta disciplina não pertence à turma selecionada.' });
    }

    await banco.executar(
      `INSERT INTO grade_horaria (turma_id, dia_semana, num_aula, alocacao_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(turma_id, dia_semana, num_aula)
       DO UPDATE SET alocacao_id = excluded.alocacao_id`,
      [posicao.turmaId, posicao.diaSemana, posicao.numAula, alocacaoId]
    );

    // Aviso (não bloqueante) de choque de horário do mesmo professor em outra turma.
    let conflito = null;
    if (alocacao.professor_nome !== 'A DEFINIR') {
      // Só é choque de verdade se for no MESMO turno: a 1ª aula da manhã e a 1ª
      // da noite são horários diferentes.
      conflito = await banco.buscarUm(
        `SELECT t.nome_descricao AS turma, tu.nome AS turno
           FROM grade_horaria g
           JOIN alocacoes a ON g.alocacao_id = a.id
           JOIN turmas t ON g.turma_id = t.id
           JOIN turnos tu ON t.turno_id = tu.id
          WHERE a.professor_id = (SELECT professor_id FROM alocacoes WHERE id = ?)
            AND g.dia_semana = ? AND g.num_aula = ? AND g.turma_id <> ?
            AND t.turno_id = (SELECT turno_id FROM turmas WHERE id = ?)
          LIMIT 1`,
        [alocacaoId, posicao.diaSemana, posicao.numAula, posicao.turmaId, posicao.turmaId]
      );
    }

    res.json({
      sucesso: true,
      mensagem: 'Aula gravada na grade.',
      conflito: conflito
        ? { professor: alocacao.professor_nome, turma: conflito.turma }
        : null
    });
  })
);

app.delete(
  '/api/grade',
  autenticar,
  exigirPerfil(PERFIS_EDICAO_GRADE),
  rota(async (req, res) => {
    // Aceita os dados no corpo (comportamento original) ou na query string, já que
    // alguns proxies descartam o corpo de requisições DELETE.
    const origem = Object.keys(req.body || {}).length ? req.body : req.query;
    const posicao = lerPosicao(origem);
    if (posicao.erro) return res.status(400).json({ sucesso: false, mensagem: posicao.erro });

    const resultado = await banco.executar(
      `DELETE FROM grade_horaria WHERE turma_id = ? AND dia_semana = ? AND num_aula = ?`,
      [posicao.turmaId, posicao.diaSemana, posicao.numAula]
    );

    res.json({
      sucesso: true,
      mensagem: resultado.changes > 0 ? 'Aula removida.' : 'Nenhuma aula nesta posição.',
      removidos: resultado.changes
    });
  })
);

/* ==========================================
   4. ROTAS DE PÁGINAS E TRATAMENTO DE ERROS
   ========================================== */

const enviarPagina = (arquivo) => (req, res) => res.sendFile(path.join(FRONTEND_PATH, arquivo));

app.get(['/', '/index.html'], enviarPagina('index.html'));
app.get(['/login', '/login.html'], enviarPagina('login.html'));
app.get(['/usuarios', '/usuarios.html'], enviarPagina('usuarios.html'));

// Rota de API inexistente responde JSON (antes devolvia a página HTML de erro do
// Express, quebrando o `await response.json()` do front).
app.use('/api', (req, res) => {
  res.status(404).json({ sucesso: false, mensagem: 'Rota de API não encontrada.' });
});

app.use((req, res) => res.status(404).sendFile(path.join(FRONTEND_PATH, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ sucesso: false, mensagem: 'Erro interno no servidor.' });
});

/* ==========================================
   5. INICIALIZAÇÃO
   ========================================== */

/**
 * Num banco recém-criado (o caso de todo primeiro deploy no Render) não há
 * turmas, e a tela abriria vazia. Aqui a planilha é carregada automaticamente.
 * A checagem por turmas existentes garante que isto NUNCA sobrescreve dados já
 * gravados — para recarregar de propósito, use `npm run importar`.
 */
async function importarSeVazio() {
  if (process.env.IMPORTAR_NO_STARTUP === 'false') return;

  const { importar, PLANILHA_PADRAO } = require('./importar');

  if ((await banco.contarTurmas()) > 0) return;

  if (!fs.existsSync(PLANILHA_PADRAO)) {
    console.warn('⚠️  Banco vazio e planilha não encontrada — cadastre as turmas manualmente.');
    return;
  }

  console.log('📥 Banco vazio: importando a planilha de professores...');
  try {
    await importar(banco, { caminho: PLANILHA_PADRAO });
  } catch (erro) {
    // Falhar a importação não deve impedir o login e a gestão de usuários.
    console.error('⚠️  Falha ao importar a planilha:', erro.message);
  }
}

banco
  .inicializar()
  .then(importarSeVazio)
  .then(() => {
    const servidor = app.listen(PORT, () => {
      console.log(`🚀 Servidor RASM Tecnologia rodando em http://localhost:${PORT}`);
    });

    const encerrar = async () => {
      console.log('\n🛑 Encerrando servidor...');
      servidor.close();
      await banco.fechar();
      process.exit(0);
    };

    process.on('SIGINT', encerrar);
    process.on('SIGTERM', encerrar);
  })
  .catch((err) => {
    // Sem banco não há sistema: falhar cedo é melhor do que aceitar requisições
    // que darão erro uma a uma.
    console.error('❌ Falha ao inicializar o banco de dados:', err.message);
    process.exit(1);
  });

module.exports = app;

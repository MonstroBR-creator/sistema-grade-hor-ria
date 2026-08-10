/**
 * IMPORTAR.JS — Carga da planilha de professores para o banco.
 *
 * Substitui o antigo backend/import_excel.py: o ambiente Node do Render não tem
 * Python nem pandas, então a importação precisava rodar em Node para funcionar
 * também em produção. Funciona igual em SQLite e PostgreSQL.
 *
 *   node backend/importar.js                 # recarrega o acervo acadêmico
 *   node backend/importar.js --reset         # apaga TAMBÉM as contas de acesso
 *   node backend/importar.js --inspecionar   # só analisa a planilha, não grava
 *   node backend/importar.js --arquivo X.xlsx
 */

'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const PLANILHA_PADRAO = path.join(__dirname, 'data', 'professores.xlsx');

const COLUNAS_OBRIGATORIAS = ['TURMA DESCRITA', 'DISCIPLINA', 'TURMA', 'NOME SUPRIDO'];

/** Tabelas recarregadas a cada importação, na ordem que respeita as chaves estrangeiras. */
const TABELAS_ACADEMICAS = ['grade_horaria', 'alocacoes', 'turmas', 'disciplinas', 'professores'];

const VAZIOS = new Set(['', 'NAN', 'NONE', 'NULL', '-', 'UNDEFINED']);

/**
 * Nas turmas semipresenciais cada disciplina rende, além do card com o
 * professor, mais um de tutoria e um de EAD — que não têm docente atribuído.
 */
const MODALIDADES_SEMIPRESENCIAL = ['TUTORIA', 'EAD'];

/* ==========================================
   LEITURA DA PLANILHA
   ========================================== */

const texto = (valor) => {
  const limpo = String(valor ?? '').trim();
  return VAZIOS.has(limpo.toUpperCase()) ? '' : limpo;
};

/**
 * Lê a planilha normalizando os cabeçalhos.
 * A coluna real chama-se "TURMA " (com espaço no fim) — sem essa normalização,
 * a leitura falha silenciosamente, que foi exatamente o bug da versão anterior.
 */
function lerPlanilha(caminho) {
  if (!fs.existsSync(caminho)) throw new Error(`Planilha não encontrada em ${caminho}`);

  const pasta = XLSX.readFile(caminho);
  const aba = pasta.Sheets[pasta.SheetNames[0]];
  const brutas = XLSX.utils.sheet_to_json(aba, { defval: '' });

  if (!brutas.length) throw new Error('A planilha está vazia.');

  const original = Object.keys(brutas[0]);
  const mapa = new Map(original.map((c) => [c, String(c).trim().toUpperCase()]));

  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => ![...mapa.values()].includes(c));
  if (faltando.length) {
    throw new Error(
      `A planilha não possui as colunas obrigatórias: ${faltando.join(', ')}.\n` +
        `Colunas encontradas: ${original.map((c) => JSON.stringify(c)).join(', ')}`
    );
  }

  const linhas = brutas.map((linha) => {
    const normalizada = {};
    for (const [chave, valor] of Object.entries(linha)) normalizada[mapa.get(chave)] = valor;
    return normalizada;
  });

  return { linhas, colunasOriginais: original };
}

/* ==========================================
   CLASSIFICAÇÃO
   ========================================== */

function codigoDoTurno(descricao, letra) {
  const d = descricao.toUpperCase();
  if (d.includes('NOITE')) return 'C';
  if (d.includes('TARDE')) return 'B';
  if (d.includes('MANHÃ') || d.includes('MANHA')) return 'A';
  if (['A', 'B', 'C'].includes(letra.toUpperCase())) return letra.toUpperCase();
  return 'A';
}

function tipoDaTurma(descricao) {
  const d = descricao.toUpperCase();
  if (d.includes('SEMIPRESENCIAL')) return 'SEMIPRESENCIAL';
  if (d.includes('TUTORIA')) return 'TUTORIA';
  return 'PRESENCIAL';
}

/* ==========================================
   IMPORTAÇÃO
   ========================================== */

async function limparTudo(banco) {
  const alvos = [...TABELAS_ACADEMICAS, 'usuarios'];

  if (banco.dialeto === 'postgres') {
    await banco.executar(`TRUNCATE ${alvos.join(', ')} RESTART IDENTITY CASCADE`);
  } else {
    for (const tabela of alvos) {
      await banco.executar(`DELETE FROM ${tabela}`);
      await banco.executar(`DELETE FROM sqlite_sequence WHERE name = ?`, [tabela]);
    }
  }
}

/** Insere se não existir e devolve o id, guardando em cache para não repetir consultas. */
function criarResolvedor(banco, tabela, coluna, cache) {
  return async (valor) => {
    if (cache.has(valor)) return cache.get(valor);

    await banco.executar(
      `INSERT INTO ${tabela} (${coluna}) VALUES (?) ON CONFLICT (${coluna}) DO NOTHING`,
      [valor]
    );
    const linha = await banco.buscarUm(`SELECT id FROM ${tabela} WHERE ${coluna} = ?`, [valor]);

    cache.set(valor, linha.id);
    return linha.id;
  };
}

const chaveAlocacao = (turmaId, disciplinaId, professorId, tipo) =>
  `${turmaId}|${disciplinaId}|${professorId ?? '-'}|${tipo}`;

/**
 * Reimportação NÃO destrutiva.
 *
 * A versão anterior apagava todas as tabelas acadêmicas e recarregava, o que
 * levava junto a grade já montada (grade_horaria aponta para alocacoes com
 * ON DELETE CASCADE). Na prática, atualizar a planilha custava todo o trabalho
 * de montagem do horário.
 *
 * Agora a planilha é comparada com o que já está no banco: o que continua igual
 * mantém o mesmo id — e portanto a aula seguem posicionada na grade. Só é
 * removido o que realmente saiu da planilha.
 */
async function importar(banco, { caminho = PLANILHA_PADRAO, resetTotal = false, silencioso = false } = {}) {
  const registrar = silencioso ? () => {} : (...a) => console.log(...a);

  const { linhas } = lerPlanilha(caminho);
  registrar(`📄 ${linhas.length} linha(s) lida(s) de ${path.basename(caminho)}.`);

  return banco.transacao(async () => {
    if (resetTotal) {
      await limparTudo(banco);
      // Sem isto o sistema ficava sem NENHUMA conta de acesso até o próximo
      // start do servidor — ninguém conseguia entrar depois de um --reset.
      if (typeof banco.garantirContaMestre === 'function') await banco.garantirContaMestre();
      registrar('🧹 Banco reiniciado por completo; conta mestre recriada.');
    }

    const turnos = await banco.buscarTodos(`SELECT id, codigo FROM turnos`);
    const turnoPorCodigo = new Map(turnos.map((t) => [t.codigo, t.id]));

    const cacheTurmas = new Map();
    const cacheDisciplinas = new Map();
    const cacheProfessores = new Map();

    const resolverDisciplina = criarResolvedor(banco, 'disciplinas', 'nome', cacheDisciplinas);
    const resolverProfessor = criarResolvedor(banco, 'professores', 'nome', cacheProfessores);

    let ignoradas = 0;
    let duplicadas = 0;

    /* ---------- 1. O que a planilha pede ---------- */
    const desejadas = new Map();
    const linhasVistas = new Set();

    for (const linha of linhas) {
      const descricao = texto(linha['TURMA DESCRITA']);
      const disciplina = texto(linha.DISCIPLINA);
      const letra = texto(linha.TURMA);
      const professor = texto(linha['NOME SUPRIDO']);

      if (!descricao || !disciplina) {
        ignoradas += 1;
        continue;
      }

      const nomeTurma = letra ? `${descricao} (Turma ${letra})` : descricao;

      if (!cacheTurmas.has(nomeTurma)) {
        const turnoId = turnoPorCodigo.get(codigoDoTurno(descricao, letra)) || turnos[0].id;
        await banco.executar(
          `INSERT INTO turmas (nome_descricao, turno_id) VALUES (?, ?)
           ON CONFLICT (nome_descricao) DO NOTHING`,
          [nomeTurma, turnoId]
        );
        const t = await banco.buscarUm(`SELECT id FROM turmas WHERE nome_descricao = ?`, [nomeTurma]);
        cacheTurmas.set(nomeTurma, t.id);
      }
      const turmaId = cacheTurmas.get(nomeTurma);
      const disciplinaId = await resolverDisciplina(disciplina);
      const professorId =
        professor && professor.toUpperCase() !== 'A DEFINIR' ? await resolverProfessor(professor) : null;

      // Linha repetida na planilha: conta uma vez só.
      const chaveLinha = `${turmaId}|${disciplinaId}|${professorId ?? '-'}`;
      if (linhasVistas.has(chaveLinha)) {
        duplicadas += 1;
        continue;
      }
      linhasVistas.add(chaveLinha);

      const tipoTurma = tipoDaTurma(descricao);

      // Cada disciplina rende um card com o professor e, nas turmas
      // semipresenciais, mais um de TUTORIA e um de EAD — sem professor.
      const variantes = [{ professorId, tipo: tipoTurma }];
      if (tipoTurma === 'SEMIPRESENCIAL') {
        for (const modalidade of MODALIDADES_SEMIPRESENCIAL) {
          variantes.push({ professorId: null, tipo: modalidade });
        }
      }

      for (const v of variantes) {
        desejadas.set(chaveAlocacao(turmaId, disciplinaId, v.professorId, v.tipo), {
          turmaId,
          disciplinaId,
          professorId: v.professorId,
          tipo: v.tipo
        });
      }
    }

    /* ---------- 2. O que já existe ---------- */
    const existentes = await banco.buscarTodos(
      `SELECT id, turma_id, disciplina_id, professor_id, tipo FROM alocacoes`
    );
    const porChave = new Map(
      existentes.map((a) => [chaveAlocacao(a.turma_id, a.disciplina_id, a.professor_id, a.tipo), a.id])
    );

    /* ---------- 3. Insere o que falta ---------- */
    let inseridas = 0;
    let mantidas = 0;

    for (const [chave, a] of desejadas) {
      if (porChave.has(chave)) {
        mantidas += 1;
        continue;
      }
      await banco.executar(
        `INSERT INTO alocacoes (turma_id, disciplina_id, professor_id, tipo) VALUES (?, ?, ?, ?)`,
        [a.turmaId, a.disciplinaId, a.professorId, a.tipo]
      );
      inseridas += 1;
    }

    /* ---------- 4. Remove só o que saiu da planilha ---------- */
    const obsoletas = [...porChave].filter(([chave]) => !desejadas.has(chave)).map(([, id]) => id);
    let aulasPerdidas = 0;

    if (obsoletas.length) {
      const marcadores = obsoletas.map(() => '?').join(', ');
      const { total } = await banco.buscarUm(
        `SELECT COUNT(*) AS total FROM grade_horaria WHERE alocacao_id IN (${marcadores})`,
        obsoletas
      );
      aulasPerdidas = Number(total);
      await banco.executar(`DELETE FROM alocacoes WHERE id IN (${marcadores})`, obsoletas);
    }

    // Turmas que sumiram da planilha, e cadastros que ficaram sem uso.
    const idsTurmas = [...cacheTurmas.values()];
    let turmasRemovidas = 0;
    if (idsTurmas.length) {
      const marcadores = idsTurmas.map(() => '?').join(', ');
      const r = await banco.executar(`DELETE FROM turmas WHERE id NOT IN (${marcadores})`, idsTurmas);
      turmasRemovidas = r.changes || 0;
    }
    await banco.executar(
      `DELETE FROM disciplinas WHERE id NOT IN (SELECT DISTINCT disciplina_id FROM alocacoes)`
    );
    await banco.executar(
      `DELETE FROM professores WHERE id NOT IN
         (SELECT DISTINCT professor_id FROM alocacoes WHERE professor_id IS NOT NULL)`
    );

    /* ---------- 5. Resumo ---------- */
    const contar = async (tabela) =>
      Number((await banco.buscarUm(`SELECT COUNT(*) AS total FROM ${tabela}`)).total);

    const resumo = {
      turmas: await contar('turmas'),
      disciplinas: await contar('disciplinas'),
      professores: await contar('professores'),
      alocacoes: await contar('alocacoes'),
      inseridas,
      mantidas,
      removidas: obsoletas.length,
      turmasRemovidas,
      aulasPerdidas,
      ignoradas,
      duplicadas
    };

    registrar('✅ Importação concluída.');
    registrar(`   • Turmas .......... ${resumo.turmas}`);
    registrar(`   • Disciplinas ..... ${resumo.disciplinas}`);
    registrar(`   • Professores ..... ${resumo.professores}`);
    registrar(`   • Alocações ....... ${resumo.alocacoes}  (${inseridas} novas, ${mantidas} mantidas, ${obsoletas.length} removidas)`);
    if (turmasRemovidas) registrar(`   • Turmas removidas (fora da planilha): ${turmasRemovidas}`);
    if (aulasPerdidas) registrar(`   ⚠️  Aulas que saíram da grade junto com alocações removidas: ${aulasPerdidas}`);
    if (ignoradas) registrar(`   • Linhas ignoradas (sem turma/disciplina): ${ignoradas}`);
    if (duplicadas) registrar(`   • Linhas duplicadas descartadas: ${duplicadas}`);

    return resumo;
  });
}

/* ==========================================
   INSPEÇÃO (substitui o debug_excel.py)
   ========================================== */

function inspecionar(caminho) {
  console.log('='.repeat(72));
  console.log(`ARQUIVO ......... ${caminho}`);

  const pasta = XLSX.readFile(caminho);
  const brutas = XLSX.utils.sheet_to_json(pasta.Sheets[pasta.SheetNames[0]], { defval: '' });
  console.log(`LINHAS .......... ${brutas.length}`);
  console.log('='.repeat(72));

  console.log('\nCOLUNAS (entre aspas, para revelar espaços invisíveis):');
  for (const coluna of Object.keys(brutas[0] || {})) {
    const normalizada = String(coluna).trim().toUpperCase();
    const marca = normalizada !== coluna ? '   ⚠️ espaço sobrando ou caixa divergente' : '';
    console.log(`  ${JSON.stringify(coluna).padEnd(24)} → ${JSON.stringify(normalizada)}${marca}`);
  }

  const { linhas } = lerPlanilha(caminho);
  console.log('\n✅ Todas as colunas obrigatórias estão presentes.');

  const porTurma = new Map();
  for (const l of linhas) {
    const chave = `${texto(l['TURMA DESCRITA'])} (Turma ${texto(l.TURMA)})`;
    porTurma.set(chave, (porTurma.get(chave) || 0) + 1);
  }

  console.log(`\nTURMAS ENCONTRADAS: ${porTurma.size}`);
  for (const [nome, total] of [...porTurma].sort()) {
    console.log(`  ${nome}  →  ${total} disciplina(s)`);
  }

  const semProfessor = linhas.filter((l) => texto(l['NOME SUPRIDO']).toUpperCase() === 'A DEFINIR').length;
  console.log(`\nLinhas sem professor definido: ${semProfessor}`);
}

/* ==========================================
   CLI
   ========================================== */

async function principal() {
  const args = process.argv.slice(2);
  const indiceArquivo = args.indexOf('--arquivo');
  const caminho = indiceArquivo >= 0 ? args[indiceArquivo + 1] : PLANILHA_PADRAO;

  if (args.includes('--inspecionar')) {
    inspecionar(caminho);
    return;
  }

  const banco = require('./db');
  await banco.inicializar();
  await importar(banco, { caminho, resetTotal: args.includes('--reset') });
  await banco.fechar();
}

if (require.main === module) {
  principal().catch((erro) => {
    console.error(`❌ ${erro.message}`);
    process.exit(1);
  });
}

module.exports = { importar, inspecionar, lerPlanilha, PLANILHA_PADRAO };

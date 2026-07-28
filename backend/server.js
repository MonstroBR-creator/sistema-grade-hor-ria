/**
 * SERVER.JS - API REST Express / SQLite, Servidor Estático e Gestão de Usuários
 * Caminho do arquivo: backend/server.js
 */

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'ceebja_chave_secreta_super_segura_2026';

// Middlewares Globais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do Front-end
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_PATH));

// Conexão com o banco de dados SQLite
const DB_PATH = path.join(__dirname, 'database', 'grade_horaria.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('⚡ Conectado ao banco SQLite em:', DB_PATH);
  }
});

/* ==========================================================================
   ROTA DE AUTENTICAÇÃO (LOGIN)
   ========================================================================== */

app.post('/api/login', (req, res) => {
  const { identificador, senha } = req.body;

  if (!identificador || !senha) {
    return res.status(400).json({ sucesso: false, mensagem: 'Preencha o Usuário/CPF e a Senha.' });
  }

  const termoLimpo = String(identificador).trim().toLowerCase();
  const cpfApenasNumeros = termoLimpo.replace(/\D/g, '');

  const query = `
    SELECT id, nome, cpf, usuario, senha_hash, perfil 
    FROM usuarios 
    WHERE LOWER(usuario) = ? OR cpf = ? OR (cpf IS NOT NULL AND cpf != '' AND cpf = ?)
  `;
  
  db.get(query, [termoLimpo, termoLimpo, cpfApenasNumeros], (err, usuario) => {
    if (err) {
      console.error('❌ Erro na consulta de login:', err.message);
      return res.status(500).json({ sucesso: false, mensagem: 'Erro interno no banco de dados.' });
    }

    if (!usuario || usuario.senha_hash !== String(senha).trim()) {
      return res.status(401).json({ sucesso: false, mensagem: 'Usuário/CPF ou senha incorretos.' });
    }

    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome, usuario: usuario.usuario, perfil: usuario.perfil },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Login realizado com sucesso!',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        usuario: usuario.usuario,
        perfil: usuario.perfil
      }
    });
  });
});

/* ==========================================================================
   ROTAS DE GESTÃO DE USUÁRIOS
   ========================================================================== */

// GET /api/usuarios - Listar todos os usuários
app.get('/api/usuarios', (req, res) => {
  const query = `SELECT id, nome, cpf, usuario, perfil FROM usuarios ORDER BY id ASC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows || []);
  });
});

// POST /api/usuarios - Cadastrar novo usuário
app.post('/api/usuarios', (req, res) => {
  const { nome, cpf, usuario, senha, perfil } = req.body;

  if (!nome || !usuario || !senha) {
    return res.status(400).json({ mensagem: 'Preencha Nome, Usuário e Senha obrigatoriamente.' });
  }

  const userLimpo = String(usuario).trim().toLowerCase();
  const cpfLimpo = cpf ? String(cpf).replace(/\D/g, '') : null;
  const perfilFinal = perfil ? String(perfil).toUpperCase() : 'PEDAGOGIA';

  const sql = `
    INSERT INTO usuarios (nome, cpf, usuario, senha_hash, perfil)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [nome, cpfLimpo, userLimpo, senha, perfilFinal], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ mensagem: 'Usuário ou CPF já cadastrado no sistema.' });
      }
      return res.status(500).json({ mensagem: err.message });
    }
    res.status(201).json({ mensagem: 'Usuário criado com sucesso!', id: this.lastID });
  });
});

// DELETE /api/usuarios/:id - Remover usuário
app.delete('/api/usuarios/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!id) return res.status(400).json({ mensagem: 'ID inválido.' });

  db.run(`DELETE FROM usuarios WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ mensagem: err.message });
    res.status(200).json({ mensagem: 'Usuário removido com sucesso!' });
  });
});

/* ==========================================================================
   ROTAS DA API REST DE GRADE E TURMAS
   ========================================================================== */

app.get('/api/turmas', (req, res) => {
  const query = `
    SELECT 
      t.id, 
      t.nome_descricao, 
      tu.codigo AS turno_codigo, 
      tu.nome AS turno_nome 
    FROM turmas t
    JOIN turnos tu ON t.turno_id = tu.id
    ORDER BY tu.codigo ASC, t.nome_descricao ASC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });

    const turmasFormatadas = (rows || []).map(turma => {
      const nome = turma.nome_descricao.toUpperCase();
      let nivel = 'OUTROS';
      if (nome.includes('FUNDAMENTAL') || nome.includes('FUND')) nivel = 'ENSINO FUNDAMENTAL';
      else if (nome.includes('MÉDIO') || nome.includes('MEDIO') || nome.includes('MED')) nivel = 'ENSINO MÉDIO';

      let moduloNum = 999;
      const matchModulo = nome.match(/MÓDULO\s*(\d+)|MODULO\s*(\d+)|MÓD\.\s*(\d+)|MOD\.\s*(\d+)/i);
      if (matchModulo) moduloNum = parseInt(matchModulo[1] || matchModulo[2] || matchModulo[3] || matchModulo[4], 10);

      return { ...turma, nivel, moduloNum };
    });

    turmasFormatadas.sort((a, b) => {
      if (a.turno_codigo !== b.turno_codigo) return a.turno_codigo.localeCompare(b.turno_codigo);
      if (a.nivel !== b.nivel) return a.nivel.localeCompare(b.nivel);
      if (a.moduloNum !== b.moduloNum) return a.moduloNum - b.moduloNum;
      return a.nome_descricao.localeCompare(b.nome_descricao);
    });

    res.json(turmasFormatadas);
  });
});

app.get('/api/alocacoes', (req, res) => {
  const query = `
    SELECT 
      a.id AS alocacao_id,
      a.turma_id,
      d.nome AS disciplina_nome,
      COALESCE(p.nome, 'A DEFINIR') AS professor_nome,
      a.tipo
    FROM alocacoes a
    LEFT JOIN disciplinas d ON a.disciplina_id = d.id
    LEFT JOIN professores p ON a.professor_id = p.id
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows || []);
  });
});

app.get('/api/grade', (req, res) => {
  const query = `
    SELECT 
      g.id,
      g.turma_id,
      g.dia_semana,
      g.num_aula,
      g.alocacao_id,
      d.nome AS disciplina_nome,
      COALESCE(p.nome, 'A DEFINIR') AS professor_nome,
      a.tipo
    FROM grade_horaria g
    JOIN alocacoes a ON g.alocacao_id = a.id
    JOIN disciplinas d ON a.disciplina_id = d.id
    LEFT JOIN professores p ON a.professor_id = p.id
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows || []);
  });
});

app.post('/api/grade', (req, res) => {
  const { turma_id, dia_semana, num_aula, alocacao_id } = req.body;
  if (!turma_id || !dia_semana || !num_aula || !alocacao_id) {
    return res.status(400).json({ mensagem: 'Parâmetros incompletos.' });
  }

  const sql = `
    INSERT INTO grade_horaria (turma_id, dia_semana, num_aula, alocacao_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(turma_id, dia_semana, num_aula) 
    DO UPDATE SET alocacao_id = excluded.alocacao_id
  `;

  db.run(sql, [turma_id, dia_semana, num_aula, alocacao_id], function(err) {
    if (err) return res.status(500).json({ mensagem: err.message });
    res.status(200).json({ mensagem: 'Sucesso', id: this.lastID });
  });
});

app.delete('/api/grade', (req, res) => {
  const { turma_id, dia_semana, num_aula } = req.body;
  if (!turma_id || !dia_semana || isNaN(num_aula)) {
    return res.status(400).json({ mensagem: 'Parâmetros inválidos.' });
  }

  const sql = `
    DELETE FROM grade_horaria 
    WHERE turma_id = ? AND dia_semana = ? AND num_aula = ?
  `;

  db.run(sql, [turma_id, dia_semana, num_aula], function(err) {
    if (err) return res.status(500).json({ mensagem: err.message });
    res.status(200).json({ mensagem: 'Aula removida com sucesso' });
  });
});

app.get('/login', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'login.html')));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
});
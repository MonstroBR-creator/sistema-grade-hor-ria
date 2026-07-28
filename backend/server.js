/**
 * SERVER.JS - API REST Express / SQLite e Servidor Estático
 * Arquitetura: Clean Code / REST API
 * Desenvolvido por Monstro Tecnologias
 */

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'ceebja_chave_secreta_super_segura_2026';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servidor de arquivos estáticos da pasta frontend
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_PATH));

// Conexão com o Banco SQLite
const DB_PATH = path.join(__dirname, 'database', 'grade_horaria.db');

// Garante que o diretório database exista
if (!fs.existsSync(path.join(__dirname, 'database'))) {
  fs.mkdirSync(path.join(__dirname, 'database'), { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar no SQLite:', err.message);
  } else {
    console.log('⚡ Conectado ao banco SQLite em:', DB_PATH);
    garantirTabelaUsuarios();
  }
});

db.run('PRAGMA foreign_keys = ON;');

/**
 * Garante a criação da tabela de usuários se ela ainda não existir no banco
 */
function garantirTabelaUsuarios() {
  const sql = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      usuario TEXT UNIQUE NOT NULL,
      cpf TEXT UNIQUE,
      senha_hash TEXT NOT NULL,
      perfil TEXT DEFAULT 'USUARIO',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  db.run(sql, (err) => {
    if (err) console.error('⚠️ Erro ao validar tabela usuarios:', err.message);
    else console.log('✅ Tabela "usuarios" pronta para uso.');
  });
}

/* ==========================================
   1. AUTENTICAÇÃO E LOGIN
   ========================================== */

app.post('/api/login', (req, res) => {
  const { identificador, senha } = req.body;

  if (!identificador || !senha) {
    return res.status(400).json({ sucesso: false, mensagem: 'Preencha Usuário/CPF e Senha.' });
  }

  const termoLimpo = String(identificador).trim().toLowerCase();
  const cpfApenasNumeros = termoLimpo.replace(/\D/g, '');

  const query = `
    SELECT id, nome, cpf, usuario, senha_hash, perfil 
    FROM usuarios 
    WHERE LOWER(usuario) = ? OR cpf = ? OR (cpf IS NOT NULL AND cpf != '' AND cpf = ?)
  `;
  
  db.get(query, [termoLimpo, termoLimpo, cpfApenasNumeros], (err, usuario) => {
    if (err) return res.status(500).json({ sucesso: false, mensagem: 'Erro interno no banco de dados.' });

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
      mensagem: 'Sucesso!',
      token,
      usuario: { id: usuario.id, nome: usuario.nome, usuario: usuario.usuario, perfil: usuario.perfil }
    });
  });
});

/* ==========================================
   2. GESTÃO DE USUÁRIOS (CRUD)
   ========================================== */

// Listar todos os usuários
app.get('/api/usuarios', (req, res) => {
  const query = `SELECT id, nome, usuario, cpf, perfil, criado_em FROM usuarios ORDER BY id DESC`;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Erro na consulta /api/usuarios:', err.message);
      return res.status(500).json({ sucesso: false, mensagem: err.message });
    }
    res.json(rows || []);
  });
});

// Cadastrar novo usuário
app.post('/api/usuarios', (req, res) => {
  const { nome, usuario, cpf, senha_hash, perfil } = req.body;

  if (!nome || !usuario || !senha_hash) {
    return res.status(400).json({ sucesso: false, mensagem: 'Nome, usuário e senha são obrigatórios.' });
  }

  const userLimpo = String(usuario).trim().toLowerCase();
  const cpfLimpo = (cpf && String(cpf).trim() !== '') ? String(cpf).replace(/\D/g, '') : null;

  const sql = `
    INSERT INTO usuarios (nome, usuario, cpf, senha_hash, perfil)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [nome.trim(), userLimpo, cpfLimpo, senha_hash.trim(), perfil || 'USUARIO'], function(err) {
    if (err) {
      console.error('❌ Erro ao inserir usuário:', err.message);
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nome de usuário ou CPF já cadastrado.' });
      }
      return res.status(500).json({ sucesso: false, mensagem: err.message });
    }
    res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado com sucesso!', id: this.lastID });
  });
});

// Excluir usuário pelo ID
app.delete('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;

  const sql = `DELETE FROM usuarios WHERE id = ?`;
  db.run(sql, [id], function(err) {
    if (err) return res.status(500).json({ sucesso: false, mensagem: err.message });
    if (this.changes === 0) {
      return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado.' });
    }
    res.json({ sucesso: true, mensagem: 'Usuário excluído com sucesso!' });
  });
});

/* ==========================================
   3. CONSULTAS DA GRADE HORÁRIA E ALOCAÇÕES
   ========================================== */

app.get('/api/turmas', (req, res) => {
  const query = `
    SELECT t.id, t.nome_descricao, tu.codigo AS turno_codigo, tu.nome AS turno_nome 
    FROM turmas t JOIN turnos tu ON t.turno_id = tu.id ORDER BY t.id ASC
  `;
  db.all(query, [], (err, rows) => res.json(rows || []));
});

app.get('/api/alocacoes', (req, res) => {
  const query = `
    SELECT a.id AS alocacao_id, a.turma_id, d.nome AS disciplina_nome, COALESCE(p.nome, 'A DEFINIR') AS professor_nome, a.tipo
    FROM alocacoes a
    LEFT JOIN disciplinas d ON a.disciplina_id = d.id
    LEFT JOIN professores p ON a.professor_id = p.id
  `;
  db.all(query, [], (err, rows) => res.json(rows || []));
});

app.get('/api/alocacoes/:turmaId', (req, res) => {
  const { turmaId } = req.params;
  const query = `
    SELECT a.id AS alocacao_id, a.turma_id, d.nome AS disciplina_nome, COALESCE(p.nome, 'A DEFINIR') AS professor_nome, a.tipo
    FROM alocacoes a
    LEFT JOIN disciplinas d ON a.disciplina_id = d.id
    LEFT JOIN professores p ON a.professor_id = p.id
    WHERE a.turma_id = ?
  `;
  db.all(query, [turmaId], (err, rows) => res.json(rows || []));
});

app.get('/api/grade', (req, res) => {
  const query = `
    SELECT g.id, g.turma_id, g.dia_semana, g.num_aula, g.alocacao_id, d.nome AS disciplina_nome, COALESCE(p.nome, 'A DEFINIR') AS professor_nome, a.tipo
    FROM grade_horaria g
    JOIN alocacoes a ON g.alocacao_id = a.id
    JOIN disciplinas d ON a.disciplina_id = d.id
    LEFT JOIN professores p ON a.professor_id = p.id
  `;
  db.all(query, [], (err, rows) => res.json(rows || []));
});

app.post('/api/grade', (req, res) => {
  const { turma_id, dia_semana, num_aula, alocacao_id } = req.body;
  const sql = `
    INSERT INTO grade_horaria (turma_id, dia_semana, num_aula, alocacao_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(turma_id, dia_semana, num_aula) DO UPDATE SET alocacao_id = excluded.alocacao_id
  `;
  db.run(sql, [turma_id, dia_semana, num_aula, alocacao_id], function(err) {
    if (err) return res.status(500).json({ mensagem: err.message });
    res.status(200).json({ mensagem: 'Sucesso', id: this.lastID });
  });
});

app.delete('/api/grade', (req, res) => {
  const { turma_id, dia_semana, num_aula } = req.body;
  const sql = `DELETE FROM grade_horaria WHERE turma_id = ? AND dia_semana = ? AND num_aula = ?`;
  db.run(sql, [turma_id, dia_semana, num_aula], function(err) {
    if (err) return res.status(500).json({ mensagem: err.message });
    res.status(200).json({ mensagem: 'Aula removida' });
  });
});

/* ==========================================
   4. ROTAS DE PÁGINAS E NAVEGAÇÃO
   ========================================== */

app.get('/login', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'login.html')));

app.get('/usuarios', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'usuarios.html')));
app.get('/usuarios.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'usuarios.html')));

app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 Servidor Monstro Tecnologias rodando na porta: ${PORT}`);
});
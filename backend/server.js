/**
 * SERVER.JS - API REST Express / PostgreSQL (Com fallback SQLite local)
 * Arquitetura: Clean Code / REST API Persistente
 * Desenvolvido por RASM Tecnologia
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ceebja_chave_secreta_super_segura_2026';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_PATH));

/* ==========================================
   CONFIGURAÇÃO DE BANCO DE DADOS (POSTGRES / SQLITE)
   ========================================== */

const DATABASE_URL = process.env.DATABASE_URL;
let isPostgres = false;
let pgPool = null;
let sqliteDb = null;

if (DATABASE_URL) {
  // Conexão PostgreSQL Persistente (Produção no Render)
  isPostgres = true;
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('⚡ Conectado ao banco POSTGRESQL (Dados Persistentes Ativados!)');
  garantirEstruturaPostgres();
} else {
  // Fallback SQLite (Apenas para Testes Locais)
  console.log('⚠️ Rodando com SQLite Local (Uso em Desenvolvimento)');
  const DB_PATH = path.join(__dirname, 'database', 'grade_horaria.db');
  if (!fs.existsSync(path.join(__dirname, 'database'))) {
    fs.mkdirSync(path.join(__dirname, 'database'), { recursive: true });
  }
  sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
    if (!err) garantirEstruturaSqlite();
  });
}

// Executor universal de queries
async function executarQuery(sql, params = []) {
  if (isPostgres) {
    // Converte sintaxe de parâmetro de ? para $1, $2 (Requisito do Postgres)
    let contador = 1;
    const sqlPostgres = sql.replace(/\?/g, () => `$${contador++}`);
    const res = await pgPool.query(sqlPostgres, params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        sqliteDb.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
      } else {
        sqliteDb.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  }
}

/* ==========================================
   MIGRATIONS E ESTRUTURA DO BANCO
   ========================================== */

async function garantirEstruturaPostgres() {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        usuario VARCHAR(100) UNIQUE NOT NULL,
        cpf VARCHAR(20) UNIQUE,
        senha_hash VARCHAR(255) NOT NULL,
        perfil VARCHAR(50) DEFAULT 'USUARIO',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS turmas (
        id SERIAL PRIMARY KEY,
        nome_descricao VARCHAR(255) NOT NULL,
        turno_id INT
      );

      CREATE TABLE IF NOT EXISTS alocacoes (
        id SERIAL PRIMARY KEY,
        turma_id INT,
        disciplina_id INT,
        professor_id INT,
        tipo VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS grade_horaria (
        id SERIAL PRIMARY KEY,
        turma_id INT NOT NULL,
        dia_semana INT NOT NULL,
        num_aula INT NOT NULL,
        alocacao_id INT NOT NULL,
        CONSTRAINT uq_grade UNIQUE(turma_id, dia_semana, num_aula)
      );
    `);
    console.log('✅ Tabelas no PostgreSQL validadas com sucesso!');
    await povoarUsuariosIniciais();
  } catch (err) {
    console.error('❌ Erro ao criar estrutura no Postgres:', err.message);
  }
}

function garantirEstruturaSqlite() {
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
  sqliteDb.run(sql, () => povoarUsuariosIniciais());
}

async function povoarUsuariosIniciais() {
  const usuarios = [
    ['Administrador Geral (Monstro)', 'monstro', '11111111111', 'monstro2026', 'ADMINISTRADOR'],
    ['Administrador do Sistema', 'admin', '00000000000', 'admin123', 'ADMINISTRADOR'],
    ['Equipe Pedagógica', 'pedagogico', '22222222222', 'pedagogico123', 'PEDAGOGICO'],
    ['Visualizador (Somente Leitura)', 'consulta', '33333333333', 'consulta123', 'CONSULTA']
  ];

  for (const u of usuarios) {
    try {
      if (isPostgres) {
        await pgPool.query(
          `INSERT INTO usuarios (nome, usuario, cpf, senha_hash, perfil) 
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (usuario) DO NOTHING`,
          u
        );
      } else {
        sqliteDb.run(
          `INSERT OR IGNORE INTO usuarios (nome, usuario, cpf, senha_hash, perfil) VALUES (?, ?, ?, ?, ?)`,
          u
        );
      }
    } catch (e) {
      // Ignora duplicados no arranque
    }
  }
  console.log('🌱 Usuários base carregados/verificados.');
}

/* ==========================================
   1. AUTENTICAÇÃO E LOGIN
   ========================================== */

app.post('/api/login', async (req, res) => {
  const { identificador, senha } = req.body;
  if (!identificador || !senha) {
    return res.status(400).json({ sucesso: false, mensagem: 'Preencha Usuário/CPF e Senha.' });
  }

  const termoLimpo = String(identificador).trim().toLowerCase();
  const cpfApenasNumeros = termoLimpo.replace(/\D/g, '');

  try {
    const rows = await executarQuery(
      `SELECT id, nome, cpf, usuario, senha_hash, perfil 
       FROM usuarios 
       WHERE LOWER(usuario) = ? OR cpf = ? OR (cpf IS NOT NULL AND cpf != '' AND cpf = ?)`,
      [termoLimpo, termoLimpo, cpfApenasNumeros]
    );

    const usuario = rows[0];
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
  } catch (err) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno no banco.' });
  }
});

/* ==========================================
   2. GESTÃO DE USUÁRIOS
   ========================================== */

app.get('/api/usuarios', async (req, res) => {
  try {
    const rows = await executarQuery(`SELECT id, nome, usuario, cpf, perfil FROM usuarios ORDER BY id DESC`);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ sucesso: false, mensagem: err.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  const { nome, usuario, cpf, senha_hash, perfil } = req.body;
  if (!nome || !usuario || !senha_hash) {
    return res.status(400).json({ sucesso: false, mensagem: 'Nome, usuário e senha são obrigatórios.' });
  }

  const userLimpo = String(usuario).trim().toLowerCase();
  const cpfLimpo = cpf && String(cpf).trim() !== '' ? String(cpf).replace(/\D/g, '') : null;

  try {
    await executarQuery(
      `INSERT INTO usuarios (nome, usuario, cpf, senha_hash, perfil) VALUES (?, ?, ?, ?, ?)`,
      [nome.trim(), userLimpo, cpfLimpo, senha_hash.trim(), perfil || 'USUARIO']
    );
    res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado com sucesso!' });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique')) {
      return res.status(400).json({ sucesso: false, mensagem: 'Nome de usuário ou CPF já cadastrado.' });
    }
    res.status(500).json({ sucesso: false, mensagem: err.message });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await executarQuery(`SELECT usuario FROM usuarios WHERE id = ?`, [id]);
    const u = rows[0];

    if (!u) return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado.' });

    const PROTECTED_USERS = ['monstro', 'monstrobr', 'rasmadmin'];
    if (PROTECTED_USERS.includes(u.usuario.toLowerCase())) {
      return res.status(403).json({
        sucesso: false,
        mensagem: `Ação negada: O usuário administrador (${u.usuario}) é protegido!`
      });
    }

    await executarQuery(`DELETE FROM usuarios WHERE id = ?`, [id]);
    res.json({ sucesso: true, mensagem: 'Usuário excluído com sucesso!' });
  } catch (err) {
    res.status(500).json({ sucesso: false, mensagem: err.message });
  }
});

/* ==========================================
   3. OPERAÇÕES DA GRADE HORÁRIA
   ========================================== */

app.get('/api/turmas', async (req, res) => {
  try {
    const rows = await executarQuery(`
      SELECT t.id, t.nome_descricao, tu.codigo AS turno_codigo, tu.nome AS turno_nome 
      FROM turmas t JOIN turnos tu ON t.turno_id = tu.id ORDER BY t.id ASC
    `);
    res.json(rows || []);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/alocacoes', async (req, res) => {
  try {
    const rows = await executarQuery(`
      SELECT a.id AS alocacao_id, a.turma_id, d.nome AS disciplina_nome, COALESCE(p.nome, 'A DEFINIR') AS professor_nome, a.tipo
      FROM alocacoes a
      LEFT JOIN disciplinas d ON a.disciplina_id = d.id
      LEFT JOIN professores p ON a.professor_id = p.id
    `);
    res.json(rows || []);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/grade', async (req, res) => {
  try {
    const rows = await executarQuery(`
      SELECT g.id, g.turma_id, g.dia_semana, g.num_aula, g.alocacao_id, d.nome AS disciplina_nome, COALESCE(p.nome, 'A DEFINIR') AS professor_nome, a.tipo
      FROM grade_horaria g
      JOIN alocacoes a ON g.alocacao_id = a.id
      JOIN disciplinas d ON a.disciplina_id = d.id
      LEFT JOIN professores p ON a.professor_id = p.id
    `);
    res.json(rows || []);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/grade', async (req, res) => {
  const { turma_id, dia_semana, num_aula, alocacao_id } = req.body;
  try {
    if (isPostgres) {
      await executarQuery(
        `INSERT INTO grade_horaria (turma_id, dia_semana, num_aula, alocacao_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (turma_id, dia_semana, num_aula) DO UPDATE SET alocacao_id = EXCLUDED.alocacao_id`,
        [turma_id, dia_semana, num_aula, alocacao_id]
      );
    } else {
      await executarQuery(
        `INSERT INTO grade_horaria (turma_id, dia_semana, num_aula, alocacao_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(turma_id, dia_semana, num_aula) DO UPDATE SET alocacao_id = excluded.alocacao_id`,
        [turma_id, dia_semana, num_aula, alocacao_id]
      );
    }
    res.status(200).json({ mensagem: 'Sucesso' });
  } catch (err) {
    res.status(500).json({ mensagem: err.message });
  }
});

app.delete('/api/grade', async (req, res) => {
  const { turma_id, dia_semana, num_aula } = req.body;
  try {
    await executarQuery(`DELETE FROM grade_horaria WHERE turma_id = ? AND dia_semana = ? AND num_aula = ?`, [
      turma_id,
      dia_semana,
      num_aula
    ]);
    res.status(200).json({ mensagem: 'Aula removida' });
  } catch (err) {
    res.status(500).json({ mensagem: err.message });
  }
});

/* ==========================================
   4. NAVEGAÇÃO E PÁGINAS
   ========================================== */

app.get('/login', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'login.html')));
app.get('/usuarios', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'usuarios.html')));
app.get('/usuarios.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'usuarios.html')));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 Servidor RASM Tecnologia rodando na porta: ${PORT}`);
});
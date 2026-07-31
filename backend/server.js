/**
 * SERVER.JS - API REST Express / PostgreSQL & SQLite
 * Sistema de Gestão de Grade Horária e Alocação Escolar (EJA / CEEBJA)
 * 
 * Arquitetura: Clean Architecture / REST API Persistente / Multi-Database
 * Desenvolvido por RASM Tecnologia
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ceebja_chave_secreta_super_segura_2026';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_PATH));

/* ==========================================================================
   1. BANCO DE DADOS (POSTGRESQL / SQLITE FALLBACK)
   ========================================================================== */

const DATABASE_URL = process.env.DATABASE_URL;
let isPostgres = false;
let pgPool = null;
let sqliteDb = null;

if (DATABASE_URL) {
  isPostgres = true;
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('⚡ Conectado ao PostgreSQL Persistente do Render.');
  garantirEstruturaPostgres();
} else {
  console.log('⚠️ Rodando com SQLite Local (Modo Desenvolvimento)');
  const DB_DIR = path.join(__dirname, 'database');
  const DB_PATH = path.join(DB_DIR, 'grade_horaria.db');

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
    if (!err) {
      console.log('✅ Banco SQLite local carregado.');
      garantirEstruturaSqlite();
    }
  });
}

async function executarQuery(sql, params = []) {
  if (isPostgres) {
    let contador = 1;
    const sqlPostgres = sql.replace(/\?/g, () => `$${contador++}`);
    const res = await pgPool.query(sqlPostgres, params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      const sqlTrim = sql.trim().toUpperCase();
      if (sqlTrim.startsWith('SELECT')) {
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

/* ==========================================================================
   2. MIGRATIONS, TABELAS E CARGA INICIAL
   ========================================================================== */

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

      CREATE TABLE IF NOT EXISTS turnos (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(20) UNIQUE NOT NULL,
        nome VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS turmas (
        id SERIAL PRIMARY KEY,
        nome_descricao VARCHAR(255) UNIQUE NOT NULL,
        turno_id INT REFERENCES turnos(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS disciplinas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS professores (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alocacoes (
        id SERIAL PRIMARY KEY,
        turma_id INT REFERENCES turmas(id) ON DELETE CASCADE,
        disciplina_id INT REFERENCES disciplinas(id) ON DELETE CASCADE,
        professor_id INT REFERENCES professores(id) ON DELETE SET NULL,
        tipo VARCHAR(50) DEFAULT 'INDIVIDUAL'
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
    console.log('✅ Estrutura de tabelas validada no PostgreSQL.');
    await povoarUsuariosIniciais();
    await processarETLPlanilha(false); // Executa verificação suave no boot
  } catch (err) {
    console.error('❌ Erro na estrutura do Postgres:', err.message);
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

    CREATE TABLE IF NOT EXISTS turnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS turmas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome_descricao TEXT UNIQUE NOT NULL,
      turno_id INTEGER,
      FOREIGN KEY(turno_id) REFERENCES turnos(id)
    );

    CREATE TABLE IF NOT EXISTS disciplinas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS professores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alocacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turma_id INTEGER,
      disciplina_id INTEGER,
      professor_id INTEGER,
      tipo TEXT DEFAULT 'INDIVIDUAL',
      FOREIGN KEY(turma_id) REFERENCES turmas(id),
      FOREIGN KEY(disciplina_id) REFERENCES disciplinas(id),
      FOREIGN KEY(professor_id) REFERENCES professores(id)
    );

    CREATE TABLE IF NOT EXISTS grade_horaria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turma_id INTEGER NOT NULL,
      dia_semana INTEGER NOT NULL,
      num_aula INTEGER NOT NULL,
      alocacao_id INTEGER NOT NULL,
      UNIQUE(turma_id, dia_semana, num_aula)
    );
  `;

  sqliteDb.exec(sql, (err) => {
    if (!err) {
      povoarUsuariosIniciais();
      processarETLPlanilha(false);
    }
  });
}

async function povoarUsuariosIniciais() {
  const usuariosBase = [
    ['Administrador Geral (Monstro)', 'monstro', '11111111111', 'monstro2026', 'ADMINISTRADOR'],
    ['Administrador do Sistema', 'admin', '00000000000', 'admin123', 'ADMINISTRADOR'],
    ['Equipe Pedagógica', 'pedagogico', '22222222222', 'pedagogico123', 'PEDAGOGICO'],
    ['Visualizador (Somente Leitura)', 'consulta', '33333333333', 'consulta123', 'CONSULTA']
  ];

  for (const u of usuariosBase) {
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
    } catch (err) {}
  }
}

/**
 * Função de Processamento ETL - Lê a Planilha Excel
 */
async function processarETLPlanilha(forcarSobrescrita = false) {
  try {
    if (!forcarSobrescrita) {
      const qtdAlocacoes = await executarQuery(`SELECT COUNT(*) AS qtd FROM alocacoes`);
      const total = parseInt(qtdAlocacoes[0]?.qtd || qtdAlocacoes[0]?.count || 0);

      if (total > 0) {
        console.log(`ℹ️ Base de dados já populada (${total} registros). ETL automático suspenso.`);
        return { sucesso: true, mensagem: 'Base já possui dados.', total };
      }
    }

    const excelPath = path.join(__dirname, 'data', 'professores.xlsx');
    if (!fs.existsSync(excelPath)) {
      console.log(`⚠️ Arquivo não encontrado em: ${excelPath}`);
      return { sucesso: false, mensagem: `Arquivo de planilha não encontrado em ${excelPath}` };
    }

    console.log(`📖 Lendo planilha em: ${excelPath}`);
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    console.log(`📦 Processando ETL de ${rows.length} linhas da planilha...`);

    const mapaTurnos = { 'A': 'MATUTINO', 'B': 'VESPERTINO', 'C': 'NOTURNO' };
    let inseridos = 0;

    for (const row of rows) {
      const turmaDescrita = String(row['TURMA DESCRITA'] || row['turma descrita'] || '').trim();
      const disciplinaNome = String(row['DISCIPLINA'] || row['disciplina'] || '').trim();
      const turnoCodigoRaw = String(row['TURMA'] || row['turma'] || 'C').trim().toUpperCase();
      const professorNome = String(row['NOME SUPRIDO'] || row['nome suprido'] || 'A DEFINIR').trim();

      if (!turmaDescrita || !disciplinaNome) continue;

      const turnoNome = mapaTurnos[turnoCodigoRaw] || 'NOTURNO';

      // 1. Turno
      let turnoId = 1;
      if (isPostgres) {
        const resT = await pgPool.query(
          `INSERT INTO turnos (codigo, nome) VALUES ($1, $2)
           ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
          [turnoCodigoRaw, turnoNome]
        );
        turnoId = resT.rows[0].id;
      } else {
        await executarQuery(`INSERT OR IGNORE INTO turnos (codigo, nome) VALUES (?, ?)`, [turnoCodigoRaw, turnoNome]);
        const resT = await executarQuery(`SELECT id FROM turnos WHERE codigo = ?`, [turnoCodigoRaw]);
        if (resT.length > 0) turnoId = resT[0].id;
      }

      // 2. Turma
      let turmaId = null;
      if (isPostgres) {
        const resTurma = await pgPool.query(
          `INSERT INTO turmas (nome_descricao, turno_id) VALUES ($1, $2)
           ON CONFLICT (nome_descricao) DO UPDATE SET turno_id = EXCLUDED.turno_id RETURNING id`,
          [turmaDescrita, turnoId]
        );
        turmaId = resTurma.rows[0].id;
      } else {
        await executarQuery(`INSERT OR IGNORE INTO turmas (nome_descricao, turno_id) VALUES (?, ?)`, [turmaDescrita, turnoId]);
        const resTurma = await executarQuery(`SELECT id FROM turmas WHERE nome_descricao = ?`, [turmaDescrita]);
        if (resTurma.length > 0) turmaId = resTurma[0].id;
      }

      // 3. Disciplina
      let discId = null;
      if (isPostgres) {
        const resDisc = await pgPool.query(
          `INSERT INTO disciplinas (nome) VALUES ($1)
           ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
          [disciplinaNome]
        );
        discId = resDisc.rows[0].id;
      } else {
        await executarQuery(`INSERT OR IGNORE INTO disciplinas (nome) VALUES (?)`, [disciplinaNome]);
        const resDisc = await executarQuery(`SELECT id FROM disciplinas WHERE nome = ?`, [disciplinaNome]);
        if (resDisc.length > 0) discId = resDisc[0].id;
      }

      // 4. Professor
      let profId = null;
      const finalProf = professorNome !== '' ? professorNome : 'A DEFINIR';
      if (isPostgres) {
        const resProf = await pgPool.query(
          `INSERT INTO professores (nome) VALUES ($1)
           ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
          [finalProf]
        );
        profId = resProf.rows[0].id;
      } else {
        await executarQuery(`INSERT OR IGNORE INTO professores (nome) VALUES (?, ?)`, [finalProf]);
        const resProf = await executarQuery(`SELECT id FROM professores WHERE nome = ?`, [finalProf]);
        if (resProf.length > 0) profId = resProf[0].id;
      }

      // 5. Alocação
      await executarQuery(
        `INSERT INTO alocacoes (turma_id, disciplina_id, professor_id, tipo) VALUES (?, ?, ?, ?)`,
        [turmaId, discId, profId, 'INDIVIDUAL']
      );

      inseridos++;
    }

    console.log(`✅ ETL concluído com sucesso: ${inseridos} alocações gravadas.`);
    return { sucesso: true, inseridos };
  } catch (err) {
    console.error('❌ Erro durante o ETL da planilha:', err.message);
    return { sucesso: false, mensagem: err.message };
  }
}

/* ==========================================================================
   3. ROTAS DE API
   ========================================================================== */

// Rota de Gatilho Manual de Importação
app.all('/api/rodar-etl-planilha', async (req, res) => {
  const resultado = await processarETLPlanilha(true);
  res.json(resultado);
});

app.post('/api/login', async (req, res) => {
  const { identificador, senha } = req.body;
  if (!identificador || !senha) return res.status(400).json({ sucesso: false, mensagem: 'Informe Usuário/CPF e Senha.' });

  const termoLimpo = String(identificador).trim().toLowerCase();
  const cpfApenasNumeros = termoLimpo.replace(/\D/g, '');

  try {
    const rows = await executarQuery(
      `SELECT id, nome, cpf, usuario, senha_hash, perfil 
       FROM usuarios WHERE LOWER(usuario) = ? OR cpf = ? OR (cpf IS NOT NULL AND cpf != '' AND cpf = ?)`,
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

    return res.json({ sucesso: true, token, usuario: { id: usuario.id, nome: usuario.nome, usuario: usuario.usuario, perfil: usuario.perfil } });
  } catch (err) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno.' });
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const rows = await executarQuery(`SELECT id, nome, usuario, cpf, perfil FROM usuarios ORDER BY id DESC`);
    res.json(rows || []);
  } catch (err) { res.status(500).json([]); }
});

app.get('/api/turmas', async (req, res) => {
  try {
    const rows = await executarQuery(`
      SELECT t.id, t.nome_descricao, COALESCE(tu.codigo, 'N/A') AS turno_codigo, COALESCE(tu.nome, 'GERAL') AS turno_nome 
      FROM turmas t LEFT JOIN turnos tu ON t.turno_id = tu.id ORDER BY t.id ASC
    `);
    res.json(rows || []);
  } catch (err) { res.json([]); }
});

app.get('/api/alocacoes', async (req, res) => {
  try {
    const rows = await executarQuery(`
      SELECT a.id AS alocacao_id, a.turma_id, d.nome AS disciplina_nome, COALESCE(p.nome, 'A DEFINIR') AS professor_nome, a.tipo
      FROM alocacoes a
      LEFT JOIN disciplinas d ON a.disciplina_id = d.id
      LEFT JOIN professores p ON a.professor_id = p.id
      ORDER BY a.id ASC
    `);
    res.json(rows || []);
  } catch (err) { res.json([]); }
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
  } catch (err) { res.json([]); }
});

app.post('/api/grade', async (req, res) => {
  const { turma_id, dia_semana, num_aula, alocacao_id } = req.body;
  try {
    if (isPostgres) {
      await executarQuery(
        `INSERT INTO grade_horaria (turma_id, dia_semana, num_aula, alocacao_id) VALUES (?, ?, ?, ?)
         ON CONFLICT (turma_id, dia_semana, num_aula) DO UPDATE SET alocacao_id = EXCLUDED.alocacao_id`,
        [turma_id, dia_semana, num_aula, alocacao_id]
      );
    } else {
      await executarQuery(
        `INSERT INTO grade_horaria (turma_id, dia_semana, num_aula, alocacao_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(turma_id, dia_semana, num_aula) DO UPDATE SET alocacao_id = excluded.alocacao_id`,
        [turma_id, dia_semana, num_aula, alocacao_id]
      );
    }
    res.json({ mensagem: 'Sucesso' });
  } catch (err) { res.status(500).json({ mensagem: err.message }); }
});

app.delete('/api/grade', async (req, res) => {
  const { turma_id, dia_semana, num_aula } = req.body;
  try {
    await executarQuery(`DELETE FROM grade_horaria WHERE turma_id = ? AND dia_semana = ? AND num_aula = ?`, [turma_id, dia_semana, num_aula]);
    res.json({ mensagem: 'Aula removida' });
  } catch (err) { res.status(500).json({ mensagem: err.message }); }
});

app.get('/login', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'login.html')));
app.get('/usuarios', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'usuarios.html')));
app.get('/usuarios.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'usuarios.html')));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 Servidor RASM Tecnologia rodando na porta: ${PORT}`);
});
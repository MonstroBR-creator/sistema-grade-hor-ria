const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do Frontend (ajuste o caminho se sua pasta estática for 'public' ou 'frontend')
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// Garantir caminho absoluto e dinâmico para o SQLite no ambiente Linux do Render
const dbPath = path.join(__dirname, 'database', 'grade_horaria.db');

console.log('Conectando ao banco de dados em:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco SQLite:', err.message);
  } else {
    console.log('Conexão estabelecida com sucesso com o SQLite.');
  }
});

// --- ROTAS DA API ---

// Endpoint de verificação de integridade (Healthcheck)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', database: dbPath });
});

// Endpoint de Turmas
app.get('/api/turmas', (req, res) => {
  const query = 'SELECT * FROM turmas';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar turmas:', err.message);
      return res.status(500).json({ error: 'Erro interno ao consultar turmas no banco.' });
    }
    res.json(rows);
  });
});

// Endpoint de Disciplinas / Professores
app.get('/api/disciplinas', (req, res) => {
  const query = 'SELECT * FROM disciplinas';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar disciplinas:', err.message);
      return res.status(500).json({ error: 'Erro interno ao consultar disciplinas.' });
    }
    res.json(rows);
  });
});

// Endpoint de Grade Horária por Turma
app.get('/api/grade/:turmaId', (req, res) => {
  const { turmaId } = req.params;
  const query = 'SELECT * FROM grade_horaria WHERE turma_id = ?';
  
  db.all(query, [turmaId], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar grade:', err.message);
      return res.status(500).json({ error: 'Erro ao consultar a grade horária.' });
    }
    res.json(rows);
  });
});

// Fallback para SPA / index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}`);
});
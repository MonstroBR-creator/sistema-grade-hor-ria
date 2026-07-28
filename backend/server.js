const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// Middlewares
app.use(cors());
app.use(express.json());

// --- LOCALIZAÇÃO INTELIGENTE DOS ARQUIVOS DO FRONTEND ---
// Tenta achar 'public' no diretório pai, no diretório atual ou serve a raiz do projeto
let staticPath = path.join(__dirname, '..', 'public');

if (!fs.existsSync(staticPath)) {
  staticPath = path.join(__dirname, 'public');
}
if (!fs.existsSync(staticPath)) {
  staticPath = path.join(__dirname, '..'); // Se o index.html estiver solto na raiz do projeto
}

console.log('Servindo arquivos estáticos de:', staticPath);
app.use(express.static(staticPath));

// --- CONEXÃO COM O BANCO DE DADOS ---
const dbPath = path.join(__dirname, 'database', 'grade_horaria.db');

console.log('Conectando ao banco SQLite em:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco SQLite:', err.message);
  } else {
    console.log('⚡ Conectado ao banco SQLite com sucesso!');
  }
});

// --- ROTAS DA API ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', database: dbPath, staticDir: staticPath });
});

app.get('/api/turmas', (req, res) => {
  const query = 'SELECT * FROM turmas';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar turmas:', err.message);
      return res.status(500).json({ error: 'Erro ao consultar turmas.' });
    }
    res.json(rows);
  });
});

app.get('/api/disciplinas', (req, res) => {
  const query = 'SELECT * FROM disciplinas';
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar disciplinas:', err.message);
      return res.status(500).json({ error: 'Erro ao consultar disciplinas.' });
    }
    res.json(rows);
  });
});

app.get('/api/grade/:turmaId', (req, res) => {
  const { turmaId } = req.params;
  const query = 'SELECT * FROM grade_horaria WHERE turma_id = ?';
  
  db.all(query, [turmaId], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar grade:', err.message);
      return res.status(500).json({ error: 'Erro ao consultar a grade.' });
    }
    res.json(rows);
  });
});

// Rota coringa para entregar o index.html principal
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Arquivo index.html não foi encontrado na pasta estática.');
  }
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
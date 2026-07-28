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

// --- MAPEAMENTO INTELIGENTE DA PASTA DO FRONTEND ---
// Procura o index.html nos locais mais comuns de um projeto Node.js
const possiveisCaminhos = [
  path.join(__dirname, '..', 'public'), // Raiz/public
  path.join(__dirname, '..'),           // Raiz do projeto (se o index.html estiver solto lá)
  path.join(__dirname, 'public'),      // backend/public
  path.join(__dirname, '..', 'frontend') // Raiz/frontend
];

let staticPath = possiveisCaminhos.find(caminho => {
  const indexExiste = fs.existsSync(path.join(caminho, 'index.html'));
  if (indexExiste) {
    console.log(`✅ Front-end encontrado em: ${caminho}`);
  }
  return indexExiste;
}) || path.join(__dirname, '..'); // Fallback para a raiz se não encontrar

console.log('Servindo arquivos estáticos de:', staticPath);
app.use(express.static(staticPath));

// --- CONEXÃO BANCO DE DADOS SQLITE ---
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

// Rota Coringa para servir o index.html principal
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`
      <h2>Erro 404 - Front-end não encontrado</h2>
      <p>O servidor está online, mas não encontrou o arquivo <b>index.html</b> nos diretórios mapeados.</p>
      <p>Diretório verificado: <code>${staticPath}</code></p>
    `);
  }
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
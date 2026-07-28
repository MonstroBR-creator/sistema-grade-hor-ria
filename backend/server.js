const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// 1. Mapeamento estático
const possiveisCaminhos = [
  path.join(__dirname, '..', 'public'),
  path.join(__dirname, '..'),
  path.join(__dirname, 'public'),
  path.join(__dirname, '..', 'frontend')
];

let staticPath = possiveisCaminhos.find(caminho => {
  return fs.existsSync(path.join(caminho, 'index.html'));
}) || path.join(__dirname, '..');

app.use(express.static(staticPath));

// 2. Conexão SQLite
const dbPath = path.join(__dirname, 'database', 'grade_horaria.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco SQLite:', err.message);
  } else {
    console.log('⚡ Conectado ao banco SQLite com sucesso!');
  }
});

// 3. API - Rotas

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', database: dbPath, staticDir: staticPath });
});

// Retorna todas as turmas
app.get('/api/turmas', (req, res) => {
  db.all('SELECT * FROM turmas', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Retorna a grade genérica sem travar por erro de JOIN
app.get('/api/grade/:turmaId', (req, res) => {
  const { turmaId } = req.params;
  
  // Tenta buscar na tabela de grade_horaria
  db.all('SELECT * FROM grade_horaria WHERE turma_id = ?', [turmaId], (err, rows) => {
    if (err) {
      // Se der erro de nome de coluna, tenta buscar direto sem filtro rígido
      db.all('SELECT * FROM grade_horaria', [], (errAll, rowsAll) => {
        if (errAll) return res.status(500).json({ error: errAll.message });
        res.json(rowsAll);
      });
    } else {
      res.json(rows);
    }
  });
});

// Servidor estático index.html
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html não encontrado.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
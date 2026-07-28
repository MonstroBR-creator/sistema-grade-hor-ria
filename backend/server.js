const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Mapeamento dinâmico da pasta estática do front-end
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

// Conexão com o Banco SQLite
const dbPath = path.join(__dirname, 'database', 'grade_horaria.db');

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

// Rota de Turmas (Retorna ID e Nome Real ex: "1º Módulo", "2º Módulo A")
app.get('/api/turmas', (req, res) => {
  db.all('SELECT * FROM turmas ORDER BY nome', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar turmas: ' + err.message });
    }
    res.json(rows);
  });
});

// Rota de Grade Completa da Turma Selecionada
app.get('/api/grade/:turmaId', (req, res) => {
  const { turmaId } = req.params;
  
  const query = 'SELECT * FROM grade_horaria WHERE turma_id = ?';
  db.all(query, [turmaId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar grade: ' + err.message });
    }
    res.json(rows);
  });
});

// Servir o index.html para qualquer outra rota
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Arquivo index.html não foi encontrado.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
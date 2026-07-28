const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');
const PUBLIC_PATH = path.join(__dirname, '..', 'public');
const staticPath = fs.existsSync(FRONTEND_PATH) ? FRONTEND_PATH : PUBLIC_PATH;

app.use(express.static(staticPath));

const DB_PATH = path.join(__dirname, 'database', 'grade_horaria.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('❌ Erro SQLite:', err.message);
  else console.log('⚡ Conectado ao banco SQLite em:', DB_PATH);
});

/* ROTAS DA API REST (CONFORME SCHEMA V1.2) */

app.get('/api/turmas', (req, res) => {
  const query = `
    SELECT t.id, t.nome_descricao, tu.codigo AS turno_codigo, tu.nome AS turno_nome 
    FROM turmas t 
    JOIN turnos tu ON t.turno_id = tu.id 
    ORDER BY t.nome_descricao ASC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
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
  db.all(query, [turmaId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('index.html não encontrado.');
});

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta: ${PORT}`));
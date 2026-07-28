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

// --- MAPEAMENTO ESTRUTURAL DO FRONTEND ---
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

// --- BANCO DE DADOS SQLITE ---
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

// Rota de Turmas
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

// Rota de Disciplinas
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

// Rota de Grade Completa por Turma (Cruzando dados de Horários, Matérias e Professores)
app.get('/api/grade/:turmaId', (req, res) => {
  const { turmaId } = req.params;
  
  // Tenta realizar a busca relacional completa. Caso a estrutura use colunas diretas, o fallback trata.
  const queryRelacional = `
    SELECT 
      g.id,
      g.dia_semana,
      g.horario,
      COALESCE(d.nome, g.disciplina, 'Disciplina não informada') AS disciplina,
      COALESCE(p.nome, g.professor, 'Professor não atribuído') AS professor
    FROM grade_horaria g
    LEFT JOIN disciplinas d ON g.disciplina_id = d.id
    LEFT JOIN professores p ON g.professor_id = p.id
    WHERE g.turma_id = ?
    ORDER BY g.dia_semana, g.horario
  `;

  db.all(queryRelacional, [turmaId], (err, rows) => {
    if (err) {
      // Fallback para tabelas com estrutura simplificada/direta
      const querySimples = 'SELECT * FROM grade_horaria WHERE turma_id = ?';
      db.all(querySimples, [turmaId], (errSimple, rowsSimple) => {
        if (errSimple) {
          console.error('Erro ao buscar grade:', errSimple.message);
          return res.status(500).json({ error: 'Erro ao consultar a grade horária.' });
        }
        return res.json(rowsSimple);
      });
    } else {
      res.json(rows);
    }
  });
});

// Servir o index.html principal
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
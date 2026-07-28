/**
 * SERVER.JS - API REST Express / SQLite e Servidor Estático
 * Caminho: backend/server.js
 */

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
// O Render injeta a porta em process.env.PORT; localmente usa a 3000
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'ceebja_chave_secreta_super_segura_2026';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Caminho absoluto para a pasta frontend
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_PATH));

// Conexão com o Banco SQLite
const DB_PATH = path.join(__dirname, 'database', 'grade_horaria.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('❌ Erro SQLite:', err.message);
  else console.log('⚡ Conectado ao banco SQLite em:', DB_PATH);
});

db.run('PRAGMA foreign_keys = ON;');

/* API LOGIN */
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
    if (err) return res.status(500).json({ sucesso: false, mensagem: 'Erro interno no banco.' });

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

/* API REST GRADE */
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

// Rotas para as páginas HTML
app.get('/login', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'login.html')));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_PATH, 'index.html')));

app.listen(PORT, () => console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`));
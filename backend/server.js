const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Mapeamento de arquivos estáticos (HTML/JS)
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

// Conexão e Inicialização do Banco SQLite
const dbPath = path.join(__dirname, 'database', 'grade_horaria.db');
const pastaDb = path.dirname(dbPath);

if (!fs.existsSync(pastaDb)) {
  fs.mkdirSync(pastaDb, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('⚡ Conectado ao banco SQLite com sucesso!');
  }
});

// ROTINA ETL: Importa do Excel se a tabela não existir ou se for acionada
function executarImportacaoExcel() {
  const caminhoExcel = path.join(__dirname, 'data', 'professores.xlsx');

  if (!fs.existsSync(caminhoExcel)) {
    console.warn(`⚠️ Arquivo Excel não localizado em: ${caminhoExcel}`);
    return;
  }

  console.log('📊 Lendo dados de backend/data/professores.xlsx...');
  const workbook = XLSX.readFile(caminhoExcel);
  const primeiraAba = workbook.SheetNames[0];
  const dados = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba]);

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS turmas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE,
      turno TEXT,
      ensino TEXT,
      modulo TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS grade_horaria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turma_id INTEGER,
      disciplina TEXT,
      turma_letra TEXT,
      professor TEXT,
      FOREIGN KEY(turma_id) REFERENCES turmas(id)
    )`);

    const stmtTurma = db.prepare('INSERT OR IGNORE INTO turmas (nome, turno, ensino, modulo) VALUES (?, ?, ?, ?)');
    const stmtGrade = db.prepare('INSERT INTO grade_horaria (turma_id, disciplina, turma_letra, professor) VALUES (?, ?, ?, ?)');

    dados.forEach(row => {
      const descrita = row['TURMA DESCRITA'] ? String(row['TURMA DESCRITA']).trim() : '';
      const letra = row['TURMA'] ? String(row['TURMA']).trim() : '';

      if (descrita) {
        const nomeCompleto = letra ? `${descrita} (Turma ${letra})` : descrita;

        let turno = 'OUTRO';
        if (descrita.toUpperCase().includes('MANHÃ')) turno = 'MANHÃ';
        else if (descrita.toUpperCase().includes('NOITE')) turno = 'NOITE';
        else if (descrita.toUpperCase().includes('TARDE')) turno = 'TARDE';

        let ensino = 'OUTRO';
        if (descrita.toUpperCase().includes('FUNDAMENTAL')) ensino = 'FUNDAMENTAL';
        else if (descrita.toUpperCase().includes('MÉDIO') || descrita.toUpperCase().includes('MEDIO')) ensino = 'MÉDIO';

        const moduloMatch = descrita.match(/\d+º\s*MÓDULO|\d+º\s*MODULO/i);
        const modulo = moduloMatch ? moduloMatch[0].toUpperCase() : 'GERAL';

        stmtTurma.run(nomeCompleto, turno, ensino, modulo);
      }
    });

    stmtTurma.finalize(() => {
      db.all('SELECT id, nome FROM turmas', [], (err, turmasBanco) => {
        if (err) return;
        const mapaTurmas = {};
        turmasBanco.forEach(t => mapaTurmas[t.nome] = t.id);

        dados.forEach(row => {
          const descrita = row['TURMA DESCRITA'] ? String(row['TURMA DESCRITA']).trim() : '';
          const disciplina = row['DISCIPLINA'] || 'A DEFINIR';
          const letra = row['TURMA'] || '';
          const professor = row['NOME SUPRIDO'] || 'A DEFINIR';

          if (descrita) {
            const nomeCompleto = letra ? `${descrita} (Turma ${String(letra).trim()})` : descrita;
            const turmaId = mapaTurmas[nomeCompleto];

            if (turmaId) {
              stmtGrade.run(turmaId, String(disciplina).trim(), String(letra).trim(), String(professor).trim());
            }
          }
        });
        stmtGrade.finalize(() => {
          console.log('🎉 Carga e sincronização da planilha concluídas!');
        });
      });
    });
  });
}

// Roda verificação inicial da tabela
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='turmas'", (err, row) => {
  if (!row) {
    executarImportacaoExcel();
  }
});

// --- APIS ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', database: dbPath });
});

// Retorna todas as turmas cadastradas com metadados
app.get('/api/turmas', (req, res) => {
  db.all('SELECT * FROM turmas ORDER BY nome ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Retorna as disciplinas e professores da turma selecionada
app.get('/api/grade/:turmaId', (req, res) => {
  const { turmaId } = req.params;
  db.all('SELECT * FROM grade_horaria WHERE turma_id = ?', [turmaId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Servidor de Front-End
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
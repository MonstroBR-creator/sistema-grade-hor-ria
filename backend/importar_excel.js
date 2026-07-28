const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const caminhoExcel = path.join(__dirname, 'data', 'professores.xlsx');
const dbPath = path.join(__dirname, 'database', 'grade_horaria.db');

if (!fs.existsSync(caminhoExcel)) {
  console.error(`❌ Erro: Arquivo não encontrado em: ${caminhoExcel}`);
  process.exit(1);
}

const pastaDb = path.dirname(dbPath);
if (!fs.existsSync(pastaDb)) {
  fs.mkdirSync(pastaDb, { recursive: true });
}

if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log('🗑️ Banco antigo removido para atualização de schema com Turno, Ensino e Módulo.');
  } catch (err) {
    console.warn('⚠️ Sobrescrevendo dados do banco existente...');
  }
}

const db = new sqlite3.Database(dbPath);
const workbook = XLSX.readFile(caminhoExcel);
const primeiraAba = workbook.SheetNames[0];
const dados = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba]);

db.serialize(() => {
  // Criar tabela de turmas com metadados estruturados
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

      // Extração inteligente de Turno, Ensino e Módulo
      let turno = 'OUTRO';
      if (descrita.toUpperCase().includes('MANHÃ')) turno = 'MANHÃ';
      else if (descrita.toUpperCase().includes('NOITE')) turno = 'NOITE';
      else if (descrita.toUpperCase().includes('TARDE')) turno = 'TARDE';

      let ensino = 'OUTRO';
      if (descrita.toUpperCase().includes('FUNDAMENTAL')) ensino = 'FUNDAMENTAL';
      else if (descrita.toUpperCase().includes('MÉDIO') || descrita.toUpperCase().includes('MEDIO')) ensino = 'MÉDIO';

      // Pega a primeira palavra/termo (ex: "1º MÓDULO", "2º MÓDULO")
      const moduloMatch = descrita.match(/\d+º\s*MÓDULO|\d+º\s*MODULO/i);
      const modulo = moduloMatch ? moduloMatch[0].toUpperCase() : 'GERAL';

      stmtTurma.run(nomeCompleto, turno, ensino, modulo);
    }
  });

  stmtTurma.finalize(() => {
    db.all('SELECT id, nome FROM turmas', [], (err, turmasBanco) => {
      if (err) return console.error('Erro:', err);

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
        console.log('🎉 Banco reorganizado com colunas separadas para Turno, Ensino e Módulo!');
        db.close();
      });
    });
  });
});
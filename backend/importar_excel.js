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

// Remove o banco antigo para recriar com a estrutura correta das colunas
if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log('🗑️ Banco antigo removido para recriação limpa.');
  } catch (err) {
    console.warn('⚠️ Não foi possível apagar o banco diretamente, sobrescrevendo dados...');
  }
}

const db = new sqlite3.Database(dbPath);

console.log('📊 Lendo arquivo backend/data/professores.xlsx...');
const workbook = XLSX.readFile(caminhoExcel);
const primeiraAba = workbook.SheetNames[0];
const dados = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba]);

console.log(`✅ ${dados.length} linhas lidas da planilha.`);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS turmas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS grade_horaria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turma_id INTEGER,
    disciplina TEXT,
    turma_letra TEXT,
    professor TEXT,
    FOREIGN KEY(turma_id) REFERENCES turmas(id)
  )`);

  const stmtTurma = db.prepare('INSERT OR IGNORE INTO turmas (nome) VALUES (?)');
  const stmtGrade = db.prepare('INSERT INTO grade_horaria (turma_id, disciplina, turma_letra, professor) VALUES (?, ?, ?, ?)');

  // 1. Cadastra os nomes dos Módulos/Turmas
  dados.forEach(row => {
    const descrita = row['TURMA DESCRITA'];
    const letra = row['TURMA'];
    
    if (descrita) {
      // Cria um nome completo combinando Descrição + Letra da Turma
      const nomeCompleto = letra ? `${descrita.trim()} (Turma ${letra.trim()})` : descrita.trim();
      stmtTurma.run(nomeCompleto);
    }
  });

  stmtTurma.finalize(() => {
    db.all('SELECT id, nome FROM turmas', [], (err, turmasBanco) => {
      if (err) {
        console.error('❌ Erro ao consultar turmas:', err.message);
        return;
      }

      const mapaTurmas = {};
      turmasBanco.forEach(t => mapaTurmas[t.nome] = t.id);

      // 2. Mapeia e insere Disciplinas, Turma e Professores do "NOME SUPRIDO"
      dados.forEach(row => {
        const descrita = row['TURMA DESCRITA'];
        const disciplina = row['DISCIPLINA'] || 'A DEFINIR';
        const letra = row['TURMA'] || '';
        const professor = row['NOME SUPRIDO'] || 'A DEFINIR';

        if (descrita) {
          const nomeCompleto = letra ? `${descrita.trim()} (Turma ${letra.trim()})` : descrita.trim();
          const turmaId = mapaTurmas[nomeCompleto];

          if (turmaId) {
            stmtGrade.run(turmaId, String(disciplina).trim(), String(letra).trim(), String(professor).trim());
          }
        }
      });

      stmtGrade.finalize(() => {
        console.log('🎉 Banco de dados SQLite populado com SUCESSO absoluto!');
        db.close();
      });
    });
  });
});
/**
 * ⚠️  SCRIPT LEGADO — NÃO USE EM OPERAÇÃO NORMAL  ⚠️
 *
 * Este importador em Node.js é anterior ao modelo relacional atual e gera um
 * banco INCOMPATÍVEL com a API:
 *
 *   • cria `turmas` com a coluna `nome`      → o servidor consulta `nome_descricao`
 *   • cria `grade_horaria` com `disciplina`/`professor` em texto
 *                                            → o servidor espera `alocacao_id`
 *   • não cria as tabelas `turnos`, `disciplinas`, `professores` nem `alocacoes`
 *   • APAGA o arquivo .db existente, incluindo todas as contas de acesso
 *
 * Executá-lo por engano derruba o sistema inteiro (turmas, grade e login).
 * O importador em uso é `backend/import_excel.py` (`npm run importar`).
 *
 * O arquivo foi mantido apenas como referência histórica. Para rodá-lo mesmo
 * assim, é preciso passar a flag explícita:
 *
 *     node backend/legacy/importar_excel.js --confirmo-schema-legado
 */

'use strict';

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

if (!process.argv.includes('--confirmo-schema-legado')) {
  console.error(
    [
      '',
      '🛑 Execução bloqueada.',
      '',
      'Este script grava um schema antigo e incompatível, e apaga o banco atual',
      '(inclusive os usuários). Use o importador oficial:',
      '',
      '    npm run importar        (backend/import_excel.py)',
      '',
      'Se você realmente precisa do comportamento legado, repita o comando com:',
      '    node backend/legacy/importar_excel.js --confirmo-schema-legado',
      ''
    ].join('\n')
  );
  process.exit(1);
}

// A partir de legacy/, os dados ficam um nível acima.
const RAIZ_BACKEND = path.join(__dirname, '..');
const caminhoExcel = path.join(RAIZ_BACKEND, 'data', 'professores.xlsx');
const dbPath = path.join(RAIZ_BACKEND, 'database', 'grade_horaria.db');

if (!fs.existsSync(caminhoExcel)) {
  console.error(`❌ Arquivo não encontrado em: ${caminhoExcel}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log('🗑️ Banco antigo removido.');
  } catch (err) {
    console.warn('⚠️ Não foi possível remover o banco existente:', err.message);
  }
}

const db = new sqlite3.Database(dbPath);
const workbook = XLSX.readFile(caminhoExcel);
const dados = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

/** Lê uma coluna ignorando espaços sobrando no cabeçalho (ex.: "TURMA "). */
function coluna(linha, nome) {
  const chave = Object.keys(linha).find((k) => String(k).trim().toUpperCase() === nome);
  return chave ? String(linha[chave]).trim() : '';
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS turmas (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nome   TEXT UNIQUE,
    turno  TEXT,
    ensino TEXT,
    modulo TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS grade_horaria (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    turma_id    INTEGER,
    disciplina  TEXT,
    turma_letra TEXT,
    professor   TEXT,
    FOREIGN KEY (turma_id) REFERENCES turmas(id)
  )`);

  const stmtTurma = db.prepare('INSERT OR IGNORE INTO turmas (nome, turno, ensino, modulo) VALUES (?, ?, ?, ?)');
  const stmtGrade = db.prepare('INSERT INTO grade_horaria (turma_id, disciplina, turma_letra, professor) VALUES (?, ?, ?, ?)');

  const nomeCompletoDe = (linha) => {
    const descrita = coluna(linha, 'TURMA DESCRITA');
    if (!descrita) return null;
    const letra = coluna(linha, 'TURMA');
    return letra ? `${descrita} (Turma ${letra})` : descrita;
  };

  dados.forEach((linha) => {
    const descrita = coluna(linha, 'TURMA DESCRITA');
    const nomeCompleto = nomeCompletoDe(linha);
    if (!nomeCompleto) return;

    const maiusculo = descrita.toUpperCase();

    let turno = 'OUTRO';
    if (maiusculo.includes('MANHÃ') || maiusculo.includes('MANHA')) turno = 'MANHÃ';
    else if (maiusculo.includes('NOITE')) turno = 'NOITE';
    else if (maiusculo.includes('TARDE')) turno = 'TARDE';

    let ensino = 'OUTRO';
    if (maiusculo.includes('FUNDAMENTAL')) ensino = 'FUNDAMENTAL';
    else if (maiusculo.includes('MÉDIO') || maiusculo.includes('MEDIO')) ensino = 'MÉDIO';

    const moduloMatch = descrita.match(/\d+º\s*M[ÓO]DULO/i);
    const modulo = moduloMatch ? moduloMatch[0].toUpperCase() : 'GERAL';

    stmtTurma.run(nomeCompleto, turno, ensino, modulo);
  });

  stmtTurma.finalize(() => {
    db.all('SELECT id, nome FROM turmas', [], (err, turmasBanco) => {
      if (err) {
        console.error('❌ Erro ao ler turmas:', err.message);
        return db.close();
      }

      const mapaTurmas = new Map(turmasBanco.map((t) => [t.nome, t.id]));

      dados.forEach((linha) => {
        const nomeCompleto = nomeCompletoDe(linha);
        if (!nomeCompleto) return;

        const turmaId = mapaTurmas.get(nomeCompleto);
        if (!turmaId) return;

        stmtGrade.run(
          turmaId,
          coluna(linha, 'DISCIPLINA') || 'A DEFINIR',
          coluna(linha, 'TURMA'),
          coluna(linha, 'NOME SUPRIDO') || 'A DEFINIR'
        );
      });

      stmtGrade.finalize(() => {
        console.log('🎉 Banco legado gerado. Lembre-se: a API NÃO lê este formato.');
        db.close();
      });
    });
  });
});

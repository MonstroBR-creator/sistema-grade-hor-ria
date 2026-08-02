/**
 * DRIVER SQLITE — usado em desenvolvimento e quando não há DATABASE_URL.
 * Expõe a mesma interface do driver PostgreSQL (ver ./postgres.js).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DIRETORIO_PADRAO = path.join(__dirname, '..', 'database');

function criar({ caminho } = {}) {
  const arquivo = caminho || process.env.DB_PATH || path.join(DIRETORIO_PADRAO, 'grade_horaria.db');
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });

  let db = null;

  const conectar = () =>
    new Promise((resolve, reject) => {
      db = new sqlite3.Database(arquivo, (err) => (err ? reject(err) : resolve()));
    });

  const executar = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });

  /** INSERT que devolve o id gerado. */
  const inserir = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });

  const buscarUm = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

  const buscarTodos = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });

  const executarScript = (sql) =>
    new Promise((resolve, reject) => {
      db.exec(sql, (err) => (err ? reject(err) : resolve()));
    });

  /** Executa uma função dentro de uma transação, revertendo em caso de erro. */
  async function transacao(fn) {
    await executar('BEGIN');
    try {
      const resultado = await fn();
      await executar('COMMIT');
      return resultado;
    } catch (erro) {
      await executar('ROLLBACK').catch(() => {});
      throw erro;
    }
  }

  const colunasDaTabela = async (tabela) => {
    const linhas = await buscarTodos(`PRAGMA table_info(${tabela})`);
    return linhas.map((c) => c.name);
  };

  const fechar = () => new Promise((resolve) => (db ? db.close(() => resolve()) : resolve()));

  return {
    dialeto: 'sqlite',
    descricao: `SQLite em ${arquivo}`,
    caminho: arquivo,
    async iniciar() {
      await conectar();
      await executar('PRAGMA foreign_keys = ON');
    },
    executar,
    inserir,
    buscarUm,
    buscarTodos,
    executarScript,
    transacao,
    colunasDaTabela,
    fechar
  };
}

module.exports = { criar };

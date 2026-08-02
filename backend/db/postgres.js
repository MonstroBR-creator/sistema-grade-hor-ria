/**
 * DRIVER POSTGRESQL — usado quando DATABASE_URL está definida (Render).
 * Expõe a mesma interface do driver SQLite (ver ./sqlite.js).
 *
 * As consultas do sistema são escritas no dialeto SQLite, com marcadores "?".
 * Este driver os converte para a numeração do PostgreSQL ($1, $2, ...).
 */

'use strict';

const { Pool } = require('pg');

/**
 * Troca os "?" por $1, $2... ignorando o que estiver dentro de aspas.
 * Sem esse cuidado, um "?" dentro de uma string literal seria renumerado.
 */
function converterMarcadores(sql) {
  let saida = '';
  let n = 0;
  let aspasSimples = false;
  let aspasDuplas = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    if (c === "'" && !aspasDuplas) aspasSimples = !aspasSimples;
    else if (c === '"' && !aspasSimples) aspasDuplas = !aspasDuplas;

    if (c === '?' && !aspasSimples && !aspasDuplas) {
      n += 1;
      saida += `$${n}`;
    } else {
      saida += c;
    }
  }

  return saida;
}

function precisaSsl(url) {
  if (process.env.PGSSL === 'false') return false;
  if (process.env.PGSSL === 'true') return true;
  // Bancos gerenciados (Render, Heroku, Neon...) exigem TLS; localhost não.
  return !/@(localhost|127\.0\.0\.1)/.test(url);
}

function criar({ url } = {}) {
  const conexao = url || process.env.DATABASE_URL;
  if (!conexao) throw new Error('DATABASE_URL não definida.');

  const pool = new Pool({
    connectionString: conexao,
    ssl: precisaSsl(conexao) ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PGPOOL_MAX || 5)
  });

  // Um erro num cliente ocioso do pool derruba o processo se não for tratado.
  pool.on('error', (err) => console.error('⚠️  Erro em conexão ociosa do PostgreSQL:', err.message));

  // Durante uma transação todas as consultas precisam ir pelo MESMO cliente.
  let clienteDaTransacao = null;
  const alvo = () => clienteDaTransacao || pool;

  const consultar = (sql, params = []) => alvo().query(converterMarcadores(sql), params);

  const executar = async (sql, params = []) => ({ changes: (await consultar(sql, params)).rowCount });

  /** INSERT que devolve o id gerado — no PostgreSQL exige RETURNING. */
  const inserir = async (sql, params = []) => {
    const comRetorno = /returning/i.test(sql) ? sql : `${sql.trim().replace(/;$/, '')} RETURNING id`;
    const r = await consultar(comRetorno, params);
    return { id: r.rows[0]?.id, changes: r.rowCount };
  };

  const buscarUm = async (sql, params = []) => (await consultar(sql, params)).rows[0];

  const buscarTodos = async (sql, params = []) => (await consultar(sql, params)).rows;

  const executarScript = async (sql) => {
    await alvo().query(sql);
  };

  async function transacao(fn) {
    const cliente = await pool.connect();
    clienteDaTransacao = cliente;
    try {
      await cliente.query('BEGIN');
      const resultado = await fn();
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw erro;
    } finally {
      clienteDaTransacao = null;
      cliente.release();
    }
  }

  const colunasDaTabela = async (tabela) => {
    const linhas = await buscarTodos(
      `SELECT column_name FROM information_schema.columns WHERE table_name = ?`,
      [tabela]
    );
    return linhas.map((c) => c.column_name);
  };

  return {
    dialeto: 'postgres',
    descricao: `PostgreSQL em ${conexao.replace(/:\/\/[^@]*@/, '://***@')}`,
    async iniciar() {
      // Falha cedo e com mensagem clara se o banco não estiver acessível.
      const cliente = await pool.connect();
      cliente.release();
    },
    executar,
    inserir,
    buscarUm,
    buscarTodos,
    executarScript,
    transacao,
    colunasDaTabela,
    fechar: () => pool.end(),
    _converterMarcadores: converterMarcadores
  };
}

module.exports = { criar, converterMarcadores };

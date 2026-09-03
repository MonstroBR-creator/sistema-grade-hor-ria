/**
 * BACKUP.JS — Gera um arquivo .sql restaurável a partir do banco em uso.
 *
 *   npm run backup                 # salva em ./backups/
 *   npm run backup -- --saida X.sql
 *
 * Para restaurar em qualquer PostgreSQL:
 *   psql "<connection-string>" -f arquivo.sql
 *
 * Todos os INSERT saem com ON CONFLICT DO NOTHING. Sem isso o arquivo quebrava
 * na restauração: o schema já semeia os 3 turnos, e a seção de dados tentava
 * inserir os mesmos ids, derrubando a transação inteira.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const banco = require('./db');

// Ordem que respeita as chaves estrangeiras na restauração.
const TABELAS = ['turnos', 'turmas', 'disciplinas', 'professores', 'alocacoes', 'grade_horaria', 'usuarios'];

/** Converte um valor num literal SQL. */
function literal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function gerar(destino) {
  const partes = [];
  const agora = new Date().toISOString();

  partes.push('-- Backup do Sistema de Grade Horaria (CEEBJA / EJA)');
  partes.push(`-- Gerado em ${agora}`);
  partes.push('--');
  partes.push('-- Restaurar:  psql "<connection-string>" -f este-arquivo.sql');
  partes.push('-- O arquivo apaga as tabelas existentes antes de recriar.');
  partes.push('');
  partes.push('BEGIN;');
  partes.push('');
  partes.push(`DROP TABLE IF EXISTS ${TABELAS.slice().reverse().join(', ')} CASCADE;`);
  partes.push('');
  partes.push('-- ============ SCHEMA ============');
  partes.push(fs.readFileSync(path.join(__dirname, 'db', 'schema.postgres.sql'), 'utf8'));
  partes.push('');
  partes.push('-- ============ DADOS ============');

  const resumo = {};
  for (const tabela of TABELAS) {
    const linhas = await banco.buscarTodos(`SELECT * FROM ${tabela} ORDER BY id`);
    resumo[tabela] = linhas.length;
    if (!linhas.length) continue;

    const colunas = Object.keys(linhas[0]);
    partes.push('');
    partes.push(`-- ${tabela} (${linhas.length} registros)`);
    for (const linha of linhas) {
      const valores = colunas.map((c) => literal(linha[c])).join(', ');
      partes.push(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${valores}) ON CONFLICT DO NOTHING;`);
    }
    partes.push(
      `SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), (SELECT GREATEST(MAX(id), 1) FROM ${tabela}));`
    );
  }

  partes.push('');
  partes.push('COMMIT;');
  partes.push('');

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, partes.join('\n'), 'utf8');
  return { resumo, tamanho: fs.statSync(destino).size };
}

async function principal() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--saida');
  const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1_$2');
  const destino =
    i >= 0 ? args[i + 1] : path.join(__dirname, '..', 'backups', `grade-horaria_${carimbo}.sql`);

  await banco.inicializar();
  const { resumo, tamanho } = await gerar(destino);
  await banco.fechar();

  console.log('💾 Backup criado.');
  console.log(`   arquivo: ${destino}`);
  console.log(`   tamanho: ${(tamanho / 1024).toFixed(1)} KB`);
  for (const [t, n] of Object.entries(resumo)) {
    console.log(`   ${t.padEnd(15)} ${String(n).padStart(5)}`);
  }
}

if (require.main === module) {
  principal().catch((erro) => {
    console.error(`❌ ${erro.message}`);
    process.exit(1);
  });
}

module.exports = { gerar };

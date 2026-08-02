/**
 * DB — escolhe o driver, aplica o schema, roda as migrações e cria a conta mestre.
 *
 * PostgreSQL quando DATABASE_URL está definida (produção no Render);
 * SQLite em arquivo caso contrário (desenvolvimento local).
 * O restante do sistema não sabe qual dos dois está em uso.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { gerarHashSenha, PERFIS } = require('../auth');

let driver = null;

/* ==========================================
   CONTA MESTRE
   ========================================== */

/**
 * O sistema nasce com UMA única conta: o mestre. Todas as demais são criadas
 * por ele na tela de Gestão de Usuários.
 * Os valores só têm efeito no primeiro start — depois a conta já existe e não
 * é sobrescrita.
 */
const USUARIO_MESTRE = {
  nome: process.env.MESTRE_NOME || 'Usuário Mestre — RASM Tecnologia',
  usuario: (process.env.MESTRE_USUARIO || 'mestre').trim().toLowerCase(),
  cpf: (process.env.MESTRE_CPF || '').replace(/\D/g, '') || null,
  senha: process.env.MESTRE_SENHA || 'rasm2026',
  perfil: PERFIS.MESTRE
};

/* ==========================================
   INICIALIZAÇÃO
   ========================================== */

function escolherDriver() {
  if (process.env.DATABASE_URL) return require('./postgres').criar();
  return require('./sqlite').criar();
}

async function aplicarSchema() {
  const arquivo = path.join(__dirname, `schema.${driver.dialeto}.sql`);
  if (!fs.existsSync(arquivo)) throw new Error(`Schema não encontrado: ${arquivo}`);
  await driver.executarScript(fs.readFileSync(arquivo, 'utf-8'));
}

/**
 * Migração incremental da tabela usuarios.
 * O código original fazia ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP, que o SQLite
 * rejeita (default não constante), e o erro era engolido por um callback vazio.
 */
async function migrarUsuarios() {
  const colunas = await driver.colunasDaTabela('usuarios');

  if (!colunas.includes('criado_em')) {
    const tipo = driver.dialeto === 'postgres' ? 'TIMESTAMP' : 'DATETIME';
    await driver.executar(`ALTER TABLE usuarios ADD COLUMN criado_em ${tipo}`);
    await driver.executar(`UPDATE usuarios SET criado_em = CURRENT_TIMESTAMP WHERE criado_em IS NULL`);
    console.log('🔧 Coluna "criado_em" adicionada à tabela usuarios.');
  }
}

/** Cria a conta mestre apenas se ela ainda não existir. */
async function semearUsuarioMestre() {
  const existente = await driver.buscarUm(
    `SELECT id FROM usuarios WHERE LOWER(usuario) = ? OR UPPER(perfil) = 'MESTRE'`,
    [USUARIO_MESTRE.usuario]
  );

  if (existente) return false;

  await driver.executar(
    `INSERT INTO usuarios (nome, usuario, cpf, senha_hash, perfil, criado_em)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      USUARIO_MESTRE.nome,
      USUARIO_MESTRE.usuario,
      USUARIO_MESTRE.cpf,
      gerarHashSenha(USUARIO_MESTRE.senha),
      USUARIO_MESTRE.perfil
    ]
  );

  console.log('');
  console.log('🔑 Conta mestre criada (única conta do sistema):');
  console.log(`      usuário: ${USUARIO_MESTRE.usuario}`);
  if (!process.env.MESTRE_SENHA) console.log(`      senha:   ${USUARIO_MESTRE.senha}`);
  else console.log('      senha:   (definida em MESTRE_SENHA)');
  console.log('      As demais contas são criadas por ela em "Gerenciar Usuários".');
  console.log('');
  return true;
}

async function inicializar() {
  driver = escolherDriver();
  await driver.iniciar();
  console.log(`⚡ Banco de dados: ${driver.descricao}`);

  await aplicarSchema();
  await migrarUsuarios();
  await semearUsuarioMestre();

  console.log('✅ Estrutura do banco validada.');
  return driver;
}

/** Quantidade de turmas — usado para decidir se a planilha precisa ser importada. */
async function contarTurmas() {
  const linha = await driver.buscarUm(`SELECT COUNT(*) AS total FROM turmas`);
  return Number(linha?.total ?? 0);
}

/* ==========================================
   API PÚBLICA (delegada ao driver escolhido)
   ========================================== */

module.exports = {
  USUARIO_MESTRE,
  inicializar,
  contarTurmas,
  get dialeto() {
    return driver?.dialeto;
  },
  executar: (sql, params) => driver.executar(sql, params),
  inserir: (sql, params) => driver.inserir(sql, params),
  buscarUm: (sql, params) => driver.buscarUm(sql, params),
  buscarTodos: (sql, params) => driver.buscarTodos(sql, params),
  executarScript: (sql) => driver.executarScript(sql),
  transacao: (fn) => driver.transacao(fn),
  fechar: () => (driver ? driver.fechar() : Promise.resolve())
};

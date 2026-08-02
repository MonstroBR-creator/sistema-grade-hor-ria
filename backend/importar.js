/**
 * IMPORTAR.JS — Carga da planilha de professores para o banco.
 *
 * Substitui o antigo backend/import_excel.py: o ambiente Node do Render não tem
 * Python nem pandas, então a importação precisava rodar em Node para funcionar
 * também em produção. Funciona igual em SQLite e PostgreSQL.
 *
 *   node backend/importar.js                 # recarrega o acervo acadêmico
 *   node backend/importar.js --reset         # apaga TAMBÉM as contas de acesso
 *   node backend/importar.js --inspecionar   # só analisa a planilha, não grava
 *   node backend/importar.js --arquivo X.xlsx
 */

'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const PLANILHA_PADRAO = path.join(__dirname, 'data', 'professores.xlsx');

const COLUNAS_OBRIGATORIAS = ['TURMA DESCRITA', 'DISCIPLINA', 'TURMA', 'NOME SUPRIDO'];

/** Tabelas recarregadas a cada importação, na ordem que respeita as chaves estrangeiras. */
const TABELAS_ACADEMICAS = ['grade_horaria', 'alocacoes', 'turmas', 'disciplinas', 'professores'];

const VAZIOS = new Set(['', 'NAN', 'NONE', 'NULL', '-', 'UNDEFINED']);

/* ==========================================
   LEITURA DA PLANILHA
   ========================================== */

const texto = (valor) => {
  const limpo = String(valor ?? '').trim();
  return VAZIOS.has(limpo.toUpperCase()) ? '' : limpo;
};

/**
 * Lê a planilha normalizando os cabeçalhos.
 * A coluna real chama-se "TURMA " (com espaço no fim) — sem essa normalização,
 * a leitura falha silenciosamente, que foi exatamente o bug da versão anterior.
 */
function lerPlanilha(caminho) {
  if (!fs.existsSync(caminho)) throw new Error(`Planilha não encontrada em ${caminho}`);

  const pasta = XLSX.readFile(caminho);
  const aba = pasta.Sheets[pasta.SheetNames[0]];
  const brutas = XLSX.utils.sheet_to_json(aba, { defval: '' });

  if (!brutas.length) throw new Error('A planilha está vazia.');

  const original = Object.keys(brutas[0]);
  const mapa = new Map(original.map((c) => [c, String(c).trim().toUpperCase()]));

  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => ![...mapa.values()].includes(c));
  if (faltando.length) {
    throw new Error(
      `A planilha não possui as colunas obrigatórias: ${faltando.join(', ')}.\n` +
        `Colunas encontradas: ${original.map((c) => JSON.stringify(c)).join(', ')}`
    );
  }

  const linhas = brutas.map((linha) => {
    const normalizada = {};
    for (const [chave, valor] of Object.entries(linha)) normalizada[mapa.get(chave)] = valor;
    return normalizada;
  });

  return { linhas, colunasOriginais: original };
}

/* ==========================================
   CLASSIFICAÇÃO
   ========================================== */

function codigoDoTurno(descricao, letra) {
  const d = descricao.toUpperCase();
  if (d.includes('NOITE')) return 'C';
  if (d.includes('TARDE')) return 'B';
  if (d.includes('MANHÃ') || d.includes('MANHA')) return 'A';
  if (['A', 'B', 'C'].includes(letra.toUpperCase())) return letra.toUpperCase();
  return 'A';
}

function tipoDaTurma(descricao) {
  const d = descricao.toUpperCase();
  if (d.includes('SEMIPRESENCIAL')) return 'SEMIPRESENCIAL';
  if (d.includes('TUTORIA')) return 'TUTORIA';
  return 'PRESENCIAL';
}

/* ==========================================
   IMPORTAÇÃO
   ========================================== */

async function limparTabelas(banco, resetTotal) {
  const alvos = resetTotal ? [...TABELAS_ACADEMICAS, 'usuarios'] : [...TABELAS_ACADEMICAS];

  if (banco.dialeto === 'postgres') {
    await banco.executar(`TRUNCATE ${alvos.join(', ')} RESTART IDENTITY CASCADE`);
  } else {
    for (const tabela of alvos) {
      await banco.executar(`DELETE FROM ${tabela}`);
      await banco.executar(`DELETE FROM sqlite_sequence WHERE name = ?`, [tabela]);
    }
  }
}

/** Insere se não existir e devolve o id, guardando em cache para não repetir consultas. */
function criarResolvedor(banco, tabela, coluna, cache) {
  return async (valor) => {
    if (cache.has(valor)) return cache.get(valor);

    await banco.executar(
      `INSERT INTO ${tabela} (${coluna}) VALUES (?) ON CONFLICT (${coluna}) DO NOTHING`,
      [valor]
    );
    const linha = await banco.buscarUm(`SELECT id FROM ${tabela} WHERE ${coluna} = ?`, [valor]);

    cache.set(valor, linha.id);
    return linha.id;
  };
}

async function importar(banco, { caminho = PLANILHA_PADRAO, resetTotal = false, silencioso = false } = {}) {
  const registrar = silencioso ? () => {} : (...a) => console.log(...a);

  const { linhas } = lerPlanilha(caminho);
  registrar(`📄 ${linhas.length} linha(s) lida(s) de ${path.basename(caminho)}.`);

  return banco.transacao(async () => {
    await limparTabelas(banco, resetTotal);
    registrar(
      resetTotal
        ? '🧹 Banco reiniciado por completo (contas de acesso incluídas).'
        : '🧹 Tabelas acadêmicas limpas (contas de acesso preservadas).'
    );

    const turnos = await banco.buscarTodos(`SELECT id, codigo FROM turnos`);
    const turnoPorCodigo = new Map(turnos.map((t) => [t.codigo, t.id]));

    const cacheTurmas = new Map();
    const cacheDisciplinas = new Map();
    const cacheProfessores = new Map();
    const alocacoesVistas = new Set();

    const resolverDisciplina = criarResolvedor(banco, 'disciplinas', 'nome', cacheDisciplinas);
    const resolverProfessor = criarResolvedor(banco, 'professores', 'nome', cacheProfessores);

    let ignoradas = 0;
    let duplicadas = 0;

    for (const linha of linhas) {
      const descricao = texto(linha['TURMA DESCRITA']);
      const disciplina = texto(linha.DISCIPLINA);
      const letra = texto(linha.TURMA);
      const professor = texto(linha['NOME SUPRIDO']);

      if (!descricao || !disciplina) {
        ignoradas += 1;
        continue;
      }

      const nomeTurma = letra ? `${descricao} (Turma ${letra})` : descricao;

      // --- Turma ---
      if (!cacheTurmas.has(nomeTurma)) {
        const turnoId = turnoPorCodigo.get(codigoDoTurno(descricao, letra)) || turnos[0].id;
        await banco.executar(
          `INSERT INTO turmas (nome_descricao, turno_id) VALUES (?, ?)
           ON CONFLICT (nome_descricao) DO NOTHING`,
          [nomeTurma, turnoId]
        );
        const t = await banco.buscarUm(`SELECT id FROM turmas WHERE nome_descricao = ?`, [nomeTurma]);
        cacheTurmas.set(nomeTurma, t.id);
      }
      const turmaId = cacheTurmas.get(nomeTurma);

      const disciplinaId = await resolverDisciplina(disciplina);

      const professorId =
        professor && professor.toUpperCase() !== 'A DEFINIR' ? await resolverProfessor(professor) : null;

      // --- Alocação (sem repetir a mesma combinação) ---
      const chave = `${turmaId}|${disciplinaId}|${professorId ?? '-'}`;
      if (alocacoesVistas.has(chave)) {
        duplicadas += 1;
        continue;
      }
      alocacoesVistas.add(chave);

      await banco.executar(
        `INSERT INTO alocacoes (turma_id, disciplina_id, professor_id, tipo) VALUES (?, ?, ?, ?)`,
        [turmaId, disciplinaId, professorId, tipoDaTurma(descricao)]
      );
    }

    const resumo = {
      turmas: cacheTurmas.size,
      disciplinas: cacheDisciplinas.size,
      professores: cacheProfessores.size,
      alocacoes: alocacoesVistas.size,
      ignoradas,
      duplicadas
    };

    registrar('✅ Importação concluída.');
    registrar(`   • Turmas .......... ${resumo.turmas}`);
    registrar(`   • Disciplinas ..... ${resumo.disciplinas}`);
    registrar(`   • Professores ..... ${resumo.professores}`);
    registrar(`   • Alocações ....... ${resumo.alocacoes}`);
    if (ignoradas) registrar(`   • Linhas ignoradas (sem turma/disciplina): ${ignoradas}`);
    if (duplicadas) registrar(`   • Linhas duplicadas descartadas: ${duplicadas}`);

    return resumo;
  });
}

/* ==========================================
   INSPEÇÃO (substitui o debug_excel.py)
   ========================================== */

function inspecionar(caminho) {
  console.log('='.repeat(72));
  console.log(`ARQUIVO ......... ${caminho}`);

  const pasta = XLSX.readFile(caminho);
  const brutas = XLSX.utils.sheet_to_json(pasta.Sheets[pasta.SheetNames[0]], { defval: '' });
  console.log(`LINHAS .......... ${brutas.length}`);
  console.log('='.repeat(72));

  console.log('\nCOLUNAS (entre aspas, para revelar espaços invisíveis):');
  for (const coluna of Object.keys(brutas[0] || {})) {
    const normalizada = String(coluna).trim().toUpperCase();
    const marca = normalizada !== coluna ? '   ⚠️ espaço sobrando ou caixa divergente' : '';
    console.log(`  ${JSON.stringify(coluna).padEnd(24)} → ${JSON.stringify(normalizada)}${marca}`);
  }

  const { linhas } = lerPlanilha(caminho);
  console.log('\n✅ Todas as colunas obrigatórias estão presentes.');

  const porTurma = new Map();
  for (const l of linhas) {
    const chave = `${texto(l['TURMA DESCRITA'])} (Turma ${texto(l.TURMA)})`;
    porTurma.set(chave, (porTurma.get(chave) || 0) + 1);
  }

  console.log(`\nTURMAS ENCONTRADAS: ${porTurma.size}`);
  for (const [nome, total] of [...porTurma].sort()) {
    console.log(`  ${nome}  →  ${total} disciplina(s)`);
  }

  const semProfessor = linhas.filter((l) => texto(l['NOME SUPRIDO']).toUpperCase() === 'A DEFINIR').length;
  console.log(`\nLinhas sem professor definido: ${semProfessor}`);
}

/* ==========================================
   CLI
   ========================================== */

async function principal() {
  const args = process.argv.slice(2);
  const indiceArquivo = args.indexOf('--arquivo');
  const caminho = indiceArquivo >= 0 ? args[indiceArquivo + 1] : PLANILHA_PADRAO;

  if (args.includes('--inspecionar')) {
    inspecionar(caminho);
    return;
  }

  const banco = require('./db');
  await banco.inicializar();
  await importar(banco, { caminho, resetTotal: args.includes('--reset') });
  await banco.fechar();
}

if (require.main === module) {
  principal().catch((erro) => {
    console.error(`❌ ${erro.message}`);
    process.exit(1);
  });
}

module.exports = { importar, inspecionar, lerPlanilha, PLANILHA_PADRAO };

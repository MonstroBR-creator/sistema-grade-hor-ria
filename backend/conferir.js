/**
 * CONFERIR.JS — Mostra o que está gravado no banco.
 *
 * Substitui o antigo backend/teste_db.py, que abria o arquivo SQLite
 * diretamente e por isso não enxergava o banco PostgreSQL de produção.
 *
 *   node backend/conferir.js            # resumo + turmas
 *   node backend/conferir.js --tudo     # inclui alocações e a grade montada
 */

'use strict';

const banco = require('./db');

const TABELAS = ['turnos', 'turmas', 'professores', 'disciplinas', 'alocacoes', 'grade_horaria', 'usuarios'];

async function conferir() {
  await banco.inicializar();

  const detalhado = process.argv.includes('--tudo');

  console.log('\n--- RESUMO ---');
  for (const tabela of TABELAS) {
    try {
      const { total } = await banco.buscarUm(`SELECT COUNT(*) AS total FROM ${tabela}`);
      console.log(`  ${tabela.padEnd(15)} ${String(total).padStart(5)} registro(s)`);
    } catch (erro) {
      console.log(`  ${tabela.padEnd(15)}     — indisponível (${erro.message})`);
    }
  }

  console.log('\n--- CONTAS DE ACESSO ---');
  const usuarios = await banco.buscarTodos(`SELECT id, usuario, perfil, nome FROM usuarios ORDER BY id`);
  for (const u of usuarios) {
    console.log(`  #${String(u.id).padEnd(3)} ${u.usuario.padEnd(18)} ${u.perfil.padEnd(14)} ${u.nome}`);
  }

  console.log('\n--- TURMAS ---');
  const turmas = await banco.buscarTodos(
    `SELECT t.id, t.nome_descricao, tu.nome AS turno
       FROM turmas t LEFT JOIN turnos tu ON t.turno_id = tu.id
      ORDER BY LOWER(t.nome_descricao)`
  );
  for (const t of turmas) {
    console.log(`  #${String(t.id).padEnd(3)} ${t.nome_descricao}  [${t.turno || 'sem turno'}]`);
  }

  if (detalhado) {
    console.log('\n--- ALOCAÇÕES ---');
    const alocacoes = await banco.buscarTodos(
      `SELECT a.id, t.nome_descricao AS turma, d.nome AS materia,
              COALESCE(p.nome, 'A DEFINIR') AS professor, COALESCE(a.tipo, 'PRESENCIAL') AS tipo
         FROM alocacoes a
         JOIN turmas t ON a.turma_id = t.id
         JOIN disciplinas d ON a.disciplina_id = d.id
         LEFT JOIN professores p ON a.professor_id = p.id
        ORDER BY LOWER(t.nome_descricao), LOWER(d.nome)`
    );
    for (const a of alocacoes) {
      console.log(`  #${String(a.id).padEnd(4)} ${a.turma} | ${a.materia} | ${a.professor} | ${a.tipo}`);
    }
  }

  console.log('\n--- AULAS POSICIONADAS NA GRADE ---');
  const grade = await banco.buscarTodos(
    `SELECT t.nome_descricao AS turma, g.dia_semana, g.num_aula, d.nome AS materia,
            COALESCE(p.nome, 'A DEFINIR') AS professor
       FROM grade_horaria g
       JOIN turmas t ON g.turma_id = t.id
       JOIN alocacoes a ON g.alocacao_id = a.id
       JOIN disciplinas d ON a.disciplina_id = d.id
       LEFT JOIN professores p ON a.professor_id = p.id
      ORDER BY LOWER(t.nome_descricao), g.num_aula`
  );
  if (!grade.length) console.log('  (nenhuma aula montada ainda)');
  for (const g of grade) {
    console.log(`  ${g.turma} | ${g.dia_semana} ${g.num_aula}ª | ${g.materia} — ${g.professor}`);
  }

  await banco.fechar();
}

conferir().catch((erro) => {
  console.error(`❌ ${erro.message}`);
  process.exit(1);
});

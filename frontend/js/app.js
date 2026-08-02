/**
 * APP.JS — Montagem da grade horária (CEEBJA / EJA)
 * Requer js/sessao.js carregado antes (Sessao, api, escapeHtml, avisar).
 */

'use strict';

/* ==========================================
   CONSTANTES
   ========================================== */

const DIAS_SEMANA = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA'];
const NUMEROS_AULA = [1, 2, 3, 4, 5];

const HORARIOS_TURNO = {
  MANHA: [
    { num: 1, rotulo: '1ª AULA', inicio: '07:50', fim: '08:40' },
    { num: 2, rotulo: '2ª AULA', inicio: '08:40', fim: '09:30' },
    { num: 3, rotulo: '3ª AULA', inicio: '09:30', fim: '10:20' },
    { tipo: 'PAUSA', rotulo: 'PAUSA', texto: 'INTERVALO DE DESCANSO (10:20 - 10:30)' },
    { num: 4, rotulo: '4ª AULA', inicio: '10:30', fim: '11:20' },
    { num: 5, rotulo: '5ª AULA', inicio: '11:20', fim: '12:10' }
  ],
  TARDE: [
    { num: 1, rotulo: '1ª AULA', inicio: '13:30', fim: '14:20' },
    { num: 2, rotulo: '2ª AULA', inicio: '14:20', fim: '15:10' },
    { num: 3, rotulo: '3ª AULA', inicio: '15:10', fim: '16:00' },
    { tipo: 'PAUSA', rotulo: 'PAUSA', texto: 'INTERVALO DE DESCANSO (16:00 - 16:10)' },
    { num: 4, rotulo: '4ª AULA', inicio: '16:10', fim: '17:00' },
    { num: 5, rotulo: '5ª AULA', inicio: '17:00', fim: '17:50' }
  ],
  NOITE: [
    { num: 1, rotulo: '1ª AULA', inicio: '18:15', fim: '19:05' },
    { num: 2, rotulo: '2ª AULA', inicio: '19:05', fim: '19:55' },
    { tipo: 'PAUSA', rotulo: 'PAUSA', texto: 'INTERVALO DE DESCANSO (19:55 - 20:05)' },
    { num: 3, rotulo: '3ª AULA', inicio: '20:05', fim: '20:55' },
    { num: 4, rotulo: '4ª AULA', inicio: '20:55', fim: '21:45' },
    { num: 5, rotulo: '5ª AULA', inicio: '21:45', fim: '22:35' }
  ]
};

/** Ordem de exibição dos grupos no seletor de turmas. */
const CATEGORIAS = [
  { chave: 'MANHA_FUNDAMENTAL', label: '📍 MANHÃ — ENSINO FUNDAMENTAL' },
  { chave: 'MANHA_MEDIO', label: '📍 MANHÃ — ENSINO MÉDIO' },
  { chave: 'MANHA_OUTRO', label: '📍 MANHÃ — OUTRAS' },
  { chave: 'TARDE_FUNDAMENTAL', label: '📍 TARDE — ENSINO FUNDAMENTAL' },
  { chave: 'TARDE_MEDIO', label: '📍 TARDE — ENSINO MÉDIO' },
  { chave: 'TARDE_OUTRO', label: '📍 TARDE — OUTRAS' },
  { chave: 'NOITE_FUNDAMENTAL', label: '📍 NOITE — ENSINO FUNDAMENTAL' },
  { chave: 'NOITE_MEDIO', label: '📍 NOITE — ENSINO MÉDIO' },
  { chave: 'NOITE_OUTRO', label: '📍 NOITE — OUTRAS' },
  { chave: 'SEMIPRESENCIAL', label: '📍 SEMIPRESENCIAL' }
];

/* ==========================================
   ESTADO
   ========================================== */

const estado = {
  turmas: new Map(),      // id (string) -> objeto da turma
  turmaSelecionada: null,
  alocacoesTurma: [],
  gradeAlocada: {},       // "DIA-AULA" -> alocacao_id
  gradeGlobal: [],
  conflitos: new Map()    // "professor|dia|aula" -> { professor, dia, aula, turmas: [] }
};

const somenteLeitura = () => Sessao.somenteLeitura();

/* ==========================================
   INICIALIZAÇÃO
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
  aplicarModoSomenteLeitura();
  carregarTurmas();
});

function aplicarModoSomenteLeitura() {
  if (!somenteLeitura()) return;

  document.getElementById('coluna-cards-arrastaveis')?.remove();
  document.getElementById('banner-modo-consulta')?.classList.remove('hidden');

  const quadro = document.getElementById('coluna-quadro-grade');
  if (quadro) {
    quadro.classList.remove('lg:col-span-3');
    quadro.classList.add('lg:col-span-4');
  }
}

async function carregarTurmas() {
  const seletor = document.getElementById('select-turma-unica');
  if (!seletor) return;

  // Quadro vazio do turno matutino enquanto nenhuma turma foi escolhida.
  renderizarEstruturaQuadro('MANHA');

  try {
    const turmas = await api('/api/turmas');

    if (!turmas.length) {
      seletor.innerHTML = '<option value="">Nenhuma turma cadastrada</option>';
      return;
    }

    estado.turmas = new Map(turmas.map((t) => [String(t.id), t]));

    seletor.innerHTML = '<option value="">-- SELECIONE A TURMA --</option>';

    // Cada turma entra em EXATAMENTE um grupo. Na versão anterior os filtros se
    // sobrepunham e a mesma turma aparecia repetida em vários grupos — ou sumia
    // do seletor quando não casava com nenhum deles.
    const grupos = new Map(CATEGORIAS.map((c) => [c.chave, []]));
    turmas.forEach((t) => grupos.get(categoriaDaTurma(t)).push(t));

    const colador = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

    CATEGORIAS.forEach(({ chave, label }) => {
      const lista = grupos.get(chave);
      if (!lista.length) return;

      lista.sort((a, b) => colador.compare(a.nome_descricao || '', b.nome_descricao || ''));

      const grupo = document.createElement('optgroup');
      grupo.label = label;

      lista.forEach((t) => {
        const opcao = document.createElement('option');
        opcao.value = String(t.id);
        opcao.textContent = t.nome_descricao;
        grupo.appendChild(opcao);
      });

      seletor.appendChild(grupo);
    });

    seletor.addEventListener('change', aoTrocarTurma);
  } catch (erro) {
    console.error('Erro ao carregar turmas:', erro);
    seletor.innerHTML = '<option value="">Erro ao carregar turmas</option>';
    avisar(erro.message, 'erro');
  }
}

function aoTrocarTurma(evento) {
  const turma = estado.turmas.get(String(evento.target.value));

  if (!turma) {
    limparTelas();
    return;
  }

  estado.turmaSelecionada = turma;
  renderizarEstruturaQuadro(turnoDaTurma(turma));
  carregarDadosTurma(turma.id);
}

/* ==========================================
   CLASSIFICAÇÃO DE TURMAS
   ========================================== */

const emMaiusculas = (turma) => String(turma?.nome_descricao || '').toUpperCase();

/**
 * Antes desta revisão a checagem era `/\b\d{1,2}\b/.test(descricao)`, que casava
 * com QUALQUER turma cujo nome tivesse um número ("1º MÓDULO", "2º MÓDULO"...).
 * Resultado: praticamente todas as turmas eram tratadas como semipresenciais.
 */
function ehSemipresencial(turma) {
  return /\bSEMI(PRESENCIAL)?\b/.test(emMaiusculas(turma));
}

/** O código do turno vem do banco e é a fonte confiável; o texto é só o plano B. */
function turnoDaTurma(turma) {
  const codigo = String(turma?.turno_codigo || '').toUpperCase();
  if (codigo === 'A') return 'MANHA';
  if (codigo === 'B') return 'TARDE';
  if (codigo === 'C') return 'NOITE';

  const descricao = emMaiusculas(turma);
  if (descricao.includes('NOITE')) return 'NOITE';
  if (descricao.includes('TARDE')) return 'TARDE';
  if (descricao.includes('MANHÃ') || descricao.includes('MANHA')) return 'MANHA';
  if (ehSemipresencial(turma)) return 'NOITE';
  return 'MANHA';
}

function nivelDaTurma(turma) {
  const descricao = emMaiusculas(turma);
  if (descricao.includes('FUNDAMENTAL') || descricao.includes('FUND')) return 'FUNDAMENTAL';
  if (descricao.includes('MÉDIO') || descricao.includes('MEDIO')) return 'MEDIO';
  return 'OUTRO';
}

function categoriaDaTurma(turma) {
  if (ehSemipresencial(turma)) return 'SEMIPRESENCIAL';
  return `${turnoDaTurma(turma)}_${nivelDaTurma(turma)}`;
}

/* ==========================================
   QUADRO DE HORÁRIOS
   ========================================== */

function renderizarEstruturaQuadro(chaveTurno) {
  const corpo = document.getElementById('corpo-quadro-grade');
  if (!corpo) return;

  corpo.innerHTML = '';
  const linhas = HORARIOS_TURNO[chaveTurno] || HORARIOS_TURNO.MANHA;

  linhas.forEach((item) => {
    const tr = document.createElement('tr');

    if (item.tipo === 'PAUSA') {
      tr.className = 'bg-red-50 border-y border-red-200 text-red-700 font-bold text-xs uppercase';
      tr.innerHTML = `
        <td class="p-2 border border-slate-200 text-center bg-red-100/50">${escapeHtml(item.rotulo)}</td>
        <td colspan="${DIAS_SEMANA.length}" class="p-2.5 text-center tracking-wide">${escapeHtml(item.texto)}</td>
      `;
      corpo.appendChild(tr);
      return;
    }

    tr.className = 'border-b border-slate-200';

    const tdHorario = document.createElement('td');
    tdHorario.className = 'p-2 bg-slate-50 font-bold border border-slate-200 text-slate-700 w-28 text-center';
    tdHorario.innerHTML = `
      <div class="text-xs text-slate-800 font-bold">${escapeHtml(item.rotulo)}</div>
      <div class="text-[10px] text-slate-500 font-normal mt-0.5">${escapeHtml(item.inicio)} - ${escapeHtml(item.fim)}</div>
    `;
    tr.appendChild(tdHorario);

    DIAS_SEMANA.forEach((dia) => {
      const td = document.createElement('td');
      td.className = 'p-2 border border-slate-200 slot-aula relative bg-white text-center';
      td.dataset.dia = dia;
      td.dataset.aula = String(item.num);

      if (!somenteLeitura()) {
        td.addEventListener('dragover', (e) => {
          e.preventDefault();
          td.classList.add('celula-hover');
        });
        td.addEventListener('dragleave', () => td.classList.remove('celula-hover'));
        td.addEventListener('drop', (e) => tratarDropAula(e, td, dia, item.num));
      }

      tr.appendChild(td);
    });

    corpo.appendChild(tr);
  });
}

async function carregarDadosTurma(turmaId) {
  try {
    // A API agora filtra as alocações no servidor em vez de baixar todas e
    // descartar a maior parte no navegador.
    const [alocacoes, grade] = await Promise.all([
      api(`/api/alocacoes?turma_id=${encodeURIComponent(turmaId)}`),
      api('/api/grade')
    ]);

    estado.alocacoesTurma = alocacoes;
    estado.gradeGlobal = grade;

    estado.gradeAlocada = {};
    grade
      .filter((g) => String(g.turma_id) === String(turmaId))
      .forEach((g) => {
        estado.gradeAlocada[`${g.dia_semana}-${g.num_aula}`] = g.alocacao_id;
      });

    estado.conflitos = calcularConflitos(grade);

    renderizarCardsDisponiveis();
    atualizarQuadroGrade();
    renderizarPainelConflitos();
  } catch (erro) {
    console.error('Erro ao carregar dados da turma:', erro);
    avisar(erro.message, 'erro');
  }
}

function renderizarCardsDisponiveis() {
  const container = document.getElementById('container-cards-disponiveis');
  if (!container) return;

  container.innerHTML = '';

  if (!estado.alocacoesTurma.length) {
    container.innerHTML =
      '<p class="text-xs text-slate-400 italic text-center py-4">Nenhuma disciplina alocada para esta turma.</p>';
    return;
  }

  estado.alocacoesTurma.forEach((item) => {
    const tipo = String(item.tipo || '').toUpperCase();
    const professor = item.professor_nome || 'A DEFINIR';
    const semProfessor = professor === 'A DEFINIR';

    let cores = 'bg-white border-slate-200';
    let selo = '';
    let icone = semProfessor ? '⚠️' : '👤';

    if (tipo.includes('SISTEMA') || tipo.includes('ONLINE')) {
      cores = 'bg-purple-50/60 border-purple-200';
      selo = '<span class="bg-purple-200/80 text-purple-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">SISTEMA</span>';
      icone = '💻';
    } else if (tipo.includes('TUTORIA')) {
      cores = 'bg-emerald-50/60 border-emerald-200';
      selo = '<span class="bg-emerald-200/80 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">TUTORIA</span>';
      icone = '👥';
    } else if (tipo.includes('SEMI')) {
      // O importador antes gravava 'PRESENCIAL' para todas as alocações; agora o
      // tipo vem da descrição da turma e as semipresenciais ganham selo próprio.
      cores = 'bg-sky-50/60 border-sky-200';
      selo = '<span class="bg-sky-200/80 text-sky-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">SEMI</span>';
      icone = '📘';
    }

    const corProfessor = semProfessor
      ? 'text-amber-600 font-bold'
      : tipo.includes('TUTORIA')
        ? 'text-emerald-800 font-semibold'
        : 'text-slate-600';

    const card = document.createElement('div');
    card.className = `card-materia p-3.5 border rounded-xl shadow-sm hover:shadow-md mb-3 relative ${cores}`;
    card.draggable = true;
    card.dataset.alocacaoId = String(item.alocacao_id);

    // escapeHtml impede que um nome com aspas ou "<" quebre a marcação.
    card.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <div class="font-bold text-slate-800 text-xs uppercase tracking-tight">${escapeHtml(item.disciplina_nome)}</div>
        ${selo}
      </div>
      <div class="text-[11px] ${corProfessor} flex items-center gap-1.5">
        <span>${icone}</span>
        <span>${escapeHtml(professor)}</span>
      </div>
    `;

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(item.alocacao_id));
      e.dataTransfer.effectAllowed = 'copy';
    });

    container.appendChild(card);
  });
}

function atualizarQuadroGrade() {
  DIAS_SEMANA.forEach((dia) => {
    NUMEROS_AULA.forEach((aula) => {
      const celula = document.querySelector(`.slot-aula[data-dia="${dia}"][data-aula="${aula}"]`);
      if (!celula) return;

      celula.innerHTML = '';
      celula.classList.remove('celula-conflito');

      const alocacaoId = estado.gradeAlocada[`${dia}-${aula}`];
      const alocacao = alocacaoId
        ? estado.alocacoesTurma.find((a) => String(a.alocacao_id) === String(alocacaoId))
        : null;

      if (!alocacao) {
        celula.innerHTML = '<span class="text-slate-300 text-xs">-</span>';
        return;
      }

      if (estado.conflitos.has(chaveConflito(alocacao.professor_nome, dia, aula))) {
        celula.classList.add('celula-conflito');
      }

      const cartao = document.createElement('div');
      cartao.className = 'p-2 bg-blue-50 border border-blue-200 rounded-lg text-left relative group shadow-sm';
      cartao.innerHTML = `
        <div class="font-bold text-slate-800 text-[11px]">${escapeHtml(alocacao.disciplina_nome)}</div>
        <div class="text-[10px] text-slate-500 mt-0.5">${escapeHtml(alocacao.professor_nome)}</div>
      `;

      if (!somenteLeitura()) {
        // Botão criado por addEventListener em vez de onclick inline: nomes com
        // apóstrofo (ex.: "D'Ávila") quebravam o atributo gerado por template.
        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className =
          'absolute top-1 right-1 text-red-400 font-bold text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600';
        remover.innerHTML = '&times;';
        remover.title = 'Remover esta aula';
        remover.setAttribute('aria-label', `Remover ${alocacao.disciplina_nome} de ${dia}, ${aula}ª aula`);
        remover.addEventListener('click', () => removerAulaGrade(dia, aula));
        cartao.appendChild(remover);
      }

      celula.appendChild(cartao);
    });
  });
}

/* ==========================================
   ARRASTAR E SOLTAR
   ========================================== */

async function tratarDropAula(evento, celula, dia, numAula) {
  evento.preventDefault();
  celula.classList.remove('celula-hover');

  const alocacaoId = evento.dataTransfer.getData('text/plain');
  if (!alocacaoId || !estado.turmaSelecionada) return;

  try {
    const resposta = await api('/api/grade', {
      metodo: 'POST',
      corpo: {
        turma_id: estado.turmaSelecionada.id,
        dia_semana: dia,
        num_aula: numAula,
        alocacao_id: Number(alocacaoId)
      }
    });

    if (resposta?.conflito) {
      avisar(
        `Atenção: ${resposta.conflito.professor} já tem aula em "${resposta.conflito.turma}" neste horário.`,
        'alerta',
        7000
      );
    }

    await carregarDadosTurma(estado.turmaSelecionada.id);
  } catch (erro) {
    // Antes, uma falha ao salvar era silenciosa: a aula sumia sem explicação.
    console.error('Erro ao salvar aula na grade:', erro);
    avisar(erro.message, 'erro');
  }
}

async function removerAulaGrade(dia, numAula) {
  if (!estado.turmaSelecionada) return;

  try {
    await api('/api/grade', {
      metodo: 'DELETE',
      corpo: {
        turma_id: estado.turmaSelecionada.id,
        dia_semana: dia,
        num_aula: numAula
      }
    });

    await carregarDadosTurma(estado.turmaSelecionada.id);
  } catch (erro) {
    console.error('Erro ao remover aula:', erro);
    avisar(erro.message, 'erro');
  }
}

/* ==========================================
   CONFLITOS DE DOCENTE
   ========================================== */

const chaveConflito = (professor, dia, aula) => `${professor}|${dia}|${aula}`;

/**
 * Agrupa a grade inteira por professor/dia/aula e reporta apenas os grupos que
 * envolvem MAIS DE UMA turma.
 * A versão anterior comparava uma única turma guardada por chave e empurrava um
 * item repetido para a lista a cada ocorrência extra, gerando alertas duplicados.
 */
function calcularConflitos(grade) {
  const agrupado = new Map();

  grade.forEach((g) => {
    const professor = String(g.professor_nome || '').trim();
    if (!professor || professor === 'A DEFINIR') return;

    const chave = chaveConflito(professor, g.dia_semana, g.num_aula);
    if (!agrupado.has(chave)) {
      agrupado.set(chave, { professor, dia: g.dia_semana, aula: g.num_aula, turmas: new Set() });
    }
    agrupado.get(chave).turmas.add(String(g.turma_id));
  });

  const conflitos = new Map();
  agrupado.forEach((valor, chave) => {
    if (valor.turmas.size > 1) {
      conflitos.set(chave, {
        ...valor,
        turmas: [...valor.turmas].map((id) => estado.turmas.get(id)?.nome_descricao || `Turma ${id}`)
      });
    }
  });

  return conflitos;
}

function renderizarPainelConflitos() {
  const painel = document.getElementById('painel-alerta');
  if (!painel) return;

  const lista = [...estado.conflitos.values()];

  if (!lista.length) {
    painel.classList.add('hidden');
    painel.innerHTML = '';
    return;
  }

  lista.sort(
    (a, b) => DIAS_SEMANA.indexOf(a.dia) - DIAS_SEMANA.indexOf(b.dia) || a.aula - b.aula
  );

  painel.innerHTML = `
    ⚠️ <strong>ALERTA DE CONFLITO DE DOCENTE!</strong><br>
    O mesmo professor está alocado em turmas diferentes no mesmo horário:
    <ul class="list-disc ml-5 mt-1 font-normal">
      ${lista
        .map(
          (c) =>
            `<li><strong>${escapeHtml(c.professor)}</strong> — ${escapeHtml(c.dia)}, ${c.aula}ª aula (${c.turmas
              .map(escapeHtml)
              .join(' × ')})</li>`
        )
        .join('')}
    </ul>
  `;
  painel.classList.remove('hidden');
}

/* ==========================================
   LIMPEZA
   ========================================== */

function limparTelas() {
  estado.turmaSelecionada = null;
  estado.alocacoesTurma = [];
  estado.gradeAlocada = {};
  estado.conflitos = new Map();

  const container = document.getElementById('container-cards-disponiveis');
  if (container) {
    container.innerHTML =
      '<p class="text-xs text-slate-400 italic text-center py-4">Selecione uma turma no filtro.</p>';
  }

  renderizarEstruturaQuadro('MANHA');
  document.getElementById('painel-alerta')?.classList.add('hidden');
}

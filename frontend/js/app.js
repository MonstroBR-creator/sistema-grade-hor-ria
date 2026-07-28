const DIAS_SEMANA = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA'];
const NUM_AULAS = [1, 2, 3, 4, 5];

let turmaSelecionadaId = null;
let alocacoesTurma = [];
let gradeAlocada = {}; // Mapa: "DIA_SEMANA-NUM_AULA" -> alocacao_id

document.addEventListener('DOMContentLoaded', () => {
  inicializarSistema();
});

async function inicializarSistema() {
  const select = document.getElementById('select-turma-unica');

  try {
    const res = await fetch('/api/turmas');
    const turmas = await res.json();

    if (!turmas || turmas.length === 0) {
      select.innerHTML = '<option value="">Nenhuma turma cadastrada</option>';
      return;
    }

    select.innerHTML = '<option value="">-- SELECIONE A TURMA / MÓDULO --</option>';

    turmas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.nome_descricao} [${t.turno_nome || 'GERAL'}]`;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      turmaSelecionadaId = e.target.value;
      if (turmaSelecionadaId) {
        carregarDadosTurma(turmaSelecionadaId);
      } else {
        limparTelas();
      }
    });

    renderizarEstruturaQuadro();

  } catch (err) {
    console.error('Erro ao inicializar:', err);
    select.innerHTML = '<option value="">Erro ao conectar ao servidor</option>';
  }
}

function renderizarEstruturaQuadro() {
  const tbody = document.getElementById('corpo-quadro-grade');
  tbody.innerHTML = '';

  NUM_AULAS.forEach(numAula => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-200';

    // Coluna do Número da Aula
    const tdAula = document.createElement('td');
    tdAula.className = 'p-2 bg-slate-100 font-bold border border-slate-200 text-slate-700';
    tdAula.textContent = `${numAula}ª Aula`;
    tr.appendChild(tdAula);

    // Slots para os 5 dias da semana
    DIAS_SEMANA.forEach(dia => {
      const tdSlot = document.createElement('td');
      tdSlot.className = 'p-2 border border-slate-200 slot-aula min-h-[60px] relative bg-slate-50 transition-colors';
      tdSlot.dataset.dia = dia;
      tdSlot.dataset.aula = numAula;

      // Eventos Drag & Drop
      tdSlot.addEventListener('dragover', e => { e.preventDefault(); tdSlot.classList.add('drag-over'); });
      tdSlot.addEventListener('dragleave', () => tdSlot.classList.remove('drag-over'));
      tdSlot.addEventListener('drop', e => tratarDropAula(e, dia, numAula));

      tr.appendChild(tdSlot);
    });

    tbody.appendChild(tr);
  });
}

async function carregarDadosTurma(turmaId) {
  try {
    // 1. Busca as alocações (cards disponíveis)
    const resAloc = await fetch(`/api/alocacoes/${turmaId}`);
    alocacoesTurma = await resAloc.json();

    // 2. Busca a grade montada salva no SQLite
    const resGrade = await fetch('/api/grade');
    const todasGrades = await resGrade.json();
    
    // Filtra a grade da turma atual
    const gradeTurma = todasGrades.filter(g => String(g.turma_id) === String(turmaId));
    
    gradeAlocada = {};
    gradeTurma.forEach(g => {
      gradeAlocada[`${g.dia_semana}-${g.num_aula}`] = g.alocacao_id;
    });

    renderizarCardsDisponiveis();
    atualizarQuadroGrade();
    verificarConflitosGerais(todasGrades);

  } catch (err) {
    console.error('Erro ao carregar dados:', err);
  }
}

function renderizarCardsDisponiveis() {
  const container = document.getElementById('container-cards-disponiveis');
  container.innerHTML = '';

  if (!alocacoesTurma || alocacoesTurma.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">Nenhuma matéria para esta turma.</p>';
    return;
  }

  alocacoesTurma.forEach(item => {
    const card = document.createElement('div');
    card.draggable = true;
    card.className = 'p-3 bg-white border border-slate-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 transition-all';
    card.dataset.alocacaoId = item.alocacao_id;

    card.innerHTML = `
      <div class="font-bold text-slate-800 text-xs mb-1">${item.disciplina_nome}</div>
      <div class="text-[11px] text-slate-600">${item.professor_nome || 'A DEFINIR'}</div>
      <div class="text-[10px] text-slate-400 mt-1 uppercase">${item.tipo || 'PRESENCIAL'}</div>
    `;

    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', item.alocacao_id);
    });

    container.appendChild(card);
  });
}

function atualizarQuadroGrade() {
  DIAS_SEMANA.forEach(dia => {
    NUM_AULAS.forEach(aula => {
      const slotKey = `${dia}-${aula}`;
      const alocacaoId = gradeAlocada[slotKey];
      const slot = document.querySelector(`.slot-aula[data-dia="${dia}"][data-aula="${aula}"]`);

      if (slot) {
        slot.innerHTML = '';

        if (alocacaoId) {
          const aloc = alocacoesTurma.find(a => String(a.alocacao_id) === String(alocacaoId));
          if (aloc) {
            const cardSlot = document.createElement('div');
            cardSlot.className = 'p-2 bg-blue-50 border border-blue-300 rounded text-left relative group';
            cardSlot.innerHTML = `
              <button onclick="removerAulaGrade('${dia}', ${aula})" class="absolute top-1 right-1 text-red-500 font-bold text-xs opacity-0 group-hover:opacity-100 hover:text-red-700">&times;</button>
              <div class="font-bold text-slate-800 text-[11px]">${aloc.disciplina_nome}</div>
              <div class="text-[10px] text-slate-600">${aloc.professor_nome}</div>
            `;
            slot.appendChild(cardSlot);
          }
        }
      }
    });
  });
}

async function tratarDropAula(e, dia, numAula) {
  e.preventDefault();
  const slot = e.currentTarget;
  slot.classList.remove('drag-over');

  const alocacaoId = e.dataTransfer.getData('text/plain');
  if (!alocacaoId || !turmaSelecionadaId) return;

  // Salva via API POST /api/grade
  try {
    const response = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turma_id: turmaSelecionadaId,
        dia_semana: dia,
        num_aula: numAula,
        alocacao_id: alocacaoId
      })
    });

    if (response.ok) {
      gradeAlocada[`${dia}-${numAula}`] = alocacaoId;
      carregarDadosTurma(turmaSelecionadaId); // Recarrega para atualizar quadro e validar conflitos
    }
  } catch (err) {
    console.error('Erro ao salvar aula na grade:', err);
  }
}

async function removerAulaGrade(dia, numAula) {
  try {
    const response = await fetch('/api/grade', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turma_id: turmaSelecionadaId,
        dia_semana: dia,
        num_aula: numAula
      })
    });

    if (response.ok) {
      delete gradeAlocada[`${dia}-${numAula}`];
      carregarDadosTurma(turmaSelecionadaId);
    }
  } catch (err) {
    console.error('Erro ao remover aula:', err);
  }
}

// Checagem de Conflito: Avisa se o mesmo professor dá aula em 2 turmas no mesmo dia e horário
function verificarConflitosGerais(todasGrades) {
  const alertaDiv = document.getElementById('painel-alerta');
  alertaDiv.classList.add('hidden');
  alertaDiv.innerHTML = '';

  const ocupacaoProfessor = {}; // "PROFESSOR-DIA-AULA" -> turma_id
  let conflitos = [];

  todasGrades.forEach(g => {
    const prof = g.professor_nome;
    if (prof && prof !== 'A DEFINIR') {
      const chave = `${prof}-${g.dia_semana}-${g.num_aula}`;
      if (ocupacaoProfessor[chave] && ocupacaoProfessor[chave] !== g.turma_id) {
        conflitos.push({ professor: prof, dia: g.dia_semana, aula: g.num_aula });
      } else {
        ocupacaoProfessor[chave] = g.turma_id;
      }
    }
  });

  if (conflitos.length > 0) {
    alertaDiv.innerHTML = `
      ⚠️ <strong>ALERTA DE CONFLITO DE HORÁRIO DE DOCENTE!</strong><br>
      O sistema detectou professores alocados no mesmo dia/horário em turmas diferentes:
      <ul class="list-disc ml-5 mt-1 font-normal">
        ${conflitos.map(c => `<li><strong>${c.professor}</strong>: ${c.dia}, ${c.aula}ª Aula</li>`).join('')}
      </ul>
    `;
    alertaDiv.classList.remove('hidden');
  }
}

function limparTelas() {
  document.getElementById('container-cards-disponiveis').innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">Selecione uma turma no filtro.</p>';
  renderizarEstruturaQuadro();
  document.getElementById('painel-alerta').classList.add('hidden');
}
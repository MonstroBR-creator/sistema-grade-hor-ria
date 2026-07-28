/**
 * APP.JS - Gestão da Grade Horária
 * Projeto: CEEBJA / EJA - Paraná
 * Compatível com schema.sql v1.2 (alocacoes, turmas, grade_horaria)
 */

const DIAS_SEMANA = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA'];
const NUM_AULAS = [1, 2, 3, 4, 5];

let turmaSelecionadaId = null;
let alocacoesTurma = [];
let gradeAlocada = {}; // Chave: "DIA_SEMANA-NUM_AULA" -> Valor: alocacao_id
let todasAsGradesGlobal = [];

document.addEventListener('DOMContentLoaded', () => {
  inicializarSistema();
});

async function inicializarSistema() {
  const select = document.getElementById('select-turma-unica');
  if (typeof renderizarEstruturaQuadro === 'function') {
    renderizarEstruturaQuadro();
  }

  try {
    const res = await fetch('/api/turmas');
    const turmas = await res.json();

    if (!turmas || turmas.length === 0) {
      select.innerHTML = '<option value="">Nenhuma turma cadastrada</option>';
      return;
    }

    select.innerHTML = '<option value="">-- SELECIONE A TURMA / MÓDULO --</option>';

    // --- REGRAS DE NEGÓCIO EJA / CEEBJA PARANÁ ---

    // Identifica Semipresencial por número isolado (ex: 01, 02) ou palavra SEMI
    const ehSemipresencial = t => {
      const desc = (t.nome_descricao || '').toUpperCase();
      return desc.includes('SEMI') || /\b\d{1,2}\b/.test(desc);
    };

    const ehManha = t => {
      const desc = (t.nome_descricao || '').toUpperCase();
      const codigo = (t.turno_codigo || '').toUpperCase();
      if (ehSemipresencial(t)) return false; // Semipresencial vai direto para a Noite
      return desc.includes('MANHÃ') || desc.includes('MANHA') || codigo === 'A';
    };

    const ehTarde = t => {
      const desc = (t.nome_descricao || '').toUpperCase();
      const codigo = (t.turno_codigo || '').toUpperCase();
      if (ehSemipresencial(t)) return false;
      return desc.includes('TARDE') || codigo === 'B';
    };

    const ehNoite = t => {
      const desc = (t.nome_descricao || '').toUpperCase();
      const codigo = (t.turno_codigo || '').toUpperCase();
      // Turmas com número (Semipresencial) entram obrigatoriamente no bloco da Noite
      return ehSemipresencial(t) || desc.includes('NOITE') || codigo === 'C';
    };

    // Ordenação pedagógica: Fundamental primeiro, Médio depois
    const ordenarPorNivel = (lista) => {
      return lista.sort((a, b) => {
        const descA = (a.nome_descricao || '').toUpperCase();
        const descB = (b.nome_descricao || '').toUpperCase();

        const ehFundA = descA.includes('FUNDAMENTAL') || descA.includes('FUND');
        const ehFundB = descB.includes('FUNDAMENTAL') || descB.includes('FUND');

        if (ehFundA && !ehFundB) return -1; // Fundamental no topo
        if (!ehFundA && ehFundB) return 1;  // Médio logo abaixo
        return descA.localeCompare(descB);  // Ordenação alfabética secundária
      });
    };

    // Separação e ordenação dos blocos de turmas
    const manhaOrdenado = ordenarPorNivel(turmas.filter(ehManha));
    const tardeOrdenado = ordenarPorNivel(turmas.filter(ehTarde));
    const noiteOrdenado = ordenarPorNivel(turmas.filter(ehNoite));

    const outros = turmas.filter(t => !ehManha(t) && !ehTarde(t) && !ehNoite(t));
    const outrosOrdenado = ordenarPorNivel(outros);

    // Construtor das categorias no HTML (<optgroup>)
    const adicionarGrupoAoSelect = (label, lista) => {
      if (lista.length === 0) return;
      const group = document.createElement('optgroup');
      group.label = `--- ${label} ---`;

      lista.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const tagSemi = ehSemipresencial(t) ? ' (SEMIPRESENCIAL)' : '';
        opt.textContent = `${t.nome_descricao}${tagSemi}`;
        group.appendChild(opt);
      });

      select.appendChild(group);
    };

    // Renderização dos grupos ordenados
    adicionarGrupoAoSelect('TURNO: MANHÃ (PRESENCIAL)', manhaOrdenado);
    adicionarGrupoAoSelect('TURNO: TARDE (PRESENCIAL)', tardeOrdenado);
    adicionarGrupoAoSelect('TURNO: NOITE (PRESENCIAL & SEMIPRESENCIAL)', noiteOrdenado);
    adicionarGrupoAoSelect('OUTRAS TURMAS', outrosOrdenado);

    // Evento ao trocar de turma no filtro
    select.addEventListener('change', (e) => {
      turmaSelecionadaId = e.target.value;
      if (turmaSelecionadaId) {
        carregarDadosTurma(turmaSelecionadaId);
      } else {
        limparTelas();
      }
    });

  } catch (err) {
    console.error('Erro ao conectar com API:', err);
    select.innerHTML = '<option value="">Erro ao carregar dados do servidor</option>';
  }
}

function renderizarEstruturaQuadro() {
  const tbody = document.getElementById('corpo-quadro-grade');
  if (!tbody) return;
  tbody.innerHTML = '';

  NUM_AULAS.forEach(numAula => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-200';

    const tdAula = document.createElement('td');
    tdAula.className = 'p-2 bg-slate-100 font-bold border border-slate-200 text-slate-700 w-16 text-center';
    tdAula.textContent = `${numAula}ª Aula`;
    tr.appendChild(tdAula);

    DIAS_SEMANA.forEach(dia => {
      const tdSlot = document.createElement('td');
      tdSlot.className = 'p-2 border border-slate-200 slot-aula min-h-[60px] relative bg-slate-50 transition-colors text-center';
      tdSlot.dataset.dia = dia;
      tdSlot.dataset.aula = numAula;

      tdSlot.addEventListener('dragover', e => { 
        e.preventDefault(); 
        tdSlot.classList.add('bg-blue-100'); 
      });
      tdSlot.addEventListener('dragleave', () => {
        tdSlot.classList.remove('bg-blue-100');
      });
      tdSlot.addEventListener('drop', e => tratarDropAula(e, dia, numAula));

      tr.appendChild(tdSlot);
    });

    tbody.appendChild(tr);
  });
}

async function carregarDadosTurma(turmaId) {
  try {
    // 1. Busca alocações (cards de matérias/professores da turma)
    const resAloc = await fetch('/api/alocacoes');
    const todasAlocacoes = await resAloc.json();
    alocacoesTurma = todasAlocacoes.filter(a => String(a.turma_id) === String(turmaId));

    // 2. Busca a grade montada salva no SQLite
    const resGrade = await fetch('/api/grade');
    todasAsGradesGlobal = await resGrade.json();

    const gradeTurma = todasAsGradesGlobal.filter(g => String(g.turma_id) === String(turmaId));

    gradeAlocada = {};
    gradeTurma.forEach(g => {
      gradeAlocada[`${g.dia_semana}-${g.num_aula}`] = g.alocacao_id;
    });

    renderizarCardsDisponiveis();
    atualizarQuadroGrade();
    verificarConflitosGerais();

  } catch (err) {
    console.error('Erro ao carregar turma:', err);
  }
}

function renderizarCardsDisponiveis() {
  const container = document.getElementById('container-cards-disponiveis');
  if (!container) return;
  container.innerHTML = '';

  if (!alocacoesTurma || alocacoesTurma.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">Nenhuma disciplina cadastrada.</p>';
    return;
  }

  alocacoesTurma.forEach(item => {
    const card = document.createElement('div');
    card.draggable = true;
    card.className = 'p-3 bg-white border border-slate-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-500 transition-all mb-2';
    card.dataset.alocacaoId = item.alocacao_id;

    card.innerHTML = `
      <div class="font-bold text-slate-800 text-xs mb-1">${item.disciplina_nome}</div>
      <div class="text-[11px] text-slate-600">${item.professor_nome || 'A DEFINIR'}</div>
      <div class="text-[10px] text-blue-600 mt-1 uppercase font-semibold">${item.tipo || 'PRESENCIAL'}</div>
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
            cardSlot.className = 'p-2 bg-blue-50 border border-blue-300 rounded text-left relative group shadow-sm';
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
  slot.classList.remove('bg-blue-100');

  const alocacaoId = e.dataTransfer.getData('text/plain');
  if (!alocacaoId || !turmaSelecionadaId) return;

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
      carregarDadosTurma(turmaSelecionadaId);
    }
  } catch (err) {
    console.error('Erro ao salvar na grade:', err);
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

function verificarConflitosGerais() {
  const alertaDiv = document.getElementById('painel-alerta');
  if (!alertaDiv) return;

  alertaDiv.classList.add('hidden');
  alertaDiv.innerHTML = '';

  const ocupacaoProfessor = {};
  let conflitos = [];

  todasAsGradesGlobal.forEach(g => {
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
      ⚠️ <strong>ALERTA DE CONFLITO DE HORÁRIO!</strong><br>
      O mesmo professor foi alocado no mesmo horário em turmas diferentes:
      <ul class="list-disc ml-5 mt-1 font-normal">
        ${conflitos.map(c => `<li><strong>${c.professor}</strong>: ${c.dia}, ${c.aula}ª Aula</li>`).join('')}
      </ul>
    `;
    alertaDiv.classList.remove('hidden');
  }
}

function limparTelas() {
  const container = document.getElementById('container-cards-disponiveis');
  if (container) {
    container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">Selecione uma turma no filtro.</p>';
  }
  renderizarEstruturaQuadro();
  const alerta = document.getElementById('painel-alerta');
  if (alerta) {
    alerta.classList.add('hidden');
  }
}
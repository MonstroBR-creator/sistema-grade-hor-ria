/**
 * APP.JS - Gestão de Grade Horária (CEEBJA / EJA)
 * Arquitetura: Clean Code / Vanilla JS / REST API
 * Desenvolvedor Full Stack Sênior & Master Data Analyst
 */

// --- CONTROLE DE SESSÃO E LOGOUT AUTOMÁTICO ---
(function verificarAutenticacao() {
  const token = localStorage.getItem('token');
  const usuarioRaw = localStorage.getItem('usuario');

  // Se não houver token/sessão, redireciona imediatamente para o login
  if (!token || !usuarioRaw) {
    window.location.replace('/login.html');
    return;
  }

  // Preenche dados do usuário logado no Header assim que o DOM carregar
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const usuario = JSON.parse(usuarioRaw);
      const elNome = document.getElementById('nome-usuario-logado');
      const elPerfil = document.getElementById('perfil-usuario-logado');

      if (elNome) elNome.textContent = usuario.nome || usuario.usuario;
      if (elPerfil) elPerfil.textContent = usuario.perfil || 'ADMINISTRADOR';
    } catch (e) {
      console.error('Erro ao ler dados da sessão:', e);
    }
  });
})();

// Função global para encerrar a sessão
function fazerLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.replace('/login.html');
}

// --- CONFIGURAÇÃO GLOBAL E CONSTANTES ---
const DIAS_SEMANA = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA'];

// Horários por Turno (Tarde iniciando exatamente às 13:30)
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

let turmaSelecionadaObj = null;
let alocacoesTurma = [];
let gradeAlocada = {};
let todasAsGradesGlobal = [];

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

    select.innerHTML = '<option value="">-- SELECIONE A TURMA --</option>';

    // --- REGRAS DE HIERARQUIA E GRUPOS DO SELECT ---
    const categorias = [
      { chave: 'MANHA_FUND', label: '📍 MANHÃ — ENSINO FUNDAMENTAL', filtro: t => ehTurno(t, 'MANHA') && ehNivel(t, 'FUNDAMENTAL') },
      { chave: 'MANHA_MEDIO', label: '📍 MANHÃ — ENSINO MÉDIO', filtro: t => ehTurno(t, 'MANHA') && ehNivel(t, 'MEDIO') },
      { chave: 'TARDE_FUND', label: '📍 TARDE — ENSINO FUNDAMENTAL', filtro: t => ehTurno(t, 'TARDE') && ehNivel(t, 'FUNDAMENTAL') },
      { chave: 'TARDE_MEDIO', label: '📍 TARDE — ENSINO MÉDIO', filtro: t => ehTurno(t, 'TARDE') && ehNivel(t, 'MEDIO') },
      { chave: 'NOITE_FUND', label: '📍 NOITE — ENSINO FUNDAMENTAL', filtro: t => ehTurno(t, 'NOITE') && ehNivel(t, 'FUNDAMENTAL') && !ehSemipresencial(t) },
      { chave: 'NOITE_MEDIO', label: '📍 NOITE — ENSINO MÉDIO', filtro: t => ehTurno(t, 'NOITE') && ehNivel(t, 'MEDIO') && !ehSemipresencial(t) },
      { chave: 'NOITE_SEMI', label: '📍 NOITE — SEMIPRESENCIAL', filtro: t => ehSemipresencial(t) || (ehTurno(t, 'NOITE') && (t.nome_descricao || '').toUpperCase().includes('SEMI')) }
    ];

    categorias.forEach(cat => {
      const listaGrupo = turmas.filter(cat.filtro);
      if (listaGrupo.length > 0) {
        // Ordenação por módulo numérico (1º, 2º, 3º...)
        listaGrupo.sort((a, b) => (a.nome_descricao || '').localeCompare(b.nome_descricao || '', undefined, { numeric: true }));

        const group = document.createElement('optgroup');
        group.label = cat.label;

        listaGrupo.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.nome_descricao;
          opt.dataset.turmaObj = JSON.stringify(t);
          group.appendChild(opt);
        });

        select.appendChild(group);
      }
    });

    select.addEventListener('change', (e) => {
      const selectedOpt = select.options[select.selectedIndex];
      if (e.target.value && selectedOpt.dataset.turmaObj) {
        turmaSelecionadaObj = JSON.parse(selectedOpt.dataset.turmaObj);
        renderizarEstruturaQuadro(turmaSelecionadaObj);
        carregarDadosTurma(turmaSelecionadaObj.id);
      } else {
        limparTelas();
      }
    });

    // Quadro inicial padrão (Manhã)
    renderizarEstruturaQuadro({ nome_descricao: 'MANHÃ' });

  } catch (err) {
    console.error('Erro ao inicializar seletor:', err);
    select.innerHTML = '<option value="">Erro ao carregar turmas</option>';
  }
}

// Funções auxiliares de classificação
function ehSemipresencial(t) {
  const desc = (t.nome_descricao || '').toUpperCase();
  return desc.includes('SEMIPRESENCIAL') || desc.includes('SEMI') || /\b\d{1,2}\b/.test(desc);
}

function ehTurno(t, turno) {
  const desc = (t.nome_descricao || '').toUpperCase();
  const cod = (t.turno_codigo || '').toUpperCase();
  if (turno === 'MANHA') return desc.includes('MANHÃ') || desc.includes('MANHA') || cod === 'A';
  if (turno === 'TARDE') return desc.includes('TARDE') || cod === 'B';
  if (turno === 'NOITE') return desc.includes('NOITE') || cod === 'C' || ehSemipresencial(t);
  return false;
}

function ehNivel(t, nivel) {
  const desc = (t.nome_descricao || '').toUpperCase();
  if (nivel === 'FUNDAMENTAL') return desc.includes('FUNDAMENTAL') || desc.includes('FUND');
  if (nivel === 'MEDIO') return desc.includes('MÉDIO') || desc.includes('MEDIO');
  return true;
}

function renderizarEstruturaQuadro(turma) {
  const tbody = document.getElementById('corpo-quadro-grade');
  if (!tbody) return;
  tbody.innerHTML = '';

  let chaveTurno = 'MANHA';
  const desc = (turma?.nome_descricao || '').toUpperCase();
  if (desc.includes('TARDE')) chaveTurno = 'TARDE';
  if (desc.includes('NOITE') || desc.includes('SEMI')) chaveTurno = 'NOITE';

  const gradeHorarios = HORARIOS_TURNO[chaveTurno];

  gradeHorarios.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-200';

    if (item.tipo === 'PAUSA') {
      tr.className = 'bg-red-50 border-y border-red-200 text-red-700 font-bold text-xs uppercase';
      tr.innerHTML = `
        <td class="p-2 border border-slate-200 text-center bg-red-100/50">${item.rotulo}</td>
        <td colspan="5" class="p-2.5 text-center tracking-wide">${item.texto}</td>
      `;
    } else {
      const tdHorario = document.createElement('td');
      tdHorario.className = 'p-2 bg-slate-50 font-bold border border-slate-200 text-slate-700 w-28 text-center';
      tdHorario.innerHTML = `
        <div class="text-xs text-slate-800 font-bold">${item.rotulo}</div>
        <div class="text-[10px] text-slate-500 font-normal mt-0.5">${item.inicio} - ${item.fim}</div>
      `;
      tr.appendChild(tdHorario);

      DIAS_SEMANA.forEach(dia => {
        const tdSlot = document.createElement('td');
        tdSlot.className = 'p-2 border border-slate-200 slot-aula min-h-[55px] relative bg-white transition-colors text-center';
        tdSlot.dataset.dia = dia;
        tdSlot.dataset.aula = item.num;

        tdSlot.addEventListener('dragover', e => { e.preventDefault(); tdSlot.classList.add('bg-blue-50'); });
        tdSlot.addEventListener('dragleave', () => tdSlot.classList.remove('bg-blue-50'));
        tdSlot.addEventListener('drop', e => tratarDropAula(e, dia, item.num));

        tr.appendChild(tdSlot);
      });
    }

    tbody.appendChild(tr);
  });
}

async function carregarDadosTurma(turmaId) {
  try {
    const resAloc = await fetch('/api/alocacoes');
    const todasAlocacoes = await resAloc.json();
    alocacoesTurma = todasAlocacoes.filter(a => String(a.turma_id) === String(turmaId));

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
    console.error('Erro ao carregar dados da turma:', err);
  }
}

function renderizarCardsDisponiveis() {
  const container = document.getElementById('container-cards-disponiveis');
  if (!container) return;
  container.innerHTML = '';

  if (!alocacoesTurma || alocacoesTurma.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">Nenhuma disciplina alocada.</p>';
    return;
  }

  alocacoesTurma.forEach(item => {
    const card = document.createElement('div');
    card.draggable = true;
    card.dataset.alocacaoId = item.alocacao_id;

    const tipoUpper = (item.tipo || '').toUpperCase();
    const profNome = item.professor_nome || 'A DEFINIR';
    const semProf = profNome === 'A DEFINIR';

    // --- ESTILIZAÇÃO E BADGES DAS CARDS ---
    let bgBorderClass = 'bg-white border-slate-200';
    let badgeHtml = '';
    let iconProf = semProf ? '⚠️' : '👤';

    if (tipoUpper.includes('SISTEMA') || tipoUpper.includes('ONLINE')) {
      bgBorderClass = 'bg-purple-50/60 border-purple-200';
      badgeHtml = `<span class="bg-purple-200/80 text-purple-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">SISTEMA</span>`;
      iconProf = '💻';
    } else if (tipoUpper.includes('TUTORIA')) {
      bgBorderClass = 'bg-emerald-50/60 border-emerald-200';
      badgeHtml = `<span class="bg-emerald-200/80 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">TUTORIA</span>`;
      iconProf = '👥';
    }

    const profColorClass = semProf ? 'text-amber-600 font-bold' : (tipoUpper.includes('TUTORIA') ? 'text-emerald-800 font-semibold' : 'text-slate-600');

    card.className = `p-3.5 border rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all mb-3 relative ${bgBorderClass}`;

    card.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <div class="font-bold text-slate-800 text-xs uppercase tracking-tight">${item.disciplina_nome}</div>
        ${badgeHtml}
      </div>
      <div class="text-[11px] ${profColorClass} flex items-center gap-1.5">
        <span>${iconProf}</span>
        <span>${profNome}</span>
      </div>
    `;

    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', item.alocacao_id);
    });

    container.appendChild(card);
  });
}

function atualizarQuadroGrade() {
  DIAS_SEMANA.forEach(dia => {
    [1, 2, 3, 4, 5].forEach(aula => {
      const slotKey = `${dia}-${aula}`;
      const alocacaoId = gradeAlocada[slotKey];
      const slot = document.querySelector(`.slot-aula[data-dia="${dia}"][data-aula="${aula}"]`);

      if (slot) {
        slot.innerHTML = '';

        if (alocacaoId) {
          const aloc = alocacoesTurma.find(a => String(a.alocacao_id) === String(alocacaoId));
          if (aloc) {
            const cardSlot = document.createElement('div');
            cardSlot.className = 'p-2 bg-blue-50 border border-blue-200 rounded-lg text-left relative group shadow-sm';
            cardSlot.innerHTML = `
              <button onclick="removerAulaGrade('${dia}', ${aula})" class="absolute top-1 right-1 text-red-400 font-bold text-xs opacity-0 group-hover:opacity-100 hover:text-red-600">&times;</button>
              <div class="font-bold text-slate-800 text-[11px]">${aloc.disciplina_nome}</div>
              <div class="text-[10px] text-slate-500 mt-0.5">${aloc.professor_nome}</div>
            `;
            slot.appendChild(cardSlot);
          }
        } else {
          slot.innerHTML = `<span class="text-slate-300 text-xs">-</span>`;
        }
      }
    });
  });
}

async function tratarDropAula(e, dia, numAula) {
  e.preventDefault();
  const slot = e.currentTarget;
  slot.classList.remove('bg-blue-50');

  const alocacaoId = e.dataTransfer.getData('text/plain');
  if (!alocacaoId || !turmaSelecionadaObj) return;

  try {
    const response = await fetch('/api/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turma_id: turmaSelecionadaObj.id,
        dia_semana: dia,
        num_aula: numAula,
        alocacao_id: alocacaoId
      })
    });

    if (response.ok) {
      gradeAlocada[`${dia}-${numAula}`] = alocacaoId;
      carregarDadosTurma(turmaSelecionadaObj.id);
    }
  } catch (err) {
    console.error('Erro ao salvar aula na grade:', err);
  }
}

async function removerAulaGrade(dia, numAula) {
  if (!turmaSelecionadaObj) return;

  try {
    const response = await fetch('/api/grade', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turma_id: turmaSelecionadaObj.id,
        dia_semana: dia,
        num_aula: numAula
      })
    });

    if (response.ok) {
      delete gradeAlocada[`${dia}-${numAula}`];
      carregarDadosTurma(turmaSelecionadaObj.id);
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
      ⚠️ <strong>ALERTA DE CONFLITO DE DOCENTE!</strong><br>
      O mesmo professor possui choque de horário em turmas simultâneas:
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
  renderizarEstruturaQuadro({ nome_descricao: 'MANHÃ' });
  const alerta = document.getElementById('painel-alerta');
  if (alerta) alerta.classList.add('hidden');
}
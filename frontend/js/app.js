/**
 * APP.JS - Gestor de Grade Horária e Gestão de Usuários
 * Caminho do arquivo: frontend/js/app.js
 */

(function verificarAutenticacao() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
  }
})();

const API_URL = 'http://localhost:3000/api';

const HORARIOS_POR_TURNO = {
  A: [
    { aula: 1, inicio: '07:50', fim: '08:40' },
    { aula: 2, inicio: '08:40', fim: '09:30' },
    { aula: 3, inicio: '09:30', fim: '10:20' },
    { tipo: 'INTERVALO', texto: 'INTERVALO DE DESCANSO (10:20 - 10:30)' },
    { aula: 4, inicio: '10:30', fim: '11:20' },
    { aula: 5, inicio: '11:20', fim: '12:10' }
  ],
  B: [
    { aula: 1, inicio: '13:30', fim: '14:20' },
    { aula: 2, inicio: '14:20', fim: '15:10' },
    { aula: 3, inicio: '15:10', fim: '16:00' },
    { tipo: 'INTERVALO', texto: 'INTERVALO DE DESCANSO (16:00 - 16:10)' },
    { aula: 4, inicio: '16:10', fim: '17:00' },
    { aula: 5, inicio: '17:00', fim: '17:50' }
  ],
  C: [
    { aula: 1, inicio: '18:15', fim: '19:05' },
    { aula: 2, inicio: '19:05', fim: '19:55' },
    { tipo: 'INTERVALO', texto: 'INTERVALO DE DESCANSO (19:55 - 20:05)' },
    { aula: 3, inicio: '20:05', fim: '20:55' },
    { aula: 4, inicio: '20:55', fim: '21:45' },
    { aula: 5, inicio: '21:45', fim: '22:35' }
  ]
};

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

let turmas = [];
let alocoes = [];
let gradeHorariaGlobal = [];
let turmaSelecionada = null;

document.addEventListener('DOMContentLoaded', async () => {
  exibirUsuarioLogado();
  await carregarDadosIniciais();
  configurarEventos();
});

function exibirUsuarioLogado() {
  const userRaw = localStorage.getItem('usuario');
  if (userRaw) {
    const usuario = JSON.parse(userRaw);
    const elemUser = document.getElementById('nome-usuario');
    if (elemUser) {
      elemUser.textContent = `${usuario.nome} (${usuario.perfil})`;
    }

    // Libera botão do Modal de Usuários para perfil MESTRE
    if (usuario.perfil === 'MESTRE') {
      const btnModal = document.getElementById('btn-modal-usuarios');
      if (btnModal) btnModal.classList.remove('hidden');
    }
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/login.html';
}

/* ==========================================================================
   FUNÇÕES DO MODAL DE GESTÃO DE USUÁRIOS
   ========================================================================== */

function abrirModalUsuarios() {
  const modal = document.getElementById('modal-usuarios');
  if (modal) {
    modal.classList.remove('hidden');
    carregarTabelaUsuarios();
  }
}

function fecharModalUsuarios() {
  const modal = document.getElementById('modal-usuarios');
  if (modal) modal.classList.add('hidden');
}

async function carregarTabelaUsuarios() {
  const tbody = document.getElementById('tabela-usuarios-corpo');
  if (!tbody) return;

  try {
    const usuarios = await fetch(`${API_URL}/usuarios`).then(r => r.json());
    
    tbody.innerHTML = usuarios.map(u => `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="p-2 font-bold text-slate-800">${u.nome}</td>
        <td class="p-2 text-slate-600">${u.usuario}</td>
        <td class="p-2 text-slate-500">${u.cpf || '-'}</td>
        <td class="p-2"><span class="px-1.5 py-0.5 text-[10px] rounded font-bold ${u.perfil === 'MESTRE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${u.perfil}</span></td>
        <td class="p-2 text-center">
          <button onclick="deletarUsuario(${u.id})" class="bg-red-500 hover:bg-red-700 text-white font-bold text-[10px] px-2 py-1 rounded cursor-pointer">Excluir</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('❌ Erro ao buscar usuários:', err);
  }
}

async function salvarNovoUsuario(event) {
  event.preventDefault();

  const nome = document.getElementById('usr-nome').value;
  const cpf = document.getElementById('usr-cpf').value;
  const usuario = document.getElementById('usr-usuario').value;
  const senha = document.getElementById('usr-senha').value;
  const perfil = document.getElementById('usr-perfil').value;

  try {
    const res = await fetch(`${API_URL}/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, cpf, usuario, senha, perfil })
    });

    const data = await res.json();

    if (res.ok) {
      alert('Usuário cadastrado com sucesso!');
      document.getElementById('form-novo-usuario').reset();
      carregarTabelaUsuarios();
    } else {
      alert(data.mensagem || 'Erro ao cadastrar usuário.');
    }
  } catch (err) {
    console.error('❌ Erro ao salvar usuário:', err);
  }
}

async function deletarUsuario(id) {
  if (!confirm('Deseja realmente remover este usuário?')) return;

  try {
    const res = await fetch(`${API_URL}/usuarios/${id}`, { method: 'DELETE' });
    if (res.ok) {
      carregarTabelaUsuarios();
    }
  } catch (err) {
    console.error('❌ Erro ao excluir usuário:', err);
  }
}

/* ==========================================================================
   FUNÇÕES DA GRADE HORÁRIA
   ========================================================================== */

async function carregarDadosIniciais() {
  try {
    const [resTurmas, resAlocacoes, resGrade] = await Promise.all([
      fetch(`${API_URL}/turmas`).then(r => r.json()),
      fetch(`${API_URL}/alocacoes`).then(r => r.json()),
      fetch(`${API_URL}/grade`).then(r => r.json())
    ]);

    turmas = resTurmas;
    alocoes = resAlocacoes;
    gradeHorariaGlobal = resGrade;

    renderizarSelectTurmas();

    if (turmas.length > 0) {
      selecionarTurma(turmas[0].id);
    }
  } catch (err) {
    console.error('❌ Erro ao carregar dados:', err);
  }
}

function renderizarSelectTurmas() {
  const select = document.getElementById('select-turma');
  if (!select) return;

  if (turmas.length === 0) {
    select.innerHTML = `<option value="">Nenhuma turma cadastrada</option>`;
    return;
  }

  const grupos = {};
  turmas.forEach(t => {
    const chaveGrupo = `${t.turno_nome.toUpperCase()} — ${t.nivel}`;
    if (!grupos[chaveGrupo]) grupos[chaveGrupo] = [];
    grupos[chaveGrupo].push(t);
  });

  let htmlOptions = '';
  for (const [grupoTitulo, listaTurmas] of Object.entries(grupos)) {
    htmlOptions += `<optgroup label="📍 ${grupoTitulo}">`;
    listaTurmas.forEach(t => {
      htmlOptions += `<option value="${t.id}">${t.nome_descricao}</option>`;
    });
    htmlOptions += `</optgroup>`;
  }

  select.innerHTML = htmlOptions;
}

function selecionarTurma(turmaId) {
  turmaSelecionada = turmas.find(t => String(t.id) === String(turmaId));
  if (!turmaSelecionada) return;

  const badgeTurno = document.getElementById('badge-turno');
  if (badgeTurno) {
    badgeTurno.textContent = `TURNO: ${turmaSelecionada.turno_nome || turmaSelecionada.turno_codigo} | ${turmaSelecionada.nivel}`;
  }

  renderizarSidebarCards();
  renderizarGradeTabela();
}

function renderizarSidebarCards() {
  const container = document.getElementById('lista-cards');
  if (!container) return;

  const alocacoesDaTurma = alocoes.filter(a => String(a.turma_id) === String(turmaSelecionada.id));

  if (alocacoesDaTurma.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-400 italic p-2">Nenhuma disciplina vinculada a esta turma.</p>`;
    return;
  }

  container.innerHTML = alocacoesDaTurma.map(a => {
    let bgEstilo = 'bg-slate-50 border-slate-200 hover:border-blue-400';
    let tagProf = (a.professor_nome === 'A DEFINIR' || !a.professor_nome) 
      ? '⚠️ <span class="text-amber-700 font-bold">A DEFINIR</span>' 
      : `👤 ${a.professor_nome}`;

    let tituloDisciplina = a.disciplina_nome;

    if (a.tipo === 'SISTEMA') {
      bgEstilo = 'bg-purple-50 border-purple-300 hover:border-purple-500';
      tituloDisciplina += ' <span class="text-[10px] bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded font-bold">SISTEMA</span>';
      tagProf = '💻 <span class="text-purple-700 font-bold">AULA ONLINE</span>';
    } else if (a.tipo === 'TUTORIA') {
      bgEstilo = 'bg-emerald-50 border-emerald-300 hover:border-emerald-500';
      tituloDisciplina += ' <span class="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold">TUTORIA</span>';
      tagProf = `👥 <span class="text-emerald-700 font-bold">${a.professor_nome}</span>`;
    }

    const payload = JSON.stringify(a).replace(/"/g, '&quot;');

    return `
      <div 
        class="card-materia ${bgEstilo} border p-3 rounded-lg shadow-sm transition-all cursor-grab mb-2 select-none active:cursor-grabbing"
        draggable="true"
        ondragstart="handleDragStart(event, ${payload})"
      >
        <div class="font-bold text-sm text-slate-800 flex items-center justify-between gap-1">${tituloDisciplina}</div>
        <div class="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1">${tagProf}</div>
      </div>
    `;
  }).join('');
}

function renderizarGradeTabela() {
  const tbody = document.getElementById('corpo-tabela-grade');
  if (!tbody) return;

  const turnoCodigo = (turmaSelecionada.turno_codigo in HORARIOS_POR_TURNO) ? turmaSelecionada.turno_codigo : 'C';
  const gradeEstrutura = HORARIOS_POR_TURNO[turnoCodigo];

  tbody.innerHTML = gradeEstrutura.map((item) => {
    if (item.tipo === 'INTERVALO') {
      return `
        <tr class="bg-red-50 text-red-600 text-xs font-bold text-center">
          <td class="py-2 px-2 border border-red-100">PAUSA</td>
          <td colspan="5" class="py-2 px-2 border border-red-100 tracking-wider">${item.texto}</td>
        </tr>
      `;
    }

    return `
      <tr class="h-16">
        <td class="bg-gray-50 border border-gray-200 text-xs font-bold text-gray-500 py-2 px-2 text-center">
          ${item.aula}ª AULA<br>
          <span class="text-gray-400 font-normal">${item.inicio} - ${item.fim}</span>
        </td>
        ${DIAS_SEMANA.map(dia => {
          const itemGrade = gradeHorariaGlobal.find(g => 
            String(g.turma_id) === String(turmaSelecionada.id) && 
            g.dia_semana === dia && 
            Number(g.num_aula) === Number(item.aula)
          );

          let conteudo = `<span class="text-xs text-gray-300">-</span>`;
          if (itemGrade) {
            let badgeTipo = '';
            if (itemGrade.tipo === 'SISTEMA') badgeTipo = '<span class="text-[9px] bg-purple-100 text-purple-700 px-1 rounded font-bold">SISTEMA</span>';
            if (itemGrade.tipo === 'TUTORIA') badgeTipo = '<span class="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded font-bold">TUTORIA</span>';

            conteudo = `
              <div class="relative group w-full h-full flex flex-col justify-center">
                <div class="font-bold text-xs text-slate-800">${itemGrade.disciplina_nome} ${badgeTipo}</div>
                <div class="text-[10px] text-slate-500 mt-0.5">${itemGrade.tipo === 'SISTEMA' ? 'AULA ONLINE' : (itemGrade.professor_nome || 'A DEFINIR')}</div>
                <button 
                  type="button"
                  title="Remover aula"
                  onclick="removerAula('${dia}', ${item.aula}, event)"
                  class="hidden group-hover:flex absolute -top-1 -right-1 bg-red-600 hover:bg-red-800 text-white rounded-full w-5 h-5 items-center justify-center text-[10px] font-bold shadow cursor-pointer z-10 transition-colors"
                >✕</button>
              </div>
            `;
          }

          return `
            <td 
              class="celula-drop border border-gray-200 p-2 transition-all relative text-center"
              data-dia="${dia}"
              data-aula="${item.aula}"
              ondragover="handleDragOver(event)"
              ondragleave="handleDragLeave(event)"
              ondrop="handleDrop(event, '${dia}', ${item.aula})"
              ondblclick="removerAula('${dia}', ${item.aula}, event)"
            >
              ${conteudo}
            </td>
          `;
        }).join('')}
      </tr>
    `;
  }).join('');

  validarConflitosVisuais();
}

function handleDragStart(event, alocacao) {
  event.dataTransfer.setData('application/json', JSON.stringify(alocacao));
  event.dataTransfer.effectAllowed = 'copyMove';
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('bg-blue-50', 'border-blue-400');
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove('bg-blue-50', 'border-blue-400');
}

async function handleDrop(event, dia, aula) {
  event.preventDefault();
  event.currentTarget.classList.remove('bg-blue-50', 'border-blue-400');

  const dataRaw = event.dataTransfer.getData('application/json');
  if (!dataRaw) return;

  const alocacao = JSON.parse(dataRaw);

  try {
    const response = await fetch(`${API_URL}/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turma_id: Number(turmaSelecionada.id),
        dia_semana: String(dia),
        num_aula: Number(aula),
        alocacao_id: Number(alocacao.alocacao_id || alocacao.id)
      })
    });

    if (response.ok) {
      gradeHorariaGlobal = await fetch(`${API_URL}/grade`).then(r => r.json());
      renderizarGradeTabela();
    }
  } catch (err) {
    console.error('❌ Erro ao salvar aula:', err);
  }
}

async function removerAula(dia, aula, event = null) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (!turmaSelecionada) return;

  try {
    const response = await fetch(`${API_URL}/grade`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turma_id: Number(turmaSelecionada.id),
        dia_semana: String(dia),
        num_aula: Number(aula)
      })
    });

    if (response.ok) {
      gradeHorariaGlobal = await fetch(`${API_URL}/grade`).then(r => r.json());
      renderizarGradeTabela();
    }
  } catch (err) {
    console.error('❌ Erro ao remover aula:', err);
  }
}

function validarConflitosVisuais() {
  const celulas = document.querySelectorAll('.celula-drop');
  const alertaBox = document.getElementById('alerta-conflito');
  const textoBox = document.getElementById('texto-conflito');
  
  if (alertaBox) alertaBox.classList.add('hidden');

  celulas.forEach(celula => {
    celula.classList.remove('bg-red-100', 'border-red-500');
    const dia = celula.getAttribute('data-dia');
    const aula = celula.getAttribute('data-aula');

    const itemGrade = gradeHorariaGlobal.find(g => 
      String(g.turma_id) === String(turmaSelecionada.id) && 
      g.dia_semana === dia && 
      Number(g.num_aula) === Number(aula)
    );

    if (itemGrade && itemGrade.tipo !== 'SISTEMA' && itemGrade.professor_nome && itemGrade.professor_nome !== 'A DEFINIR') {
      const conflito = gradeHorariaGlobal.find(g => 
        g.professor_nome === itemGrade.professor_nome &&
        g.tipo !== 'SISTEMA' &&
        g.dia_semana === dia &&
        Number(g.num_aula) === Number(aula) &&
        String(g.turma_id) !== String(turmaSelecionada.id)
      );

      if (conflito) {
        celula.classList.add('bg-red-100', 'border-red-500');
        if (alertaBox && textoBox) {
          textoBox.textContent = `⚠️ Conflito! O Prof. ${itemGrade.professor_nome} já leciona neste horário (${dia}, ${aula}ª Aula) na turma ID ${conflito.turma_id}.`;
          alertaBox.classList.remove('hidden');
        }
      }
    }
  });
}

function configurarEventos() {
  const selectTurma = document.getElementById('select-turma');
  if (selectTurma) {
    selectTurma.addEventListener('change', (e) => {
      selecionarTurma(e.target.value);
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', logout);
  }
}
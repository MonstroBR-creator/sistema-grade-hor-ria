let listaCompletaTurmas = [];

document.addEventListener('DOMContentLoaded', () => {
  iniciarSistema();
});

async function iniciarSistema() {
  const selectTurno = document.getElementById('filtro-turno');
  const selectEnsino = document.getElementById('filtro-ensino');
  const selectTurma = document.getElementById('select-turma');

  try {
    // 1. Busca lista completa do banco
    const response = await fetch('/api/turmas');
    listaCompletaTurmas = await response.json();

    // 2. Popula o select de turmas inicialmente
    filtrarEAtualizarTurmas();

    // 3. Adiciona os ouvintes nos seletores
    selectTurno.addEventListener('change', filtrarEAtualizarTurmas);
    selectEnsino.addEventListener('change', filtrarEAtualizarTurmas);

    // 4. Carrega a grade ao selecionar a turma
    selectTurma.addEventListener('change', (e) => {
      const turmaId = e.target.value;
      if (turmaId) {
        carregarGrade(turmaId);
      } else {
        document.getElementById('grade-container').innerHTML = `
          <p class="aviso">Selecione uma turma no filtro acima para visualizar os professores e matérias.</p>
        `;
      }
    });

  } catch (err) {
    console.error('Erro ao carregar turmas:', err);
    selectTurma.innerHTML = '<option value="">Erro ao carregar dados do servidor</option>';
  }
}

function filtrarEAtualizarTurmas() {
  const turnoSel = document.getElementById('filtro-turno').value;
  const ensinoSel = document.getElementById('filtro-ensino').value;
  const selectTurma = document.getElementById('select-turma');

  selectTurma.innerHTML = '<option value="">Selecione uma Turma</option>';

  // Filtro de array em memória
  const turmasFiltradas = listaCompletaTurmas.filter(turma => {
    const bateTurno = !turnoSel || 
      (turma.turno && turma.turno === turnoSel) || 
      turma.nome.toUpperCase().includes(turnoSel);

    const bateEnsino = !ensinoSel || 
      (turma.ensino && turma.ensino === ensinoSel) || 
      turma.nome.toUpperCase().includes(ensinoSel);

    return bateTurno && bateEnsino;
  });

  if (turmasFiltradas.length === 0) {
    selectTurma.innerHTML = '<option value="">Nenhuma turma encontrada com esses filtros</option>';
    return;
  }

  turmasFiltradas.forEach(turma => {
    const opt = document.createElement('option');
    opt.value = turma.id;
    opt.textContent = turma.nome;
    selectTurma.appendChild(opt);
  });
}

async function carregarGrade(turmaId) {
  const container = document.getElementById('grade-container');
  container.innerHTML = '<p>Carregando disciplinas e professores...</p>';

  try {
    const response = await fetch(`/api/grade/${turmaId}`);
    const dados = await response.json();

    if (!dados || dados.length === 0) {
      container.innerHTML = '<p class="aviso">Nenhuma disciplina ou professor cadastrado para esta turma.</p>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Disciplina / Matéria</th>
            <th>Turma</th>
            <th>Professor(a) Atribuído(a)</th>
          </tr>
        </thead>
        <tbody>
    `;

    dados.forEach(linha => {
      html += `
        <tr>
          <td style="font-weight: bold;">${linha.disciplina || '-'}</td>
          <td>${linha.turma_letra || '-'}</td>
          <td>${linha.professor || 'A DEFINIR'}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

  } catch (err) {
    console.error('Erro ao buscar a grade:', err);
    container.innerHTML = '<p style="color: red;">Erro ao carregar os dados da grade horária.</p>';
  }
}
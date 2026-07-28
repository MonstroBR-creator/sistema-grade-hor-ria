document.addEventListener('DOMContentLoaded', () => {
  inicializarSistema();
});

async function inicializarSistema() {
  const selectTurma = document.getElementById('select-turma') || document.querySelector('select');
  
  if (!selectTurma) {
    console.error('Elemento select de turmas não foi encontrado no DOM.');
    return;
  }

  // 1. Carregar lista de Turmas
  await carregarTurmas(selectTurma);

  // 2. Escutar a seleção do usuário para buscar a Grade (Professores/Matérias)
  selectTurma.addEventListener('change', (event) => {
    const turmaId = event.target.value;
    if (turmaId) {
      carregarGradeDaTurma(turmaId);
    } else {
      limparExibicaoGrade();
    }
  });
}

async function carregarTurmas(selectElement) {
  try {
    const response = await fetch('/api/turmas');
    if (!response.ok) throw new Error('Erro ao buscar turmas');
    
    const turmas = await response.json();
    selectElement.innerHTML = '<option value="">Selecione uma Turma</option>';

    if (turmas.length === 0) {
      selectElement.innerHTML = '<option value="">Nenhuma turma encontrada</option>';
      return;
    }

    turmas.forEach(turma => {
      const option = document.createElement('option');
      option.value = turma.id;
      
      // Mapeia o campo correto de nome que existir no banco
      const nomeExibicao = turma.nome || turma.nome_turma || turma.turma || turma.descricao || `Turma ${turma.id}`;
      option.textContent = nomeExibicao;
      
      selectElement.appendChild(option);
    });
  } catch (error) {
    console.error('Erro na carga de turmas:', error);
    selectElement.innerHTML = '<option value="">Erro ao carregar turmas</option>';
  }
}

async function carregarGradeDaTurma(turmaId) {
  const containerGrade = document.getElementById('grade-container') || document.getElementById('resultado') || document.querySelector('.grade-horaria');
  
  if (!containerGrade) {
    console.warn('Container para exibição da grade não localizado no HTML.');
    return;
  }

  containerGrade.innerHTML = '<p class="carregando">Carregando professores e matérias...</p>';

  try {
    const response = await fetch(`/api/grade/${turmaId}`);
    if (!response.ok) throw new Error('Erro ao buscar a grade');

    const grade = await response.json();

    if (grade.length === 0) {
      containerGrade.innerHTML = '<p class="aviso">Nenhuma aula ou professor cadastrado para esta turma.</p>';
      return;
    }

    // Renderiza a tabela completa com matérias e professores
    let html = `
      <table class="tabela-grade" border="1" style="width:100%; border-collapse: collapse; margin-top: 15px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 8px;">Dia / Horário</th>
            <th style="padding: 8px;">Matéria / Disciplina</th>
            <th style="padding: 8px;">Professor(a)</th>
          </tr>
        </thead>
        <tbody>
    `;

    grade.forEach(item => {
      const diaHorario = item.dia_semana ? `${item.dia_semana} - ${item.horario || ''}` : (item.horario || 'Horário flexível');
      const materia = item.disciplina || item.materia || item.nome_disciplina || 'Sem matéria';
      const professor = item.professor || item.nome_professor || 'A definir';

      html += `
        <tr>
          <td style="padding: 8px; text-align: center;">${diaHorario}</td>
          <td style="padding: 8px; font-weight: bold;">${materia}</td>
          <td style="padding: 8px;">${professor}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    containerGrade.innerHTML = html;

  } catch (error) {
    console.error('Erro ao carregar grade:', error);
    containerGrade.innerHTML = '<p class="erro">Erro ao carregar os dados de professores e matérias.</p>';
  }
}

function limparExibicaoGrade() {
  const containerGrade = document.getElementById('grade-container') || document.getElementById('resultado') || document.querySelector('.grade-horaria');
  if (containerGrade) {
    containerGrade.innerHTML = '';
  }
}
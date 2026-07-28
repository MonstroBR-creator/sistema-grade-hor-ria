document.addEventListener('DOMContentLoaded', () => {
  carregarTurmas();
});

async function carregarTurmas() {
  const select = document.getElementById('select-turma');

  try {
    const response = await fetch('/api/turmas');
    const turmas = await response.json();

    if (!turmas || turmas.length === 0) {
      select.innerHTML = '<option value="">Nenhuma turma cadastrada</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Selecione uma Turma / Módulo --</option>';

    turmas.forEach(turma => {
      const option = document.createElement('option');
      option.value = turma.id;
      option.textContent = turma.nome;
      select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
      const turmaId = e.target.value;
      if (turmaId) {
        carregarGrade(turmaId);
      } else {
        document.getElementById('resultado').innerHTML = `
          <div class="mensagem-status">Selecione uma turma no campo acima para visualizar as disciplinas e professores.</div>
        `;
      }
    });

  } catch (error) {
    console.error('Erro ao carregar turmas:', error);
    select.innerHTML = '<option value="">Erro ao carregar dados do servidor</option>';
  }
}

async function carregarGrade(turmaId) {
  const container = document.getElementById('resultado');
  container.innerHTML = '<div class="mensagem-status">Carregando professores e matérias...</div>';

  try {
    const response = await fetch(`/api/grade/${turmaId}`);
    const dados = await response.json();

    if (!dados || dados.length === 0) {
      container.innerHTML = '<div class="mensagem-status">Nenhum professor ou disciplina cadastrado para esta turma.</div>';
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

  } catch (error) {
    console.error('Erro ao buscar a grade:', error);
    container.innerHTML = '<div class="mensagem-status" style="color: red;">Erro ao carregar os dados da turma.</div>';
  }
}
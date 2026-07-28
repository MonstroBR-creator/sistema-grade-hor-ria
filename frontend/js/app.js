document.addEventListener('DOMContentLoaded', () => {
  iniciar();
});

async function iniciar() {
  const select = document.querySelector('select') || document.getElementById('select-turma');
  if (!select) return;

  try {
    const res = await fetch('/api/turmas');
    const turmas = await res.json();

    select.innerHTML = '<option value="">Selecione uma Turma / Módulo</option>';

    if (turmas.length === 0) {
      select.innerHTML = '<option value="">Nenhuma turma cadastrada no banco</option>';
      return;
    }

    turmas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      // Exibe o nome real importado da planilha (ex: "1º Módulo", "CEEBJA - Etapa 1")
      opt.textContent = t.nome || t.nome_turma || `Turma ${t.id}`;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      const id = e.target.value;
      if (id) {
        carregarGrade(id);
      } else {
        limparGrade();
      }
    });

  } catch (err) {
    console.error('Erro ao carregar turmas:', err);
  }
}

async function carregarGrade(turmaId) {
  let container = document.getElementById('grade-container') || document.getElementById('resultado') || document.querySelector('.grade-horaria');

  if (!container) {
    container = document.createElement('div');
    container.id = 'grade-container';
    document.body.appendChild(container);
  }

  container.innerHTML = '<p style="padding: 10px;">Carregando professores e matérias...</p>';

  try {
    const res = await fetch(`/api/grade/${turmaId}`);
    const dados = await res.json();

    if (!dados || dados.length === 0) {
      container.innerHTML = '<p style="padding: 10px;">Nenhuma matéria/professor encontrado para este módulo.</p>';
      return;
    }

    let html = `
      <table border="1" style="width:100%; border-collapse: collapse; margin-top: 15px; text-align: left; font-family: sans-serif;">
        <thead>
          <tr style="background-color: #004085; color: white;">
            <th style="padding: 10px;">Dia da Semana</th>
            <th style="padding: 10px;">Horário / Aula</th>
            <th style="padding: 10px;">Matéria / Disciplina</th>
            <th style="padding: 10px;">Professor(a)</th>
          </tr>
        </thead>
        <tbody>
    `;

    dados.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8f9fa';
      html += `
        <tr style="background-color: ${bg};">
          <td style="padding: 10px;">${row.dia_semana || '-'}</td>
          <td style="padding: 10px;">${row.horario || '-'}</td>
          <td style="padding: 10px; font-weight: bold;">${row.disciplina || '-'}</td>
          <td style="padding: 10px;">${row.professor || '-'}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

  } catch (err) {
    console.error('Erro ao carregar grade:', err);
    container.innerHTML = '<p style="color: red; padding: 10px;">Erro ao carregar dados do banco.</p>';
  }
}

function limparGrade() {
  const container = document.getElementById('grade-container') || document.getElementById('resultado') || document.querySelector('.grade-horaria');
  if (container) container.innerHTML = '';
}
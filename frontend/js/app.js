document.addEventListener('DOMContentLoaded', () => {
  iniciar();
});

async function iniciar() {
  const select = document.querySelector('select') || document.getElementById('select-turma');
  if (!select) return;

  try {
    const res = await fetch('/api/turmas');
    const turmas = await res.json();

    select.innerHTML = '<option value="">Selecione uma Turma</option>';
    
    turmas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id || t.ID || t.codigo;
      // Pega qualquer propriedade de nome disponível no objeto
      const rotulo = t.nome || t.nome_turma || t.turma || t.descricao || `Turma ${opt.value}`;
      opt.textContent = rotulo;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      const id = e.target.value;
      if (id) carregarGrade(id);
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

  container.innerHTML = '<p>Carregando dados da grade...</p>';

  try {
    const res = await fetch(`/api/grade/${turmaId}`);
    const dados = await res.json();

    if (!dados || dados.length === 0) {
      container.innerHTML = '<p>Nenhum registro encontrado para esta turma.</p>';
      return;
    }

    // Pega todas as colunas dinamicamente
    const colunas = Object.keys(dados[0]);

    let tableHtml = `
      <table border="1" style="width:100%; border-collapse: collapse; margin-top: 15px; text-align: left;">
        <thead>
          <tr style="background-color: #f4f4f4;">
            ${colunas.map(c => `<th style="padding: 8px; text-transform: uppercase;">${c}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    dados.forEach(linha => {
      tableHtml += '<tr>';
      colunas.forEach(c => {
        tableHtml += `<td style="padding: 8px;">${linha[c] !== null ? linha[c] : '-'}</td>`;
      });
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;

  } catch (err) {
    console.error('Erro ao carregar grade:', err);
    container.innerHTML = '<p>Erro ao conectar com o banco de dados.</p>';
  }
}
document.addEventListener('DOMContentLoaded', () => {
  carregarTurmas();
});

async function carregarTurmas() {
  const select = document.getElementById('select-turma');

  try {
    const res = await fetch('/api/turmas');
    const turmas = await res.json();

    if (!turmas || turmas.length === 0) {
      select.innerHTML = '<option value="">Nenhuma turma cadastrada</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Selecione uma Turma / Módulo --</option>';

    turmas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.nome_descricao} [${t.turno_nome}]`;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      const turmaId = e.target.value;
      if (turmaId) {
        carregarAlocacoes(turmaId);
      } else {
        document.getElementById('resultado').innerHTML = `
          <div class="p-6 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-sm">
            Selecione uma turma no campo acima para visualizar as disciplinas e professores.
          </div>
        `;
      }
    });

  } catch (err) {
    console.error('Erro ao carregar turmas:', err);
    select.innerHTML = '<option value="">Erro ao carregar dados do servidor</option>';
  }
}

async function carregarAlocacoes(turmaId) {
  const container = document.getElementById('resultado');
  container.innerHTML = '<div class="p-4 text-center text-slate-500 text-sm">Carregando disciplinas e professores...</div>';

  try {
    const res = await fetch(`/api/alocacoes/${turmaId}`);
    const dados = await res.json();

    if (!dados || dados.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-slate-500 text-sm">Nenhuma alocação encontrada para esta turma.</div>';
      return;
    }

    let html = `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse border border-slate-200 text-sm">
          <thead>
            <tr class="bg-blue-900 text-white">
              <th class="p-3 border border-slate-300 font-semibold">Disciplina / Matéria</th>
              <th class="p-3 border border-slate-300 font-semibold">Tipo</th>
              <th class="p-3 border border-slate-300 font-semibold">Professor(a) Atribuído(a)</th>
            </tr>
          </thead>
          <tbody>
    `;

    dados.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
      html += `
        <tr class="${bg}">
          <td class="p-3 border border-slate-200 font-bold text-slate-800">${item.disciplina_nome || '-'}</td>
          <td class="p-3 border border-slate-200 text-slate-600">${item.tipo || 'PRESENCIAL'}</td>
          <td class="p-3 border border-slate-200 text-slate-700">${item.professor_nome || 'A DEFINIR'}</td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

  } catch (err) {
    console.error('Erro ao carregar alocações:', err);
    container.innerHTML = '<div class="p-4 text-center text-red-600 text-sm">Erro ao carregar os dados.</div>';
  }
}
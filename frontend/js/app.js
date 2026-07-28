document.addEventListener('DOMContentLoaded', () => {
  inicializarSistema();
});

async function inicializarSistema() {
  const select = document.getElementById('select-turma-unica');

  try {
    const res = await fetch('/api/turmas');
    const turmas = await res.json();

    if (!turmas || turmas.length === 0) {
      select.innerHTML = '<option value="">Nenhuma turma encontrada</option>';
      return;
    }

    select.innerHTML = '<option value="">-- SELECIONE A TURMA / MÓDULO --</option>';

    // Separação em grupos dentro do SELETOR ÚNICO
    const manha = turmas.filter(t => (t.nome_descricao || t.nome || '').toUpperCase().includes('MANHÃ'));
    const noite = turmas.filter(t => (t.nome_descricao || t.nome || '').toUpperCase().includes('NOITE'));
    const semipresencial = turmas.filter(t => (t.nome_descricao || t.nome || '').toUpperCase().includes('SEMI') || (t.nome_descricao || t.nome || '').toUpperCase().includes('EAD'));
    const outros = turmas.filter(t => !manha.includes(t) && !noite.includes(t) && !semipresencial.includes(t));

    const criarGrupo = (label, lista) => {
      if (lista.length === 0) return;
      const group = document.createElement('optgroup');
      group.label = `--- ${label} ---`;
      lista.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.nome_descricao || t.nome;
        group.appendChild(opt);
      });
      select.appendChild(group);
    };

    criarGrupo('TURNO: MANHÃ', manha);
    criarGrupo('TURNO: NOITE', noite);
    criarGrupo('MODALIDADE: SEMIPRESENCIAL', semipresencial);
    criarGrupo('OUTROS / MÓDULOS', outros);

    select.addEventListener('change', (e) => {
      const turmaId = e.target.value;
      if (turmaId) {
        carregarCardsDaTurma(turmaId);
      } else {
        resetaContainerCards();
      }
    });

  } catch (err) {
    console.error('Erro ao inicializar:', err);
    select.innerHTML = '<option value="">Erro ao carregar dados do servidor</option>';
  }
}

function resetaContainerCards() {
  document.getElementById('container-cards').innerHTML = `
    <div class="col-span-full p-8 text-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">
      Selecione uma opção no filtro acima para carregar os cards das disciplinas e professores.
    </div>
  `;
}

async function carregarCardsDaTurma(turmaId) {
  const container = document.getElementById('container-cards');
  container.innerHTML = '<div class="col-span-full text-center p-6 text-slate-500 text-sm">Carregando cards...</div>';

  try {
    const res = await fetch(`/api/alocacoes/${turmaId}`);
    const alocacoes = await res.json();

    if (!alocacoes || alocacoes.length === 0) {
      container.innerHTML = '<div class="col-span-full p-6 text-center text-slate-500 text-sm">Nenhuma disciplina cadastrada para esta turma.</div>';
      return;
    }

    // Validação em Tempo Real: Verifica se há professores duplicados alocados no mesmo bloco
    const professoresAlocados = {};
    let conflitosDetectados = [];

    alocacoes.forEach(a => {
      const prof = a.professor_nome;
      if (prof && prof !== 'A DEFINIR') {
        if (professoresAlocados[prof]) {
          professoresAlocados[prof].push(a.disciplina_nome);
          conflitosDetectados.push({ professor: prof, disciplinas: professoresAlocados[prof] });
        } else {
          professoresAlocados[prof] = [a.disciplina_nome];
        }
      }
    });

    container.innerHTML = '';

    // ALERTA DE CONFLITO EM TEMPO REAL
    if (conflitosDetectados.length > 0) {
      const alertaDiv = document.createElement('div');
      alertaDiv.className = 'col-span-full mb-4 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm font-semibold rounded shadow-sm';
      alertaDiv.innerHTML = `
        ⚠️ <strong>ATENÇÃO / CONFLITO DE DOCENTE DETECTADO!</strong><br>
        O mesmo professor foi atribuído a mais de uma disciplina nesta mesma turma/horário:
        <ul class="list-disc ml-5 mt-1 font-normal">
          ${conflitosDetectados.map(c => `<li><strong>${c.professor}</strong> em: ${c.disciplinas.join(', ')}</li>`).join('')}
        </ul>
      `;
      container.appendChild(alertaDiv);
    }

    // RENDERIZAÇÃO DOS CARDS
    alocacoes.forEach(item => {
      const ehSemipresencial = (item.tipo && item.tipo.toUpperCase().includes('SEMI')) || item.disciplina_nome.toUpperCase().includes('SEMI');
      
      const card = document.createElement('div');
      card.className = `p-5 rounded-lg shadow-sm border transition-all ${
        ehSemipresencial 
          ? 'bg-amber-50 border-amber-300' 
          : 'bg-white border-slate-200 hover:shadow-md'
      }`;

      card.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
            ehSemipresencial ? 'bg-amber-200 text-amber-800' : 'bg-blue-100 text-blue-800'
          }">
            ${ehSemipresencial ? 'Semipresencial' : 'Presencial'}
          </span>
        </div>

        <h3 class="text-base font-bold text-slate-800 mb-2">${item.disciplina_nome}</h3>
        
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs text-slate-500 font-medium">Docente:</span>
          <span class="text-sm font-bold ${
            item.professor_nome === 'A DEFINIR' ? 'text-red-500 italic' : 'text-slate-700'
          }">
            ${item.professor_nome}
          </span>
        </div>
      `;

      container.appendChild(card);
    });

  } catch (err) {
    console.error('Erro ao carregar cards:', err);
    container.innerHTML = '<div class="col-span-full p-4 text-center text-red-600 text-sm">Erro ao carregar os cards da turma.</div>';
  }
}
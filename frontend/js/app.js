document.addEventListener('DOMContentLoaded', () => {
  carregarTurmas();
});

async function carregarTurmas() {
  const selectTurma = document.getElementById('select-turma') || document.querySelector('select');
  
  try {
    // Rota relativa dinâmica (funciona em dev e prod)
    const response = await fetch('/api/turmas');
    
    if (!response.ok) {
      throw new Error(`Erro na requisição: ${response.status}`);
    }
    
    const turmas = await response.json();
    
    if (!selectTurma) {
      console.error('Elemento select de turmas não foi encontrado no DOM.');
      return;
    }
    
    selectTurma.innerHTML = '<option value="">Selecione uma Turma</option>';
    
    if (turmas.length === 0) {
      selectTurma.innerHTML = '<option value="">Nenhuma turma cadastrada</option>';
      return;
    }
    
    turmas.forEach(turma => {
      const option = document.createElement('option');
      option.value = turma.id;
      option.textContent = turma.nome || turma.nome_turma || `Turma ${turma.id}`;
      selectTurma.appendChild(option);
    });
    
  } catch (error) {
    console.error('Falha ao carregar turmas:', error);
    if (selectTurma) {
      selectTurma.innerHTML = '<option value="">Erro ao carregar turmas</option>';
    }
  }
}
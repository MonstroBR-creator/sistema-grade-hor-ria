/**
 * LOGIN.JS - Controle de Autenticação Atômico
 * Caminho: frontend/js/login.js
 */

document.addEventListener('DOMContentLoaded', () => {
  // Se o usuário já estiver logado, redireciona para a grade principal
  const token = localStorage.getItem('token');
  if (token) {
    window.location.replace('/');
    return;
  }

  const btnEntrar = document.getElementById('btn-entrar');
  const identificadorInput = document.getElementById('identificador');
  const senhaInput = document.getElementById('senha');

  if (btnEntrar) {
    btnEntrar.addEventListener('click', processarLogin);
  }

  // Suporte à tecla Enter nos campos de texto
  [identificadorInput, senhaInput].forEach(input => {
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          processarLogin();
        }
      });
    }
  });
});

async function processarLogin() {
  const idInput = document.getElementById('identificador');
  const senhaInput = document.getElementById('senha');
  const alertaErro = document.getElementById('alerta-erro');
  const alertaSucesso = document.getElementById('alerta-sucesso');
  const btnEntrar = document.getElementById('btn-entrar');

  const identificador = idInput.value.trim();
  const senha = senhaInput.value.trim();

  alertaErro.classList.add('hidden');
  alertaSucesso.classList.add('hidden');

  if (!identificador || !senha) {
    alertaErro.textContent = 'Por favor, informe o Usuário/CPF e a Senha.';
    alertaErro.classList.remove('hidden');
    return;
  }

  btnEntrar.disabled = true;
  btnEntrar.innerHTML = `<span>Autenticando...</span>`;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador, senha })
    });

    const data = await response.json();

    if (response.ok && data.sucesso) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));

      alertaSucesso.textContent = 'Acesso autorizado! Redirecionando...';
      alertaSucesso.classList.remove('hidden');

      setTimeout(() => {
        window.location.href = '/';
      }, 400);

    } else {
      alertaErro.textContent = data.mensagem || 'Credenciais de acesso incorretas.';
      alertaErro.classList.remove('hidden');
      btnEntrar.disabled = false;
      btnEntrar.innerHTML = `<span>Entrar no Sistema</span>`;
    }
  } catch (err) {
    console.error('❌ Erro de comunicação com o servidor:', err);
    alertaErro.textContent = 'Erro de conexão com o servidor. Verifique se o backend Node está em execução.';
    alertaErro.classList.remove('hidden');
    btnEntrar.disabled = false;
    btnEntrar.innerHTML = `<span>Entrar no Sistema</span>`;
  }
}
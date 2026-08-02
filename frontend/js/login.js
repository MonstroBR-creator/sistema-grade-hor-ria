/**
 * LOGIN.JS — Autenticação da página de acesso.
 * Caminho real: frontend/js/login.js
 *
 * O projeto original tinha DUAS implementações divergentes de login: um script
 * inline em login.html e um frontend/login.js que nunca era carregado (e cujo
 * cabeçalho apontava para um caminho inexistente). Esta é a única versão.
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const formulario = document.getElementById('form-login');
  if (formulario) formulario.addEventListener('submit', processarLogin);
});

async function processarLogin(evento) {
  evento.preventDefault();

  const campoIdentificador = document.getElementById('identificador');
  const campoSenha = document.getElementById('senha');
  const alertaErro = document.getElementById('alerta-erro');
  const alertaSucesso = document.getElementById('alerta-sucesso');
  const botao = document.getElementById('btn-entrar');

  const identificador = campoIdentificador.value.trim();
  const senha = campoSenha.value;

  alertaErro.classList.add('hidden');
  alertaSucesso.classList.add('hidden');

  if (!identificador || !senha) {
    mostrarErro(alertaErro, botao, 'Informe o Usuário/CPF e a Senha.');
    return;
  }

  botao.disabled = true;
  botao.innerHTML = '<span>Autenticando...</span>';

  try {
    const dados = await api('/api/login', {
      metodo: 'POST',
      corpo: { identificador, senha },
      autenticado: false
    });

    Sessao.salvar(dados.token, dados.usuario);

    alertaSucesso.textContent = 'Acesso autorizado! Redirecionando...';
    alertaSucesso.classList.remove('hidden');

    // `replace` impede que o botão "voltar" retorne à tela de login já autenticado.
    setTimeout(() => window.location.replace('/index.html'), 350);
  } catch (erro) {
    mostrarErro(alertaErro, botao, erro.message || 'Credenciais de acesso incorretas.');
  }
}

function mostrarErro(alertaErro, botao, mensagem) {
  alertaErro.textContent = mensagem;
  alertaErro.classList.remove('hidden');
  botao.disabled = false;
  botao.innerHTML = '<span>Entrar no Sistema</span>';
}

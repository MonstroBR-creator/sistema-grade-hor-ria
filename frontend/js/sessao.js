/**
 * SESSAO.JS — Camada compartilhada de sessão, chamadas à API e utilitários de UI.
 * Carregue este arquivo no <head>, antes do script da página:
 *
 *   <script src="js/sessao.js" data-guard="privado"></script>   → exige login
 *   <script src="js/sessao.js" data-guard="publico"></script>   → página de login
 *
 * No projeto original cada página repetia (com variações) o controle de sessão
 * dentro de <script> inline, e o token JWT nunca era enviado à API.
 */

'use strict';

const Sessao = (() => {
  const CHAVE_TOKEN = 'token';
  const CHAVE_USUARIO = 'usuario';

  const token = () => localStorage.getItem(CHAVE_TOKEN);

  function usuario() {
    try {
      const bruto = localStorage.getItem(CHAVE_USUARIO);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      console.error('Sessão corrompida no armazenamento local:', e);
      return null;
    }
  }

  const salvar = (tok, dados) => {
    localStorage.setItem(CHAVE_TOKEN, tok);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(dados));
  };

  const limpar = () => {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USUARIO);
  };

  const ativa = () => Boolean(token() && usuario());

  const perfil = () => String(usuario()?.perfil || '').toUpperCase();

  const somenteLeitura = () => perfil() === 'CONSULTA';

  // Espelha PERFIS_GESTAO_USUARIOS de backend/auth.js — a autorização de fato
  // é feita no servidor; isto só evita mostrar uma tela que a API vai recusar.
  const PERFIS_GESTORES = ['MESTRE', 'ADMINISTRADOR'];
  const podeGerenciarUsuarios = () => PERFIS_GESTORES.includes(perfil());

  function encerrar(destino = '/login.html') {
    limpar();
    window.location.replace(destino);
  }

  return {
    token,
    usuario,
    salvar,
    limpar,
    ativa,
    perfil,
    somenteLeitura,
    podeGerenciarUsuarios,
    encerrar
  };
})();

/* ==========================================
   GUARDA DE ROTA
   ========================================== */

(function aplicarGuarda() {
  const guarda = document.currentScript?.dataset?.guard;

  if (guarda === 'privado' && !Sessao.ativa()) {
    window.location.replace('/login.html');
  }

  if (guarda === 'publico' && Sessao.ativa()) {
    window.location.replace('/index.html');
  }
})();

/* ==========================================
   CHAMADAS À API
   ========================================== */

class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
  }
}

/**
 * Wrapper de fetch que anexa o token, interpreta o JSON de resposta e converte
 * qualquer falha numa exceção com mensagem legível.
 */
async function api(caminho, { metodo = 'GET', corpo = null, autenticado = true } = {}) {
  const opcoes = { method: metodo, headers: {} };

  if (autenticado && Sessao.token()) {
    opcoes.headers.Authorization = `Bearer ${Sessao.token()}`;
  }

  if (corpo !== null) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(caminho, opcoes);
  } catch (e) {
    throw new ErroApi('Não foi possível falar com o servidor. Verifique se o backend está em execução.', 0);
  }

  let dados = null;
  const tipo = resposta.headers.get('content-type') || '';
  if (tipo.includes('application/json')) {
    dados = await resposta.json().catch(() => null);
  }

  if (resposta.status === 401 && autenticado) {
    Sessao.encerrar();
    throw new ErroApi('Sessão expirada.', 401);
  }

  if (!resposta.ok) {
    throw new ErroApi(dados?.mensagem || `Falha na requisição (HTTP ${resposta.status}).`, resposta.status);
  }

  return dados;
}

/* ==========================================
   UTILITÁRIOS DE INTERFACE
   ========================================== */

/**
 * Escapa texto vindo do banco antes de injetá-lo com innerHTML.
 * Sem isto, um nome com aspas ou `<` quebrava a marcação (e permitia injeção).
 */
function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Exibe um aviso flutuante temporário no canto da tela. */
function avisar(mensagem, tipo = 'erro', duracaoMs = 5000) {
  let area = document.getElementById('area-avisos');
  if (!area) {
    area = document.createElement('div');
    area.id = 'area-avisos';
    area.setAttribute('role', 'status');
    area.setAttribute('aria-live', 'polite');
    document.body.appendChild(area);
  }

  const caixa = document.createElement('div');
  caixa.className = `aviso aviso-${tipo}`;
  caixa.textContent = mensagem;
  area.appendChild(caixa);

  setTimeout(() => caixa.remove(), duracaoMs);
}

/** Preenche o nome/perfil no cabeçalho e liga o botão de sair. */
function prepararCabecalho() {
  const dados = Sessao.usuario();

  const elNome = document.getElementById('nome-usuario-logado');
  const elPerfil = document.getElementById('perfil-usuario-logado');

  if (elNome) elNome.textContent = dados?.nome || dados?.usuario || 'Usuário';
  if (elPerfil) elPerfil.textContent = dados?.perfil || 'USUARIO';

  document.querySelectorAll('[data-acao="sair"]').forEach((botao) => {
    botao.addEventListener('click', () => Sessao.encerrar());
  });

  // O link de gestão de contas só aparece para quem a API realmente autoriza.
  const linkUsuarios = document.getElementById('btn-gerenciar-usuarios');
  if (linkUsuarios && !Sessao.podeGerenciarUsuarios()) {
    linkUsuarios.remove();
  }
}

document.addEventListener('DOMContentLoaded', prepararCabecalho);

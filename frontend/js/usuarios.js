/**
 * USUARIOS.JS — Painel de gestão de contas de acesso.
 * Requer js/sessao.js carregado antes (Sessao, api, escapeHtml, avisar).
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // A API só aceita perfil ADMINISTRADOR aqui; a checagem no cliente evita que a
  // página carregue uma tela inútil (a autorização de verdade está no servidor).
  if (!Sessao.podeGerenciarUsuarios()) {
    document.getElementById('conteudo-usuarios')?.classList.add('hidden');
    document.getElementById('bloqueio-perfil')?.classList.remove('hidden');
    return;
  }

  document.getElementById('form-criar-usuario')?.addEventListener('submit', criarUsuario);
  document.getElementById('cad-cpf')?.addEventListener('input', formatarCpf);

  carregarUsuarios();
});

/* ==========================================
   LISTAGEM
   ========================================== */

async function carregarUsuarios() {
  const corpo = document.getElementById('tabela-corpo-usuarios');
  if (!corpo) return;

  try {
    const usuarios = await api('/api/usuarios');

    if (!usuarios.length) {
      corpo.innerHTML =
        '<tr><td colspan="6" class="p-4 text-center text-slate-400 italic">Nenhum usuário cadastrado.</td></tr>';
      return;
    }

    corpo.innerHTML = '';
    const meuId = Sessao.usuario()?.id;

    usuarios.forEach((u) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-200 hover:bg-slate-50 transition-colors';

      tr.innerHTML = `
        <td class="p-3 border border-slate-200 font-bold text-slate-500">${escapeHtml(u.id)}</td>
        <td class="p-3 border border-slate-200 font-semibold text-slate-800">${escapeHtml(u.nome)}</td>
        <td class="p-3 border border-slate-200 text-blue-600 font-mono">${escapeHtml(u.usuario)}</td>
        <td class="p-3 border border-slate-200 text-slate-600">${escapeHtml(formatarCpfTexto(u.cpf))}</td>
        <td class="p-3 border border-slate-200 font-bold text-xs uppercase text-slate-700">${escapeHtml(u.perfil)}</td>
      `;

      const acoes = document.createElement('td');
      acoes.className = 'p-3 border border-slate-200 text-center';

      if (Number(u.id) === Number(meuId)) {
        acoes.innerHTML = '<span class="text-[11px] text-slate-400 italic">conta atual</span>';
      } else {
        // Botão via addEventListener: com onclick inline, um nome contendo
        // apóstrofo (ex.: "D'Ávila") quebrava o JavaScript gerado.
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className =
          'bg-red-500 hover:bg-red-600 text-white font-bold text-[11px] px-2.5 py-1 rounded shadow transition-all cursor-pointer';
        botao.textContent = 'Excluir';
        botao.addEventListener('click', () => excluirUsuario(u.id, u.nome));
        acoes.appendChild(botao);
      }

      tr.appendChild(acoes);
      corpo.appendChild(tr);
    });
  } catch (erro) {
    corpo.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">${escapeHtml(erro.message)}</td></tr>`;
  }
}

/* ==========================================
   CADASTRO
   ========================================== */

async function criarUsuario(evento) {
  evento.preventDefault();

  const botao = document.getElementById('btn-cadastrar');
  const senha = document.getElementById('cad-senha').value;

  if (senha.length < 6) {
    mostrarMensagem('A senha deve ter no mínimo 6 caracteres.', 'erro');
    return;
  }

  const novoUsuario = {
    nome: document.getElementById('cad-nome').value.trim(),
    usuario: document.getElementById('cad-usuario').value.trim(),
    cpf: document.getElementById('cad-cpf').value.replace(/\D/g, ''),
    senha_hash: senha,
    perfil: document.getElementById('cad-perfil').value
  };

  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    const dados = await api('/api/usuarios', { metodo: 'POST', corpo: novoUsuario });

    mostrarMensagem(dados.mensagem || 'Usuário cadastrado com sucesso!', 'sucesso');
    document.getElementById('form-criar-usuario').reset();
    await carregarUsuarios();
  } catch (erro) {
    mostrarMensagem(erro.message, 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar Usuário';
  }
}

async function excluirUsuario(id, nome) {
  if (!confirm(`Tem certeza que deseja excluir o usuário "${nome}"?`)) return;

  try {
    await api(`/api/usuarios/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
    mostrarMensagem(`Usuário "${nome}" excluído.`, 'sucesso');
    await carregarUsuarios();
  } catch (erro) {
    mostrarMensagem(erro.message, 'erro');
  }
}

/* ==========================================
   APOIO DE INTERFACE
   ========================================== */

function mostrarMensagem(texto, tipo) {
  const caixa = document.getElementById('alerta-msg');
  if (!caixa) {
    avisar(texto, tipo);
    return;
  }

  const estilos =
    tipo === 'sucesso'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-red-50 text-red-700 border border-red-200';

  caixa.className = `mb-4 p-3 rounded-lg text-xs font-semibold ${estilos}`;
  caixa.textContent = texto;
}

function formatarCpfTexto(cpf) {
  const digitos = String(cpf || '').replace(/\D/g, '');
  if (digitos.length !== 11) return cpf || '-';
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

function formatarCpf(evento) {
  const digitos = evento.target.value.replace(/\D/g, '').slice(0, 11);

  let formatado = digitos;
  if (digitos.length > 9) {
    formatado = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  } else if (digitos.length > 6) {
    formatado = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
  } else if (digitos.length > 3) {
    formatado = `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
  }

  evento.target.value = formatado;
}

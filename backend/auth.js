/**
 * AUTH.JS — Senhas, tokens JWT e middlewares de autorização.
 * Sistema de Gestão de Grade Horária (CEEBJA / EJA)
 */

'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SEGREDO_PADRAO = 'ceebja_chave_de_desenvolvimento_NAO_USE_EM_PRODUCAO';
const JWT_SECRET = process.env.JWT_SECRET || SEGREDO_PADRAO;
const JWT_EXPIRACAO = process.env.JWT_EXPIRACAO || '8h';
const EM_PRODUCAO = process.env.NODE_ENV === 'production';

if (EM_PRODUCAO && JWT_SECRET === SEGREDO_PADRAO) {
  // Em produção, subir com a chave padrão significa que qualquer pessoa que leia o
  // código-fonte consegue forjar um token de administrador.
  console.error('❌ JWT_SECRET não definido. Configure a variável de ambiente antes de iniciar em produção.');
  process.exit(1);
}

if (!EM_PRODUCAO && JWT_SECRET === SEGREDO_PADRAO) {
  console.warn('⚠️  Usando JWT_SECRET de desenvolvimento. Defina JWT_SECRET no ambiente antes de publicar.');
}

/* ==========================================
   PERFIS DE ACESSO
   ========================================== */

const PERFIS = {
  // Conta única de comando do sistema, criada na instalação. Não pode ser
  // cadastrada pela tela — existe uma só, e ela é protegida contra exclusão.
  MESTRE: 'MESTRE',
  ADMINISTRADOR: 'ADMINISTRADOR',
  PEDAGOGICO: 'PEDAGOGICO',
  SECRETARIA: 'SECRETARIA',
  USUARIO: 'USUARIO',
  CONSULTA: 'CONSULTA'
};

/** Perfis que podem ser escolhidos ao cadastrar uma conta pela interface. */
const PERFIS_ATRIBUIVEIS = [
  PERFIS.ADMINISTRADOR,
  PERFIS.PEDAGOGICO,
  PERFIS.SECRETARIA,
  PERFIS.USUARIO,
  PERFIS.CONSULTA
];

/** Perfis autorizados a criar/excluir contas de acesso. */
const PERFIS_GESTAO_USUARIOS = [PERFIS.MESTRE, PERFIS.ADMINISTRADOR];

/** Perfis autorizados a montar/alterar a grade horária. */
const PERFIS_EDICAO_GRADE = [
  PERFIS.MESTRE,
  PERFIS.ADMINISTRADOR,
  PERFIS.PEDAGOGICO,
  PERFIS.SECRETARIA,
  PERFIS.USUARIO
];

/* ==========================================
   SENHAS
   ========================================== */

const CUSTO_BCRYPT = 10;
const PREFIXOS_BCRYPT = ['$2a$', '$2b$', '$2y$'];

/** Indica se o valor guardado no banco já é um hash bcrypt (e não texto puro legado). */
function ehHashBcrypt(valor) {
  return typeof valor === 'string' && PREFIXOS_BCRYPT.some((p) => valor.startsWith(p));
}

function gerarHashSenha(senha) {
  return bcrypt.hashSync(String(senha), CUSTO_BCRYPT);
}

/**
 * Confere a senha informada contra o valor armazenado.
 * Aceita hashes bcrypt e também senhas legadas em texto puro — estas últimas são
 * migradas para hash automaticamente no primeiro login bem-sucedido (ver server.js).
 */
function conferirSenha(senhaInformada, valorArmazenado) {
  const senha = String(senhaInformada ?? '');

  if (ehHashBcrypt(valorArmazenado)) {
    return { valida: bcrypt.compareSync(senha, valorArmazenado), legado: false };
  }

  return { valida: senha === String(valorArmazenado ?? ''), legado: true };
}

/* ==========================================
   TOKENS
   ========================================== */

function gerarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      nome: usuario.nome,
      usuario: usuario.usuario,
      perfil: usuario.perfil
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRACAO }
  );
}

function lerTokenDoCabecalho(req) {
  const cabecalho = req.headers.authorization || '';
  const [esquema, token] = cabecalho.split(' ');
  if (esquema && esquema.toLowerCase() === 'bearer' && token) return token.trim();
  return null;
}

/**
 * Middleware: exige um token válido. Popula `req.usuario`.
 * Antes desta revisão nenhuma rota validava o token — qualquer pessoa com acesso
 * à porta do servidor podia listar, criar e excluir usuários.
 */
function autenticar(req, res, next) {
  const token = lerTokenDoCabecalho(req);

  if (!token) {
    return res.status(401).json({ sucesso: false, mensagem: 'Sessão não informada. Faça login novamente.' });
  }

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    const expirou = err.name === 'TokenExpiredError';
    return res.status(401).json({
      sucesso: false,
      mensagem: expirou ? 'Sessão expirada. Faça login novamente.' : 'Sessão inválida. Faça login novamente.'
    });
  }
}

/** Middleware: exige que o perfil do usuário autenticado esteja na lista informada. */
function exigirPerfil(perfisPermitidos) {
  const permitidos = perfisPermitidos.map((p) => String(p).toUpperCase());

  return (req, res, next) => {
    const perfil = String(req.usuario?.perfil || '').toUpperCase();

    if (!permitidos.includes(perfil)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Seu perfil de acesso não permite executar esta ação.'
      });
    }

    return next();
  };
}

/* ==========================================
   LIMITE DE TENTATIVAS DE LOGIN (em memória)
   ========================================== */

const MAX_TENTATIVAS = 10;
const JANELA_MS = 15 * 60 * 1000;
const tentativas = new Map();

function chaveTentativa(req, identificador) {
  return `${req.ip}|${String(identificador || '').toLowerCase()}`;
}

function tentativasExcedidas(req, identificador) {
  const registro = tentativas.get(chaveTentativa(req, identificador));
  if (!registro) return false;
  if (Date.now() - registro.desde > JANELA_MS) return false;
  return registro.contagem >= MAX_TENTATIVAS;
}

function registrarFalha(req, identificador) {
  const chave = chaveTentativa(req, identificador);
  const registro = tentativas.get(chave);

  if (!registro || Date.now() - registro.desde > JANELA_MS) {
    tentativas.set(chave, { contagem: 1, desde: Date.now() });
  } else {
    registro.contagem += 1;
  }
}

function limparTentativas(req, identificador) {
  tentativas.delete(chaveTentativa(req, identificador));
}

// Descarte periódico das janelas vencidas para o Map não crescer indefinidamente.
const limpezaPeriodica = setInterval(() => {
  const agora = Date.now();
  for (const [chave, registro] of tentativas) {
    if (agora - registro.desde > JANELA_MS) tentativas.delete(chave);
  }
}, JANELA_MS);
limpezaPeriodica.unref();

module.exports = {
  PERFIS,
  PERFIS_ATRIBUIVEIS,
  PERFIS_GESTAO_USUARIOS,
  PERFIS_EDICAO_GRADE,
  ehHashBcrypt,
  gerarHashSenha,
  conferirSenha,
  gerarToken,
  autenticar,
  exigirPerfil,
  tentativasExcedidas,
  registrarFalha,
  limparTentativas
};

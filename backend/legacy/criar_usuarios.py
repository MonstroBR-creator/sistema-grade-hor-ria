"""
CRIAR_USUARIOS.PY — Criação manual das contas de acesso padrão.
Arquivo: backend/criar_usuarios.py

Uso:
    python backend/criar_usuarios.py                 # cria só o que estiver faltando
    python backend/criar_usuarios.py --redefinir     # redefine as senhas padrão

O sistema tem UMA conta de origem — o mestre. Todas as demais são criadas por
ela na tela "Gerenciar Usuários".

Observação: o próprio servidor Node cria essa conta na inicialização
(ver backend/db.js). Este script é um atalho para preparar o banco sem subir a
aplicação — a lista abaixo precisa continuar igual à de db.js.

Correções desta revisão:
  * O script gravava o CPF 11111111111 para o usuário 'pedagogia', o mesmo CPF
    que o servidor usa para o administrador 'monstro'. Como a coluna cpf é
    UNIQUE e o ON CONFLICT tratava apenas a coluna `usuario`, a execução
    quebrava com IntegrityError depois do primeiro start do servidor.
  * Os nomes de usuário e perfis divergiam dos do servidor ('pedagogia' x
    'pedagogico', 'MESTRE' x 'ADMINISTRADOR'); 'MESTRE' não era reconhecido por
    nenhuma verificação de permissão do sistema.
  * O upsert sobrescrevia a senha a cada execução, desfazendo trocas feitas
    pelos usuários. Agora isso só acontece com --redefinir.
"""

import argparse
import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database", "grade_horaria.db")
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database", "schema.sql")

# Conta única do sistema — espelha USUARIO_MESTRE de backend/db.js.
# As demais contas são criadas pelo mestre na tela "Gerenciar Usuários".
# (nome, cpf, usuario, senha, perfil)
USUARIOS_PADRAO = [
    (
        os.environ.get("MESTRE_NOME", "Usuário Mestre — RASM Tecnologia"),
        "".join(c for c in os.environ.get("MESTRE_CPF", "") if c.isdigit()) or None,
        os.environ.get("MESTRE_USUARIO", "mestre").strip().lower(),
        os.environ.get("MESTRE_SENHA", "rasm2026"),
        "MESTRE",
    ),
]

try:
    import bcrypt  # opcional

    def proteger(senha):
        return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")

    BCRYPT_DISPONIVEL = True
except ImportError:
    def proteger(senha):
        return senha

    BCRYPT_DISPONIVEL = False


def garantir_schema(conn):
    """Garante que a tabela usuarios exista, usando o schema oficial do projeto."""
    if not os.path.exists(SCHEMA_PATH):
        raise FileNotFoundError(f"Arquivo de schema não encontrado em {SCHEMA_PATH}")

    with open(SCHEMA_PATH, "r", encoding="utf-8") as arquivo:
        conn.executescript(arquivo.read())


def criar_usuarios(redefinir=False):
    if not os.path.exists(DB_PATH):
        print("ℹ️  Banco ainda não existe — ele será criado agora.")
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    conn = sqlite3.connect(DB_PATH)

    try:
        garantir_schema(conn)
        cursor = conn.cursor()

        criados = atualizados = mantidos = 0

        for nome, cpf, usuario, senha, perfil in USUARIOS_PADRAO:
            # Busca por login OU por CPF: os dois campos são UNIQUE e qualquer um
            # deles em conflito impediria o INSERT.
            cursor.execute(
                "SELECT id, usuario FROM usuarios WHERE LOWER(usuario) = ? OR (cpf IS NOT NULL AND cpf = ?)",
                (usuario, cpf),
            )
            existente = cursor.fetchone()

            if existente is None:
                cursor.execute(
                    """INSERT INTO usuarios (nome, cpf, usuario, senha_hash, perfil, criado_em)
                       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                    (nome, cpf, usuario, proteger(senha), perfil),
                )
                criados += 1
                print(f"  + criado:  {usuario} ({perfil})")
            elif redefinir:
                cursor.execute(
                    """UPDATE usuarios
                          SET nome = ?, cpf = ?, usuario = ?, senha_hash = ?, perfil = ?
                        WHERE id = ?""",
                    (nome, cpf, usuario, proteger(senha), perfil, existente[0]),
                )
                atualizados += 1
                print(f"  ~ redefinido: {usuario} ({perfil})")
            else:
                mantidos += 1
                print(f"  = já existe: {existente[1]} (senha preservada)")

        conn.commit()

        print(f"\n✅ Concluído — {criados} criado(s), {atualizados} redefinido(s), {mantidos} mantido(s).")
        print("   Acesso permitido pelo nome de usuário OU pelo CPF.")

        if not BCRYPT_DISPONIVEL and (criados or atualizados):
            print(
                "\n⚠️  Pacote 'bcrypt' não instalado: as senhas foram gravadas em texto puro.\n"
                "   O servidor Node aceita esse formato e converte para hash no primeiro\n"
                "   login bem-sucedido. Para já gravar protegido:  pip install bcrypt"
            )

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Cria as contas de acesso padrão do sistema.")
    parser.add_argument(
        "--redefinir",
        action="store_true",
        help="Sobrescreve nome, perfil e senha das contas padrão já existentes.",
    )
    argumentos = parser.parse_args()

    try:
        criar_usuarios(argumentos.redefinir)
    except Exception as erro:
        print(f"❌ {erro}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

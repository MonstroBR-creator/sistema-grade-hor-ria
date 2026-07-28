"""
CRIAR_USUARIOS.PY - Cadastro de Usuários com Suporte a CPF e Usuário
Arquivo: backend/criar_usuarios.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'grade_horaria.db')

def criar_usuarios():
    if not os.path.exists(DB_PATH):
        print("⚠️ Banco de dados não encontrado. Execute primeiro o import_excel.py.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Cria/Atualiza tabela garantindo colunas CPF e USUARIO
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome VARCHAR(100) NOT NULL,
        cpf VARCHAR(14) UNIQUE,
        usuario VARCHAR(50) UNIQUE NOT NULL,
        senha_hash VARCHAR(255) NOT NULL,
        perfil VARCHAR(20) NOT NULL DEFAULT 'PEDAGOGIA'
    );
    """)

    usuarios = [
        ('Administrador Geral', '00000000000', 'admin', 'admin123', 'MESTRE'),
        ('Equipe Pedagogia', '11111111111', 'pedagogia', 'senha123', 'PEDAGOGIA')
    ]

    for nome, cpf, usuario, senha, perfil in usuarios:
        cursor.execute("""
            INSERT INTO usuarios (nome, cpf, usuario, senha_hash, perfil)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(usuario) DO UPDATE SET
                nome = excluded.nome,
                cpf = excluded.cpf,
                senha_hash = excluded.senha_hash,
                perfil = excluded.perfil
        """, (nome, cpf, usuario, senha, perfil))

    conn.commit()
    conn.close()
    print("✅ Usuários cadastrados! Acesso via Usuário ou CPF ativado.")

if __name__ == '__main__':
    criar_usuarios()
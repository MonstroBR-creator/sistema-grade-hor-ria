"""
TESTE_DB.PY — Conferência rápida do conteúdo do banco.
Arquivo: backend/teste_db.py

Uso:
    python backend/teste_db.py

Correções desta revisão: o script quebrava com OperationalError quando o banco
existia mas ainda não tinha sido importado (tabelas ausentes) e não fechava a
conexão em caso de erro. Agora ele apenas relata o que encontra.
"""

import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database", "grade_horaria.db")

TABELAS_ESPERADAS = [
    "turnos",
    "turmas",
    "professores",
    "disciplinas",
    "alocacoes",
    "grade_horaria",
    "usuarios",
]


def tabelas_existentes(cursor):
    cursor.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    return {linha[0] for linha in cursor.fetchall()}


def verificar_dados():
    if not os.path.exists(DB_PATH):
        print("❌ Banco de dados não existe. Rode primeiro:  npm run importar")
        return 1

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        presentes = tabelas_existentes(cursor)

        faltando = [t for t in TABELAS_ESPERADAS if t not in presentes]
        if faltando:
            print(f"⚠️  Tabelas ausentes: {', '.join(faltando)}")
            print("   Rode `npm run importar` (ou inicie o servidor) para criá-las.\n")

        print("--- RESUMO ---")
        for tabela in TABELAS_ESPERADAS:
            if tabela in presentes:
                cursor.execute(f"SELECT COUNT(*) FROM {tabela}")
                print(f"  {tabela:<15} {cursor.fetchone()[0]:>5} registro(s)")
            else:
                print(f"  {tabela:<15}     — ausente")

        if "turmas" in presentes:
            print("\n--- 1. TURMAS ---")
            cursor.execute(
                """SELECT t.id, t.nome_descricao, tu.nome
                     FROM turmas t
                     LEFT JOIN turnos tu ON t.turno_id = tu.id
                    ORDER BY t.nome_descricao"""
            )
            for tid, nome, turno in cursor.fetchall():
                print(f"  ID {tid:>3} | {nome}  [{turno or 'sem turno'}]")

        if {"alocacoes", "turmas", "disciplinas"} <= presentes:
            print("\n--- 2. ALOCAÇÕES ---")
            cursor.execute(
                """SELECT a.id, t.nome_descricao, d.nome,
                          COALESCE(p.nome, 'A DEFINIR'), COALESCE(a.tipo, 'PRESENCIAL')
                     FROM alocacoes a
                     JOIN turmas t      ON a.turma_id = t.id
                     JOIN disciplinas d ON a.disciplina_id = d.id
                     LEFT JOIN professores p ON a.professor_id = p.id
                    ORDER BY t.nome_descricao, d.nome"""
            )
            for aid, turma, materia, professor, tipo in cursor.fetchall():
                print(f"  #{aid:<4} {turma} | {materia} | {professor} | {tipo}")

        if "grade_horaria" in presentes:
            print("\n--- 3. AULAS JÁ POSICIONADAS NA GRADE ---")
            cursor.execute(
                """SELECT t.nome_descricao, g.dia_semana, g.num_aula, d.nome,
                          COALESCE(p.nome, 'A DEFINIR')
                     FROM grade_horaria g
                     JOIN turmas t      ON g.turma_id = t.id
                     JOIN alocacoes a   ON g.alocacao_id = a.id
                     JOIN disciplinas d ON a.disciplina_id = d.id
                     LEFT JOIN professores p ON a.professor_id = p.id
                    ORDER BY t.nome_descricao, g.dia_semana, g.num_aula"""
            )
            linhas = cursor.fetchall()
            if not linhas:
                print("  (nenhuma aula montada ainda)")
            for turma, dia, aula, materia, professor in linhas:
                print(f"  {turma} | {dia} {aula}ª | {materia} — {professor}")

        return 0

    except sqlite3.Error as erro:
        print(f"❌ Erro de banco: {erro}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(verificar_dados())

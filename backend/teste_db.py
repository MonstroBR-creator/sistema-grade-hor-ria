import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "database", "grade_horaria.db")

def verificar_dados():
    if not os.path.exists(DB_PATH):
        print("❌ Banco de dados não existe no caminho especificado.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("--- 1. TURMAS ---")
    cursor.execute("SELECT id, nome_descricao FROM turmas;")
    turmas = cursor.fetchall()
    for t in turmas:
        print(f"ID: {t[0]} | Nome: {t[1]}")

    print("\n--- 2. ALOCAÇÕES CADASTRADAS ---")
    cursor.execute("""
        SELECT a.id, t.nome_descricao, d.nome, COALESCE(p.nome, 'A DEFINIR'), COALESCE(a.tipo, 'PRESENCIAL')
        FROM alocacoes a
        JOIN turmas t ON a.turma_id = t.id
        JOIN disciplinas d ON a.disciplina_id = d.id
        LEFT JOIN professores p ON a.professor_id = p.id;
    """)
    alocacoes = cursor.fetchall()
    for a in alocacoes:
        print(f"Alocacao ID: {a[0]} | Turma: {a[1]} | Materia: {a[2]} | Prof: {a[3]} | Tipo: {a[4]}")

    conn.close()

if __name__ == "__main__":
    verificar_dados()
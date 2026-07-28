import os
import sqlite3
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(BASE_DIR, "data", "professores.xlsx")
DB_PATH = os.path.join(BASE_DIR, "database", "grade_horaria.db")
SCHEMA_PATH = os.path.join(BASE_DIR, "database", "schema.sql")


def inicializar_banco():
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
            print("🧹 Banco antigo removido para recriação limpa do schema.")
        except Exception as e:
            print(f"⚠️ Erro ao remover banco antigo: {e}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        cursor.executescript(f.read())
    conn.commit()
    conn.close()


def mapear_turno_id(codigo_turma):
    cod = str(codigo_turma).strip().upper()
    if cod == "A":
        return 1
    elif cod == "B":
        return 2
    return 3


def importar_dados():
    if not os.path.exists(EXCEL_PATH):
        print(f"❌ Planilha não encontrada em: {EXCEL_PATH}")
        return

    inicializar_banco()

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Injeta professor neutro 'A DEFINIR'
    cursor.execute("INSERT OR IGNORE INTO professores (id, nome) VALUES (1, 'A DEFINIR')")

    df = pd.read_excel(EXCEL_PATH)
    df.columns = df.columns.astype(str).str.strip().str.upper()

    col_turma_desc = [c for c in df.columns if "TURMA" in c and "DESCRITA" in c]
    col_turma_codigo = [c for c in df.columns if c == "TURMA" or "TURMA (" in c or "TURMA_" in c]
    col_disciplina = [c for c in df.columns if "DISCIPLINA" in c]
    col_professor = [c for c in df.columns if "NOME" in c or "SUPRIDO" in c or "PROFESSOR" in c]

    col_desc = col_turma_desc[0] if col_turma_desc else df.columns[0]
    col_disc = col_disciplina[0] if col_disciplina else df.columns[1]
    col_cod = col_turma_codigo[0] if col_turma_codigo else [c for c in df.columns if c != col_desc and c != col_disc][0]
    col_prof = col_professor[0] if col_professor else df.columns[-1]

    print("⏳ Processando registros e gerando alocações...")

    total_criados = 0

    for idx, row in df.iterrows():
        val_desc = row[col_desc]
        val_disc = row[col_disc]
        val_cod = row[col_cod]
        val_prof = row[col_prof]

        if pd.isna(val_desc) or pd.isna(val_disc):
            continue

        turma_desc = str(val_desc).strip()
        disciplina_nome = str(val_disc).strip()
        codigo_turma = str(val_cod).strip()
        prof_raw = str(val_prof).strip() if not pd.isna(val_prof) else ""

        if prof_raw == "" or prof_raw.upper() in ["NAN", "NONE", "NULL", "A DEFINIR"]:
            prof_nome = "A DEFINIR"
        else:
            prof_nome = prof_raw

        turno_id = mapear_turno_id(codigo_turma)

        # 1. Turma
        cursor.execute("INSERT OR IGNORE INTO turmas (nome_descricao, turno_id) VALUES (?, ?)", (turma_desc, turno_id))
        cursor.execute("SELECT id FROM turmas WHERE nome_descricao = ?", (turma_desc,))
        turma_id = cursor.fetchone()[0]

        # 2. Disciplina
        cursor.execute("INSERT OR IGNORE INTO disciplinas (nome) VALUES (?)", (disciplina_nome,))
        cursor.execute("SELECT id FROM disciplinas WHERE nome = ?", (disciplina_nome,))
        disciplina_id = cursor.fetchone()[0]

        # 3. Professor
        if prof_nome == "A DEFINIR":
            prof_id = 1
        else:
            cursor.execute("INSERT OR IGNORE INTO professores (nome) VALUES (?)", (prof_nome,))
            cursor.execute("SELECT id FROM professores WHERE nome = ?", (prof_nome,))
            prof_id = cursor.fetchone()[0]

        # 4. Alocação Presencial Normal
        cursor.execute("""
            INSERT INTO alocacoes (turma_id, disciplina_id, professor_id, tipo)
            VALUES (?, ?, ?, 'PRESENCIAL')
        """, (turma_id, disciplina_id, prof_id))
        total_criados += 1

        # 5. Se a turma for SEMIPRESENCIAL, cria opções virtuais
        if "SEMIPRESENCIAL" in turma_desc.upper():
            cursor.execute("""
                INSERT INTO alocacoes (turma_id, disciplina_id, professor_id, tipo)
                VALUES (?, ?, ?, 'SISTEMA')
            """, (turma_id, disciplina_id, prof_id))

            cursor.execute("""
                INSERT INTO alocacoes (turma_id, disciplina_id, professor_id, tipo)
                VALUES (?, ?, ?, 'TUTORIA')
            """, (turma_id, disciplina_id, prof_id))
            total_criados += 2

    conn.commit()
    conn.close()
    print(f"✅ ETL Concluído! {total_criados} alocações gravadas no SQLite.")


if __name__ == "__main__":
    importar_dados()
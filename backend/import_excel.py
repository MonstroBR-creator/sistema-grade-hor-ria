import os
import sqlite3
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(BASE_DIR, 'data', 'professores.xlsx')
DB_PATH = os.path.join(BASE_DIR, 'database', 'grade_horaria.db')
SCHEMA_PATH = os.path.join(BASE_DIR, 'database', 'schema.sql')

def inicializar_banco():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    # Força a remoção do banco antigo se o schema for incompatível
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
            print("🗑️ Banco de dados antigo removido para recriação limpa com o schema.sql.")
        except Exception as e:
            print(f"⚠️ Não foi possível deletar o arquivo do banco diretamente: {e}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Ativa foreign keys e executa a criação das tabelas do schema v1.2
    cursor.execute("PRAGMA foreign_keys = ON;")
    if os.path.exists(SCHEMA_PATH):
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            cursor.executescript(f.read())
    else:
        print(f"❌ Erro: Arquivo de schema não encontrado em {SCHEMA_PATH}")

    conn.commit()
    conn.close()

def importar_dados():
    if not os.path.exists(EXCEL_PATH):
        print(f"❌ Arquivo {EXCEL_PATH} não encontrado.")
        return

    inicializar_banco()
    df = pd.read_excel(EXCEL_PATH)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Garante o PRAGMA para relacionamentos
    cursor.execute("PRAGMA foreign_keys = ON;")

    # Mapeamento do Turno (A=Manhã, B=Tarde, C=Noite)
    cursor.execute("SELECT id, codigo FROM turnos")
    turnos_map = {codigo: tid for tid, codigo in cursor.fetchall()}

    for _, row in df.iterrows():
        descrita = str(row.get('TURMA DESCRITA', '')).strip()
        disciplina = str(row.get('DISCIPLINA', '')).strip()
        turma_letra = str(row.get('TURMA', 'A')).strip().upper()
        professor = str(row.get('NOME SUPRIDO', 'A DEFINIR')).strip()

        if not descrita or descrita.lower() == 'nan':
            continue

        nome_turma_completa = f"{descrita} (Turma {turma_letra})" if turma_letra and turma_letra != 'NAN' else descrita
        
        # Identifica Turno
        turno_id = turnos_map.get('A', 1)
        if 'NOITE' in descrita.upper():
            turno_id = turnos_map.get('C', 3)
        elif 'TARDE' in descrita.upper():
            turno_id = turnos_map.get('B', 2)

        # 1. Turmas
        cursor.execute("INSERT OR IGNORE INTO turmas (nome_descricao, turno_id) VALUES (?, ?)", (nome_turma_completa, turno_id))
        cursor.execute("SELECT id FROM turmas WHERE nome_descricao = ?", (nome_turma_completa,))
        turma_id = cursor.fetchone()[0]

        # 2. Disciplinas
        cursor.execute("INSERT OR IGNORE INTO disciplinas (nome) VALUES (?)", (disciplina,))
        cursor.execute("SELECT id FROM disciplinas WHERE nome = ?", (disciplina,))
        disciplina_id = cursor.fetchone()[0]

        # 3. Professores
        prof_id = None
        if professor and professor.upper() != 'A DEFINIR' and professor.lower() != 'nan':
            cursor.execute("INSERT OR IGNORE INTO professores (nome) VALUES (?)", (professor,))
            cursor.execute("SELECT id FROM professores WHERE nome = ?", (professor,))
            prof_id = cursor.fetchone()[0]

        # 4. Alocações
        cursor.execute("""
            INSERT INTO alocacoes (turma_id, disciplina_id, professor_id, tipo)
            VALUES (?, ?, ?, 'PRESENCIAL')
        """, (turma_id, disciplina_id, prof_id))

    conn.commit()
    conn.close()
    print("✅ Carga do professores.xlsx concluída com sucesso no schema relacional v1.2!")

if __name__ == '__main__':
    importar_dados()
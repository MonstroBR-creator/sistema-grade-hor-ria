"""
IMPORT_EXCEL.PY — Carga da planilha de professores para o banco SQLite.
Arquivo: backend/import_excel.py

Uso:
    python backend/import_excel.py                  # recarrega o acervo acadêmico
    python backend/import_excel.py --reset          # apaga TAMBÉM os usuários
    python backend/import_excel.py --arquivo X.xlsx # usa outra planilha

Correções desta revisão:
  * A coluna da planilha chama-se "TURMA " (com espaço ao final). O código
    anterior fazia row.get('TURMA', 'A') e recebia SEMPRE o valor padrão 'A',
    de modo que as 23 turmas eram gravadas como "(Turma A)" — inclusive as de
    tarde, noite e semipresenciais. Os nomes das colunas agora são normalizados.
  * O script apagava o arquivo .db inteiro, destruindo as contas de acesso a
    cada importação. Agora só as tabelas acadêmicas são recriadas (use --reset
    para o comportamento antigo, de forma explícita).
  * As alocações eram inseridas sem verificação e duplicavam a cada execução.
  * O campo `tipo` era gravado como 'PRESENCIAL' mesmo para turmas
    semipresenciais; agora é derivado da descrição da turma.
"""

import argparse
import os
import sqlite3
import sys

import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(BASE_DIR, "data", "professores.xlsx")
DB_PATH = os.path.join(BASE_DIR, "database", "grade_horaria.db")
SCHEMA_PATH = os.path.join(BASE_DIR, "database", "schema.sql")

COLUNAS_OBRIGATORIAS = ["TURMA DESCRITA", "DISCIPLINA", "TURMA", "NOME SUPRIDO"]

# Tabelas apagadas a cada importação, na ordem que respeita as chaves estrangeiras.
TABELAS_ACADEMICAS = ["grade_horaria", "alocacoes", "turmas", "disciplinas", "professores"]

VAZIOS = {"", "NAN", "NONE", "NULL", "-"}


def texto(valor):
    """Converte qualquer célula do pandas em texto limpo ('' quando vazia)."""
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return ""
    limpo = str(valor).strip()
    return "" if limpo.upper() in VAZIOS else limpo


def preparar_banco(conn, reset_total):
    """Aplica o schema e limpa as tabelas que serão recarregadas."""
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    if not os.path.exists(SCHEMA_PATH):
        raise FileNotFoundError(f"Arquivo de schema não encontrado em {SCHEMA_PATH}")

    with open(SCHEMA_PATH, "r", encoding="utf-8") as arquivo:
        cursor.executescript(arquivo.read())

    # executescript encerra a transação corrente; reativa o PRAGMA por segurança.
    cursor.execute("PRAGMA foreign_keys = ON;")

    alvos = list(TABELAS_ACADEMICAS)
    if reset_total:
        alvos.append("usuarios")
        print("⚠️  --reset: as contas de acesso também serão apagadas.")

    for tabela in alvos:
        cursor.execute(f"DELETE FROM {tabela};")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name = ?;", (tabela,))

    print("🧹 Tabelas acadêmicas limpas (contas de acesso preservadas)." if not reset_total
          else "🧹 Banco reiniciado por completo.")


def carregar_planilha(caminho):
    if not os.path.exists(caminho):
        raise FileNotFoundError(f"Planilha não encontrada em {caminho}")

    df = pd.read_excel(caminho)

    # Normaliza os cabeçalhos: remove espaços sobrando e uniformiza a caixa.
    # É o que impede a repetição do bug da coluna "TURMA ".
    df.columns = [str(coluna).strip().upper() for coluna in df.columns]

    faltando = [c for c in COLUNAS_OBRIGATORIAS if c not in df.columns]
    if faltando:
        raise ValueError(
            "A planilha não possui as colunas obrigatórias: "
            + ", ".join(faltando)
            + f"\nColunas encontradas: {df.columns.tolist()}"
        )

    return df


def identificar_turno(descricao, letra, turnos_por_codigo):
    """Retorna o id do turno. A descrição manda; a letra é o plano B."""
    texto_maiusculo = descricao.upper()

    if "NOITE" in texto_maiusculo:
        return turnos_por_codigo.get("C", 3)
    if "TARDE" in texto_maiusculo:
        return turnos_por_codigo.get("B", 2)
    if "MANHÃ" in texto_maiusculo or "MANHA" in texto_maiusculo:
        return turnos_por_codigo.get("A", 1)

    if letra.upper() in turnos_por_codigo:
        return turnos_por_codigo[letra.upper()]

    return turnos_por_codigo.get("A", 1)


def identificar_tipo(descricao):
    texto_maiusculo = descricao.upper()
    if "SEMIPRESENCIAL" in texto_maiusculo:
        return "SEMIPRESENCIAL"
    if "TUTORIA" in texto_maiusculo:
        return "TUTORIA"
    return "PRESENCIAL"


def importar(caminho_excel=EXCEL_PATH, reset_total=False):
    df = carregar_planilha(caminho_excel)
    print(f"📄 {len(df)} linha(s) lida(s) de {os.path.basename(caminho_excel)}.")

    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)

    try:
        preparar_banco(conn, reset_total)
        cursor = conn.cursor()

        cursor.execute("SELECT id, codigo FROM turnos")
        turnos_por_codigo = {codigo: tid for tid, codigo in cursor.fetchall()}

        cache_turmas, cache_disciplinas, cache_professores = {}, {}, {}
        alocacoes_vistas = set()
        ignoradas = duplicadas = 0

        for _, linha in df.iterrows():
            descricao = texto(linha.get("TURMA DESCRITA"))
            disciplina = texto(linha.get("DISCIPLINA"))
            letra = texto(linha.get("TURMA"))
            professor = texto(linha.get("NOME SUPRIDO"))

            if not descricao or not disciplina:
                ignoradas += 1
                continue

            nome_turma = f"{descricao} (Turma {letra})" if letra else descricao

            # --- Turma ---
            if nome_turma not in cache_turmas:
                turno_id = identificar_turno(descricao, letra, turnos_por_codigo)
                cursor.execute(
                    "INSERT OR IGNORE INTO turmas (nome_descricao, turno_id) VALUES (?, ?)",
                    (nome_turma, turno_id),
                )
                cursor.execute("SELECT id FROM turmas WHERE nome_descricao = ?", (nome_turma,))
                cache_turmas[nome_turma] = cursor.fetchone()[0]
            turma_id = cache_turmas[nome_turma]

            # --- Disciplina ---
            if disciplina not in cache_disciplinas:
                cursor.execute("INSERT OR IGNORE INTO disciplinas (nome) VALUES (?)", (disciplina,))
                cursor.execute("SELECT id FROM disciplinas WHERE nome = ?", (disciplina,))
                cache_disciplinas[disciplina] = cursor.fetchone()[0]
            disciplina_id = cache_disciplinas[disciplina]

            # --- Professor (opcional) ---
            professor_id = None
            if professor and professor.upper() != "A DEFINIR":
                if professor not in cache_professores:
                    cursor.execute("INSERT OR IGNORE INTO professores (nome) VALUES (?)", (professor,))
                    cursor.execute("SELECT id FROM professores WHERE nome = ?", (professor,))
                    cache_professores[professor] = cursor.fetchone()[0]
                professor_id = cache_professores[professor]

            # --- Alocação (sem repetir a mesma combinação) ---
            chave = (turma_id, disciplina_id, professor_id)
            if chave in alocacoes_vistas:
                duplicadas += 1
                continue
            alocacoes_vistas.add(chave)

            cursor.execute(
                "INSERT INTO alocacoes (turma_id, disciplina_id, professor_id, tipo) VALUES (?, ?, ?, ?)",
                (turma_id, disciplina_id, professor_id, identificar_tipo(descricao)),
            )

        conn.commit()

        print("✅ Importação concluída.")
        print(f"   • Turmas .......... {len(cache_turmas)}")
        print(f"   • Disciplinas ..... {len(cache_disciplinas)}")
        print(f"   • Professores ..... {len(cache_professores)}")
        print(f"   • Alocações ....... {len(alocacoes_vistas)}")
        if ignoradas:
            print(f"   • Linhas ignoradas (sem turma/disciplina): {ignoradas}")
        if duplicadas:
            print(f"   • Linhas duplicadas descartadas: {duplicadas}")

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Importa professores.xlsx para o banco SQLite.")
    parser.add_argument("--arquivo", default=EXCEL_PATH, help="Caminho da planilha a importar.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Apaga TAMBÉM as contas de acesso (comportamento destrutivo do script antigo).",
    )
    argumentos = parser.parse_args()

    try:
        importar(argumentos.arquivo, argumentos.reset)
    except Exception as erro:
        print(f"❌ {erro}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

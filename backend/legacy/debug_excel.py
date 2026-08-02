"""
DEBUG_EXCEL.PY — Inspeção da planilha antes da importação.
Arquivo: backend/debug_excel.py

Uso:
    python backend/debug_excel.py
    python backend/debug_excel.py --arquivo outra_planilha.xlsx

Correções desta revisão: o script executava tudo no nível do módulo e estourava
com uma pilha de erro do pandas quando o arquivo não existia. Agora ele valida o
caminho, mostra os nomes de coluna EXATAMENTE como estão (útil porque a coluna
"TURMA " tem um espaço ao final, que já causou um bug na importação) e aponta as
colunas obrigatórias ausentes.
"""

import argparse
import os
import sys

import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(BASE_DIR, "data", "professores.xlsx")

COLUNAS_OBRIGATORIAS = ["TURMA DESCRITA", "DISCIPLINA", "TURMA", "NOME SUPRIDO"]


def inspecionar(caminho):
    if not os.path.exists(caminho):
        print(f"❌ Planilha não encontrada em: {caminho}", file=sys.stderr)
        return 1

    df = pd.read_excel(caminho)

    print("=" * 72)
    print(f"ARQUIVO ......... {caminho}")
    print(f"LINHAS BRUTAS ... {len(df)}")
    print("=" * 72)

    print("\nCOLUNAS (repr, para revelar espaços invisíveis):")
    for coluna in df.columns:
        normalizada = str(coluna).strip().upper()
        marca = "  ⚠️ tem espaço/caixa divergente" if normalizada != str(coluna) else ""
        print(f"  {coluna!r:<25} → normalizada: {normalizada!r}{marca}")

    normalizadas = [str(c).strip().upper() for c in df.columns]
    faltando = [c for c in COLUNAS_OBRIGATORIAS if c not in normalizadas]
    if faltando:
        print(f"\n❌ Colunas obrigatórias ausentes: {', '.join(faltando)}")
    else:
        print("\n✅ Todas as colunas obrigatórias estão presentes.")

    print("\nCÉLULAS VAZIAS POR COLUNA:")
    print(df.isna().sum().to_string())

    df_normalizado = df.copy()
    df_normalizado.columns = normalizadas

    if not faltando:
        chave = ["TURMA DESCRITA", "TURMA", "DISCIPLINA"]
        duplicadas = int(df_normalizado.duplicated(subset=chave).sum())
        print(f"\nLINHAS DUPLICADAS por {chave}: {duplicadas}")

        print("\nTURMAS ENCONTRADAS:")
        agrupado = df_normalizado.groupby(["TURMA DESCRITA", "TURMA"]).size()
        for (descricao, letra), total in agrupado.items():
            print(f"  {descricao}  (Turma {letra})  →  {total} disciplina(s)")

    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 1000)
    print("\nPRIMEIRAS 15 LINHAS:")
    print(df.head(15).to_string())

    return 0


def main():
    parser = argparse.ArgumentParser(description="Inspeciona a planilha de professores.")
    parser.add_argument("--arquivo", default=EXCEL_PATH, help="Caminho da planilha.")
    argumentos = parser.parse_args()
    sys.exit(inspecionar(argumentos.arquivo))


if __name__ == "__main__":
    main()

import os
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(BASE_DIR, "data", "professores.xlsx")

df = pd.read_excel(EXCEL_PATH)

print("=" * 60)
print(f"TOTAL DE LINHAS BRUTAS NA PLANILHA: {len(df)}")
print("=" * 60)
print("COLUNAS ENCONTRADAS:", df.columns.tolist())
print("-" * 60)

# Exibe as 15 primeiras linhas com todas as colunas sem corte
pd.set_option("display.max_columns", None)
pd.set_option("display.width", 1000)
print(df.head(15))
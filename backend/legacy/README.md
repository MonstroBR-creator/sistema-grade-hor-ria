# Ferramentas legadas

Nada aqui é usado pelo sistema em funcionamento. Os arquivos foram mantidos
como referência do que existia antes da revisão.

## Por que saíram do caminho principal

O sistema passou a rodar em **PostgreSQL no Render**, e o ambiente Node do Render
não tem Python nem `pandas`. Toda a ferramentaria foi reescrita em Node para
funcionar igual no seu computador e no servidor:

| Antes (aqui)        | Agora                       | Comando            |
|---------------------|-----------------------------|--------------------|
| `import_excel.py`   | `backend/importar.js`       | `npm run importar` |
| `debug_excel.py`    | `backend/importar.js --inspecionar` | `npm run inspecionar` |
| `teste_db.py`       | `backend/conferir.js`       | `npm run conferir` |
| `criar_usuarios.py` | `backend/db/index.js` cria a conta mestre no start | — |
| `importar_excel.js` | — (schema incompatível, ver abaixo) | — |

## Avisos

- **`importar_excel.js`** grava um schema **incompatível** com a API e apaga o
  banco existente. Executá-lo derruba grade e login. Ele se recusa a rodar sem a
  flag `--confirmo-schema-legado`.
- Os scripts Python só entendem **SQLite** e escrevem direto no arquivo
  `.db`. Contra o banco de produção em PostgreSQL eles não funcionam.
- `criar_usuarios.py` ainda cria as quatro contas antigas (`admin`,
  `pedagogico`, `consulta`...). O sistema atual tem **uma única conta**, o
  mestre — rodar esse script recria contas que não deveriam existir.

Se um dia estes arquivos deixarem de servir como referência histórica, podem ser
apagados sem qualquer efeito sobre o sistema.

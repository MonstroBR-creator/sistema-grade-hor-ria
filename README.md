# Sistema de Gestão de Grade Horária — CEEBJA / EJA

Versão 1.4.0. Aplicação web para montar o quadro semanal de horários das turmas,
arrastando disciplinas e docentes para os tempos de aula.

Roda em **SQLite** no seu computador e em **PostgreSQL** no servidor, com o mesmo
código — a escolha é automática, pela presença de `DATABASE_URL`.

> Lista completa das correções em [`RELATORIO-REVISAO.md`](RELATORIO-REVISAO.md).

---

## Rodar localmente

```bash
npm install
npm start          # http://localhost:3000
```

Só isso. Com o banco vazio, o servidor cria a conta mestre e importa
`backend/data/professores.xlsx` sozinho no primeiro start. Não é preciso Python,
nem PostgreSQL, nem rodar migração à mão.

### Conta inicial

O sistema nasce com **uma única conta** — o mestre. As demais são criadas por ela
em *Gerenciar Usuários*.

| Usuário  | Senha      | Perfil |
|----------|------------|--------|
| `mestre` | `rasm2026` | MESTRE |

O acesso funciona pelo nome de usuário **ou** pelo CPF (com ou sem pontuação).
A senha é gravada com hash bcrypt. **Troque-a antes de colocar em uso.**

Para definir outro login/senha, exporte as variáveis **antes do primeiro start**
(veja `.env.example`) — depois disso a conta já existe e não é sobrescrita:

```powershell
$env:MESTRE_USUARIO = "rasm"
$env:MESTRE_SENHA   = "sua-senha-forte"
npm start
```

A conta mestre é protegida: não pode ser excluída pela tela, e o perfil `MESTRE`
não pode ser atribuído a nenhuma conta nova — existe um mestre só.

---

## Publicar no Render

O arquivo [`render.yaml`](render.yaml) descreve o serviço web e o banco
PostgreSQL. No Render: **New → Blueprint**, aponte para o repositório.

O que precisa estar configurado no serviço:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | ligada ao banco PostgreSQL (o Render preenche) |
| `JWT_SECRET` | valor aleatório — **sem ele o servidor não inicia em produção** |
| `NODE_ENV` | `production` |
| `MESTRE_SENHA` | a senha do mestre, definida **antes do primeiro deploy** |

Build: `npm ci` · Start: `npm start`

No primeiro deploy o banco está vazio, então o servidor cria as tabelas, a conta
mestre e importa a planilha automaticamente. Nos deploys seguintes ele encontra
dados e **não** mexe em nada.

> **Atenção ao plano gratuito do PostgreSQL no Render:** ele expira depois de um
> período e o banco é removido junto com os dados. Para uso real da escola, vale
> um plano pago ou um backup periódico (`pg_dump`).

### Por que PostgreSQL e não SQLite no servidor

No Render o sistema de arquivos é reiniciado a cada deploy e a cada restart. Com
SQLite, toda a grade montada seria perdida sem aviso. O PostgreSQL é um serviço
separado, que sobrevive aos deploys.

---

## Perfis de acesso

| Perfil          | Ver grade | Editar grade | Gerenciar usuários |
|-----------------|:---------:|:------------:|:------------------:|
| MESTRE          | ✅ | ✅ | ✅ |
| ADMINISTRADOR   | ✅ | ✅ | ✅ |
| PEDAGOGICO      | ✅ | ✅ | — |
| SECRETARIA      | ✅ | ✅ | — |
| USUARIO         | ✅ | ✅ | — |
| CONSULTA        | ✅ | — | — |

`MESTRE` é exclusivo da conta de origem e não aparece no formulário de cadastro.

As permissões são aplicadas **no servidor** ([`backend/auth.js`](backend/auth.js));
a interface apenas reflete o que a API já autoriza. Para mudar quem gerencia
contas, edite `PERFIS_GESTAO_USUARIOS`.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor |
| `npm run dev` | Sobe com recarga automática |
| `npm run importar` | Recarrega a planilha (preserva as contas de acesso) |
| `npm run importar -- --reset` | Recarrega **apagando também** as contas |
| `npm run inspecionar` | Analisa a planilha sem gravar nada |
| `npm run conferir` | Mostra o que está gravado no banco |

Todos funcionam igual em SQLite e PostgreSQL. Para rodar contra o banco de
produção, defina `DATABASE_URL` antes do comando.

---

## Estrutura

```
.
├── package.json              # dependências e scripts
├── render.yaml               # serviço web + banco PostgreSQL no Render
├── .env.example              # variáveis de ambiente
├── backend/
│   ├── server.js             # rotas da API e servidor de arquivos estáticos
│   ├── auth.js               # senhas (bcrypt), JWT e permissões
│   ├── importar.js           # carga da planilha  (npm run importar)
│   ├── conferir.js           # inspeção do banco  (npm run conferir)
│   ├── db/
│   │   ├── index.js          # escolhe o driver, aplica schema, cria o mestre
│   │   ├── sqlite.js         # driver de desenvolvimento
│   │   ├── postgres.js       # driver de produção
│   │   ├── schema.sqlite.sql
│   │   └── schema.postgres.sql
│   ├── data/professores.xlsx
│   └── legacy/               # ferramentas antigas, fora de uso (ver README de lá)
└── frontend/
    ├── index.html            # quadro de horários
    ├── login.html
    ├── usuarios.html
    ├── css/styles.css
    └── js/
        ├── sessao.js         # sessão, chamadas à API e utilitários
        ├── app.js            # montagem da grade
        ├── login.js
        └── usuarios.js
```

O backend não sabe qual banco está em uso: as diferenças de dialeto ficam
inteiramente dentro de `backend/db/`.

---

## API

Todas as rotas de `/api`, exceto `POST /api/login`, exigem o cabeçalho
`Authorization: Bearer <token>`.

| Método | Rota | Permissão |
|---|---|---|
| POST | `/api/login` | pública |
| GET | `/api/sessao` | autenticado |
| GET | `/api/turmas` | autenticado |
| GET | `/api/alocacoes` (aceita `?turma_id=`) | autenticado |
| GET | `/api/grade` | autenticado |
| POST | `/api/grade` | edição da grade |
| DELETE | `/api/grade` | edição da grade |
| GET | `/api/usuarios` | MESTRE / ADMINISTRADOR |
| POST | `/api/usuarios` | MESTRE / ADMINISTRADOR |
| DELETE | `/api/usuarios/:id` | MESTRE / ADMINISTRADOR |

---

Desenvolvido por RASM Tecnologia — CNPJ 33.131.697/0001-99

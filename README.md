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

## Backup

```bash
npm run backup
```

Grava um `.sql` restaurável em `backups/`, com carimbo de data. Para restaurar
em qualquer PostgreSQL:

```bash
psql "<connection-string>" -f backups/grade-horaria_AAAAMMDD_HHMM.sql
```

Rode contra o banco de produção definindo `DATABASE_URL` antes do comando.
**Faça isso com regularidade** — a pasta `backups/` está no `.gitignore` porque
os arquivos contêm CPF e hashes de senha.

> Todo `INSERT` sai com `ON CONFLICT DO NOTHING`. Sem isso o arquivo não
> restaurava: o schema já semeia os 3 turnos e a seção de dados tentava inserir
> os mesmos ids, derrubando a transação inteira.

## Banco de dados

Em produção o banco é **PostgreSQL no Neon** (plano gratuito, sem prazo de
validade; a computação hiberna após 5 minutos parada e volta sozinha).

Quando a `DATABASE_URL` aponta para um host `*.neon.tech`, o sistema usa o driver
serverless do Neon, que conversa por **WebSocket na porta 443** em vez da 5432.
Isso não é detalhe: muitas redes domésticas e operadoras bloqueiam a 5432, e sem
esse caminho os comandos `npm run backup`, `npm run importar` e `npm run conferir`
não conectariam da sua máquina — embora funcionassem no servidor.

Para descobrir se a sua rede bloqueia a 5432:

```bash
node -e "require('net').connect(5432,'ep-seu-endpoint.neon.tech',()=>console.log('porta aberta')).on('error',e=>console.log('bloqueada:',e.message))"
```

## Publicar no Render

O arquivo [`render.yaml`](render.yaml) descreve o serviço web e o banco
PostgreSQL. No Render: **New → Blueprint**, aponte para o repositório.

O que precisa estar configurado no serviço:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string do **Neon** (colada à mão, não é gerada pelo Render) |
| `JWT_SECRET` | valor aleatório — **sem ele o servidor não inicia em produção** |
| `NODE_ENV` | `production` |
| `MESTRE_SENHA` | a senha do mestre, definida **antes do primeiro deploy** |

Build: `npm ci` · Start: `npm start`

No primeiro deploy o banco está vazio, então o servidor cria as tabelas, a conta
mestre e importa a planilha automaticamente. Nos deploys seguintes ele encontra
dados e **não** mexe em nada.

> **Histórico:** o banco ficava no PostgreSQL gratuito do Render, que **expira 30
> dias após a criação** e é apagado 14 dias depois. Foi o que aconteceu em
> 30/08/2026, derrubando o site e levando parte da grade montada. Por isso o banco
> mudou para o Neon, cujo plano gratuito não tem prazo de validade — e por isso
> `npm run backup` existe.

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

## Atualizar matérias, professores e turmas

A fonte da verdade é a planilha `backend/data/professores.xlsx`. Para mudar
qualquer coisa — trocar o professor de uma disciplina, incluir uma matéria nova,
corrigir o nome de uma turma — edite a planilha e rode:

```bash
npm run importar
```

**A grade já montada é preservada.** A importação compara a planilha com o banco
em vez de apagar tudo: o que continua igual mantém o mesmo registro, e as aulas
seguem no lugar onde foram posicionadas. Só sai da grade aquilo que realmente
saiu da planilha — e o comando avisa quantas aulas isso afetou:

```
• Alocações ....... 162  (3 novas, 159 mantidas, 0 removidas)
⚠️  Aulas que saíram da grade junto com alocações removidas: 2
```

Dá para rodar quantas vezes quiser, a qualquer momento. Rodar duas vezes seguidas
sem mudar a planilha não altera nada (`0 novas, 0 removidas`).

Antes de uma mudança grande, vale conferir o que a planilha tem sem gravar nada:

```bash
npm run inspecionar
```

> Para atualizar o **banco de produção**, defina `DATABASE_URL` antes do comando.
> Não existe tela de edição de matérias: tudo passa pela planilha.

### Turmas semipresenciais

Nas turmas cujo nome contém SEMIPRESENCIAL, cada disciplina rende **três** cards:

| Card | Responsável | Tipo |
|---|---|---|
| Aula com o docente | nome do professor | `SEMIPRESENCIAL` |
| Tutoria | `TUTORIA` | `TUTORIA` |
| Ensino a distância | `EAD` | `EAD` |

Os cards de tutoria e EAD não têm professor atribuído — no lugar do nome aparece
a própria modalidade. Por não terem docente, também não entram na checagem de
choque de horário.

Isso é gerado automaticamente pela importação; não é preciso repetir as linhas
na planilha.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor |
| `npm run dev` | Sobe com recarga automática |
| `npm run importar` | Atualiza a partir da planilha, **preservando a grade montada** |
| `npm run importar -- --reset` | Recomeça do zero, apagando inclusive as contas |
| `npm run inspecionar` | Analisa a planilha sem gravar nada |
| `npm run conferir` | Mostra o que está gravado no banco |
| `npm run backup` | Gera um `.sql` restaurável em `backups/` |

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

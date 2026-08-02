# Relatório de Revisão — Sistema de Grade Horária

**Data:** 31/07 a 01/08/2026 · **Versão:** 1.2.0 → 1.4.0
**Branch:** `revisao/v1.4-postgres` · **Commit:** `e90b6cc`
A versão anterior continua acessível no histórico do git (commit `ac7dd160`).

**41 problemas corrigidos** (19 que já estavam se manifestando + 22 fragilidades),
mais 2 melhorias, além da preparação para hospedagem (§7).
Nenhuma funcionalidade foi removida: login por
usuário ou CPF, seleção de turma agrupada, arrastar-e-soltar, alerta de conflito
de docente, modo somente leitura e o CRUD de usuários continuam funcionando como
antes — agora com as permissões aplicadas também no servidor.

Cada item indica se o defeito **estava se manifestando** com os dados atuais ou
se era uma **fragilidade** que ainda não tinha dado problema.

---

## 1. Segurança

### 1.1 A API inteira estava aberta — sem nenhuma autenticação `[manifestando]`
`backend/server.js:166-276` — O login gerava um token JWT, mas **nenhuma rota o
verificava**. Qualquer pessoa com acesso à porta do servidor podia, sem senha:

```
GET    /api/usuarios      → lista todos os cadastros
POST   /api/usuarios      → cria uma conta ADMINISTRADOR
DELETE /api/usuarios/3    → apaga usuários
POST   /api/grade         → altera a grade de qualquer turma
```

**Correção:** middleware `autenticar` em `backend/auth.js`, aplicado a todas as
rotas de `/api` exceto o login.
*Verificado:* as 6 rotas respondem **401** sem token e com token inválido.

### 1.2 Senhas guardadas em texto puro `[manifestando]`
`backend/server.js:80-102, 143` — A coluna se chamava `senha_hash`, mas
guardava a senha literal (`'admin123'`), comparada com `!==`. Quem lesse o
arquivo `.db` via as senhas de todo mundo.

**Correção:** hash **bcrypt** (custo 10). Bases antigas continuam funcionando:
se o valor gravado não for um hash, a comparação em texto ainda é aceita **e a
senha é convertida para hash no primeiro login bem-sucedido** — ninguém perde o
acesso.
*Verificado:* as 4 contas padrão gravam `$2a$10$…` com 60 caracteres.

### 1.3 Perfil CONSULTA era bloqueado só no navegador `[manifestando]`
`frontend/index.html:126-145` — O modo somente leitura apenas escondia a coluna
de arraste via CSS. A rota `POST /api/grade` aceitava o pedido normalmente.

**Correção:** `exigirPerfil` no servidor.
*Verificado:* CONSULTA recebe **403** ao tentar gravar na grade e ao listar
usuários; continua com **200** para consultar turmas e a grade.

### 1.4 Chave de assinatura do JWT fixa no código-fonte `[fragilidade]`
`backend/server.js:16` — `JWT_SECRET = 'ceebja_chave_secreta_super_segura_2026'`.
Quem lesse o repositório podia forjar um token de administrador.

**Correção:** lida de `process.env.JWT_SECRET`. Com `NODE_ENV=production` e a
chave padrão, o servidor **se recusa a iniciar**. Em desenvolvimento, avisa.

### 1.5 Injeção de HTML nas telas `[fragilidade]`
`frontend/js/app.js:282-288, 316-317` e `frontend/usuarios.html:152-163` —
Nomes de disciplina, professor e usuário iam direto para `innerHTML`.

**Correção:** função `escapeHtml()` aplicada a todo dado vindo do banco.
*Verificado:* um usuário chamado `Ana D'Ávila <img src=x onerror=...>` é exibido
como texto literal; a tag não é interpretada e o script não executa.

### 1.6 Sem limite de tentativas de login `[fragilidade]`
Nada impedia testar senhas em série.
**Correção:** limitador em memória — 10 tentativas por IP+identificador a cada 15
minutos, respondendo **429**. Sem dependências novas.

---

## 2. Corrupção de dados na importação

### 2.1 Todas as 23 turmas eram gravadas como "(Turma A)" `[manifestando]`
`backend/import_excel.py:56` — A coluna da planilha chama-se **`'TURMA '`, com um
espaço no final**. O código fazia `row.get('TURMA', 'A')`, nunca encontrava a
chave e usava sempre o valor padrão `'A'`.

Resultado: turmas da tarde, da noite e as semipresenciais eram todas rotuladas
"(Turma A)".

| | Antes | Depois |
|---|---|---|
| Letras distintas gravadas | `A` | `1, 2, 3, 4, A, B, C` |

**Correção:** os cabeçalhos são normalizados (`.strip().upper()`) na leitura, o
que também previne a repetição do problema; as colunas obrigatórias passam a ser
validadas com mensagem clara.
*Verificado:* `4º MÓDULO FUNDAMENTAL PRESENCIAL TARDE (Turma B)`,
`1º MÓDULO MÉDIO SEMIPRESENCIAL NOITE (Turma 1)` etc.

### 2.2 A importação apagava todas as contas de acesso `[manifestando]`
`backend/import_excel.py:14-19` — O script fazia `os.remove(DB_PATH)`, destruindo
o banco inteiro. Toda recarga da planilha eliminava os usuários cadastrados.

**Correção:** só as tabelas acadêmicas são recriadas; `usuarios` é preservada.
O comportamento antigo continua disponível, mas explícito: `--reset`.
*Verificado:* as 4 contas (com os hashes) sobrevivem a uma reimportação.

### 2.3 `npm run build` quebrava com IntegrityError `[manifestando]`
`backend/criar_usuarios.py:33` gravava o CPF `11111111111` para o usuário
`pedagogia`; `backend/server.js:79` já usava esse mesmo CPF para o administrador
`monstro`. Como `cpf` é UNIQUE e o `ON CONFLICT` cobria apenas a coluna
`usuario`, o script falhava depois do primeiro start do servidor.

**Correção:** o sistema passou a nascer com **uma única conta** (o mestre), o que
elimina a colisão na raiz; a busca considera login **e** CPF antes de inserir.

### 2.4 Perfis e logins divergentes entre os scripts `[manifestando]`
`criar_usuarios.py` criava `pedagogia` com perfil `MESTRE`; o servidor esperava
`pedagogico`/`PEDAGOGICO`. `MESTRE` não era reconhecido por nenhuma verificação
do sistema — era um perfil fantasma.

**Correção:** `MESTRE` virou um perfil real e documentado, exclusivo da conta de
origem, com permissão total. `backend/criar_usuarios.py` e `backend/db.js`
compartilham a mesma definição.

### 2.5 O script redefinia senhas a cada execução `[fragilidade]`
O `ON CONFLICT DO UPDATE` sobrescrevia a senha, desfazendo trocas feitas pelos
usuários. **Correção:** só cria o que falta; sobrescrever exige `--redefinir`.

### 2.6 `importar_excel.js` destrói o sistema se executado `[fragilidade]`
`backend/importar_excel.js` é um importador antigo que apaga o `.db` e grava um
schema **incompatível** com a API (`turmas.nome` em vez de `nome_descricao`, sem
as tabelas `alocacoes`/`disciplinas`/`professores`). Rodá-lo por engano derruba
grade e login de uma vez.

**Correção:** movido para `backend/legacy/`, com aviso no cabeçalho e uma trava:
sem a flag `--confirmo-schema-legado` ele se recusa a rodar e aponta o
importador correto. *Verificado:* execução bloqueada, saída 1.

### 2.7 Alocações duplicavam a cada importação `[fragilidade]`
Não havia verificação antes do `INSERT`. **Correção:** deduplicação por
(turma, disciplina, professor) e relatório do que foi descartado.

### 2.8 `tipo` sempre gravado como 'PRESENCIAL' `[manifestando]`
Mesmo para as turmas semipresenciais. **Correção:** o tipo é derivado da
descrição — hoje resulta em 93 `PRESENCIAL` e 23 `SEMIPRESENCIAL`. A interface
ganhou o selo correspondente (o suporte a `tipo` já existia no `app.js`).

---

## 3. Banco de dados

### 3.1 Migração de coluna que o SQLite rejeita, com erro engolido `[manifestando]`
`backend/server.js:65`:
```js
db.run(`ALTER TABLE usuarios ADD COLUMN criado_em DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
```
O SQLite **não aceita** default não constante em `ADD COLUMN`. O callback vazio
descartava o erro, então a coluna nunca era criada em bancos existentes e
ninguém ficava sabendo.

**Correção:** verificação via `PRAGMA table_info`, `ALTER` sem default e `UPDATE`
preenchendo os registros antigos.

### 3.2 Só a tabela `usuarios` era criada na inicialização `[fragilidade]`
Num banco novo, o `schema.sql` nunca era aplicado — as consultas de turmas
falhavam. Combinado com o item 4.1, a tela mostrava "Nenhuma turma cadastrada".

**Correção:** `schema.sql` (todo idempotente) é aplicado a cada inicialização.

### 3.3 `PRAGMA foreign_keys` disparado fora do callback de conexão `[fragilidade]`
`backend/server.js:42` — executado em paralelo com a abertura do banco.
**Correção:** aplicado após a conexão estar pronta.

### 3.4 Servidor subia mesmo sem banco `[fragilidade]`
O erro de conexão era só registrado no console e o `listen` acontecia assim
mesmo. **Correção:** inicialização assíncrona; falha de banco encerra o processo
com mensagem clara.

### 3.5 Schema sem `criado_em`, sem índices e sem `ON DELETE CASCADE` `[fragilidade]`
`schema.sql` divergia do que o servidor esperava e deixava linhas órfãs na grade
quando uma alocação era reimportada. **Correção:** coluna adicionada, 5 índices
de apoio e `ON DELETE CASCADE` em `grade_horaria`/`alocacoes`.

---

## 4. API

### 4.1 Erros de banco viravam "lista vazia" `[fragilidade]`
`backend/server.js:232, 242, 253`:
```js
db.all(query, [], (err, rows) => res.json(rows || []));   // err ignorado
```
Qualquer falha aparecia na tela como "Nenhuma turma cadastrada", escondendo o
problema real. **Correção:** todas as rotas tratam o erro e respondem 500.

### 4.2 Nenhuma validação de entrada `[fragilidade]`
`POST /api/grade` aceitava `dia_semana: "DOMINGO"`, `num_aula: 99` ou
`alocacao_id` inexistente, gravando lixo no banco.
**Correção:** dia e número de aula validados contra listas fechadas; a alocação
precisa existir **e pertencer à turma informada**.
*Verificado:* 400 / 400 / 404 / 400 respectivamente.

### 4.3 Rota de API inexistente devolvia HTML `[fragilidade]`
A página de erro padrão do Express quebrava o `await response.json()` do front
com um erro de parsing confuso. **Correção:** `/api/*` não encontrado responde
JSON com 404.

### 4.4 Consulta de login comparava texto não numérico com a coluna CPF `[fragilidade]`
`backend/server.js:137` tinha três cláusulas, uma delas comparando o
identificador digitado diretamente com `cpf`. **Correção:** a cláusula de CPF só
entra quando o identificador contém dígitos.
*Verificado:* login por `admin`, por `00000000000` e por `000.000.000-00`.

### 4.5 Sem proteções na exclusão de usuários `[fragilidade]`
Dava para excluir a própria conta em uso ou o último administrador, deixando o
sistema sem acesso administrativo. **Correção:** ambos bloqueados (403), além da
lista de usuários protegidos que já existia.

### 4.6 `DELETE` com dados no corpo `[fragilidade]`
Alguns proxies descartam o corpo de requisições DELETE. **Correção:** a rota
aceita corpo (como antes) **ou** query string.

### 4.7 Cadastro duplicado viraria erro 500 em produção `[manifestando em produção]`
`backend/server.js:191` — A detecção de nome/CPF repetido era:

```js
if (String(err.message).includes('UNIQUE'))   // → 409 "já cadastrado"
```

O SQLite diz `UNIQUE constraint failed: usuarios.usuario`; o **PostgreSQL** diz
`duplicate key value violates unique constraint`, em minúsculas. No servidor, a
comparação falharia e o usuário receberia **"Erro interno no servidor"** em vez
da mensagem clara — sem pista do que estava errado.

**Correção:** verificação por código de erro (`23505`) e por texto, sem
diferenciar maiúsculas. *Encontrado ao testar contra um PostgreSQL real.*

### 4.8 Melhorias de desempenho e retorno
- `GET /api/alocacoes` aceita `?turma_id=` — o front baixava as 116 alocações e
  descartava a maioria no navegador a cada troca de turma.
- `POST /api/grade` devolve o conflito de docente detectado, permitindo avisar
  na hora em vez de só no recarregamento.

---

## 5. Interface

### 5.1 Turmas duplicadas no seletor `[manifestando]`
`frontend/js/app.js:149`:
```js
return desc.includes('SEMIPRESENCIAL') || desc.includes('SEMI') || /\b\d{1,2}\b/.test(desc);
```
O `\b\d{1,2}\b` casa com **qualquer** descrição que contenha um número — e todas
começam com "1º MÓDULO", "2º MÓDULO"… (o `º` conta como limite de palavra).
Logo **todas as 23 turmas eram consideradas semipresenciais**. Como os filtros
de categoria eram aplicados de forma independente, sem remoção, a mesma turma
aparecia em vários grupos.

Medido com os dados reais:

| | Antes | Depois |
|---|---|---|
| Entradas no seletor (para 23 turmas) | **34** | 23 |
| Turmas repetidas em mais de um grupo | **11** | 0 |
| Turmas vistas como semipresenciais | **23 de 23** | 4 de 23 |

**Correção:** a detecção passou a exigir a palavra `SEMI`/`SEMIPRESENCIAL`, e
cada turma é atribuída a **exatamente um** grupo.
*Verificado no navegador (jsdom):* 7 grupos, 23 opções, nenhum id repetido.

### 5.2 Turmas podiam sumir do seletor `[fragilidade]`
As categorias cobriam só FUNDAMENTAL e MÉDIO; uma turma sem nenhuma das duas
palavras não entrava em grupo nenhum e desaparecia silenciosamente da lista.
**Correção:** grupos "OUTRAS" por turno como rede de segurança.
*Hoje:* 0 turmas cairiam nesse caso — a correção é preventiva.

### 5.3 Alerta de conflito duplicado e sem destaque na grade `[manifestando quando há conflito]`
`frontend/js/app.js:381-413` — O algoritmo guardava **uma** turma por chave e
empurrava um item repetido a cada ocorrência extra: com 3 turmas em choque, o
mesmo professor era listado 2 vezes. O alerta também não dizia **quais** turmas
colidiam, e as células envolvidas não recebiam destaque.

**Correção:** agrupamento por professor/dia/aula, reportando só os grupos com
mais de uma turma, com os nomes das turmas, ordenado por dia e aula — e as
células em choque recebem a classe `.celula-conflito`.

### 5.4 A folha de estilos nunca era carregada `[manifestando]`
`frontend/css/styles.css` existia, mas **nenhuma página o referenciava**. As
classes `.celula-conflito`, `.celula-hover` e `.card-materia` eram código morto,
e o `app.js` usava classes soltas do Tailwind no lugar.

**Correção:** o arquivo é carregado pelas três páginas e as classes passaram a
ser efetivamente usadas. Também foram adicionados: respeito a
`prefers-reduced-motion`, avisos flutuantes e um layout de impressão do quadro.

### 5.5 Erros ao salvar eram silenciosos `[manifestando]`
`frontend/js/app.js:349, 372` — `if (response.ok)` sem `else`. Se a gravação
falhasse, a aula simplesmente não aparecia e o usuário não recebia explicação
nenhuma. **Correção:** avisos visíveis em todas as falhas de rede e de API.

### 5.6 Dois `fazerLogout()` diferentes `[manifestando]`
`app.js:34` removia apenas `token` e `usuario`; `index.html:148` redefinia a
função com `localStorage.clear()`. Vencia a segunda, e a primeira era código
morto. **Correção:** uma única implementação em `sessao.js`, ligada por
`data-acao="sair"`.

### 5.7 `frontend/login.js` era código morto e divergente `[manifestando]`
O arquivo nunca era carregado — `login.html` tinha o seu próprio script inline,
com comportamento diferente (redirecionava para `/index.html`, enquanto o
`login.js` ia para `/`). O cabeçalho do arquivo ainda declarava um caminho que
não existia (`frontend/js/login.js`). **Correção:** uma única implementação, em
`frontend/js/login.js`, de fato carregada.

### 5.8 `onclick` inline quebrava com apóstrofo no nome `[manifestando]`
`frontend/usuarios.html:159`:
```js
<button onclick="excluirUsuario(${u.id}, '${u.nome}')">
```
Um nome como **D'Ávila** — comum — encerrava a string e gerava JavaScript
inválido: o botão Excluir daquela linha simplesmente parava de funcionar.
O mesmo padrão estava em `app.js:315`.

**Correção:** botões criados com `addEventListener`, sem gerar código.
*Verificado:* exclusão funciona com o nome `Ana D'Ávila <img src=x onerror=…>`.

### 5.9 O turno do quadro vinha só do texto da descrição `[fragilidade]`
`app.js:173-176` ignorava `turno_codigo`, que vem do banco e é o dado confiável.
**Correção:** o código do turno tem prioridade; o texto virou plano B.
*Medido:* 0 divergências com os dados atuais — correção preventiva.

### 5.10 Controle de sessão repetido e sem envio do token `[manifestando]`
Cada página repetia sua própria verificação de sessão em `<script>` inline, com
variações. Nenhuma delas enviava o token nas chamadas à API.

**Correção:** `frontend/js/sessao.js`, carregado no `<head>` com
`data-guard="privado"` ou `data-guard="publico"`. Centraliza sessão, anexa o
`Authorization`, encerra a sessão automaticamente em 401 e padroniza as
mensagens de erro. Todo o JavaScript inline saiu das três páginas.

### 5.11 Acessibilidade e usabidade
Adicionados `scope` nas colunas da tabela, `aria-label` nos botões de remover,
`aria-live` nos painéis de alerta, `autocomplete` nos campos de login, máscara
de CPF no cadastro, e a opção de perfil **CONSULTA** no formulário — ela existia
no sistema mas não podia ser escolhida na tela.

---

## 6. Configuração e organização

### 6.1 `npm start` não funcionava em lugar nenhum `[manifestando]`
Havia dois `package.json`:

- na raiz: só `pg` e `xlsx`, **sem nenhum script** → `npm start` respondia
  *"Missing script: start"*;
- em `backend/`: com os scripts, mas apontando para `backend/server.js` — que,
  executado de dentro de `backend/`, vira `backend/backend/server.js` →
  *MODULE_NOT_FOUND*.

*Confirmado executando `npm start` nos dois diretórios do projeto original.*

**Correção:** um único `package.json` na raiz do projeto revisado, com todas as
dependências e scripts corretos.

### 6.2 Dependência `pg` (PostgreSQL) nunca usada `[fragilidade]`
Nenhum arquivo importa `pg`; o banco é SQLite. **Correção:** removida.
`xlsx` também saiu das dependências principais — só o script legado a usa.

### 6.3 `.gitignore` incompleto `[fragilidade]`
Existia apenas em `backend/` e não cobria o arquivo `.db` (dados reais indo para
o repositório), `.env` nem `__pycache__`. **Correção:** `.gitignore` completo na
raiz.

### 6.4 Marca inconsistente `[manifestando]`
`usuarios.html` exibia "Monstro Tecnologias" no título e no rodapé; as demais
páginas, "RASM Tecnologia(s)" — com o mesmo CNPJ. **Correção:** "RASM
Tecnologia" nas três páginas. *Marca confirmada pela cliente em 31/07/2026.*

### 6.5 Scripts de apoio frágeis `[fragilidade]`
`debug_excel.py` executava no nível do módulo e estourava com a pilha do pandas
se o arquivo não existisse; `teste_db.py` quebrava com `OperationalError` quando
as tabelas ainda não tinham sido criadas.
**Correção:** validação de caminho, `--help`, códigos de saída e mensagens
úteis. O `debug_excel.py` agora mostra os nomes de coluna em `repr()` e sinaliza
espaços invisíveis — foi assim que o problema 2.1 apareceu.

---

## 7. Preparação para publicação (Render + PostgreSQL)

Não são defeitos da base: são as mudanças necessárias para o sistema funcionar
hospedado. O histórico do repositório mostra uma tentativa anterior de migrar
para PostgreSQL no Render, revertida — era dela que sobrava a dependência `pg`
sem uso (item 6.2).

### 7.1 SQLite não sobrevive a um deploy
No Render o sistema de arquivos é recriado a cada deploy e a cada restart. Com
SQLite gravando em arquivo, **toda a grade montada seria perdida** sem aviso.

**Solução:** camada de banco com dois drivers em `backend/db/`:

| | Local | Produção |
|---|---|---|
| Banco | SQLite em arquivo | PostgreSQL |
| Escolhido por | ausência de `DATABASE_URL` | presença de `DATABASE_URL` |
| Instalação | nenhuma | serviço do Render |

O resto do sistema não sabe qual está em uso. As consultas são escritas num só
dialeto (marcadores `?`) e o driver do PostgreSQL os converte para `$1, $2...`,
ignorando o que estiver dentro de aspas. As diferenças de tipo (`AUTOINCREMENT`
× `SERIAL`, `DATETIME` × `TIMESTAMP`) ficam nos dois arquivos de schema.

### 7.2 O importador exigia Python e pandas
`npm run importar` rodava `import_excel.py`. O ambiente Node do Render não tem
Python nem pandas, então a carga da planilha simplesmente não rodaria lá.

**Solução:** reescrito em Node (`backend/importar.js`), com a biblioteca `xlsx`.
Produz exatamente o mesmo resultado do script Python — 23 turmas, 33
disciplinas, 43 professores, 116 alocações — e funciona nos dois bancos.
As ferramentas Python foram para `backend/legacy/`, com um README explicando as
substituições. O sistema não depende mais de Python para nada.

### 7.3 Banco novo abriria vazio
No primeiro deploy não há nada no banco, e a tela abriria sem turma nenhuma.

**Solução:** com o banco vazio, o servidor importa a planilha sozinho no start.
A checagem é por turmas existentes, então isso **nunca** sobrescreve dados já
gravados — nos deploys seguintes ele não mexe em nada.

### 7.4 Sem descrição de infraestrutura
**Solução:** `render.yaml` descreve o serviço web e o banco PostgreSQL, com
`JWT_SECRET` gerado automaticamente e `MESTRE_SENHA` solicitada no painel (não
fica no repositório).

### 7.5 Repositório carregando o que não devia
`node_modules` (246 arquivos) e o banco `grade_horaria.db` com dados reais
estavam **versionados** — o `.gitignore` existia só em `backend/` e não os
cobria. Como já estavam rastreados, o `.gitignore` sozinho não resolveria.

**Correção:** removidos do versionamento (continuam no disco), `.gitignore` na
raiz e `.gitattributes` normalizando quebras de linha. O repositório saiu de
**266 para 32 arquivos**.

---

## 8. O que foi verificado

Tudo abaixo foi executado nesta revisão, com o servidor no ar e o banco real:

| Bateria | Casos | Resultado |
|---|---|---|
| API sobre **SQLite** — autenticação, permissões, validação, CRUD | 47 | ✅ |
| API sobre **PostgreSQL** — a mesma bateria, servidor real | 47 | ✅ |
| Camada de banco em PostgreSQL — schema, migração, transações, cascata | 27 | ✅ |
| Interface do quadro (jsdom + servidor real) | 26 | ✅ |
| Página de usuários, incluindo nome hostil | 14 | ✅ |
| Página de login | 12 | ✅ |
| Classificação de turmas — antes × depois, dados reais | 23 turmas | ✅ |
| Sintaxe (`node --check`) | 12 arquivos | ✅ |

**Como o PostgreSQL foi testado:** com um servidor PostgreSQL 18 real (binários
embarcados, sem instalação no sistema). O servidor do projeto foi iniciado
apontando para ele, com `NODE_ENV=production` e `JWT_SECRET` — a mesma
configuração do Render — e a bateria de API rodou contra a stack completa. Foi
assim que o defeito 4.7 apareceu.

A interface foi exercitada com **jsdom** carregando as páginas HTML reais e os
scripts servidos pelo próprio servidor — inclusive arrastar-e-soltar com
persistência no banco.

**O que não foi verificado:** não abri o sistema em navegador; o layout
propriamente dito (Tailwind) não foi conferido a olho. E o deploy no Render em
si não foi executado — o `render.yaml` e as variáveis estão escritos e o código
foi testado contra PostgreSQL, mas o primeiro deploy real ainda vai acontecer.

---

## 9. Pontos em aberto (não alterados)

Nenhum destes é defeito; ficam registrados para sua decisão.

0. **O plano gratuito do PostgreSQL no Render expira** e o banco é removido
   junto com os dados. Para uso real da escola, vale um plano pago ou um backup
   periódico (`pg_dump`). É o ponto mais importante desta lista.
1. **Tailwind via CDN** — as páginas carregam `cdn.tailwindcss.com`, que é a
   versão de desenvolvimento e exige internet. Trocar por uma build local
   melhora desempenho e permite uso off-line, mas adiciona etapa de build.
2. **Gestão de usuários restrita a MESTRE e ADMINISTRADOR** — antes qualquer
   conta autenticada podia criar e apagar usuários (na prática, qualquer pessoa,
   pelo item 1.1). Se a equipe pedagógica precisar dessa permissão, basta
   incluir o perfil em `PERFIS_GESTAO_USUARIOS`, em `backend/auth.js`.
3. **Não há edição de usuário** — só criação e exclusão, como no original. Não
   existe troca de senha pela interface: a senha do mestre, depois de criada, só
   muda direto no banco. Se isso for necessário no dia a dia, vale acrescentar.
4. **Conflito de docente é aviso, não bloqueio** — mantido o comportamento
   original: o sistema alerta, mas permite gravar.
5. **Sessão de 8 horas sem renovação** — ao expirar, o usuário é levado ao login.
6. **A senha inicial do mestre (`rasm2026`) está no README** — troque-a antes de
   colocar em uso, ou defina `MESTRE_SENHA` antes do primeiro start.

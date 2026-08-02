-- ============================================================
-- SCHEMA — SQLite (desenvolvimento local)
-- Equivalente a schema.postgres.sql. Ao alterar um, altere o outro.
-- Todas as instruções são idempotentes.
-- ============================================================

CREATE TABLE IF NOT EXISTS turnos (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo VARCHAR(10) NOT NULL UNIQUE,
    nome   VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS turmas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_descricao VARCHAR(150) NOT NULL UNIQUE,
    turno_id       INTEGER NOT NULL REFERENCES turnos(id)
);

CREATE TABLE IF NOT EXISTS professores (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    nome VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS disciplinas (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    nome VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS alocacoes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    turma_id      INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id),
    professor_id  INTEGER REFERENCES professores(id),
    tipo          VARCHAR(20) DEFAULT 'PRESENCIAL'
);

CREATE TABLE IF NOT EXISTS grade_horaria (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    turma_id    INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    dia_semana  VARCHAR(20) NOT NULL,
    num_aula    INTEGER NOT NULL,
    alocacao_id INTEGER NOT NULL REFERENCES alocacoes(id) ON DELETE CASCADE,
    CONSTRAINT unq_grade_posicao UNIQUE (turma_id, dia_semana, num_aula)
);

-- senha_hash guarda um hash bcrypt (ver backend/auth.js). Valores em texto puro
-- vindos de bases antigas ainda funcionam e são convertidos no primeiro login.
CREATE TABLE IF NOT EXISTS usuarios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       VARCHAR(150) NOT NULL,
    cpf        VARCHAR(14) UNIQUE,
    usuario    VARCHAR(50) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    perfil     VARCHAR(20) NOT NULL DEFAULT 'USUARIO',
    criado_em  DATETIME
);

CREATE INDEX IF NOT EXISTS idx_alocacoes_turma     ON alocacoes (turma_id);
CREATE INDEX IF NOT EXISTS idx_alocacoes_professor ON alocacoes (professor_id);
CREATE INDEX IF NOT EXISTS idx_grade_turma         ON grade_horaria (turma_id);
CREATE INDEX IF NOT EXISTS idx_grade_posicao       ON grade_horaria (dia_semana, num_aula);
CREATE INDEX IF NOT EXISTS idx_turmas_turno        ON turmas (turno_id);

INSERT OR IGNORE INTO turnos (id, codigo, nome) VALUES (1, 'A', 'Manhã');
INSERT OR IGNORE INTO turnos (id, codigo, nome) VALUES (2, 'B', 'Tarde');
INSERT OR IGNORE INTO turnos (id, codigo, nome) VALUES (3, 'C', 'Noite');

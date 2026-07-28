PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo VARCHAR(10) NOT NULL UNIQUE,
    nome VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS turmas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_descricao VARCHAR(100) NOT NULL UNIQUE,
    turno_id INTEGER NOT NULL,
    FOREIGN KEY (turno_id) REFERENCES turnos(id)
);

CREATE TABLE IF NOT EXISTS professores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS disciplinas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS alocacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turma_id INTEGER NOT NULL,
    disciplina_id INTEGER NOT NULL,
    professor_id INTEGER,
    tipo VARCHAR(20) DEFAULT 'PRESENCIAL',
    FOREIGN KEY (turma_id) REFERENCES turmas(id),
    FOREIGN KEY (disciplina_id) REFERENCES disciplinas(id),
    FOREIGN KEY (professor_id) REFERENCES professores(id)
);

CREATE TABLE IF NOT EXISTS grade_horaria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turma_id INTEGER NOT NULL,
    dia_semana VARCHAR(20) NOT NULL,
    num_aula INTEGER NOT NULL,
    alocacao_id INTEGER NOT NULL,
    FOREIGN KEY (turma_id) REFERENCES turmas(id),
    FOREIGN KEY (alocacao_id) REFERENCES alocacoes(id),
    CONSTRAINT unq_grade_posicao UNIQUE (turma_id, dia_semana, num_aula)
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome VARCHAR(100) NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    perfil VARCHAR(20) NOT NULL DEFAULT 'PEDAGOGIA'
);

INSERT OR IGNORE INTO turnos (id, codigo, nome) VALUES (1, 'A', 'Manhã');
INSERT OR IGNORE INTO turnos (id, codigo, nome) VALUES (2, 'B', 'Tarde');
INSERT OR IGNORE INTO turnos (id, codigo, nome) VALUES (3, 'C', 'Noite');
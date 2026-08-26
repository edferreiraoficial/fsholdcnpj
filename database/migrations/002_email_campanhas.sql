CREATE TABLE IF NOT EXISTS email_campanhas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(150) NOT NULL,
    assunto VARCHAR(255) NOT NULL,
    corpo_html LONGTEXT NOT NULL,
    filtros_json LONGTEXT NOT NULL,
    total_destinatarios INT UNSIGNED NOT NULL DEFAULT 0,
    enviados INT UNSIGNED NOT NULL DEFAULT 0,
    falhas INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('RASCUNHO','PRONTA','ENVIANDO','CONCLUIDA','CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    iniciado_em DATETIME NULL,
    finalizado_em DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_email_campanhas_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_campanha_destinatarios (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    campanha_id BIGINT UNSIGNED NOT NULL,
    prospect_id BIGINT UNSIGNED NOT NULL,
    email VARCHAR(255) NOT NULL,
    status ENUM('PENDENTE','ENVIADO','FALHOU','REMOVIDO') NOT NULL DEFAULT 'PENDENTE',
    tentativas SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    erro TEXT NULL,
    enviado_em DATETIME NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_email_campanha_prospect (campanha_id, prospect_id),
    KEY idx_email_dest_status (campanha_id, status),
    KEY idx_email_dest_email (email),
    CONSTRAINT fk_email_dest_campanha FOREIGN KEY (campanha_id) REFERENCES email_campanhas(id) ON DELETE CASCADE,
    CONSTRAINT fk_email_dest_prospect FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_optout (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    motivo VARCHAR(255) NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_email_optout_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FSHold CNPJ
-- Cadastro de múltiplos remetentes SMTP e vínculo opcional com campanhas

CREATE TABLE IF NOT EXISTS email_remetentes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    smtp_host VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port INT UNSIGNED NOT NULL DEFAULT 587,
    smtp_secure TINYINT(1) NOT NULL DEFAULT 0,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password VARCHAR(500) NOT NULL,
    from_name VARCHAR(150) NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    padrao TINYINT(1) NOT NULL DEFAULT 0,
    ultimo_erro TEXT NULL,
    ultimo_envio_em DATETIME NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_email_remetentes_email (email),
    KEY idx_email_remetentes_ativo_padrao (ativo, padrao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE email_campanhas
  ADD COLUMN remetente_id BIGINT UNSIGNED NULL AFTER nome,
  ADD KEY idx_email_campanhas_remetente (remetente_id),
  ADD CONSTRAINT fk_email_campanhas_remetente
    FOREIGN KEY (remetente_id) REFERENCES email_remetentes(id)
    ON DELETE SET NULL;

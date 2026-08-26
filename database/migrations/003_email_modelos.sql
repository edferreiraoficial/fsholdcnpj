-- FSHold CNPJ
-- CRM de prospecção comercial
-- Avanço do módulo de e-mail: modelos reutilizáveis

CREATE TABLE IF NOT EXISTS email_modelos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(150) NOT NULL,
    assunto VARCHAR(255) NOT NULL,
    corpo_html LONGTEXT NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_email_modelos_ativo_nome (ativo, nome)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

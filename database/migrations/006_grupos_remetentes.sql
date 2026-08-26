-- Grupos de remetentes para campanhas
CREATE TABLE IF NOT EXISTS email_remetente_grupos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(150) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_email_remetente_grupos_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_remetente_grupo_itens (
  grupo_id BIGINT UNSIGNED NOT NULL,
  remetente_id BIGINT UNSIGNED NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  PRIMARY KEY (grupo_id, remetente_id),
  KEY idx_grupo_itens_remetente (remetente_id),
  CONSTRAINT fk_grupo_itens_grupo FOREIGN KEY (grupo_id) REFERENCES email_remetente_grupos(id) ON DELETE CASCADE,
  CONSTRAINT fk_grupo_itens_remetente FOREIGN KEY (remetente_id) REFERENCES email_remetentes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE email_campanhas
  ADD COLUMN grupo_remetente_id BIGINT UNSIGNED NULL AFTER remetente_id,
  ADD KEY idx_email_campanhas_grupo_remetente (grupo_remetente_id),
  ADD CONSTRAINT fk_email_campanhas_grupo_remetente FOREIGN KEY (grupo_remetente_id) REFERENCES email_remetente_grupos(id) ON DELETE SET NULL;

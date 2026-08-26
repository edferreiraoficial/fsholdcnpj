-- Rodízio automático de remetentes
ALTER TABLE email_remetentes
  ADD COLUMN rodizio TINYINT(1) NOT NULL DEFAULT 1 AFTER padrao;

ALTER TABLE email_campanha_destinatarios
  ADD COLUMN remetente_id BIGINT UNSIGNED NULL AFTER email,
  ADD KEY idx_email_dest_remetente (remetente_id),
  ADD CONSTRAINT fk_email_dest_remetente FOREIGN KEY (remetente_id) REFERENCES email_remetentes(id) ON DELETE SET NULL;

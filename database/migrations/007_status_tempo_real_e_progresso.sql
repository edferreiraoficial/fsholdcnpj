-- Status CRM em tempo real e progresso persistido de campanhas
ALTER TABLE prospect_crm
  ADD COLUMN IF NOT EXISTS status_tempo_real INT NULL AFTER status_id,
  ADD COLUMN IF NOT EXISTS status_atualizado_em DATETIME NULL AFTER status_tempo_real;

UPDATE prospect_crm
SET status_tempo_real=status_id
WHERE status_tempo_real IS NULL;

ALTER TABLE email_campanhas
  ADD COLUMN IF NOT EXISTS lote_status VARCHAR(30) NOT NULL DEFAULT 'PARADO' AFTER status,
  ADD COLUMN IF NOT EXISTS lote_total INT UNSIGNED NOT NULL DEFAULT 0 AFTER lote_status,
  ADD COLUMN IF NOT EXISTS lote_processados INT UNSIGNED NOT NULL DEFAULT 0 AFTER lote_total,
  ADD COLUMN IF NOT EXISTS lote_enviados INT UNSIGNED NOT NULL DEFAULT 0 AFTER lote_processados,
  ADD COLUMN IF NOT EXISTS lote_falhas INT UNSIGNED NOT NULL DEFAULT 0 AFTER lote_enviados,
  ADD COLUMN IF NOT EXISTS lote_mensagem VARCHAR(500) NULL AFTER lote_falhas,
  ADD COLUMN IF NOT EXISTS lote_atualizado_em DATETIME NULL AFTER lote_mensagem;

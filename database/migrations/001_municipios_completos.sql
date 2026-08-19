-- FSHold CNPJ v2.2
-- Permite carregar todos os municípios antes de conhecer a UF.
-- A UF será preenchida automaticamente durante a leitura dos Estabelecimentos.

ALTER TABLE municipios
    MODIFY COLUMN uf CHAR(2) NULL;

CREATE INDEX IF NOT EXISTS idx_municipios_nome
    ON municipios (nome);

CREATE INDEX IF NOT EXISTS idx_municipios_uf_nome
    ON municipios (uf, nome);

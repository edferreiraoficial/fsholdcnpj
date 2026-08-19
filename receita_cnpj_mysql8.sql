-- ============================================================
-- BASE CNPJ - RECEITA FEDERAL - MySQL 8
-- Estrutura para importação dos Dados Abertos do CNPJ
-- Compatível com CNPJ alfanumérico (novas inscrições a partir de 07/2026)
-- ============================================================

CREATE DATABASE IF NOT EXISTS receita_cnpj
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE receita_cnpj;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS simples;
DROP TABLE IF EXISTS socios;
DROP TABLE IF EXISTS estabelecimentos;
DROP TABLE IF EXISTS empresas;
DROP TABLE IF EXISTS motivos;
DROP TABLE IF EXISTS cnaes;
DROP TABLE IF EXISTS municipios;
DROP TABLE IF EXISTS naturezas_juridicas;
DROP TABLE IF EXISTS qualificacoes_socios;
DROP TABLE IF EXISTS paises;

-- -------------------------
-- TABELAS DE DOMÍNIO
-- -------------------------

CREATE TABLE paises (
    codigo VARCHAR(3) NOT NULL,
    descricao VARCHAR(150) NOT NULL,
    PRIMARY KEY (codigo),
    INDEX idx_paises_descricao (descricao)
) ENGINE=InnoDB;

CREATE TABLE municipios (
    codigo VARCHAR(4) NOT NULL,
    descricao VARCHAR(150) NOT NULL,
    PRIMARY KEY (codigo),
    INDEX idx_municipios_descricao (descricao)
) ENGINE=InnoDB;

CREATE TABLE qualificacoes_socios (
    codigo VARCHAR(2) NOT NULL,
    descricao VARCHAR(200) NOT NULL,
    PRIMARY KEY (codigo)
) ENGINE=InnoDB;

CREATE TABLE naturezas_juridicas (
    codigo VARCHAR(4) NOT NULL,
    descricao VARCHAR(200) NOT NULL,
    PRIMARY KEY (codigo)
) ENGINE=InnoDB;

CREATE TABLE cnaes (
    codigo VARCHAR(7) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    PRIMARY KEY (codigo),
    INDEX idx_cnaes_descricao (descricao)
) ENGINE=InnoDB;

CREATE TABLE motivos (
    codigo VARCHAR(2) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    PRIMARY KEY (codigo)
) ENGINE=InnoDB;

-- -------------------------
-- EMPRESAS
-- -------------------------

CREATE TABLE empresas (
    cnpj_basico VARCHAR(8) NOT NULL,
    razao_social VARCHAR(255) NULL,
    natureza_juridica VARCHAR(4) NULL,
    qualificacao_responsavel VARCHAR(2) NULL,
    capital_social DECIMAL(18,2) NULL,
    porte_empresa VARCHAR(2) NULL,
    ente_federativo_responsavel VARCHAR(255) NULL,

    PRIMARY KEY (cnpj_basico),
    INDEX idx_empresas_razao_social (razao_social),
    INDEX idx_empresas_natureza (natureza_juridica),
    INDEX idx_empresas_porte (porte_empresa)
) ENGINE=InnoDB;

-- -------------------------
-- ESTABELECIMENTOS
-- -------------------------

CREATE TABLE estabelecimentos (
    cnpj_basico VARCHAR(8) NOT NULL,
    cnpj_ordem VARCHAR(4) NOT NULL,
    cnpj_dv VARCHAR(2) NOT NULL,
    identificador_matriz_filial CHAR(1) NULL,
    nome_fantasia VARCHAR(255) NULL,
    situacao_cadastral VARCHAR(2) NULL,
    data_situacao_cadastral DATE NULL,
    motivo_situacao_cadastral VARCHAR(2) NULL,
    nome_cidade_exterior VARCHAR(255) NULL,
    pais VARCHAR(3) NULL,
    data_inicio_atividade DATE NULL,
    cnae_fiscal_principal VARCHAR(7) NULL,
    cnae_fiscal_secundaria TEXT NULL,
    tipo_logradouro VARCHAR(50) NULL,
    logradouro VARCHAR(255) NULL,
    numero VARCHAR(30) NULL,
    complemento VARCHAR(255) NULL,
    bairro VARCHAR(150) NULL,
    cep VARCHAR(8) NULL,
    uf CHAR(2) NULL,
    municipio VARCHAR(4) NULL,
    ddd1 VARCHAR(4) NULL,
    telefone1 VARCHAR(12) NULL,
    ddd2 VARCHAR(4) NULL,
    telefone2 VARCHAR(12) NULL,
    ddd_fax VARCHAR(4) NULL,
    fax VARCHAR(12) NULL,
    correio_eletronico VARCHAR(255) NULL,
    situacao_especial VARCHAR(255) NULL,
    data_situacao_especial DATE NULL,

    cnpj_completo VARCHAR(14)
      GENERATED ALWAYS AS (CONCAT(cnpj_basico, cnpj_ordem, cnpj_dv)) STORED,

    PRIMARY KEY (cnpj_basico, cnpj_ordem, cnpj_dv),
    UNIQUE KEY uk_estabelecimentos_cnpj (cnpj_completo),

    INDEX idx_estab_situacao (situacao_cadastral),
    INDEX idx_estab_uf_municipio_situacao (uf, municipio, situacao_cadastral),
    INDEX idx_estab_municipio_situacao (municipio, situacao_cadastral),
    INDEX idx_estab_cnae (cnae_fiscal_principal),
    INDEX idx_estab_nome_fantasia (nome_fantasia),
    INDEX idx_estab_data_situacao (data_situacao_cadastral),
    INDEX idx_estab_cep (cep)
) ENGINE=InnoDB;

-- -------------------------
-- SIMPLES / MEI
-- -------------------------

CREATE TABLE simples (
    cnpj_basico VARCHAR(8) NOT NULL,
    opcao_simples CHAR(1) NULL,
    data_opcao_simples DATE NULL,
    data_exclusao_simples DATE NULL,
    opcao_mei CHAR(1) NULL,
    data_opcao_mei DATE NULL,
    data_exclusao_mei DATE NULL,

    PRIMARY KEY (cnpj_basico),
    INDEX idx_simples_opcao (opcao_simples),
    INDEX idx_mei_opcao (opcao_mei)
) ENGINE=InnoDB;

-- -------------------------
-- SÓCIOS
-- -------------------------

CREATE TABLE socios (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    cnpj_basico VARCHAR(8) NOT NULL,
    identificador_socio CHAR(1) NULL,
    nome_socio_razao_social VARCHAR(255) NULL,
    cnpj_cpf_socio VARCHAR(20) NULL,
    qualificacao_socio VARCHAR(2) NULL,
    data_entrada_sociedade DATE NULL,
    pais VARCHAR(3) NULL,
    representante_legal VARCHAR(20) NULL,
    nome_representante VARCHAR(255) NULL,
    qualificacao_representante_legal VARCHAR(2) NULL,
    faixa_etaria CHAR(1) NULL,

    PRIMARY KEY (id),
    INDEX idx_socios_cnpj_basico (cnpj_basico),
    INDEX idx_socios_nome (nome_socio_razao_social),
    INDEX idx_socios_qualificacao (qualificacao_socio)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- VIEW PARA PROSPECÇÃO
-- ============================================================

CREATE OR REPLACE VIEW vw_empresas_completas AS
SELECT
    e.cnpj_completo AS cnpj,
    e.cnpj_basico,
    e.cnpj_ordem,
    e.cnpj_dv,
    emp.razao_social,
    e.nome_fantasia,
    e.identificador_matriz_filial,
    e.situacao_cadastral,
    e.data_situacao_cadastral,
    e.motivo_situacao_cadastral,
    mot.descricao AS motivo_situacao_descricao,
    emp.porte_empresa,
    emp.natureza_juridica,
    nat.descricao AS natureza_juridica_descricao,
    emp.capital_social,
    e.data_inicio_atividade,
    e.cnae_fiscal_principal,
    cnae.descricao AS cnae_principal_descricao,
    e.cnae_fiscal_secundaria,
    e.tipo_logradouro,
    e.logradouro,
    e.numero,
    e.complemento,
    e.bairro,
    e.cep,
    e.uf,
    e.municipio AS codigo_municipio,
    mun.descricao AS municipio,
    e.ddd1,
    e.telefone1,
    e.ddd2,
    e.telefone2,
    e.correio_eletronico AS email,
    s.opcao_simples,
    s.data_opcao_simples,
    s.data_exclusao_simples,
    s.opcao_mei,
    s.data_opcao_mei,
    s.data_exclusao_mei
FROM estabelecimentos e
JOIN empresas emp
    ON emp.cnpj_basico = e.cnpj_basico
LEFT JOIN municipios mun
    ON mun.codigo = e.municipio
LEFT JOIN cnaes cnae
    ON cnae.codigo = e.cnae_fiscal_principal
LEFT JOIN naturezas_juridicas nat
    ON nat.codigo = emp.natureza_juridica
LEFT JOIN motivos mot
    ON mot.codigo = e.motivo_situacao_cadastral
LEFT JOIN simples s
    ON s.cnpj_basico = e.cnpj_basico;

-- ============================================================
-- EXEMPLOS DE CONSULTA
-- ============================================================

-- Empresas INAPTAS de uma cidade:
-- SELECT *
-- FROM vw_empresas_completas
-- WHERE situacao_cadastral = '04'
--   AND uf = 'SP'
--   AND municipio = 'PAULINIA'
-- ORDER BY razao_social;

-- Somente matrizes INAPTAS:
-- SELECT *
-- FROM vw_empresas_completas
-- WHERE situacao_cadastral = '04'
--   AND identificador_matriz_filial = '1'
--   AND uf = 'SP'
--   AND municipio = 'PAULINIA'
-- ORDER BY razao_social;

-- Contagem por situação:
-- SELECT situacao_cadastral, COUNT(*)
-- FROM estabelecimentos
-- GROUP BY situacao_cadastral;

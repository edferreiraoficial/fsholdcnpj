# CRM CNPJ — Consulta + Importação

Aplicação local para Windows que consulta o CRM CNPJ na Hostinger e controla a importação filtrada dos ZIPs da Receita Federal.

## Arquitetura

- Frontend: React + TypeScript + Material UI
- Backend local: Node.js + Fastify
- Banco: MariaDB Hostinger via túnel SSH
- ZIPs da Receita: permanecem em `E:\ReceitaCNPJ`

## 1. Abra o túnel SSH

Em um PowerShell separado e mantenha aberto:

```powershell
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -p 65002 -L 3307:127.0.0.1:3306 u356706785@92.113.37.37
```

## 2. Backend

```powershell
cd E:\crm-cnpj-painel-importacao\backend
npm install
Copy-Item .env.example .env
notepad .env
npm run dev
```

Configure a senha no `.env` e confirme `CNPJ_ZIP_DIR`.

API: `http://localhost:3333`

Teste: `http://localhost:3333/health`

## 3. Frontend

Em outro PowerShell:

```powershell
cd E:\crm-cnpj-painel-importacao\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Abra:

`http://localhost:5173`

## Tela Consultar base

Permite consultar o que já foi importado, pesquisar por CNPJ/empresa/fantasia/sócio, filtrar município, UF, situação e status CRM, e abrir os detalhes da empresa e sócios.

## Tela Importar da Receita

O frame de importação permite selecionar:

- UF
- situação cadastral
- várias cidades
- vários motivos da situação
- vários CNAEs principais
- vários portes
- somente matriz ou matriz + filiais

Os filtros vazios significam "todos" naquele critério.

O botão **Importar para Hostinger** dispara o importador no próprio backend local. O progresso aparece na tela em tempo real e as execuções ficam registradas em `importacoes_cnpj` e `importacao_arquivos`.

## Segurança

O arquivo `.env` contém a senha do banco e não deve ser enviado ao GitHub.

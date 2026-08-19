<<<<<<< HEAD
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
=======
# Importador CNPJ Receita Federal -> MySQL 8 remoto

## Instalação no Windows 10

1. Extraia este projeto, por exemplo em `C:\cnpj-importador`.
2. Abra o PowerShell na pasta.
3. Rode:

```powershell
npm install
Copy-Item .env.example .env
```

4. Edite `.env` com os dados do MySQL da Hostinger e a pasta dos ZIPs.
5. Teste:

```powershell
npm run testar-conexao
```

6. Primeira importação completa:

```powershell
npm run importar -- --limpar
```

Digite `SIM` quando solicitado.

## Pasta dos ZIPs

Coloque os arquivos oficiais sem extrair, por exemplo:

```text
C:\ReceitaCNPJ\
  Empresas0.zip
  Empresas1.zip
  Estabelecimentos0.zip
  Socios0.zip
  Simples.zip
  Cnaes.zip
  Municipios.zip
  Motivos.zip
  Naturezas.zip
  Paises.zip
  Qualificacoes.zip
```

## Observações

- O importador lê os ZIPs diretamente.
- Os dados são enviados ao MySQL em lotes, evitando depender de `LOAD DATA LOCAL INFILE`.
- Comece com `BATCH_SIZE=1000`.
- Se ocorrer erro de pacote grande, use 500.
- Não publique o arquivo `.env` no GitHub.
>>>>>>> 26990be254c4b2667a6bd42482c37928df473520

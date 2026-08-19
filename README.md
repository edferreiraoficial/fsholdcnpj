<<<<<<< HEAD
# FSHold CNPJ — CRM de Prospecção Contábil

Plataforma local para Windows que processa os ZIPs dos Dados Abertos do CNPJ, importa apenas os registros filtrados para o MariaDB da Hostinger e oferece consulta + CRM.
=======
<<<<<<< HEAD
# CRM CNPJ — Consulta + Importação

Aplicação local para Windows que consulta o CRM CNPJ na Hostinger e controla a importação filtrada dos ZIPs da Receita Federal.
>>>>>>> 3e7226b891f18b3e217e275d808991e33931895b

## Arquitetura

- Frontend: React + TypeScript + Material UI
<<<<<<< HEAD
- Backend: Node.js + Fastify + Zod
- Banco: MariaDB 11.x na Hostinger
- Conexão local: túnel SSH `127.0.0.1:3307 -> Hostinger 127.0.0.1:3306`
- Importador: worker local com checkpoint e retomada
- ZIPs da Receita: permanecem no Windows

## 1. Túnel SSH

Abra um PowerShell exclusivo e mantenha aberto:

```powershell
ssh -N `
  -o ServerAliveInterval=30 `
  -o ServerAliveCountMax=10 `
  -o ExitOnForwardFailure=yes `
  -p 65002 `
  -L 3307:127.0.0.1:3306 `
  u356706785@92.113.37.37
```

Teste:

```powershell
Test-NetConnection 127.0.0.1 -Port 3307
```

O resultado deve mostrar `TcpTestSucceeded : True`.

## 2. Backend

```powershell
cd E:\crm-cnpj\backend
=======
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
>>>>>>> 3e7226b891f18b3e217e275d808991e33931895b
npm install
Copy-Item .env.example .env
notepad .env
npm run dev
```

<<<<<<< HEAD
API: `http://localhost:3333`

## 3. Frontend

```powershell
cd E:\crm-cnpj\frontend
=======
Configure a senha no `.env` e confirme `CNPJ_ZIP_DIR`.

API: `http://localhost:3333`

Teste: `http://localhost:3333/health`

## 3. Frontend

Em outro PowerShell:

```powershell
cd E:\crm-cnpj-painel-importacao\frontend
>>>>>>> 3e7226b891f18b3e217e275d808991e33931895b
npm install
Copy-Item .env.example .env
npm run dev
```

<<<<<<< HEAD
Abra `http://localhost:5173`.

## Melhorias da v2

- indicador permanente API / Banco / Túnel / Importador
- backend dividido em rotas e serviços
- importador com heartbeat, reconexão e checkpoint local
- retomada de importação interrompida
- filtros de importação por UF, cidades, situação, motivos, CNAEs, porte, Simples e MEI
- log em tempo real por Server-Sent Events (SSE)
- histórico de importações
- consulta paginada com filtros
- detalhe do prospect com sócios, contatos, propostas e CRM
- edição de status, prioridade e próximo contato
- criação de contato e tarefa
- README limpo, sem conflitos de merge

## Segurança

Nunca envie `.env`, senha do banco ou arquivos ZIP da Receita ao GitHub.


## Ajustes v2.1

- filtros aceitam vazio como “Todos”
- opções explícitas “TODAS/TODOS” em cidades, motivos, CNAEs e porte
- cidades com autocomplete pelo nome oficial
- fallback para ler `Municipios.zip` quando a tabela `municipios` ainda estiver vazia
- municípios usados na importação são gravados/atualizados no banco
- painel de filtros aproveita toda a largura disponível da tela


## Municípios completos — v2.2

A tabela `municipios` passa a receber todos os registros de `Municipios.zip`.

Antes de iniciar:

1. Execute `database/migrations/001_municipios_completos.sql` no phpMyAdmin.
2. Reinicie o backend.
3. Para carregar imediatamente todos os municípios, faça:

```powershell
Invoke-RestMethod -Method Post http://localhost:3333/import/municipios/carregar
```

O retorno informa a quantidade importada.

A UF é preenchida automaticamente durante a varredura dos arquivos
`Estabelecimentos*.zip`, porque o arquivo auxiliar `Municipios.zip` contém
código e nome, enquanto o estabelecimento contém o código do município e a UF.
=======
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
>>>>>>> 3e7226b891f18b3e217e275d808991e33931895b

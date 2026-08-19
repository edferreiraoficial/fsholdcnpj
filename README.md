# FSHold CNPJ — CRM de Prospecção Contábil

Plataforma local para Windows que processa os ZIPs dos Dados Abertos do CNPJ, importa apenas os registros filtrados para o MariaDB da Hostinger e oferece consulta + CRM.

## Arquitetura

- Frontend: React + TypeScript + Material UI
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
npm install
Copy-Item .env.example .env
notepad .env
npm run dev
```

API: `http://localhost:3333`

## 3. Frontend

```powershell
cd E:\crm-cnpj\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

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

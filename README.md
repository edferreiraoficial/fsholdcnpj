# FSHold CNPJ

CRM de prospecção contábil com importação filtrada dos Dados Abertos do CNPJ.

## Arquitetura

- Frontend: React + TypeScript + Material UI + Vite
- Backend: Node.js + Fastify + TypeScript
- Banco: MariaDB 11.x na Hostinger
- Importador: worker local no Windows
- ZIPs da Receita: permanecem no Windows
- Conexão local ao banco: túnel SSH `127.0.0.1:3307 -> 127.0.0.1:3306`

## Estrutura

```text
fsholdcnpj-clean/
├─ backend/
├─ frontend/
├─ database/
├─ scripts/
├─ .gitignore
└─ README.md
```

## 1. Banco

Use o banco já existente na Hostinger.

A aplicação espera as tabelas e views:
- empresas
- estabelecimentos
- socios
- empresa_tributacao
- prospects
- prospect_crm
- prospect_contatos
- prospect_propostas
- prospect_status
- tarefas
- importacoes_cnpj
- importacao_arquivos
- cnaes
- municipios
- motivos_situacao
- naturezas_juridicas
- qualificacoes_socios
- vw_prospects_completos
- vw_socios_prospects

## 2. Túnel SSH

No Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\iniciar-tunel.ps1
```

Teste:

```powershell
Test-NetConnection 127.0.0.1 -Port 3307
```

## 3. Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
notepad .env
npm run dev
```

API local: `http://localhost:3333`

## 4. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend local: `http://localhost:5173`

## 5. GitHub

Crie um repositório limpo ou substitua o conteúdo do repositório existente depois de validar localmente:

```powershell
git init
git add .
git commit -m "Reconstroi FSHold CNPJ em base limpa"
git branch -M main
git remote add origin https://github.com/edferreiraoficial/fsholdcnpj.git
git push -u origin main
```

Se o remoto já tiver histórico e você quiser substituí-lo pela base limpa, use apenas após validar tudo localmente:

```powershell
git push --force-with-lease origin main
```

## 6. Importação

No painel, escolha:
- UF
- situação cadastral
- cidades
- motivos
- CNAEs
- porte
- Simples
- MEI
- somente matrizes
- retomada

Campos vazios significam **Todos**.

O importador:
1. lê os ZIPs localmente;
2. filtra antes de gravar;
3. grava empresas e estabelecimentos selecionados;
4. cria prospects;
5. traz Simples/MEI;
6. traz sócios;
7. registra a importação;
8. permite retomada por checkpoint.

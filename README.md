# FS Hold — Serviços + CRM CNPJ

Projeto consolidado da FS Hold. O site público de serviços e o CRM são independentes para que uma publicação não quebre a outra.

## Estrutura ativa

- `servicos/` — site público estático para `servicos.fshold.com.br`.
- `frontend/` — CRM React/Vite para `crm.fshold.com.br`.
- `backend/` — API Fastify/Node para `api.fshold.com.br` (porta definida por `PORT`).
- `database/` — migrations e ajustes do MariaDB.
- `scripts/` — utilitários locais, inclusive túnel SSH.

Arquivos antigos do importador standalone e backups de package foram removidos. A importação usada pelo CRM está em `backend/src/importer/` e é acionada pelas rotas do backend.

## Desenvolvimento local

### Backend
```powershell
cd backend
npm install
Copy-Item .env.example .env
# preencha DB_PASSWORD e demais dados reais no .env
npm run dev
```
API local: `http://localhost:3333`

### Frontend CRM
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```
CRM local: `http://localhost:5173`

### Site de serviços
```powershell
cd servicos
python -m http.server 8080
```
Site local: `http://localhost:8080`

## Build do CRM

```powershell
cd backend
npm run build
cd ..\frontend
$env:VITE_API_URL="https://api.fshold.com.br"
npm run build
```

Publicação esperada:
- conteúdo de `servicos/` -> `servicos.fshold.com.br`;
- conteúdo de `frontend/dist/` -> `crm.fshold.com.br`;
- aplicação Node de `backend/` -> `api.fshold.com.br`.

O frontend também possui fallback automático: em localhost usa `http://localhost:3333`; fora de localhost usa `https://api.fshold.com.br` quando `VITE_API_URL` não for definido no build.

## Banco e importação

O backend usa MariaDB e as variáveis de `backend/.env`. Os ZIPs da Receita permanecem na máquina configurada em `CNPJ_ZIP_DIR`. Para acesso local ao banco remoto, use `scripts/iniciar-tunel.ps1` quando necessário.

Nunca publique arquivos `.env` reais ou senhas no repositório/site. Os arquivos `.env.example` são apenas modelos.

# Alterações 007

- Envio de campanha assíncrono com progresso persistido e polling no frontend.
- Menu lateral retrátil inspirado no painel Posto Via 14.
- Layout global mais compacto: fontes, bordas, controles e linhas menores.
- Removido texto auxiliar do filtro de município.
- Filtro por parte do endereço de e-mail em Consultar base.
- Status CRM em tempo real; status 10 (Não contatar) remove o prospect de pendências de campanhas.
- Coluna Capital exibida somente com Capital mínimo e/ou máximo preenchido.
- Subabas em Compor campanha: Destinatários e Mensagem e envio.
- Visualização do e-mail dentro da área de Mensagem e envio.
- Compatibilidade de produção Hostinger: build backend em dist/server.js e inicialização sem top-level await.

## Banco
Execute database/migrations/007_status_tempo_real_e_progresso.sql antes de publicar esta versão.

# Alterações 010 — Pausa e parada do envio em massa

- Adicionados controles **Pausar** e **Parar envio** durante o processamento assíncrono das campanhas.
- A pausa/parada é solicitada ao backend e persistida em `email_campanhas.lote_status`.
- `PAUSA_SOLICITADA` encerra o processamento com segurança como `PAUSADO`.
- `PARADA_SOLICITADA` encerra o lote com segurança como `PARADO`.
- O e-mail que já estiver em transmissão pode concluir; os seguintes permanecem `PENDENTE`.
- Após pausa/parada, a campanha volta a ficar pronta para continuar, permitindo alterar o grupo de remetentes antes de retomar.
- O painel de progresso mostra o status em tempo real e disponibiliza os botões de controle enquanto o lote estiver ativo.
- Quando todos os remetentes do grupo ficam indisponíveis, os totais processados do lote passam a ser contabilizados antes da pausa automática.
- Não requer nova migration de banco; utiliza os campos de progresso já criados na migration 007.

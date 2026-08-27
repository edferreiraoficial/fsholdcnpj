# Alterações 009

- Consulta: seleção individual ou de todos os registros filtrados e alteração em massa do Status CRM.
- Consulta: checkbox marcado por padrão para ignorar Status 10 - Não contatar; filtro explícito de Status CRM prevalece.
- Consulta: filtros reorganizados e compactados conforme solicitado, incluindo Parte do e-mail entre Capital máximo e Ordenar por.
- Consulta: UF alinhada horizontalmente ao início de Data inicial; busca geral ampliada.
- Consulta: modal de detalhes com botão X no canto superior direito.
- Importação: título alterado para "Importar Empresas da Receita Federal" e layout compactado no mesmo padrão da Consulta.
- Campanhas: paginação no histórico, pendentes e destinatários detalhados.
- Todas as tabelas paginadas: opções 25, 50, 100, 250 e 500 linhas.
- Remetentes e grupos: paginação adicionada com o mesmo padrão.
- Removida a mensagem explicativa da variável CRM_WHATSAPP.
- Backend: listagem de prospects e destinatários de campanha aceita até 500 registros por página.
- Backend: novo endpoint POST /prospects/bulk-status para atualização em massa por IDs ou por todos os filtros ativos.

import { Grid, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function DashboardPage() {
  const [data, setData] = useState<any>({});
  useEffect(() => { api.get('/dashboard').then(r => setData(r.data)).catch(() => {}); }, []);

  const cards = [
    ['Prospects', data.total_prospects || 0],
    ['Não contatados', data.nao_contatados || 0],
    ['Oportunidades', data.oportunidades || 0],
    ['Clientes', data.clientes || 0],
    ['Retornos atrasados', data.retornos_atrasados || 0]
  ];

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h5" fontWeight={700}>Dashboard</Typography>
        <Typography color="text.secondary">Visão rápida da operação comercial.</Typography>
      </div>
      <Grid container spacing={2}>
        {cards.map(([label, value]) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={String(label)}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h4" fontWeight={700}>{value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}

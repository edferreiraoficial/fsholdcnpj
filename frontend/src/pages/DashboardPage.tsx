import { Grid, Paper, Stack, Typography } from '@mui/material';
import { useEffect,useState } from 'react';
import { api } from '../lib/api';

export default function DashboardPage(){
  const [d,setD]=useState<any>({});
  useEffect(()=>{api.get('/dashboard').then(r=>setD(r.data)).catch(()=>{})},[]);
  const cards=[
    ['Prospects',d.total_prospects||0],
    ['Não contatados',d.nao_contatados||0],
    ['Oportunidades',d.oportunidades||0],
    ['Clientes',d.clientes||0],
    ['Retornos atrasados',d.retornos_atrasados||0]
  ];
  return(
    <Stack spacing={2}>
      <div><Typography variant="h5" fontWeight={700}>Dashboard</Typography>
      <Typography color="text.secondary">Visão geral da operação.</Typography></div>
      <Grid container spacing={2}>
        {cards.map(([l,v])=><Grid item xs={12} sm={6} md={4} lg={2} key={String(l)}>
          <Paper variant="outlined" sx={{p:2}}>
            <Typography variant="caption" color="text.secondary">{l}</Typography>
            <Typography variant="h4" fontWeight={700}>{v}</Typography>
          </Paper>
        </Grid>)}
      </Grid>
    </Stack>
  );
}

import { Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function HealthBar(){
  const [h,setH]=useState<any>(null);
  useEffect(()=>{
    const load=()=>api.get('/health').then(r=>setH(r.data)).catch(()=>setH(null));
    load(); const id=setInterval(load,5000); return()=>clearInterval(id);
  },[]);
  return(
    <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
      <Typography variant="caption" color="text.secondary">Status</Typography>
      <Chip size="small" variant="outlined" label={`API: ${h?.api?'Online':'Offline'}`}/>
      <Chip size="small" variant="outlined" label={`Banco: ${h?.database?.ok?'Online':'Offline'}`}/>
      <Chip size="small" variant="outlined" label={`Importador: ${h?.importer?.running?'Processando':'Aguardando'}`}/>
    </Stack>
  );
}

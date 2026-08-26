import { Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function HealthBar({compact=false}:{compact?:boolean}){
  const [h,setH]=useState<any>(null);
  useEffect(()=>{
    const load=()=>api.get('/health').then(r=>setH(r.data)).catch(()=>setH(null));
    load(); const id=setInterval(load,5000); return()=>clearInterval(id);
  },[]);
  if(compact) return <Stack spacing={.5} alignItems="center"><Chip variant="outlined" label={h?.api?'API ✓':'API ✕'}/><Chip variant="outlined" label={h?.database?.ok?'DB ✓':'DB ✕'}/></Stack>;
  return <Stack spacing={.5}><Typography variant="caption" color="text.secondary">Status</Typography><Stack direction="row" spacing={.5} flexWrap="wrap"><Chip variant="outlined" label={`API: ${h?.api?'Online':'Offline'}`}/><Chip variant="outlined" label={`Banco: ${h?.database?.ok?'Online':'Offline'}`}/><Chip variant="outlined" label={`Importador: ${h?.importer?.running?'Processando':'Aguardando'}`}/></Stack></Stack>;
}

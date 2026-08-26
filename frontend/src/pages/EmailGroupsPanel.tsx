import { Alert, Button, Checkbox, FormControlLabel, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { EmailSender } from './EmailSendersPanel';

export type EmailSenderGroup={id:number;nome:string;descricao?:string;ativo:number|boolean;quantidade:number};

export default function EmailGroupsPanel({onChange}:{onChange?:()=>void}){
  const [grupos,setGrupos]=useState<EmailSenderGroup[]>([]);
  const [remetentes,setRemetentes]=useState<EmailSender[]>([]);
  const [id,setId]=useState(0); const [nome,setNome]=useState(''); const [descricao,setDescricao]=useState('');
  const [selecionados,setSelecionados]=useState<number[]>([]); const [erro,setErro]=useState(''); const [sucesso,setSucesso]=useState('');
  const carregar=async()=>{const [g,r]=await Promise.all([api.get('/email-sender-groups'),api.get('/email-senders')]);setGrupos(g.data||[]);setRemetentes((r.data||[]).filter((x:any)=>Boolean(x.ativo)));onChange?.();};
  useEffect(()=>{carregar().catch(()=>{});},[]);
  const novo=()=>{setId(0);setNome('');setDescricao('');setSelecionados([]);};
  const editar=async(g:EmailSenderGroup)=>{const {data}=await api.get(`/email-sender-groups/${g.id}`);setId(g.id);setNome(data.grupo?.nome||'');setDescricao(data.grupo?.descricao||'');setSelecionados((data.itens||[]).map((x:any)=>Number(x.id)));};
  const salvar=async()=>{setErro('');setSucesso('');try{if(!nome.trim())throw new Error('Informe o nome do grupo.');if(!selecionados.length)throw new Error('Selecione pelo menos um remetente.');const payload={nome,descricao,ativo:true,remetenteIds:selecionados}; if(id) await api.put(`/email-sender-groups/${id}`,payload); else await api.post('/email-sender-groups',payload);setSucesso(id?'Grupo atualizado.':'Grupo criado.');novo();await carregar();}catch(e:any){setErro(e?.response?.data?.message||e.message);}};
  const desativar=async(g:EmailSenderGroup)=>{if(!confirm(`Desativar o grupo ${g.nome}?`))return;await api.delete(`/email-sender-groups/${g.id}`);await carregar();};
  return <Stack spacing={2}>
    <Typography variant="h6" fontWeight={700}>Grupos de envio</Typography>
    <Typography color="text.secondary">A campanha seleciona um grupo. O grupo pode ter apenas um e-mail ou vários remetentes para rodízio automático.</Typography>
    {erro&&<Alert severity="error">{erro}</Alert>}{sucesso&&<Alert severity="success">{sucesso}</Alert>}
    <Paper variant="outlined" sx={{p:2}}><Stack spacing={2}>
      <TextField label="Nome do grupo" value={nome} onChange={e=>setNome(e.target.value)} />
      <TextField label="Descrição" value={descricao} onChange={e=>setDescricao(e.target.value)} />
      <Typography fontWeight={700}>Remetentes do grupo</Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap">{remetentes.map(r=><FormControlLabel key={r.id} control={<Checkbox checked={selecionados.includes(r.id)} onChange={e=>setSelecionados(v=>e.target.checked?[...v,r.id]:v.filter(x=>x!==r.id))}/>} label={`${r.nome} — ${r.email}`}/>)}</Stack>
      <Stack direction="row" spacing={1}><Button variant="contained" onClick={salvar}>{id?'Salvar grupo':'Criar grupo'}</Button>{id>0&&<Button variant="outlined" onClick={novo}>Cancelar</Button>}</Stack>
    </Stack></Paper>
    <Table size="small"><TableHead><TableRow><TableCell>Grupo</TableCell><TableCell>Descrição</TableCell><TableCell>Remetentes</TableCell><TableCell>Ações</TableCell></TableRow></TableHead><TableBody>{grupos.filter(g=>Boolean(g.ativo)).map(g=><TableRow key={g.id}><TableCell>{g.nome}</TableCell><TableCell>{g.descricao||'-'}</TableCell><TableCell>{Number(g.quantidade||0)}</TableCell><TableCell><Button size="small" onClick={()=>editar(g)}>Editar</Button><Button size="small" color="error" onClick={()=>desativar(g)}>Desativar</Button></TableCell></TableRow>)}</TableBody></Table>
  </Stack>;
}

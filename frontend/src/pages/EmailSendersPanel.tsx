import {
  Alert, Button, Checkbox, FormControlLabel, Grid, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow,
  TextField, Typography
} from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type EmailSender={
  id:number; nome:string; email:string; smtp_host:string; smtp_port:number;
  smtp_secure:number|boolean; smtp_user:string; from_name:string;
  ativo:number|boolean; padrao:number|boolean; rodizio:number|boolean; ultimo_erro?:string|null;
  ultimo_envio_em?:string|null;
};

const vazio={
  id:0,nome:'',email:'',smtpHost:'smtp.gmail.com',smtpPort:587,
  smtpSecure:false,smtpUser:'',smtpPassword:'',fromName:'FSHold Assessoria',
  ativo:true,padrao:false,rodizio:true
};

export default function EmailSendersPanel({onChange}:{onChange?:()=>void}){
  const [items,setItems]=useState<EmailSender[]>([]);
  const [form,setForm]=useState<any>(vazio);
  const [teste,setTeste]=useState('');
  const [erro,setErro]=useState('');
  const [sucesso,setSucesso]=useState('');
  const [page,setPage]=useState(0);
  const [pageSize,setPageSize]=useState(25);

  const carregar=async()=>{
    const {data}=await api.get('/email-senders');
    setItems(data||[]);
    onChange?.();
  };

  useEffect(()=>{carregar().catch(()=>{});},[]);

  const editar=(r:EmailSender)=>setForm({
    id:r.id,nome:r.nome,email:r.email,smtpHost:r.smtp_host,smtpPort:r.smtp_port,
    smtpSecure:Boolean(r.smtp_secure),smtpUser:r.smtp_user,smtpPassword:'',
    fromName:r.from_name,ativo:Boolean(r.ativo),padrao:Boolean(r.padrao),rodizio:Boolean(r.rodizio)
  });

  const salvar=async()=>{
    setErro('');setSucesso('');
    try{
      if(form.id){
        await api.put(`/email-senders/${form.id}`,form);
        setSucesso('Remetente atualizado.');
      }else{
        await api.post('/email-senders',form);
        setSucesso('Remetente cadastrado.');
      }
      setForm(vazio); await carregar();
    }catch(e:any){setErro(e?.response?.data?.message||e.message);}
  };

  const desativar=async(id:number)=>{
    if(!window.confirm('Desativar este remetente?')) return;
    await api.delete(`/email-senders/${id}`); await carregar();
  };

  const testar=async(id:number)=>{
    setErro('');setSucesso('');
    try{
      if(!teste) throw new Error('Informe o e-mail que receberá o teste.');
      const {data}=await api.post(`/email-senders/${id}/test`,{to:teste});
      if(data?.ok===false){
        setErro(data.message||'Não foi possível enviar o teste SMTP.');
        await carregar();
        return;
      }
      setSucesso('Teste SMTP enviado com sucesso.'); await carregar();
    }catch(e:any){setErro(e?.response?.data?.message||e.message);}
  };

  return <Stack spacing={2}>
    <Typography variant="h6" fontWeight={700}>E-mails remetentes</Typography>
    <Typography color="text.secondary">
      Cadastre várias contas de envio. Para Gmail, use senha de app quando a conta exigir autenticação em duas etapas.
    </Typography>
    {erro&&<Alert severity="error">{erro}</Alert>}
    {sucesso&&<Alert severity="success">{sucesso}</Alert>}

    <Paper variant="outlined" sx={{p:2}}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}><TextField fullWidth label="Identificação" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/></Grid>
        <Grid item xs={12} md={4}><TextField fullWidth type="email" label="E-mail remetente" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Grid>
        <Grid item xs={12} md={4}><TextField fullWidth label="Nome exibido no remetente" value={form.fromName} onChange={e=>setForm({...form,fromName:e.target.value})}/></Grid>
        <Grid item xs={12} md={4}><TextField fullWidth label="Servidor SMTP" value={form.smtpHost} onChange={e=>setForm({...form,smtpHost:e.target.value})}/></Grid>
        <Grid item xs={12} md={2}><TextField fullWidth type="number" label="Porta" value={form.smtpPort} onChange={e=>setForm({...form,smtpPort:Number(e.target.value)})}/></Grid>
        <Grid item xs={12} md={6}><TextField fullWidth label="Usuário SMTP" value={form.smtpUser} onChange={e=>setForm({...form,smtpUser:e.target.value})}/></Grid>
        <Grid item xs={12} md={6}><TextField fullWidth type="password" label={form.id?'Nova senha SMTP (deixe vazio para manter)':'Senha / senha de app SMTP'} value={form.smtpPassword} onChange={e=>setForm({...form,smtpPassword:e.target.value})}/></Grid>
        <Grid item xs={12} md={6}>
          <Stack direction="row" spacing={2}>
            <FormControlLabel control={<Checkbox checked={form.smtpSecure} onChange={e=>setForm({...form,smtpSecure:e.target.checked})}/>} label="SSL direto (normalmente porta 465)"/>
            <FormControlLabel control={<Checkbox checked={form.ativo} onChange={e=>setForm({...form,ativo:e.target.checked})}/>} label="Ativo"/>
            <FormControlLabel control={<Checkbox checked={form.padrao} onChange={e=>setForm({...form,padrao:e.target.checked})}/>} label="Remetente padrão"/>
            <FormControlLabel control={<Checkbox checked={form.rodizio} onChange={e=>setForm({...form,rodizio:e.target.checked})}/>} label="Participar do rodízio"/>
          </Stack>
        </Grid>
        <Grid item xs={12}>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={salvar}>{form.id?'Salvar alterações':'Cadastrar remetente'}</Button>
            {form.id&&<Button variant="outlined" onClick={()=>setForm(vazio)}>Cancelar edição</Button>}
          </Stack>
        </Grid>
      </Grid>
    </Paper>

    <Grid container spacing={2} alignItems="center">
      <Grid item xs={12} md={8}><TextField fullWidth type="email" label="Endereço para receber teste SMTP" value={teste} onChange={e=>setTeste(e.target.value)}/></Grid>
    </Grid>

    <Table size="small">
      <TableHead><TableRow><TableCell>Nome</TableCell><TableCell>E-mail</TableCell><TableCell>SMTP</TableCell><TableCell>Padrão</TableCell><TableCell>Rodízio</TableCell><TableCell>Último envio/erro</TableCell><TableCell>Ações</TableCell></TableRow></TableHead>
      <TableBody>{items.slice(page*pageSize,page*pageSize+pageSize).map(r=><TableRow key={r.id}>
        <TableCell>{r.nome}</TableCell><TableCell>{r.email}</TableCell><TableCell>{r.smtp_host}:{r.smtp_port}</TableCell>
        <TableCell>{Boolean(r.padrao)?'Sim':'Não'}</TableCell><TableCell>{Boolean(r.rodizio)?'Sim':'Não'}</TableCell>
        <TableCell>{r.ultimo_erro?`Erro: ${String(r.ultimo_erro).slice(0,90)}`:(r.ultimo_envio_em?new Date(r.ultimo_envio_em).toLocaleString('pt-BR'):'-')}</TableCell>
        <TableCell><Stack direction="row" spacing={1}><Button size="small" onClick={()=>editar(r)}>Editar</Button><Button size="small" onClick={()=>testar(r.id)}>Testar</Button><Button size="small" color="error" onClick={()=>desativar(r.id)}>Desativar</Button></Stack></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <TablePagination component="div" count={items.length} page={page} rowsPerPage={pageSize} onPageChange={(_,p)=>setPage(p)} onRowsPerPageChange={e=>{setPageSize(Number(e.target.value));setPage(0)}} rowsPerPageOptions={[25,50,100,250,500]}/>
  </Stack>;
}

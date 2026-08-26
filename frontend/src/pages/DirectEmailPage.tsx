import {
  Alert, Box, Button, Chip, CircularProgress, Grid, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type Modelo={
  id:number;
  nome:string;
  assunto:string;
  corpo_html:string;
};

export default function DirectEmailPage(){
  const [ids,setIds]=useState<number[]>([]);
  const [prospects,setProspects]=useState<any[]>([]);
  const [modelos,setModelos]=useState<Modelo[]>([]);
  const [modeloId,setModeloId]=useState<number|''>('');
  const [assunto,setAssunto]=useState('');
  const [corpoHtml,setCorpoHtml]=useState('');
  const [loading,setLoading]=useState(false);
  const [erro,setErro]=useState('');
  const [sucesso,setSucesso]=useState('');
  const [resultado,setResultado]=useState<any|null>(null);

  useEffect(()=>{
    let selected:number[]=[];
    try{
      selected=JSON.parse(localStorage.getItem('fshold_direct_email_ids')||'[]');
    }catch{}
    setIds(selected);
    carregar(selected);
    carregarModelos();
  },[]);

  const carregarModelos=async()=>{
    try{
      const {data}=await api.get('/email-models');
      setModelos(data||[]);
    }catch{}
  };

  const carregar=async(selected:number[])=>{
    if(!selected.length){
      setProspects([]);
      return;
    }
    setLoading(true);
    setErro('');
    try{
      const list:any[]=[];
      for(const id of selected.slice(0,100)){
        const {data}=await api.get(`/email-direct/prospect/${id}`);
        if(data.ok && data.prospect) list.push(data.prospect);
      }
      setProspects(list);
      if(!list.length){
        setErro('Os prospects selecionados não possuem e-mail elegível para envio.');
      }
    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  };

  const carregarModelo=(value:any)=>{
    const id=Number(value);
    setModeloId(id||'');
    const m=modelos.find(x=>x.id===id);
    if(m){
      setAssunto(m.assunto);
      setCorpoHtml(m.corpo_html);
    }
  };

  const remover=(id:number)=>{
    const next=ids.filter(x=>x!==id);
    setIds(next);
    localStorage.setItem('fshold_direct_email_ids',JSON.stringify(next));
    setProspects(prev=>prev.filter(x=>Number(x.prospect_id)!==id));
  };

  const enviar=async()=>{
    if(!prospects.length) return;
    setLoading(true);
    setErro('');
    setSucesso('');
    setResultado(null);
    try{
      const {data}=await api.post('/email-direct/send',{
        prospectIds:prospects.map(x=>Number(x.prospect_id)),
        assunto,
        corpoHtml
      });
      if(data.ok===false) throw new Error(data.message||'Falha no envio.');
      setResultado(data);
      setSucesso(
        `Envio concluído: ${data.enviados} enviado(s) e ${data.falhas} falha(s).`
      );
    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  };

  const variaveis='{{razao_social}}, {{nome_fantasia}}, {{cnpj}}, {{municipio}}, {{uf}}, {{situacao_cadastral}}, {{data_situacao}}, {{whatsapp}}';

  return <Stack spacing={2}>
    <Box>
      <Typography variant="h5" fontWeight={700}>E-mail direto</Typography>
      <Typography color="text.secondary">
        Envio individual ou para poucos prospects, sem criar campanha.
        Cada envio é registrado no histórico do prospect.
      </Typography>
    </Box>

    {erro&&<Alert severity="error">{erro}</Alert>}
    {sucesso&&<Alert severity="success">{sucesso}</Alert>}

    <Paper variant="outlined" sx={{p:3}}>
      <Stack spacing={2}>
        <Typography fontWeight={700}>
          Destinatários selecionados: {prospects.length}
        </Typography>

        {loading && <CircularProgress size={24}/>}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Empresa</TableCell>
              <TableCell>CNPJ</TableCell>
              <TableCell>E-mail</TableCell>
              <TableCell>Situação</TableCell>
              <TableCell>Data situação</TableCell>
              <TableCell/>
            </TableRow>
          </TableHead>
          <TableBody>
            {prospects.map(p=><TableRow key={p.prospect_id}>
              <TableCell>{p.razao_social||p.nome_fantasia||'-'}</TableCell>
              <TableCell>{p.cnpj}</TableCell>
              <TableCell>{p.email}</TableCell>
              <TableCell><Chip size="small" label={p.situacao_cadastral||'-'}/></TableCell>
              <TableCell>{p.data_situacao||'-'}</TableCell>
              <TableCell>
                <Button color="error" size="small" onClick={()=>remover(Number(p.prospect_id))}>
                  Remover
                </Button>
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>

        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <TextField
              select fullWidth label="Modelo de e-mail (opcional)"
              value={modeloId}
              onChange={e=>carregarModelo(e.target.value)}
            >
              <MenuItem value="">Sem modelo</MenuItem>
              {modelos.map(m=><MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}
            </TextField>
          </Grid>

          <Grid item xs={12} md={7}>
            <TextField
              fullWidth label="Assunto"
              value={assunto}
              onChange={e=>setAssunto(e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth multiline minRows={12}
              label="Mensagem HTML"
              value={corpoHtml}
              onChange={e=>setCorpoHtml(e.target.value)}
            />
            <Typography variant="caption" color="text.secondary">
              Variáveis disponíveis: {variaveis}
            </Typography>
          </Grid>
        </Grid>

        <Alert severity="info">
          Este modo não cria campanha. Para disparos em massa, continue usando
          Campanhas de E-mail.
        </Alert>

        <Button
          variant="contained"
          disabled={loading||!prospects.length||!assunto.trim()||!corpoHtml.trim()}
          onClick={enviar}
          sx={{alignSelf:'flex-start'}}
        >
          Enviar e-mail agora
        </Button>

        {resultado&&<Box>
          <Typography fontWeight={700}>Resultado</Typography>
          <Typography>
            Total {resultado.total} · Enviados {resultado.enviados} · Falhas {resultado.falhas}
          </Typography>
        </Box>}
      </Stack>
    </Paper>
  </Stack>;
}

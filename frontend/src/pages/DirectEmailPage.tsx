import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Grid, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type Modelo={id:number;nome:string;assunto:string;corpo_html:string};

const readJson=(key:string,fallback:any)=>{try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}};

export default function DirectEmailPage(){
  const consultaFilters=useMemo(()=>readJson('fshold_direct_email_filters',readJson('fshold_last_filters',{})),[]);
  const [selectedIds,setSelectedIds]=useState<number[]>(()=>readJson('fshold_direct_email_ids',[]));
  const [prospects,setProspects]=useState<any[]>([]);
  const [total,setTotal]=useState(0);
  const [page,setPage]=useState(0);
  const [pageSize,setPageSize]=useState(25);
  const [modelos,setModelos]=useState<Modelo[]>([]);
  const [modeloId,setModeloId]=useState<number|''>('');
  const [assunto,setAssunto]=useState('');
  const [corpoHtml,setCorpoHtml]=useState('');
  const [loading,setLoading]=useState(false);
  const [erro,setErro]=useState('');
  const [sucesso,setSucesso]=useState('');
  const [resultado,setResultado]=useState<any|null>(null);

  useEffect(()=>{carregarModelos();},[]);
  useEffect(()=>{carregar();},[page,pageSize]);
  useEffect(()=>{localStorage.setItem('fshold_direct_email_ids',JSON.stringify(selectedIds));},[selectedIds]);

  const carregarModelos=async()=>{try{const {data}=await api.get('/email-models');setModelos(data||[])}catch{}};
  const carregar=async()=>{
    setLoading(true);setErro('');
    try{
      const {data}=await api.get('/prospects',{params:{...consultaFilters,temEmail:'S',page:page+1,pageSize}});
      setProspects(data.items||[]);setTotal(Number(data.total||0));
    }catch(e:any){setErro(e?.response?.data?.message||e.message||'Erro ao carregar relação filtrada.')}finally{setLoading(false)}
  };
  const carregarModelo=(value:any)=>{const id=Number(value);setModeloId(id||'');const m=modelos.find(x=>x.id===id);if(m){setAssunto(m.assunto);setCorpoHtml(m.corpo_html)}};
  const toggle=(id:number)=>setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const pageEligible=prospects.filter(p=>!!p.email).map(p=>Number(p.prospect_id));
  const allPageSelected=pageEligible.length>0&&pageEligible.every(id=>selectedIds.includes(id));
  const togglePage=()=>setSelectedIds(prev=>allPageSelected?prev.filter(id=>!pageEligible.includes(id)):Array.from(new Set([...prev,...pageEligible])));
  const clearSelection=()=>setSelectedIds([]);

  const enviar=async()=>{
    if(!selectedIds.length)return;
    setLoading(true);setErro('');setSucesso('');setResultado(null);
    try{
      const {data}=await api.post('/email-campaigns/send-direct',{
        filters:{},includeProspectIds:selectedIds,excludeProspectIds:[],assunto,corpoHtml,ignorarJaEnviados:true
      });
      if(data.ok===false)throw new Error(data.message||'Falha no envio.');
      setResultado(data);setSucesso(`Envio concluído: ${data.enviados} enviado(s) e ${data.falhas} falha(s).`);
    }catch(e:any){setErro(e?.response?.data?.message||e.message||'Erro no envio.')}finally{setLoading(false)}
  };

  const variaveis='{{razao_social}}, {{nome_fantasia}}, {{cnpj}}, {{municipio}}, {{uf}}, {{situacao_cadastral}}, {{data_situacao}}, {{whatsapp}}';
  return <Stack spacing={1}>
    <Box><Typography variant="h5" fontWeight={700}>E-mail direto</Typography><Typography color="text.secondary">A relação abaixo usa os filtros mantidos na página Consultar base. Selecione exatamente quem deve receber.</Typography></Box>
    {erro&&<Alert severity="error">{erro}</Alert>}{sucesso&&<Alert severity="success">{sucesso}</Alert>}
    <Paper variant="outlined" sx={{p:1}}>
      <Stack spacing={0.7}>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography fontWeight={700}>Relação da Consulta: {total.toLocaleString('pt-BR')}</Typography>
          <Chip label={`${selectedIds.length.toLocaleString('pt-BR')} selecionados`} variant="outlined"/>
          <Button variant="outlined" onClick={togglePage}>{allPageSelected?'Desmarcar página':'Selecionar página'}</Button>
          <Button variant="outlined" onClick={clearSelection} disabled={!selectedIds.length}>Limpar seleção</Button>
          <Button variant="outlined" onClick={carregar}>Atualizar</Button>
          {loading&&<CircularProgress size={16}/>} 
        </Stack>
        <TableContainer sx={{maxHeight:360}}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow><TableCell padding="checkbox"><Checkbox size="small" checked={allPageSelected} indeterminate={!allPageSelected&&pageEligible.some(id=>selectedIds.includes(id))} onChange={togglePage}/></TableCell><TableCell>Empresa</TableCell><TableCell>CNPJ</TableCell><TableCell>Município</TableCell><TableCell>E-mail</TableCell><TableCell>Situação</TableCell></TableRow></TableHead>
            <TableBody>{prospects.map(p=>{const id=Number(p.prospect_id);return <TableRow key={id} hover><TableCell padding="checkbox"><Checkbox size="small" disabled={!p.email} checked={selectedIds.includes(id)} onChange={()=>toggle(id)}/></TableCell><TableCell>{p.razao_social||p.nome_fantasia||'-'}</TableCell><TableCell>{p.cnpj}</TableCell><TableCell>{p.municipio}/{p.uf}</TableCell><TableCell>{p.email||'-'}</TableCell><TableCell>{p.situacao_cadastral||'-'}</TableCell></TableRow>})}</TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} page={page} rowsPerPage={pageSize} onPageChange={(_,p)=>setPage(p)} onRowsPerPageChange={e=>{setPageSize(Number(e.target.value));setPage(0)}} rowsPerPageOptions={[25,50,100]}/>
      </Stack>
    </Paper>

    <Paper variant="outlined" sx={{p:1}}><Stack spacing={0.7}>
      <Grid container columnSpacing={0.75} rowSpacing={0.55}>
        <Grid item xs={12} md={5}><TextField select fullWidth label="Modelo de e-mail" value={modeloId} onChange={e=>carregarModelo(e.target.value)}><MenuItem value="">Sem modelo</MenuItem>{modelos.map(m=><MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}</TextField></Grid>
        <Grid item xs={12} md={7}><TextField fullWidth label="Assunto" value={assunto} onChange={e=>setAssunto(e.target.value)}/></Grid>
        <Grid item xs={12}><TextField fullWidth multiline minRows={8} label="Mensagem HTML" value={corpoHtml} onChange={e=>setCorpoHtml(e.target.value)}/><Typography variant="caption" color="text.secondary">Variáveis: {variaveis}</Typography></Grid>
      </Grid>
      <Button variant="contained" disabled={loading||!selectedIds.length||!assunto.trim()||!corpoHtml.trim()} onClick={enviar} sx={{alignSelf:'flex-start'}}>Enviar para {selectedIds.length.toLocaleString('pt-BR')} selecionado(s)</Button>
      {resultado&&<Typography>Resultado: total {resultado.total} · enviados {resultado.enviados} · falhas {resultado.falhas}</Typography>}
    </Stack></Paper>
  </Stack>;
}

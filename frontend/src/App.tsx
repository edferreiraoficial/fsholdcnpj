<<<<<<< HEAD
import {
  AppBar, Box, Button, Container, CssBaseline, Stack, Toolbar, Typography
} from '@mui/material';
import { useState } from 'react';
import HealthBar from './components/HealthBar';
import ConsultPage from './pages/ConsultPage';
import DashboardPage from './pages/DashboardPage';
import ImportPage from './pages/ImportPage';

type Page = 'dashboard' | 'consulta' | 'importacao';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <>
      <CssBaseline />
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={800}>FSHold CNPJ</Typography>
            <Typography variant="caption" color="text.secondary">CRM de prospecção contábil</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setPage('dashboard')}>Dashboard</Button>
            <Button onClick={() => setPage('consulta')}>Consultar base</Button>
            <Button onClick={() => setPage('importacao')}>Importar da Receita</Button>
          </Stack>
        </Toolbar>
        <Box sx={{ px: 3, pb: 1 }}><HealthBar /></Box>
      </AppBar>

      <Container maxWidth={false} sx={{ py: 3, px: { xs: 2, md: 3, xl: 4 }, width: "100%" }}>
        {page === 'dashboard' && <DashboardPage />}
        {page === 'consulta' && <ConsultPage />}
        {page === 'importacao' && <ImportPage />}
      </Container>
    </>
  );
=======
import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Alert, AppBar, Autocomplete, Box, Button, Chip, CircularProgress, Container, Divider,
  Drawer, FormControlLabel, Grid, LinearProgress, MenuItem, Paper, Stack, Switch, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow,
  Tabs, TextField, Toolbar, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import StorageIcon from '@mui/icons-material/Storage';
import RefreshIcon from '@mui/icons-material/Refresh';
import StopCircleIcon from '@mui/icons-material/StopCircle';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3333' });

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const SITUACOES = [
  {codigo:'01', nome:'Nula'}, {codigo:'02', nome:'Ativa'}, {codigo:'03', nome:'Suspensa'},
  {codigo:'04', nome:'Inapta'}, {codigo:'08', nome:'Baixada'}
];
const PORTES = [
  {codigo:'01', nome:'Microempresa'}, {codigo:'03', nome:'Empresa de Pequeno Porte'}, {codigo:'05', nome:'Demais'}
];

type Prospect = any;

function Metric({title,value,icon}:{title:string;value:any;icon:any}){
  return <Paper sx={{p:2.2,height:'100%'}}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="body2" color="text.secondary">{title}</Typography><Typography variant="h4" fontWeight={700}>{Number(value ?? 0).toLocaleString('pt-BR')}</Typography></Box><Box sx={{opacity:.7}}>{icon}</Box></Stack></Paper>
}

function Consulta({dashboard, refreshDashboard}:{dashboard:any;refreshDashboard:()=>void}){
  const [filters,setFilters]=useState<any>({municipios:[],cnaes:[],status:[]});
  const [rows,setRows]=useState<Prospect[]>([]);
  const [loading,setLoading]=useState(false);
  const [page,setPage]=useState(0);
  const [pageSize,setPageSize]=useState(25);
  const [total,setTotal]=useState(0);
  const [selected,setSelected]=useState<any>(null);
  const [tab,setTab]=useState(0);
  const [form,setForm]=useState({q:'',uf:'SP',municipio:'PAULINIA',situacao:'04',cnae:'',porte:'',simples:'',mei:'',status:''});

  useEffect(()=>{ api.get('/filters').then(r=>setFilters(r.data)); },[]);
  useEffect(()=>{ load(); },[page,pageSize]);

  async function load(){
    setLoading(true);
    try{
      const params:any={...form,page:page+1,pageSize}; Object.keys(params).forEach(k=>params[k]===''&&delete params[k]);
      const r=await api.get('/prospects',{params}); setRows(r.data.items); setTotal(Number(r.data.total));
      refreshDashboard();
    } finally {setLoading(false)}
  }
  async function openDetail(id:number){ const r=await api.get(`/prospects/${id}`); setSelected(r.data); setTab(0); }
  const statusColor=(s:string)=> s==='Cliente'?'success':s==='Interessado'?'warning':s==='Não contatado'?'default':'info';

  return <>
    <Grid container spacing={2} mb={2}>
      <Grid size={{xs:12,sm:6,md:3}}><Metric title="Prospects" value={dashboard.total_prospects} icon={<BusinessIcon fontSize="large"/>}/></Grid>
      <Grid size={{xs:12,sm:6,md:3}}><Metric title="Não contatados" value={dashboard.nao_contatados} icon={<PhoneInTalkIcon fontSize="large"/>}/></Grid>
      <Grid size={{xs:12,sm:6,md:3}}><Metric title="Oportunidades" value={dashboard.oportunidades} icon={<TrendingUpIcon fontSize="large"/>}/></Grid>
      <Grid size={{xs:12,sm:6,md:3}}><Metric title="Retornos atrasados" value={dashboard.retornos_atrasados} icon={<WarningAmberIcon fontSize="large"/>}/></Grid>
    </Grid>

    <Paper sx={{p:2,mb:2}}>
      <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Filtros da base já importada</Typography>
      <Grid container spacing={1.5} alignItems="center">
        <Grid size={{xs:12,md:4}}><TextField fullWidth size="small" label="CNPJ, empresa, fantasia ou sócio" value={form.q} onChange={e=>setForm({...form,q:e.target.value})}/></Grid>
        <Grid size={{xs:6,md:1}}><TextField select fullWidth size="small" label="UF" value={form.uf} onChange={e=>setForm({...form,uf:e.target.value})}><MenuItem value="">Todas</MenuItem>{UFS.map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></Grid>
        <Grid size={{xs:6,md:2}}><TextField select fullWidth size="small" label="Município" value={form.municipio} onChange={e=>setForm({...form,municipio:e.target.value})}><MenuItem value="">Todos</MenuItem>{filters.municipios.map((m:any)=><MenuItem key={m.municipio} value={m.municipio}>{m.municipio}</MenuItem>)}</TextField></Grid>
        <Grid size={{xs:6,md:1.5}}><TextField select fullWidth size="small" label="Situação" value={form.situacao} onChange={e=>setForm({...form,situacao:e.target.value})}><MenuItem value="">Todas</MenuItem>{SITUACOES.map(s=><MenuItem key={s.codigo} value={s.codigo}>{s.codigo} - {s.nome}</MenuItem>)}</TextField></Grid>
        <Grid size={{xs:6,md:1.5}}><TextField select fullWidth size="small" label="Status CRM" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><MenuItem value="">Todos</MenuItem>{filters.status.map((s:any)=><MenuItem key={s.id} value={s.id}>{s.nome}</MenuItem>)}</TextField></Grid>
        <Grid size={{xs:12,md:2}}><Button fullWidth variant="contained" startIcon={<SearchIcon/>} onClick={()=>{setPage(0);load()}}>Pesquisar</Button></Grid>
      </Grid>
    </Paper>

    <Paper>
      <TableContainer sx={{maxHeight:'62vh'}}><Table stickyHeader size="small"><TableHead><TableRow>
        <TableCell>CNPJ</TableCell><TableCell>Razão Social</TableCell><TableCell>Fantasia</TableCell><TableCell>Município</TableCell><TableCell>CNAE</TableCell><TableCell>Telefone</TableCell><TableCell>E-mail</TableCell><TableCell>Status</TableCell>
      </TableRow></TableHead><TableBody>
        {loading?<TableRow><TableCell colSpan={8} align="center" sx={{py:6}}><CircularProgress/></TableCell></TableRow>:
        rows.map(r=><TableRow hover key={r.prospect_id} onDoubleClick={()=>openDetail(r.prospect_id)} sx={{cursor:'pointer'}}>
          <TableCell>{r.cnpj}</TableCell><TableCell>{r.razao_social}</TableCell><TableCell>{r.nome_fantasia}</TableCell><TableCell>{r.municipio}/{r.uf}</TableCell><TableCell>{r.cnae_descricao || r.cnae_principal}</TableCell><TableCell>{r.telefone1}</TableCell><TableCell>{r.email}</TableCell><TableCell><Chip size="small" label={r.status_crm||'Não contatado'} color={statusColor(r.status_crm) as any}/></TableCell>
        </TableRow>)}
      </TableBody></Table></TableContainer>
      <TablePagination component="div" count={total} page={page} onPageChange={(_,p)=>setPage(p)} rowsPerPage={pageSize} onRowsPerPageChange={e=>{setPageSize(+e.target.value);setPage(0)}} rowsPerPageOptions={[25,50,100]}/>
    </Paper>

    <Drawer anchor="right" open={!!selected} onClose={()=>setSelected(null)} PaperProps={{sx:{width:{xs:'100%',md:720}}}}>
      {selected&&<Box sx={{p:3}}><Typography variant="h5" fontWeight={700}>{selected.razao_social}</Typography><Typography color="text.secondary">{selected.cnpj} • {selected.municipio}/{selected.uf}</Typography><Divider sx={{my:2}}/>
        <Tabs value={tab} onChange={(_,v)=>setTab(v)} variant="scrollable"><Tab label="Empresa"/><Tab label={`Sócios (${selected.socios?.length||0})`}/><Tab label="Contatos"/><Tab label="Propostas"/></Tabs>
        <Box sx={{mt:2}}>
          {tab===0&&<Grid container spacing={2}><Grid size={{xs:12,md:6}}><Typography><b>Fantasia:</b> {selected.nome_fantasia||'-'}</Typography><Typography><b>Situação:</b> {selected.situacao_cadastral}</Typography><Typography><b>Porte:</b> {selected.porte||'-'}</Typography><Typography><b>Simples:</b> {selected.simples||'-'} • <b>MEI:</b> {selected.mei||'-'}</Typography></Grid><Grid size={{xs:12,md:6}}><Typography><b>Telefone:</b> {selected.telefone1||'-'}</Typography><Typography><b>E-mail:</b> {selected.email||'-'}</Typography><Typography><b>CNAE:</b> {selected.cnae_descricao||'-'}</Typography><Typography><b>Próximo contato:</b> {selected.proximo_contato||'-'}</Typography></Grid></Grid>}
          {tab===1&&selected.socios?.map((s:any)=><Paper variant="outlined" key={s.socio_id} sx={{p:1.5,mb:1}}><Typography fontWeight={700}>{s.nome_socio_razao_social}</Typography><Typography variant="body2">{s.qualificacao||'-'} • Entrada: {s.data_entrada_sociedade||'-'}</Typography></Paper>)}
          {tab===2&&selected.contatos?.map((c:any)=><Paper variant="outlined" key={c.id} sx={{p:1.5,mb:1}}><Typography fontWeight={700}>{c.tipo} • {c.data_contato}</Typography><Typography variant="body2">{c.resultado||''} {c.observacoes||''}</Typography></Paper>)}
          {tab===3&&selected.propostas?.map((p:any)=><Paper variant="outlined" key={p.id} sx={{p:1.5,mb:1}}><Typography fontWeight={700}>{p.titulo||'Proposta'} • {p.status}</Typography><Typography variant="body2">Mensal: R$ {p.valor_mensal||'0,00'}</Typography></Paper>)}
        </Box>
      </Box>}
    </Drawer>
  </>;
}

function Importacao(){
  const [options,setOptions]=useState<any>({motivos:[],cnaes:[],historico:[]});
  const [job,setJob]=useState<any>({running:false,logs:[]});
  const [message,setMessage]=useState<string>('');
  const [form,setForm]=useState<any>({
    uf:'SP', situacao:'04', municipios:['PAULINIA'], somenteMatriz:true,
    motivos:[], cnaes:[], porte:[]
  });

  async function loadOptions(){ const r=await api.get('/import/options'); setOptions(r.data); }
  async function loadStatus(){ const r=await api.get('/import/status'); setJob(r.data); }
  useEffect(()=>{ loadOptions(); loadStatus(); },[]);
  useEffect(()=>{
    if(!job.running) return;
    const t=setInterval(async()=>{ const r=await api.get('/import/status'); setJob(r.data); if(!r.data.running) loadOptions(); },1800);
    return()=>clearInterval(t);
  },[job.running]);

  async function start(){
    setMessage('');
    try{
      await api.post('/import/start', form);
      await loadStatus();
      setMessage('Importação iniciada. O progresso aparece abaixo.');
    }catch(e:any){ setMessage(e.response?.data?.message || e.message); }
  }
  async function cancel(){ try{ await api.post('/import/cancel'); await loadStatus(); }catch(e:any){ setMessage(e.response?.data?.message || e.message); } }

  const motivoOptions=options.motivos.map((m:any)=>({label:`${m.codigo} - ${m.descricao}`, value:m.codigo}));
  const cnaeOptions=options.cnaes.map((c:any)=>({label:`${c.codigo} - ${c.descricao}`, value:c.codigo}));

  return <Grid container spacing={2}>
    <Grid size={{xs:12,lg:5}}>
      <Paper sx={{p:2.5,position:{lg:'sticky'},top:{lg:88}}}>
        <Stack direction="row" spacing={1} alignItems="center" mb={.5}><CloudUploadIcon/><Typography variant="h6" fontWeight={800}>Importar da Receita</Typography></Stack>
        <Typography variant="body2" color="text.secondary" mb={2}>Defina aqui exatamente o que será filtrado nos ZIPs locais e gravado no banco da Hostinger.</Typography>
        <Alert severity="info" sx={{mb:2}}>Os ZIPs completos permanecem no seu computador. Somente empresas aprovadas por estes filtros são enviadas ao banco.</Alert>

        <Grid container spacing={1.5}>
          <Grid size={{xs:4}}><TextField select fullWidth size="small" label="UF" value={form.uf} onChange={e=>setForm({...form,uf:e.target.value})}>{UFS.map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></Grid>
          <Grid size={{xs:8}}><TextField select fullWidth size="small" label="Situação cadastral" value={form.situacao} onChange={e=>setForm({...form,situacao:e.target.value})}>{SITUACOES.map(s=><MenuItem key={s.codigo} value={s.codigo}>{s.codigo} - {s.nome}</MenuItem>)}</TextField></Grid>

          <Grid size={{xs:12}}><Autocomplete multiple freeSolo options={[]} value={form.municipios} onChange={(_,v)=>setForm({...form,municipios:v.map(String)})} renderInput={p=><TextField {...p} size="small" label="Cidades" helperText="Digite uma cidade e pressione Enter. Pode adicionar várias. Vazio = toda a UF."/>}/></Grid>

          <Grid size={{xs:12}}><Autocomplete multiple options={motivoOptions} value={motivoOptions.filter((x:any)=>form.motivos.includes(x.value))} onChange={(_,v)=>setForm({...form,motivos:v.map((x:any)=>x.value)})} getOptionLabel={(o:any)=>o.label} renderInput={p=><TextField {...p} size="small" label="Motivos da situação" helperText="Vazio = todos os motivos."/>}/></Grid>

          <Grid size={{xs:12}}><Autocomplete multiple options={cnaeOptions} value={cnaeOptions.filter((x:any)=>form.cnaes.includes(x.value))} onChange={(_,v)=>setForm({...form,cnaes:v.map((x:any)=>x.value)})} getOptionLabel={(o:any)=>o.label} renderInput={p=><TextField {...p} size="small" label="CNAEs principais" helperText="Vazio = todos os CNAEs."/>}/></Grid>

          <Grid size={{xs:12}}><Autocomplete multiple options={PORTES} value={PORTES.filter(x=>form.porte.includes(x.codigo))} onChange={(_,v)=>setForm({...form,porte:v.map(x=>x.codigo)})} getOptionLabel={o=>`${o.codigo} - ${o.nome}`} renderInput={p=><TextField {...p} size="small" label="Porte da empresa" helperText="Vazio = todos os portes."/>}/></Grid>

          <Grid size={{xs:12}}><FormControlLabel control={<Switch checked={form.somenteMatriz} onChange={e=>setForm({...form,somenteMatriz:e.target.checked})}/>} label="Importar somente matrizes"/></Grid>
        </Grid>

        <Divider sx={{my:2}}/>
        <Stack direction={{xs:'column',sm:'row'}} spacing={1}>
          <Button fullWidth variant="contained" size="large" startIcon={<CloudUploadIcon/>} disabled={job.running} onClick={start}>Importar para Hostinger</Button>
          {job.running&&<Button color="error" variant="outlined" startIcon={<StopCircleIcon/>} onClick={cancel}>Cancelar</Button>}
        </Stack>
        {message&&<Alert severity={message.includes('iniciada')?'success':'warning'} sx={{mt:2}}>{message}</Alert>}
      </Paper>
    </Grid>

    <Grid size={{xs:12,lg:7}}>
      <Paper sx={{p:2.5,mb:2}}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Box><Typography variant="h6" fontWeight={800}>Processamento</Typography><Typography variant="body2" color="text.secondary">Leitura local → filtro → enriquecimento → MariaDB Hostinger</Typography></Box>
          <Button startIcon={<RefreshIcon/>} onClick={loadStatus}>Atualizar</Button>
        </Stack>
        {job.running&&<LinearProgress sx={{mb:2}}/>}
        <Stack direction="row" spacing={1} mb={1} flexWrap="wrap">
          <Chip label={job.running?'IMPORTANDO':'PARADO'} color={job.running?'primary':'default'}/>
          {job.startedAt&&<Chip variant="outlined" label={`Início: ${new Date(job.startedAt).toLocaleString('pt-BR')}`}/>} 
          {job.exitCode===0&&<Chip color="success" label="Última execução concluída"/>}
          {job.error&&<Chip color="error" label="Última execução com erro"/>}
        </Stack>
        <Box component="pre" sx={{m:0,p:2,bgcolor:'#111827',color:'#e5e7eb',borderRadius:1.5,minHeight:280,maxHeight:480,overflow:'auto',fontSize:12,whiteSpace:'pre-wrap'}}>{job.logs?.length?job.logs.join('\n'):'Nenhuma importação iniciada nesta sessão.'}</Box>
      </Paper>

      <Paper sx={{p:2.5}}>
        <Typography variant="h6" fontWeight={800} mb={1.5}>Últimas importações</Typography>
        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>ID</TableCell><TableCell>Data</TableCell><TableCell>UF / cidades</TableCell><TableCell>Situação</TableCell><TableCell>Encontrados</TableCell><TableCell>Status</TableCell></TableRow></TableHead><TableBody>
          {options.historico.map((h:any)=><TableRow key={h.id}><TableCell>{h.id}</TableCell><TableCell>{h.iniciado_em?new Date(h.iniciado_em).toLocaleString('pt-BR'):'-'}</TableCell><TableCell>{h.filtro_uf} • {h.filtro_municipios||'Todas'}</TableCell><TableCell>{h.filtro_situacao}</TableCell><TableCell>{Number(h.encontrados||0).toLocaleString('pt-BR')}</TableCell><TableCell><Chip size="small" label={h.status} color={h.status==='CONCLUIDO'?'success':h.status==='ERRO'?'error':'default'}/></TableCell></TableRow>)}
        </TableBody></Table></TableContainer>
      </Paper>
    </Grid>
  </Grid>;
}

export default function App(){
  const [section,setSection]=useState(0);
  const [dashboard,setDashboard]=useState<any>({});
  const [health,setHealth]=useState<any>(null);
  const refreshDashboard=()=>api.get('/dashboard').then(r=>setDashboard(r.data)).catch(()=>{});
  useEffect(()=>{ refreshDashboard(); api.get('/health').then(r=>setHealth(r.data)).catch(()=>setHealth({ok:false})); },[]);

  return <Box sx={{minHeight:'100vh',bgcolor:'#f4f6f8'}}>
    <AppBar position="sticky" elevation={0}><Toolbar><BusinessIcon sx={{mr:1}}/><Typography variant="h6" fontWeight={800} sx={{flexGrow:1}}>CRM CNPJ • Prospecção Contábil</Typography><Chip size="small" icon={<StorageIcon/>} label={health?.ok?'Banco conectado':'Banco desconectado'} color={health?.ok?'success':'error'} sx={{color:'white'}}/></Toolbar></AppBar>
    <Box sx={{bgcolor:'background.paper',borderBottom:1,borderColor:'divider'}}><Container maxWidth="xl"><Tabs value={section} onChange={(_,v)=>setSection(v)}><Tab label="Consultar base"/><Tab label="Importar da Receita"/></Tabs></Container></Box>
    <Container maxWidth="xl" sx={{py:3}}>{section===0?<Consulta dashboard={dashboard} refreshDashboard={refreshDashboard}/>:<Importacao/>}</Container>
  </Box>;
>>>>>>> 3e7226b891f18b3e217e275d808991e33931895b
}

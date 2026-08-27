import {
  Alert,Autocomplete,Box,Button,Checkbox,Chip,CircularProgress,FormControlLabel,
  Grid,MenuItem,Paper,Stack,TextField,Typography
} from '@mui/material';
import { useEffect,useRef,useState } from 'react';
import { API_URL,api } from '../lib/api';

type Option={codigo:string;descricao:string};

export default function ImportPage(){
  const [uf,setUf]=useState('SP'),[situacao,setSituacao]=useState('');
  const [municipios,setMunicipios]=useState<string[]>([]),[municipioOptions,setMunicipioOptions]=useState<string[]>([]),[municipioBusca,setMunicipioBusca]=useState('');
  const [motivos,setMotivos]=useState<Option[]>([]),[cnaes,setCnaes]=useState<Option[]>([]),[porte,setPorte]=useState<string[]>([]);
  const [simples,setSimples]=useState(''),[mei,setMei]=useState(''),[somenteMatriz,setSomenteMatriz]=useState(true),[resume,setResume]=useState(false);
  const [motivoOptions,setMotivoOptions]=useState<Option[]>([]),[cnaeOptions,setCnaeOptions]=useState<Option[]>([]);
  const [logs,setLogs]=useState<string[]>([]),[running,setRunning]=useState(false),[error,setError]=useState<string|null>(null);
  const logRef=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    api.get('/import/options').then(r=>{setMotivoOptions(r.data.motivos||[]);setCnaeOptions(r.data.cnaes||[])}).catch(()=>{});
    const ev=new EventSource(`${API_URL}/import/events`);
    ev.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='log')setLogs(p=>[...p.slice(-500),m.line]);if(m.job){setRunning(!!m.job.running);setError(m.job.error||null);if(m.job.logs)setLogs(m.job.logs)}}catch{}};
    return()=>ev.close();
  },[]);

  useEffect(()=>{
    const t=setTimeout(()=>api.get('/import/municipios',{params:{uf,q:municipioBusca}})
      .then(r=>{const municipios=Array.from(new Set<string>((r.data||[]).map((x:any)=>String(x.nome??'')).filter(Boolean)));setMunicipioOptions(['TODAS',...municipios])})
      .catch(()=>setMunicipioOptions(['TODAS'])),250);
    return()=>clearTimeout(t);
  },[uf,municipioBusca]);

  useEffect(()=>{if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight},[logs]);

  const start=async()=>{
    setError(null);
    try{
      await api.post('/import/start',{
        uf,situacao,municipios,somenteMatriz,
        motivos:motivos.map(x=>x.codigo),cnaes:cnaes.map(x=>x.codigo),porte,simples,mei,resume
      });
      setRunning(true);
    }catch(e:any){setError(e?.response?.data?.message||e.message)}
  };

  return(
    <Stack spacing={1}>
      <Box><Typography variant="h5" fontWeight={700}>Importar Empresas da Receita Federal</Typography>
      <Typography color="text.secondary">Vazio ou “Todos” significa sem filtro naquele campo.</Typography></Box>
      {error&&<Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{p:.75,width:'100%'}}>
        <Grid container columnSpacing={.35} rowSpacing={.28}>
          <Grid item xs={12} md={2}><TextField select fullWidth label="UF" value={uf} onChange={e=>setUf(e.target.value)}>
            {['SP','MG','RJ','PR','SC','RS','GO','DF','BA','ES'].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}
          </TextField></Grid>
          <Grid item xs={12} md={2}><TextField select fullWidth label="Situação" value={situacao} onChange={e=>setSituacao(e.target.value)}>
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="02">02 - Ativa</MenuItem>
            <MenuItem value="03">03 - Suspensa</MenuItem>
            <MenuItem value="04">04 - Inapta</MenuItem>
            <MenuItem value="08">08 - Baixada</MenuItem>
          </TextField></Grid>
          <Grid item xs={12} md={8}><Autocomplete multiple freeSolo options={municipioOptions} value={municipios}
            inputValue={municipioBusca} onInputChange={(_,v)=>setMunicipioBusca(v)}
            onChange={(_,v)=>{const vals=v.map(String);setMunicipios(vals.includes('TODAS')?[]:vals)}}
            renderInput={p=><TextField {...p} label="Cidades" placeholder="Todas ou digite para buscar"/>}/>
          </Grid>

          <Grid item xs={12} md={6}><Autocomplete multiple options={[{codigo:'',descricao:'TODOS'},...motivoOptions]} value={motivos}
            getOptionLabel={x=>x.codigo?`${x.codigo} - ${x.descricao}`:'TODOS'} onChange={(_,v)=>setMotivos(v.some(x=>!x.codigo)?[]:v)}
            renderInput={p=><TextField {...p} label="Motivos" placeholder="Todos"/>}/></Grid>

          <Grid item xs={12} md={6}><Autocomplete multiple options={[{codigo:'',descricao:'TODOS'},...cnaeOptions]} value={cnaes}
            getOptionLabel={x=>x.codigo?`${x.codigo} - ${x.descricao}`:'TODOS'} onChange={(_,v)=>setCnaes(v.some(x=>!x.codigo)?[]:v)}
            renderInput={p=><TextField {...p} label="CNAEs principais" placeholder="Todos"/>}/></Grid>

          <Grid item xs={12} md={5}><Autocomplete multiple options={['TODOS','00','01','03','05']} value={porte}
            onChange={(_,v)=>setPorte(v.includes('TODOS')?[]:v)} renderInput={p=><TextField {...p} label="Porte" placeholder="Todos"/>}/></Grid>
          <Grid item xs={6} md={2}><TextField select fullWidth label="Simples" value={simples} onChange={e=>setSimples(e.target.value)}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="S">Sim</MenuItem><MenuItem value="N">Não</MenuItem>
          </TextField></Grid>
          <Grid item xs={6} md={2}><TextField select fullWidth label="MEI" value={mei} onChange={e=>setMei(e.target.value)}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="S">Sim</MenuItem><MenuItem value="N">Não</MenuItem>
          </TextField></Grid>
          <Grid item xs={12} md={3}><Stack>
            <FormControlLabel control={<Checkbox checked={somenteMatriz} onChange={e=>setSomenteMatriz(e.target.checked)}/>} label="Somente matrizes"/>
            <FormControlLabel control={<Checkbox checked={resume} onChange={e=>setResume(e.target.checked)}/>} label="Retomar importação"/>
          </Stack></Grid>

          <Grid item xs={12}><Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={running} onClick={start}>{running?<CircularProgress size={20}/>:'Importar para Hostinger'}</Button>
            {running&&<Chip label="Importação em andamento"/>}
          </Stack></Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{p:.75}}>
        <Typography fontWeight={700} mb={.5}>Log em tempo real</Typography>
        <Box ref={logRef} sx={{height:260,overflow:'auto',bgcolor:'#101418',color:'#d8e1e8',p:.75,borderRadius:1,fontFamily:'Consolas, monospace',fontSize:10.5}}>
          {logs.length?logs.map((x,i)=><div key={i}>{x}</div>):'Aguardando importação...'}
        </Box>
      </Paper>
    </Stack>
  );
}

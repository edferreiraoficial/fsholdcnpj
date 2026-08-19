import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel,
  Grid, MenuItem, Paper, Stack, TextField, Typography
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { API_URL, api } from '../lib/api';

type Option = { codigo: string; descricao: string };
type History = any;

export default function ImportPage() {
  const [uf, setUf] = useState('SP');
  const [situacao, setSituacao] = useState('04');
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [municipioOptions, setMunicipioOptions] = useState<string[]>([]);
  const [municipioBusca, setMunicipioBusca] = useState('');
  const [somenteMatriz, setSomenteMatriz] = useState(true);
  const [motivos, setMotivos] = useState<Option[]>([]);
  const [cnaes, setCnaes] = useState<Option[]>([]);
  const [porte, setPorte] = useState<string[]>([]);
  const [simples, setSimples] = useState('');
  const [mei, setMei] = useState('');
  const [resume, setResume] = useState(false);

  const [motivoOptions, setMotivoOptions] = useState<Option[]>([]);
  const [cnaeOptions, setCnaeOptions] = useState<Option[]>([]);
  const [historico, setHistorico] = useState<History[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);


  const loadOptions = async () => {
    const { data } = await api.get('/import/options');
    setMotivoOptions(data.motivos || []);
    setCnaeOptions(data.cnaes || []);
    setHistorico(data.historico || []);
  };

  const loadStatus = async () => {
    const { data } = await api.get('/import/status');
    setRunning(data.running);
    setLogs(data.logs || []);
    setError(data.error || null);
  };

  useEffect(() => {
    loadOptions().catch(() => {});
    loadStatus().catch(() => {});
    const events = new EventSource(`${API_URL}/import/events`);
    events.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'log') {
          setLogs(prev => [...prev.slice(-500), msg.line]);
        } else if (msg.type === 'status' || msg.type === 'snapshot') {
          const j = msg.job;
          if (j) {
            setRunning(!!j.running);
            setError(j.error || null);
            if (j.logs) setLogs(j.logs);
          }
        }
      } catch {}
    };
    const interval = setInterval(() => {
      loadStatus().catch(() => {});
      loadOptions().catch(() => {});
    }, 10000);
    return () => {
      events.close();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);


  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/import/municipios', {
          params: { uf, q: municipioBusca }
        });
        const nomes = (data || []).map((x: any) => x.nome).filter(Boolean);
        setMunicipioOptions(Array.from(new Set(['TODAS', ...nomes])));
      } catch {
        setMunicipioOptions(['TODAS']);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [uf, municipioBusca]);

  const start = async () => {
    setError(null);
    try {
      await api.post('/import/start', {
        uf, situacao, municipios, somenteMatriz,
        motivos: motivos.map(x => x.codigo),
        cnaes: cnaes.map(x => x.codigo),
        porte, simples, mei, resume
      });
      setRunning(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message);
    }
  };

  const cancel = async () => {
    await api.post('/import/cancel').catch(() => {});
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" fontWeight={700}>Importar da Receita</Typography>
        <Typography color="text.secondary">
          Os filtros são aplicados localmente antes de gravar dados na Hostinger.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, width: "100%" }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={2}>
            <TextField select fullWidth label="UF" value={uf} onChange={e => setUf(e.target.value)}>
              {['SP','MG','RJ','PR','SC','RS','GO','DF','BA','ES'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField select fullWidth label="Situação" value={situacao} onChange={e => setSituacao(e.target.value)}>
              <MenuItem value="02">02 - Ativa</MenuItem>
              <MenuItem value="03">03 - Suspensa</MenuItem>
              <MenuItem value="04">04 - Inapta</MenuItem>
              <MenuItem value="08">08 - Baixada</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={8}>
            <Autocomplete
              multiple
              freeSolo
              options={municipioOptions}
              value={municipios}
              inputValue={municipioBusca}
              onInputChange={(_, v) => setMunicipioBusca(v)}
              onChange={(_, v) => {
                const values = v.map(x => String(x));
                setMunicipios(values.includes('TODAS') ? [] : values);
              }}
              renderInput={p => (
                <TextField
                  {...p}
                  label="Cidades"
                  placeholder="Todas ou digite para buscar"
                  helperText="Vazio = todas as cidades da UF. Ao digitar, o sistema sugere o nome oficial."
                />
              )}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Autocomplete
              multiple
              options={[{ codigo: '', descricao: 'TODAS' }, ...motivoOptions]}
              getOptionLabel={x => x.codigo ? `${x.codigo} - ${x.descricao}` : 'TODAS'}
              value={motivos}
              onChange={(_, v) => setMotivos(v.some(x => !x.codigo) ? [] : v)}
              renderInput={p => <TextField {...p} label="Motivos" placeholder="Todos" />}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Autocomplete
              multiple
              options={[{ codigo: '', descricao: 'TODOS' }, ...cnaeOptions]}
              getOptionLabel={x => x.codigo ? `${x.codigo} - ${x.descricao}` : 'TODOS'}
              value={cnaes}
              onChange={(_, v) => setCnaes(v.some(x => !x.codigo) ? [] : v)}
              renderInput={p => <TextField {...p} label="CNAEs principais" placeholder="Todos" />}
            />
          </Grid>

          <Grid item xs={12} md={5}>
            <Autocomplete
              multiple
              options={['TODOS','00','01','03','05']}
              value={porte}
              onChange={(_, v) => setPorte(v.includes('TODOS') ? [] : v)}
              renderInput={p => <TextField {...p} label="Porte (código Receita)" placeholder="Todos" />}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth label="Simples" value={simples} onChange={e => setSimples(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="S">Sim</MenuItem>
              <MenuItem value="N">Não</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth label="MEI" value={mei} onChange={e => setMei(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="S">Sim</MenuItem>
              <MenuItem value="N">Não</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack>
              <FormControlLabel
                control={<Checkbox checked={somenteMatriz} onChange={e => setSomenteMatriz(e.target.checked)} />}
                label="Somente matrizes"
              />
              <FormControlLabel
                control={<Checkbox checked={resume} onChange={e => setResume(e.target.checked)} />}
                label="Retomar importação interrompida"
              />
            </Stack>
          </Grid>

          <Grid item xs={12}>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={running} onClick={start}>
                {running ? <CircularProgress size={20} /> : 'Importar para Hostinger'}
              </Button>
              <Button color="error" disabled={!running} onClick={cancel}>Cancelar</Button>
              {running && <Chip label="Importação em andamento" />}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1}>Log em tempo real</Typography>
        <Box
          ref={logRef}
          sx={{
            height: 300, overflow: 'auto', bgcolor: '#101418', color: '#d8e1e8',
            p: 1.5, borderRadius: 1, fontFamily: 'Consolas, monospace', fontSize: 12
          }}
        >
          {logs.length ? logs.map((x, i) => <div key={i}>{x}</div>) : 'Aguardando importação...'}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1}>Últimas importações</Typography>
        <Stack spacing={1}>
          {historico.slice(0, 10).map((h: any) => (
            <Box key={h.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip size="small" label={h.status} />
              <Typography variant="body2">#{h.id} {h.filtro_uf} · {h.filtro_municipios || 'todas cidades'}</Typography>
              <Typography variant="caption" color="text.secondary">
                encontrados {h.encontrados || 0} · inseridos {h.inseridos || 0}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

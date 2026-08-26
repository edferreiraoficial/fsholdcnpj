import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Divider,
  Grid, MenuItem, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField, Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const money = (v:any) => v == null || v === '' ? '-' : Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

const formatDateBR = (value:any) => {
  if (!value) return '-';

  // MariaDB/mysql2 pode retornar Date, ISO datetime ou YYYY-MM-DD.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '-' : value.toLocaleDateString('pt-BR');
  }

  const raw = String(value).trim();
  if (!raw) return '-';

  // Prioriza YYYY-MM-DD para evitar problemas de timezone.
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, ano, mes, dia] = match;
    return `${dia}/${mes}/${ano}`;
  }

  const data = new Date(raw);
  return Number.isNaN(data.getTime()) ? '-' : data.toLocaleDateString('pt-BR');
};

export default function ConsultPage() {
  const [selectedEmailIds,setSelectedEmailIds]=useState<number[]>([]);
  const [q,setQ]=useState(''), [uf,setUf]=useState(''), [municipio,setMunicipio]=useState('');
  const [municipioBusca,setMunicipioBusca]=useState('');
  const [situacao,setSituacao]=useState(''), [motivo,setMotivo]=useState('');
  const [dataSituacaoDe,setDataSituacaoDe]=useState(''), [dataSituacaoAte,setDataSituacaoAte]=useState('');
  const [cnae,setCnae]=useState(''), [porte,setPorte]=useState('');
  const [simples,setSimples]=useState(''), [mei,setMei]=useState(''), [status,setStatus]=useState('');
  const [prioridade,setPrioridade]=useState(''), [temTelefone,setTemTelefone]=useState(''), [temEmail,setTemEmail]=useState('');
  const [capitalMin,setCapitalMin]=useState(''), [capitalMax,setCapitalMax]=useState('');
  const [order,setOrder]=useState('data_desc');
  const [exportando,setExportando]=useState<'xlsx'|'pdf'|''>('');
  const [items,setItems]=useState<any[]>([]), [total,setTotal]=useState(0);
  const [page,setPage]=useState(0), [pageSize,setPageSize]=useState(25);
  const [filters,setFilters]=useState<any>({municipios:[],status:[],cnaes:[],motivos:[]});
  const [detail,setDetail]=useState<any>(null), [tab,setTab]=useState(0);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{ api.get('/filters').then(r=>setFilters(r.data)).catch(()=>{}); },[]);
  const municipios = useMemo(() => {
    const termo = municipioBusca.trim().toUpperCase();

    if (termo.length < 2) return [];

    return (filters.municipios || [])
      .filter((x:any) => !uf || x.uf === uf || !x.uf)
      .filter((x:any) => String(x.nome || '').toUpperCase().includes(termo))
      .map((x:any) => String(x.nome || '').toUpperCase())
      .slice(0, 100);
  }, [filters.municipios, uf, municipioBusca]);

  const currentParams = () => ({
    q:q||undefined,
    uf:uf||undefined,
    municipio:municipio||undefined,
    situacao:situacao||undefined,
    motivo:motivo||undefined,
    dataSituacaoDe:dataSituacaoDe||undefined,
    dataSituacaoAte:dataSituacaoAte||undefined,
    cnae:cnae||undefined,
    porte:porte||undefined,
    simples:simples||undefined,
    mei:mei||undefined,
    status:status||undefined,
    prioridade:prioridade||undefined,
    temTelefone:temTelefone||undefined,
    temEmail:temEmail||undefined,
    capitalMin:capitalMin||undefined,
    capitalMax:capitalMax||undefined,
    order
  });

  const load = async(reset=false) => {
    const target = reset ? 0 : page;
    setLoading(true);
    setError('');

    try {
      localStorage.setItem('fshold_last_filters', JSON.stringify(currentParams()));
      const {data}=await api.get('/prospects',{params:{
        ...currentParams(),
        page:target+1,
        pageSize
      }});

      setItems(data.items || []);
      setTotal(Number(data.total || 0));
      if(reset)setPage(0);
    } catch (e:any) {
      const mensagem =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Erro ao pesquisar prospects.';
      setError(mensagem);
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ load().catch(()=>{}); },[page,pageSize]);

  const exportar = async(format:'xlsx'|'pdf') => {
    setExportando(format);
    setError('');

    try {
      const response = await api.get('/prospects/export', {
        params: {
          ...currentParams(),
          format
        },
        responseType: 'blob'
      });

      const contentType = String(
      response.headers['content-type'] ?? ''
      );

      if (contentType.includes('application/json')) {
        const texto = await response.data.text();
        const json = JSON.parse(texto);
        throw new Error(json.message || 'Erro ao exportar.');
      }

      const disposition = response.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename =
        match?.[1] ||
        `prospects-filtrados.${format === 'xlsx' ? 'xlsx' : 'pdf'}`;

      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e:any) {
      if (e?.response?.data instanceof Blob) {
        try {
          const texto = await e.response.data.text();
          const json = JSON.parse(texto);
          setError(json.message || 'Erro ao exportar.');
          return;
        } catch {}
      }

      setError(
        e?.response?.data?.message ||
        e?.message ||
        'Erro ao exportar a lista.'
      );
    } finally {
      setExportando('');
    }
  };

  const clear = () => {
    setSelectedEmailIds([]);
    setQ('');setUf('');setMunicipio('');setMunicipioBusca('');setSituacao('');setMotivo('');
    setDataSituacaoDe('');setDataSituacaoAte('');
    setCnae('');setPorte('');
    setSimples('');setMei('');setStatus('');setPrioridade('');setTemTelefone('');
    setTemEmail('');setCapitalMin('');setCapitalMax('');setOrder('data_desc');
  };

  const toggleEmailSelection=(id:number)=>{
    setSelectedEmailIds(prev=>
      prev.includes(id) ? prev.filter(x=>x!==id) : [...prev,id]
    );
  };

  const abrirEmailDireto=()=>{
    if(!selectedEmailIds.length) return;
    localStorage.setItem(
      'fshold_direct_email_ids',
      JSON.stringify(selectedEmailIds)
    );
    window.dispatchEvent(new Event('fshold-open-direct-email'));
  };

  return <Stack spacing={2}>
    <Box>
      <Typography variant="h5" fontWeight={700}>Consultar base</Typography>
      <Typography color="text.secondary">Pesquisa comercial dos prospects importados.</Typography>
    </Box>

    {error && <Alert severity="error">{error}</Alert>}

    <Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
      <Grid container spacing={2}>
        <Grid item xs={12} lg={5}>
          <TextField fullWidth label="CNPJ, empresa, fantasia ou sócio" value={q} onChange={e=>setQ(e.target.value)}/>
        </Grid>
        <Grid item xs={6} lg={1.5}>
          <TextField select fullWidth label="UF" value={uf} onChange={e=>{setUf(e.target.value);setMunicipio('');setMunicipioBusca('')}}>
            <MenuItem value="">Todas</MenuItem>
            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={6} lg={5.5}>
          <Autocomplete
            options={municipios}
            value={municipio || null}
            inputValue={municipioBusca}
            onInputChange={(_, v, reason) => {
              if (reason !== 'reset') setMunicipioBusca(v.toUpperCase());
            }}
            onChange={(_, v) => {
              const valor = (v || '').toUpperCase();
              setMunicipio(valor);
              setMunicipioBusca(valor);
            }}
            noOptionsText={
              municipioBusca.trim().length < 2
                ? 'Digite pelo menos 2 letras'
                : 'Nenhum município encontrado'
            }
            filterOptions={(options) => options}
            renderInput={p => (
              <TextField
                {...p}
                label="Município"
                placeholder="DIGITE 2 OU MAIS LETRAS"
                helperText="A lista é filtrada automaticamente a partir da 2ª letra."
                inputProps={{
                  ...p.inputProps,
                  style: { textTransform: 'uppercase' }
                }}
              />
            )}
          />
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField select fullWidth label="Situação" value={situacao} onChange={e=>setSituacao(e.target.value)}>
            <MenuItem value="">Todas</MenuItem><MenuItem value="02">02 - Ativa</MenuItem><MenuItem value="03">03 - Suspensa</MenuItem>
            <MenuItem value="04">04 - Inapta</MenuItem><MenuItem value="08">08 - Baixada</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Autocomplete
            options={filters.motivos||[]}
            getOptionLabel={(x:any)=>`${x.codigo} - ${x.descricao}`}
            value={(filters.motivos||[]).find((x:any)=>x.codigo===motivo)||null}
            onChange={(_,v:any)=>setMotivo(v?.codigo||'')}
            renderInput={p=><TextField {...p} label="Motivo da situação cadastral" placeholder="Todos"/>}
          />
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField
            fullWidth
            type="date"
            label="Data situação de"
            InputLabelProps={{ shrink: true }}
            value={dataSituacaoDe}
            onChange={e=>setDataSituacaoDe(e.target.value)}
          />
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField
            fullWidth
            type="date"
            label="Data situação até"
            InputLabelProps={{ shrink: true }}
            value={dataSituacaoAte}
            onChange={e=>setDataSituacaoAte(e.target.value)}
          />
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField select fullWidth label="Porte" value={porte} onChange={e=>setPorte(e.target.value)}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="00">00</MenuItem><MenuItem value="01">01</MenuItem><MenuItem value="03">03</MenuItem><MenuItem value="05">05</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Autocomplete options={filters.cnaes||[]} getOptionLabel={(x:any)=>`${x.codigo} - ${x.descricao}`}
            value={(filters.cnaes||[]).find((x:any)=>x.codigo===cnae)||null}
            onChange={(_,v:any)=>setCnae(v?.codigo||'')}
            renderInput={p=><TextField {...p} label="CNAE principal" placeholder="Todos"/>}/>
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField select fullWidth label="Simples" value={simples} onChange={e=>setSimples(e.target.value)}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="S">Sim</MenuItem><MenuItem value="N">Não</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField select fullWidth label="MEI" value={mei} onChange={e=>setMei(e.target.value)}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="S">Sim</MenuItem><MenuItem value="N">Não</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField select fullWidth label="Status CRM" value={status} onChange={e=>setStatus(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            {(filters.status||[]).map((x:any)=><MenuItem key={x.id} value={x.id}>{x.nome}</MenuItem>)}
          </TextField>
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField select fullWidth label="Prioridade" value={prioridade} onChange={e=>setPrioridade(e.target.value)}>
            <MenuItem value="">Todas</MenuItem><MenuItem value="BAIXA">Baixa</MenuItem><MenuItem value="NORMAL">Normal</MenuItem><MenuItem value="ALTA">Alta</MenuItem><MenuItem value="URGENTE">Urgente</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField select fullWidth label="Telefone" value={temTelefone} onChange={e=>setTemTelefone(e.target.value)}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="S">Com telefone</MenuItem><MenuItem value="N">Sem telefone</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField select fullWidth label="E-mail" value={temEmail} onChange={e=>setTemEmail(e.target.value)}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="S">Com e-mail</MenuItem><MenuItem value="N">Sem e-mail</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={6} md={3} lg={2}>
          <TextField fullWidth type="number" label="Capital mínimo" value={capitalMin} onChange={e=>setCapitalMin(e.target.value)}/>
        </Grid>
        <Grid item xs={6} md={3} lg={2}>
          <TextField fullWidth type="number" label="Capital máximo" value={capitalMax} onChange={e=>setCapitalMax(e.target.value)}/>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <TextField
            select
            fullWidth
            label="Ordenar por"
            value={order}
            onChange={e=>setOrder(e.target.value)}
          >
            <MenuItem value="data_desc">Data da situação - mais recente primeiro</MenuItem>
            <MenuItem value="data_asc">Data da situação - mais antiga primeiro</MenuItem>
            <MenuItem value="razao_asc">Razão social - A a Z</MenuItem>
            <MenuItem value="razao_desc">Razão social - Z a A</MenuItem>
            <MenuItem value="capital_desc">Capital social - maior primeiro</MenuItem>
            <MenuItem value="capital_asc">Capital social - menor primeiro</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12}>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={loading} onClick={()=>load(true)}>
              {loading ? <CircularProgress size={20} /> : 'Pesquisar'}
            </Button>
            <Button
              variant="outlined"
              disabled={!selectedEmailIds.length}
              onClick={abrirEmailDireto}
            >
              Enviar e-mail aos selecionados ({selectedEmailIds.length})
            </Button>
            <Button variant="outlined" onClick={clear}>Limpar filtros</Button>
            <Button
              variant="outlined"
              disabled={!!exportando || total===0}
              onClick={()=>exportar('xlsx')}
            >
              {exportando==='xlsx' ? <CircularProgress size={18}/> : 'Exportar Excel'}
            </Button>
            <Button
              variant="outlined"
              disabled={!!exportando || total===0}
              onClick={()=>exportar('pdf')}
            >
              {exportando==='pdf' ? <CircularProgress size={18}/> : 'Exportar PDF'}
            </Button>
            <Chip variant="outlined" label={`${total.toLocaleString('pt-BR')} encontrados`}/>
          </Stack>
        </Grid>
      </Grid>
    </Paper>

    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead><TableRow>
          <TableCell padding="checkbox"><Checkbox disabled/></TableCell>
          <TableCell>CNPJ</TableCell><TableCell>Empresa</TableCell><TableCell>Município</TableCell>
          <TableCell>Situação</TableCell><TableCell>Data situação</TableCell><TableCell>CNAE</TableCell><TableCell>Capital</TableCell>
          <TableCell>Contato</TableCell><TableCell>Simples/MEI</TableCell><TableCell>CRM</TableCell><TableCell/>
        </TableRow></TableHead>
        <TableBody>
          {items.map(r=><TableRow key={r.prospect_id} hover>
            <TableCell padding="checkbox">
              <Checkbox
                checked={selectedEmailIds.includes(Number(r.prospect_id))}
                disabled={!r.email}
                onClick={e=>e.stopPropagation()}
                onChange={()=>toggleEmailSelection(Number(r.prospect_id))}
              />
            </TableCell>
            <TableCell>{r.cnpj}</TableCell>
            <TableCell sx={{minWidth:250}}><Typography fontWeight={700}>{r.razao_social}</Typography><Typography variant="caption">{r.nome_fantasia||'-'}</Typography></TableCell>
            <TableCell>{r.municipio}/{r.uf}</TableCell>
            <TableCell><Chip size="small" variant="outlined" label={r.situacao_cadastral}/></TableCell>
            <TableCell sx={{whiteSpace:'nowrap'}}>
              {formatDateBR(r.data_situacao)}
            </TableCell>
            <TableCell sx={{minWidth:200}}><Typography>{r.cnae_principal||'-'}</Typography><Typography variant="caption">{r.cnae_descricao||''}</Typography></TableCell>
            <TableCell>{money(r.capital_social)}</TableCell>
            <TableCell sx={{minWidth:170}}><Typography>{r.telefone1||'-'}</Typography><Typography variant="caption">{r.email||''}</Typography></TableCell>
            <TableCell><Stack direction="row" spacing={0.5}>{r.simples==='S'&&<Chip size="small" label="Simples"/>}{r.mei==='S'&&<Chip size="small" label="MEI"/>}</Stack></TableCell>
            <TableCell><Typography>{r.status_crm||'Não contatado'}</Typography><Typography variant="caption">{r.prioridade||'NORMAL'}</Typography></TableCell>
            <TableCell><Button size="small" onClick={async()=>{setDetail((await api.get(`/prospects/${r.prospect_id}`)).data);setTab(0)}}>Abrir</Button></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      <TablePagination component="div" count={total} page={page} rowsPerPage={pageSize}
        onPageChange={(_,p)=>setPage(p)} onRowsPerPageChange={e=>{setPageSize(Number(e.target.value));setPage(0)}} rowsPerPageOptions={[25,50,100]}/>
    </TableContainer>

    <Dialog open={!!detail} onClose={()=>setDetail(null)} maxWidth="lg" fullWidth>
      <DialogTitle>{detail?.razao_social}</DialogTitle>
      <DialogContent>
        {detail&&<Stack spacing={2}>
          <Tabs value={tab} onChange={(_,v)=>setTab(v)}>
            <Tab label="Empresa"/><Tab label={`Sócios (${detail.socios?.length||0})`}/>
            <Tab label={`Contatos (${detail.contatos?.length||0})`}/><Tab label={`Propostas (${detail.propostas?.length||0})`}/>
            <Tab label={`Tarefas (${detail.tarefas?.length||0})`}/>
          </Tabs><Divider/>
          {tab===0&&<Grid container spacing={2}>
            <Grid item xs={12} md={6}><Typography><b>CNPJ:</b> {detail.cnpj}</Typography></Grid>
            <Grid item xs={12} md={6}><Typography><b>Município:</b> {detail.municipio}/{detail.uf}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography><b>Situação:</b> {detail.situacao_cadastral}</Typography></Grid>
            <Grid item xs={12} md={4}>
              <Typography><b>Data da situação:</b> {formatDateBR(detail.data_situacao)}</Typography>
            </Grid>
            <Grid item xs={12} md={4}><Typography><b>Porte:</b> {detail.porte||'-'}</Typography></Grid>
            <Grid item xs={12} md={4}><Typography><b>Capital:</b> {money(detail.capital_social)}</Typography></Grid>
            <Grid item xs={12} md={6}><Typography><b>Telefone:</b> {detail.telefone1||'-'}</Typography></Grid>
            <Grid item xs={12} md={6}><Typography><b>E-mail:</b> {detail.email||'-'}</Typography></Grid>
          </Grid>}
          {tab===1&&<Stack spacing={1}>{(detail.socios||[]).map((s:any)=><Paper key={s.socio_id} variant="outlined" sx={{p:1.5}}><Typography fontWeight={700}>{s.nome_socio_razao_social}</Typography><Typography variant="caption">{s.qualificacao||'Qualificação não informada'}</Typography></Paper>)}</Stack>}
          {tab===2&&<Stack spacing={1}>{(detail.contatos||[]).map((c:any)=><Paper key={c.id} variant="outlined" sx={{p:1.5}}><Typography fontWeight={700}>{c.tipo}</Typography><Typography variant="body2">{c.resultado||c.observacoes||'-'}</Typography></Paper>)}</Stack>}
          {tab===3&&<Stack spacing={1}>{(detail.propostas||[]).map((p:any)=><Paper key={p.id} variant="outlined" sx={{p:1.5}}><Typography fontWeight={700}>{p.titulo||`Proposta #${p.id}`}</Typography></Paper>)}</Stack>}
          {tab===4&&<Stack spacing={1}>{(detail.tarefas||[]).map((t:any)=><Paper key={t.id} variant="outlined" sx={{p:1.5}}><Typography fontWeight={700}>{t.titulo}</Typography></Paper>)}</Stack>}
        </Stack>}
      </DialogContent>
    </Dialog>
  </Stack>;
}

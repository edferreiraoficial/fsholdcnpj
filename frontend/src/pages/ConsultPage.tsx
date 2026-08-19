import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Grid, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow,
  TextField, Typography
} from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function ConsultPage() {
  const [q, setQ] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [situacao, setSituacao] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<any>({ municipios: [], status: [] });
  const [detail, setDetail] = useState<any | null>(null);

  const load = async () => {
    const { data } = await api.get('/prospects', {
      params: {
        q: q || undefined,
        municipio: municipio || undefined,
        situacao: situacao || undefined,
        status: status || undefined,
        page: page + 1,
        pageSize
      }
    });
    setItems(data.items);
    setTotal(data.total);
  };

  useEffect(() => { api.get('/filters').then(r => setFilters(r.data)); }, []);
  useEffect(() => { load().catch(() => {}); }, [page, pageSize]);

  const openDetail = async (id: number) => {
    const { data } = await api.get(`/prospects/${id}`);
    setDetail(data);
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" fontWeight={700}>Consultar base</Typography>
        <Typography color="text.secondary">Busque empresas e trabalhe os prospects já importados.</Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <TextField fullWidth label="CNPJ, empresa, fantasia ou sócio" value={q} onChange={e => setQ(e.target.value)} />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField select fullWidth label="Município" value={municipio} onChange={e => setMunicipio(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {(filters.municipios || []).map((x: any) => <MenuItem key={x.municipio} value={x.municipio}>{x.municipio}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth label="Situação" value={situacao} onChange={e => setSituacao(e.target.value)}>
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="02">Ativa</MenuItem>
              <MenuItem value="03">Suspensa</MenuItem>
              <MenuItem value="04">Inapta</MenuItem>
              <MenuItem value="08">Baixada</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth label="CRM" value={status} onChange={e => setStatus(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              {(filters.status || []).map((x: any) => <MenuItem key={x.id} value={x.id}>{x.nome}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Button variant="contained" onClick={() => { setPage(0); load(); }}>Pesquisar</Button>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>CNPJ</TableCell>
              <TableCell>Razão social</TableCell>
              <TableCell>Município</TableCell>
              <TableCell>Situação</TableCell>
              <TableCell>CNAE</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>Status CRM</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(row => (
              <TableRow key={row.prospect_id} hover>
                <TableCell>{row.cnpj}</TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{row.razao_social}</Typography>
                  <Typography variant="caption" color="text.secondary">{row.nome_fantasia}</Typography>
                </TableCell>
                <TableCell>{row.municipio}/{row.uf}</TableCell>
                <TableCell><Chip size="small" label={row.situacao_cadastral} /></TableCell>
                <TableCell>{row.cnae_principal}</TableCell>
                <TableCell>{row.telefone1}</TableCell>
                <TableCell>{row.status_crm || 'Não contatado'}</TableCell>
                <TableCell><Button size="small" onClick={() => openDetail(row.prospect_id)}>Abrir</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={pageSize}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[25,50,100]}
        />
      </TableContainer>

      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail?.razao_social}</DialogTitle>
        <DialogContent>
          {detail && (
            <Stack spacing={2} mt={1}>
              <Grid container spacing={2}>
                <Grid item xs={6}><b>CNPJ:</b> {detail.cnpj}</Grid>
                <Grid item xs={6}><b>Município:</b> {detail.municipio}/{detail.uf}</Grid>
                <Grid item xs={6}><b>Telefone:</b> {detail.telefone1 || '-'}</Grid>
                <Grid item xs={6}><b>E-mail:</b> {detail.email || '-'}</Grid>
                <Grid item xs={6}><b>Simples:</b> {detail.simples || '-'}</Grid>
                <Grid item xs={6}><b>MEI:</b> {detail.mei || '-'}</Grid>
              </Grid>
              <Typography variant="subtitle1" fontWeight={700}>Sócios</Typography>
              {(detail.socios || []).map((s: any) => (
                <Paper key={s.socio_id} variant="outlined" sx={{ p: 1.5 }}>
                  <Typography fontWeight={600}>{s.nome_socio_razao_social}</Typography>
                  <Typography variant="caption">{s.qualificacao || 'Qualificação não informada'}</Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

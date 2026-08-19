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
}

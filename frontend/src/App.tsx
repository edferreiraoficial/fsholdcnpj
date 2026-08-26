import { AppBar,Box,Button,Container,CssBaseline,Stack,Toolbar,Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import HealthBar from './components/HealthBar';
import DashboardPage from './pages/DashboardPage';
import ConsultPage from './pages/ConsultPage';
import ImportPage from './pages/ImportPage';
import EmailCampaignPage from './pages/EmailCampaignPage';
import DirectEmailPage from './pages/DirectEmailPage';

type Page='dashboard'|'consulta'|'importacao'|'email-direto'|'email';

export default function App(){
  const [page,setPage]=useState<Page>('dashboard');

  useEffect(()=>{
    const openDirect=()=>setPage('email-direto');
    window.addEventListener('fshold-open-direct-email',openDirect);
    return()=>window.removeEventListener('fshold-open-direct-email',openDirect);
  },[]);
  return<>
    <CssBaseline/>
    <AppBar position="static" color="inherit" elevation={0} sx={{borderBottom:1,borderColor:'divider'}}>
      <Toolbar>
        <Box sx={{flexGrow:1}}><Typography variant="h6" fontWeight={800}>FSHold CNPJ</Typography><Typography variant="caption" color="text.secondary">CRM de prospecção comercial</Typography></Box>
        <Stack direction="row" spacing={1}><Button onClick={()=>setPage('dashboard')}>Dashboard</Button><Button onClick={()=>setPage('consulta')}>Consultar base</Button><Button onClick={()=>setPage('importacao')}>Importar da Receita</Button><Button onClick={()=>setPage('email-direto')}>E-mail</Button><Button onClick={()=>setPage('email')}>Campanhas</Button></Stack>
      </Toolbar>
      <Box sx={{px:3,pb:1}}><HealthBar/></Box>
    </AppBar>
    <Container maxWidth={false} sx={{py:3,px:{xs:2,md:3,xl:4},width:'100%'}}>
      {page==='dashboard'&&<DashboardPage/>}
      {page==='consulta'&&<ConsultPage/>}
      {page==='importacao'&&<ImportPage/>}
      {page==='email-direto'&&<DirectEmailPage/>}
      {page==='email'&&<EmailCampaignPage/>}
    </Container>
  </>;
}

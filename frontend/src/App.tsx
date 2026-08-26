import {
  Box,CssBaseline,Divider,Drawer,IconButton,List,ListItemButton,ListItemIcon,ListItemText,Tooltip,Typography
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import MenuIcon from '@mui/icons-material/Menu';
import { useEffect,useState } from 'react';
import HealthBar from './components/HealthBar';
import DashboardPage from './pages/DashboardPage';
import ConsultPage from './pages/ConsultPage';
import ImportPage from './pages/ImportPage';
import EmailCampaignPage from './pages/EmailCampaignPage';
import DirectEmailPage from './pages/DirectEmailPage';

type Page='dashboard'|'consulta'|'importacao'|'email-direto'|'email';
const drawerOpen=214, drawerClosed=58;

export default function App(){
  const [page,setPage]=useState<Page>('dashboard');
  const [expanded,setExpanded]=useState(true);
  useEffect(()=>{
    const openDirect=()=>setPage('email-direto');
    window.addEventListener('fshold-open-direct-email',openDirect);
    return()=>window.removeEventListener('fshold-open-direct-email',openDirect);
  },[]);

  const items=[
    ['dashboard','Dashboard',<DashboardOutlinedIcon fontSize="small"/>],
    ['consulta','Consultar base',<SearchOutlinedIcon fontSize="small"/>],
    ['importacao','Importar Receita',<CloudDownloadOutlinedIcon fontSize="small"/>],
    ['email-direto','E-mail',<MailOutlineIcon fontSize="small"/>],
    ['email','Campanhas',<CampaignOutlinedIcon fontSize="small"/>]
  ] as const;

  const width=expanded?drawerOpen:drawerClosed;
  return <Box sx={{display:'flex',minHeight:'100vh'}}>
    <CssBaseline/>
    <Drawer variant="permanent" sx={{width,flexShrink:0,'& .MuiDrawer-paper':{width,boxSizing:'border-box',overflowX:'hidden',transition:'width .18s ease',background:'linear-gradient(180deg,#0b2f66 0%,#123f82 100%)',color:'#fff',borderRight:0}}}>
      <Box sx={{height:52,display:'flex',alignItems:'center',px:1,gap:1}}>
        <IconButton size="small" onClick={()=>setExpanded(v=>!v)} sx={{color:'#fff'}}>{expanded?<MenuOpenIcon/>:<MenuIcon/>}</IconButton>
        {expanded&&<Box sx={{minWidth:0}}><Typography fontSize={14} fontWeight={800} noWrap>FSHold CNPJ</Typography><Typography fontSize={10.5} sx={{color:'rgba(255,255,255,.7)'}} noWrap>Painel administrativo</Typography></Box>}
      </Box>
      <Divider sx={{borderColor:'rgba(255,255,255,.16)'}}/>
      <List dense sx={{px:.5,py:1}}>
        {items.map(([key,label,icon])=><Tooltip key={key} title={expanded?'':label} placement="right">
          <ListItemButton selected={page===key} onClick={()=>setPage(key)} sx={{minHeight:38,borderRadius:1.2,mb:.35,px:1,color:'#fff','& .MuiListItemIcon-root':{color:'rgba(255,255,255,.86)'},'&.Mui-selected':{backgroundColor:'rgba(64,144,255,.35)',borderLeft:'3px solid #ffc857'},'&.Mui-selected:hover':{backgroundColor:'rgba(64,144,255,.45)'},'&:hover':{backgroundColor:'rgba(255,255,255,.08)'}}}>
            <ListItemIcon sx={{minWidth:36}}>{icon}</ListItemIcon>
            {expanded&&<ListItemText primary={label} primaryTypographyProps={{fontSize:12.5,fontWeight:page===key?700:500}}/>}
          </ListItemButton>
        </Tooltip>)}
      </List>
      <Box sx={{mt:'auto',p:1}}><HealthBar compact={!expanded}/></Box>
    </Drawer>
    <Box component="main" sx={{flexGrow:1,minWidth:0,p:{xs:1,md:1.5},width:`calc(100% - ${width}px)`,transition:'width .18s ease'}}>
      {page==='dashboard'&&<DashboardPage/>}
      {page==='consulta'&&<ConsultPage/>}
      {page==='importacao'&&<ImportPage/>}
      {page==='email-direto'&&<DirectEmailPage/>}
      {page==='email'&&<EmailCampaignPage/>}
    </Box>
  </Box>;
}

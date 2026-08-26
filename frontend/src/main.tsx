import React from 'react';
import ReactDOM from 'react-dom/client';
import { createTheme,ThemeProvider } from '@mui/material/styles';
import App from './App';

const theme=createTheme({
  palette:{mode:'light',background:{default:'#f5f6f8'}},
  shape:{borderRadius:6},
  typography:{fontFamily:'Inter, Arial, sans-serif',fontSize:12.5,h5:{fontSize:'1.05rem'},h6:{fontSize:'.95rem'},body1:{fontSize:'.78rem'},body2:{fontSize:'.74rem'},caption:{fontSize:'.67rem'},button:{fontSize:'.72rem',textTransform:'none'}},
  components:{
    MuiPaper:{styleOverrides:{root:{backgroundImage:'none'}}},
    MuiButton:{defaultProps:{size:'small'},styleOverrides:{root:{minHeight:30,padding:'4px 10px'}}},
    MuiTextField:{defaultProps:{size:'small'}},
    MuiFormControl:{defaultProps:{size:'small'}},
    MuiInputBase:{styleOverrides:{root:{fontSize:12.5},input:{paddingTop:7,paddingBottom:7}}},
    MuiInputLabel:{styleOverrides:{root:{fontSize:12.5}}},
    MuiTableCell:{styleOverrides:{root:{fontSize:11.5,padding:'4px 7px',lineHeight:1.25},head:{fontWeight:700,whiteSpace:'nowrap'}}},
    MuiTableRow:{styleOverrides:{root:{height:30}}},
    MuiChip:{defaultProps:{size:'small'},styleOverrides:{root:{height:22,fontSize:10.5}}},
    MuiTab:{styleOverrides:{root:{minHeight:34,padding:'5px 10px',fontSize:11.5,textTransform:'none'}}},
    MuiTabs:{styleOverrides:{root:{minHeight:34}}},
    MuiDialogTitle:{styleOverrides:{root:{fontSize:15,padding:'10px 14px'}}},
    MuiDialogContent:{styleOverrides:{root:{padding:'10px 14px'}}}
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider theme={theme}><App/></ThemeProvider></React.StrictMode>
);

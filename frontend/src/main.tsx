import React from 'react';
import ReactDOM from 'react-dom/client';
import { createTheme,ThemeProvider } from '@mui/material/styles';
import App from './App';

const theme=createTheme({
  palette:{mode:'light',background:{default:'#f5f6f8'}},
  shape:{borderRadius:4},
  typography:{fontFamily:'Inter, Arial, sans-serif',fontSize:11.5,h5:{fontSize:'.98rem'},h6:{fontSize:'.88rem'},body1:{fontSize:'.72rem'},body2:{fontSize:'.69rem'},caption:{fontSize:'.62rem'},button:{fontSize:'.66rem',textTransform:'none'}},
  components:{
    MuiPaper:{styleOverrides:{root:{backgroundImage:'none'}}},
    MuiButton:{defaultProps:{size:'small'},styleOverrides:{root:{minHeight:25,padding:'2px 7px'}}},
    MuiTextField:{defaultProps:{size:'small'}},
    MuiFormControl:{defaultProps:{size:'small'}},
    MuiInputBase:{styleOverrides:{root:{fontSize:11.5,minHeight:29},input:{paddingTop:4,paddingBottom:4}}},
    MuiInputLabel:{styleOverrides:{root:{fontSize:11.5}}},
    MuiTableCell:{styleOverrides:{root:{fontSize:10.5,padding:'2px 5px',lineHeight:1.15},head:{fontWeight:700,whiteSpace:'nowrap'}}},
    MuiTableRow:{styleOverrides:{root:{height:24}}},
    MuiChip:{defaultProps:{size:'small'},styleOverrides:{root:{height:19,fontSize:9.5}}},
    MuiTab:{styleOverrides:{root:{minHeight:29,padding:'3px 8px',fontSize:10.5,textTransform:'none'}}},
    MuiTabs:{styleOverrides:{root:{minHeight:29}}},
    MuiDialogTitle:{styleOverrides:{root:{fontSize:15,padding:'10px 14px'}}},
    MuiDialogContent:{styleOverrides:{root:{padding:'10px 14px'}}}
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider theme={theme}><App/></ThemeProvider></React.StrictMode>
);

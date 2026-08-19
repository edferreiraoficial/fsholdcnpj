import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';

const theme = createTheme({
  palette: { mode: 'light', primary: { main: '#1f2937' }, secondary: { main: '#6b7280' } },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'Inter, Arial, sans-serif' }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider theme={theme}><CssBaseline/><App/></ThemeProvider></React.StrictMode>
);

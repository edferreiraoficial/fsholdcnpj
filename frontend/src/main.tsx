import React from 'react';
import ReactDOM from 'react-dom/client';
<<<<<<< HEAD
import { createTheme, ThemeProvider } from '@mui/material/styles';
import App from './App';

const theme = createTheme({
  palette: {
    mode: 'light',
    background: { default: '#f6f8fa' }
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, Arial, sans-serif'
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
=======
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';

const theme = createTheme({
  palette: { mode: 'light', primary: { main: '#1f2937' }, secondary: { main: '#6b7280' } },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'Inter, Arial, sans-serif' }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider theme={theme}><CssBaseline/><App/></ThemeProvider></React.StrictMode>
>>>>>>> 3e7226b891f18b3e217e275d808991e33931895b
);

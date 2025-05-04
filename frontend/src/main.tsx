import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import './style.css'; // Import any global styles

// Create a theme instance
const theme = createTheme({
  // Optional: customize theme if needed
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

// Use the newer createRoot API
const container = document.getElementById('root');

if (!container) {
  throw new Error('Failed to find the root element');
}

const root = ReactDOM.createRoot(container);

// Render with StrictMode for development benefits
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAppearance } from './hooks/useAppearance';
import './fonts/spectral.css';

// Load appearance from file before first render to avoid any flash.
initAppearance().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
});

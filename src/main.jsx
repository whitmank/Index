// Author: Claude Sonnet 4.6
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAppearance } from './hooks/useAppearance';
import './fonts/spectral.css';

initAppearance().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
});

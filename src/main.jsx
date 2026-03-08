import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAppearance } from './hooks/useAppearance';

initAppearance();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Le composant App.jsx qui importe votre code

// Optionnel, mais important si vous voulez le style (Tailwind CSS)
import './index.css'; 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
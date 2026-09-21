import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// Must load before every other stylesheet: it declares the values the rest consume.
import './styles/tokens.css';
import './index.css';
// Shared back-arrow control with no component of its own; imported here because a
// view mounted outside <Layout /> would not get it from generalStyles.css.
import './styles/backArrow.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

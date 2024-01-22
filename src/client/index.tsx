import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
dayjs.extend(utc)
dayjs.extend(relativeTime);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import './client/index.css';
import App from './client/App';
import reportWebVitals from './client/reportWebVitals';
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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

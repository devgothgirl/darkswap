import { createRoot } from 'react-dom/client';

import '@/lib/api';
import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// The server supplies public HTML and App seeds its query cache from that same
// public snapshot. Client takeover retains the existing interactive app; it does
// not depend on DOM hydration of time-sensitive provider labels.
createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

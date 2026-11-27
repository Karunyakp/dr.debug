import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KairosProvider } from './context/KairosContext';
import { ThemeProvider } from './context/ThemeContext';

// Google Maps Case A (Demo Key) two-tier quota defense registered before React renders
declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const joined = args
      .map((item) => (typeof item === 'string' ? item : item instanceof Error ? item.message : ''))
      .join(' ');
    if (joined.includes('OverQuotaMapError') || joined.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    originalConsoleError(...args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <KairosProvider>
          <App />
        </KairosProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);

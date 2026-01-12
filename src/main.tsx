import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { testVariousDocumentSizes } from './services/__tests__/testDocumentSizes'

// Expose test function to window for browser console access
if (typeof window !== 'undefined') {
  (window as any).testDocumentSizes = testVariousDocumentSizes;
  console.log('🧪 Test function available: window.testDocumentSizes()');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

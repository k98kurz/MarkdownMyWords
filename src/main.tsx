import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { PreferenceProvider } from './providers/PreferenceProvider';
import { PwaInstallProvider } from './contexts/PwaInstallContext';
import { gunService } from './services/gunService';
import { encryptionService } from './services/encryptionService';
import { testVariousDocumentSizes } from './test/testDocumentSizes';
import { testGunService } from './test/gunService.test';
import { testAuthStore } from './test/authStore.test';
import { testEncryptionService } from './test/encryptionService.test';
import { testFunctionalResult } from './test/functionalResult.test';
import { printTestSummary, type TestSuiteResult } from './dev/testRunner';
import { testDocumentStore } from './test/documentStore.test';
import { clearHolsterStorage, completePendingStorageClear } from './dev/clearHolsterStorage';
import { listUsers } from './dev/consoleTools';
import { useConnectionStore } from './stores/connectionStore';

// Initialize services
async function initializeServices() {
  try {
    // Must run before gunService.initialize() opens the IndexedDB
    // connection, otherwise a pending clear cannot delete the database.
    await completePendingStorageClear();
    gunService.initialize();
    console.log('✅ Holster initialized');

    const seaResult = await encryptionService.initializeSEA();
    if (seaResult.success) {
      console.log('✅ SEA initialized');
    } else {
      throw new Error(`SEA initialization failed: ${JSON.stringify(seaResult.error)}`);
    }

    const updateConnectionStatus = () => {
      const connectionStore = useConnectionStore.getState();
      connectionStore.updateConnectionStatus();
    };

    updateConnectionStatus();
    setInterval(updateConnectionStatus, 5000);
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

(async () => {
  try {
    await initializeServices();

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <PwaInstallProvider>
          <BrowserRouter>
            <PreferenceProvider>
              <App />
            </PreferenceProvider>
          </BrowserRouter>
        </PwaInstallProvider>
      </StrictMode>
    );
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="padding: 2rem; text-align: center;">
          <h1 style="color: #e53e3e;">Initialization Failed</h1>
          <p>Failed to initialize required services. Please check the console for details and refresh the page.</p>
        </div>
      `;
    }
  }
})();

async function runAllTests(): Promise<void> {
  console.log('🚀 Running All Tests\n');
  console.log('='.repeat(60));

  try {
    const allSuiteResults: TestSuiteResult[] = [];

    console.log('\n📦 Test Suite 1: Document Encryption Sizes\n');
    const docSizesResult = await testVariousDocumentSizes();
    allSuiteResults.push(docSizesResult);

    console.log('\n' + '='.repeat(60));

    console.log('\n📦 Test Suite 2: Holster Service\n');
    const gunResults = await testGunService();
    allSuiteResults.push(...gunResults);

    console.log('\n' + '='.repeat(60));

    console.log('\n📦 Test Suite 3: Auth Store\n');
    const authResult = await testAuthStore();
    allSuiteResults.push(authResult);

    console.log('\n' + '='.repeat(60));

    console.log('\n📦 Test Suite 4: Encryption Service\n');
    const encResults = await testEncryptionService();
    allSuiteResults.push(...encResults);

    console.log('\n' + '='.repeat(60));

    console.log('\n📦 Test Suite 5: Functional Result\n');
    const funcResults = await testFunctionalResult();
    allSuiteResults.push(...funcResults);

    console.log('\n' + '='.repeat(60));

    console.log('\n📦 Test Suite 6: Document Store\n');
    const docStoreResults = await testDocumentStore();
    allSuiteResults.push(...docStoreResults);

    console.log('\n' + '='.repeat(60));

    printTestSummary(allSuiteResults);
  } catch (error) {
    console.error('\n❌ Error running tests:', error);
    throw error;
  }
}

if (
  typeof window !== 'undefined' &&
  import.meta.env.VITE_APP_DEV_MODE === 'true'
) {
  // Dev tools: expose functions to window for browser console testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  win.testDocumentSizes = testVariousDocumentSizes;
  win.testGunService = testGunService;
  win.testAuthStore = testAuthStore;
  win.testEncryptionService = testEncryptionService;
  win.testFunctionalResult = testFunctionalResult;
  win.testDocumentStore = testDocumentStore;
  win.runAllTests = runAllTests;
  win.clearHolsterStorage = clearHolsterStorage;
  win.gunService = gunService;
  win.listUsers = listUsers;
  console.log('🧪 Dev console functions available:');
  console.log(
    '   - window.testDocumentSizes() - Test encryption with various document sizes'
  );
    console.log('   - window.testGunService() - Test Holster service operations');
  console.log('   - window.testAuthStore() - Test authentication store');
  console.log(
    '   - window.testEncryptionService() - Test encryption service (full test suite)'
  );
  console.log(
    '   - window.testFunctionalResult() - Test functional result utility (comprehensive suite)'
  );
  console.log(
    '   - window.testDocumentStore() - Test document store operations (full test suite)'
  );
  console.log('   - window.runAllTests() - Run all test suites');
    console.log('   - window.clearHolsterStorage(options) - Clear local Holster storage (reload to complete)');
  console.log(
    '   - window.listUsers(usernames) - List users by usernames array'
  );
}

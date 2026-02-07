import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from './providers/ThemeProvider';
import { gunService } from './services/gunService';
import { encryptionService } from './services/encryptionService';
import { testVariousDocumentSizes } from './test/testDocumentSizes';
import { testGunService } from './test/gunService.test';
import { testAuthStore } from './test/authStore.test';
import { testEncryptionService } from './test/encryptionService.test';
import { testFunctionalResult } from './test/functionalResult.test';
import { printTestSummary, type TestSuiteResult } from './utils/testRunner';
import { testNewGunSEAScheme } from './test/testNewGunSEAScheme';
import { testDocumentStore } from './test/documentStore.test';
import { clearGunDBLocalStorage } from './utils/clearGunDB';
import { listUsers } from './utils/consoleTools';
import { useConnectionStore } from './stores/connectionStore';

// Initialize services
async function initializeServices() {
  try {
    gunService.initialize();
    console.log('✅ GunDB initialized');

    const seaResult = await encryptionService.initializeSEA();
    if (seaResult.success) {
      console.log('✅ SEA initialized');
    } else {
      console.error('❌ Failed to initialize SEA:', seaResult.error);
    }

    const updateConnectionStatus = () => {
      const connectionStore = useConnectionStore.getState();
      connectionStore.updateConnectionStatus();
    };

    updateConnectionStatus();
    setInterval(updateConnectionStatus, 5000);
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
  }
}

initializeServices();

async function runAllTests(): Promise<void> {
  console.log('🚀 Running All Tests\n');
  console.log('='.repeat(60));

  try {
    const allSuiteResults: TestSuiteResult[] = [];

    console.log('\n📦 Test Suite 1: Document Encryption Sizes\n');
    const docSizesResult = await testVariousDocumentSizes();
    allSuiteResults.push(docSizesResult);

    console.log('\n' + '='.repeat(60));

    console.log('\n📦 Test Suite 2: GunDB Service\n');
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
  (window as any).testDocumentSizes = testVariousDocumentSizes;
  (window as any).testGunService = testGunService;
  (window as any).testAuthStore = testAuthStore;
  (window as any).testEncryptionService = testEncryptionService;
  (window as any).testFunctionalResult = testFunctionalResult;
  (window as any).testNewGunSEAScheme = testNewGunSEAScheme;
  (window as any).testDocumentStore = testDocumentStore;
  (window as any).runAllTests = runAllTests;
  (window as any).clearGunDB = clearGunDBLocalStorage;
  (window as any).gunService = gunService;
  (window as any).listUsers = listUsers;
  console.log('🧪 Dev console functions available:');
  console.log(
    '   - window.testDocumentSizes() - Test encryption with various document sizes'
  );
  console.log('   - window.testGunService() - Test GunDB service operations');
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
  console.log('   - window.clearGunDB(options) - Clear local GunDB storage');
  console.log(
    '   - window.listUsers(usernames) - List users by usernames array'
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);

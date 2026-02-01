import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { gunService } from './services/gunService';
import { encryptionService } from './services/encryptionService';
import { testVariousDocumentSizes } from './test/testDocumentSizes';
import { testGunService } from './test/gunService.test';
import { testAuthStore } from './test/authStore.test';
import { testEncryptionService } from './test/encryptionService.test';
import { testFunctionalResult } from './test/functionalResult.test';
import { printTestSummary, type TestSuiteResult } from './utils/testRunner';
//import { testNewGunSEAScheme } from './test/testNewGunSEAScheme'
import { clearGunDBLocalStorage } from './utils/clearGunDB';
import { useConnectionStore } from './stores/connectionStore';

// Initialize services
async function initializeServices() {
  try {
    // Initialize GunDB
    gunService.initialize();
    console.log('✅ GunDB initialized');

    // Initialize SEA
    await encryptionService.initializeSEA();
    console.log('✅ SEA initialized');

    // Set up connection status polling
    const updateConnectionStatus = () => {
      const connectionStore = useConnectionStore.getState();
      connectionStore.updateConnectionStatus();
    };

    // Initial update
    updateConnectionStatus();

    // Set up polling interval
    setInterval(updateConnectionStatus, 5000);
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
  }
}

// Initialize services before rendering app
initializeServices();

// Run all tests function
async function runAllTests(): Promise<void> {
  console.log('🚀 Running All Tests\n');
  console.log('='.repeat(60));

  try {
    const allSuiteResults: TestSuiteResult[] = [];

    // Test 1: Document encryption sizes
    console.log('\n📦 Test Suite 1: Document Encryption Sizes\n');
    const docSizesResult = await testVariousDocumentSizes();
    allSuiteResults.push(docSizesResult);

    console.log('\n' + '='.repeat(60));

    // Test 2: GunDB Service
    console.log('\n📦 Test Suite 2: GunDB Service\n');
    const gunResults = await testGunService();
    allSuiteResults.push(...gunResults);

    console.log('\n' + '='.repeat(60));

    // Test 3: Auth Store
    console.log('\n📦 Test Suite 3: Auth Store\n');
    const authResult = await testAuthStore();
    allSuiteResults.push(authResult);

    console.log('\n' + '='.repeat(60));

    // Test 4: Encryption Service
    console.log('\n📦 Test Suite 4: Encryption Service\n');
    const encResults = await testEncryptionService();
    allSuiteResults.push(...encResults);

    console.log('\n' + '='.repeat(60));

    // Test 5: Functional Result
    console.log('\n📦 Test Suite 5: Functional Result\n');
    const funcResults = await testFunctionalResult();
    allSuiteResults.push(...funcResults);

    console.log('\n' + '='.repeat(60));

    // Print overall summary
    printTestSummary(allSuiteResults);
  } catch (error) {
    console.error('\n❌ Error running tests:', error);
    throw error;
  }
}

// Expose functions to window for browser console access
if (typeof window !== 'undefined') {
  (window as any).testDocumentSizes = testVariousDocumentSizes;
  (window as any).testGunService = testGunService;
  (window as any).testAuthStore = testAuthStore;
  (window as any).testEncryptionService = testEncryptionService;
  (window as any).testFunctionalResult = testFunctionalResult;
  //(window as any).testNewGunSEAScheme = testNewGunSEAScheme;
  (window as any).runAllTests = runAllTests;
  (window as any).clearGunDB = clearGunDBLocalStorage;
  (window as any).gunService = gunService;
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
  //  console.log('   - window.testNewGunSEAScheme() - Test new GunDB + SEA security scheme');
  console.log('   - window.runAllTests() - Run all test suites');
  console.log('   - window.clearGunDB(options) - Clear local GunDB storage');
  //console.log('\n📋 Copy-paste examples:');
  //console.log('   window.runAllTests() - Run all tests');
  //console.log('   window.testDocumentSizes() - Test document encryption');
  //console.log('   window.testGunService() - Test GunDB service');
  //console.log('   window.testEncryptionService() - Test encryption service');
  //console.log('   window.testNewGunSEAScheme() - Test new GunDB + SEA scheme');
  //console.log('   window.clearGunDB().then(() => console.log("Cleared!"));');
  //console.log('   window.clearAllGunDBData().then(() => console.log("All cleared!"));');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

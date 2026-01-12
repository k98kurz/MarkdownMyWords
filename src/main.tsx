import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { gunService } from './services/gunService'
import { encryptionService } from './services/encryptionService'
import { testVariousDocumentSizes } from './services/__tests__/testDocumentSizes'
import { testGunService } from './services/__tests__/gunService.test'
import { testNonEphemeralECDH } from './services/__tests__/testNonEphemeralECDH'
import { listUsers, listUsersDetailed, getUserById, listSEAUsers } from './utils/listUsers'
import { clearGunDBLocalStorage, clearAllGunDBData } from './utils/clearGunDB'

// Initialize services
async function initializeServices() {
  try {
    // Initialize GunDB
    gunService.initialize();
    console.log('✅ GunDB initialized');

    // Initialize SEA
    await encryptionService.initializeSEA();
    console.log('✅ SEA initialized');
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
    // Test 1: Document encryption sizes
    console.log('\n📦 Test Suite 1: Document Encryption Sizes\n');
    await testVariousDocumentSizes();

    console.log('\n' + '='.repeat(60));

    // Test 2: GunDB Service
    console.log('\n📦 Test Suite 2: GunDB Service\n');
    await testGunService();

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ All test suites complete!');
  } catch (error) {
    console.error('\n❌ Error running tests:', error);
    throw error;
  }
}

// Expose functions to window for browser console access
if (typeof window !== 'undefined') {
  (window as any).testDocumentSizes = testVariousDocumentSizes;
  (window as any).testGunService = testGunService;
  (window as any).testNonEphemeralECDH = testNonEphemeralECDH;
  (window as any).runAllTests = runAllTests;
  (window as any).listUsers = listUsers;
  (window as any).listUsersDetailed = listUsersDetailed;
  (window as any).getUserById = getUserById;
  (window as any).listSEAUsers = listSEAUsers;
  (window as any).clearGunDB = clearGunDBLocalStorage;
  (window as any).clearAllGunDBData = clearAllGunDBData;
  console.log('🧪 Dev console functions available:');
  console.log('   - window.testDocumentSizes() - Test encryption with various document sizes');
  console.log('   - window.testGunService() - Test GunDB service operations');
  console.log('   - window.testNonEphemeralECDH() - Test ECDH with non-ephemeral public key');
  console.log('   - window.runAllTests() - Run all test suites');
  console.log('   - window.listUsers() - Returns array of all users (profiles + SEA)');
  console.log('   - window.listUsersDetailed() - Prints formatted user list');
  console.log('   - window.getUserById(userId) - Get specific user by ID');
  console.log('   - window.listSEAUsers() - List SEA-authenticated users only');
  console.log('   - window.clearGunDB(options) - Clear local GunDB storage');
  console.log('   - window.clearAllGunDBData() - Clear all GunDB data (alias)');
  console.log('\n📋 Copy-paste examples:');
  console.log('   window.runAllTests() - Run all tests');
  console.log('   window.testDocumentSizes() - Test document encryption');
  console.log('   window.testGunService() - Test GunDB service');
  console.log('   window.testNonEphemeralECDH() - Test non-ephemeral ECDH');
  console.log('   window.listUsers().then(users => console.log(users));');
  console.log('   window.listUsersDetailed().then(() => console.log("Done"));');
  console.log('   window.listSEAUsers().then(users => console.log(users));');
  console.log('   window.getUserById("user-id").then(user => console.log(user));');
  console.log('   window.clearGunDB().then(() => console.log("Cleared!"));');
  console.log('   window.clearAllGunDBData().then(() => console.log("All cleared!"));');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

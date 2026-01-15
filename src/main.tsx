import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { gunService } from './services/gunService'
import { encryptionService } from './services/encryptionService'
import { testVariousDocumentSizes } from './test/testDocumentSizes'
import { testGunService } from './test/gunService.test'
import { testEncryptionService } from './test/encryptionService.test'
//import { testNewGunSEAScheme } from './test/testNewGunSEAScheme'
import { listUsers, listUsersDetailed, getUserById } from './utils/listUsers'
import { clearGunDBLocalStorage } from './utils/clearGunDB'
import { useConnectionStore } from './stores/connectionStore'

// Initialize services
async function initializeServices() {
  try {
    // Initialize GunDB
    gunService.initialize()
    console.log('✅ GunDB initialized')

    // Initialize SEA
    await encryptionService.initializeSEA()
    console.log('✅ SEA initialized')

    // Set up connection status polling
    const updateConnectionStatus = () => {
      const connectionStore = useConnectionStore.getState()
      connectionStore.updateConnectionStatus()
    }

    // Initial update
    updateConnectionStatus()

    // Set up polling interval
    setInterval(updateConnectionStatus, 5000)
  } catch (error) {
    console.error('❌ Failed to initialize services:', error)
  }
}

// Initialize services before rendering app
initializeServices()

// Run all tests function
async function runAllTests(): Promise<void> {
  console.log('🚀 Running All Tests\n')
  console.log('='.repeat(60))

  try {
    // Test 1: Document encryption sizes
    console.log('\n📦 Test Suite 1: Document Encryption Sizes\n')
    await testVariousDocumentSizes()

    console.log('\n' + '='.repeat(60))

    // Test 2: GunDB Service
    console.log('\n📦 Test Suite 2: GunDB Service\n')
    await testGunService()

    console.log('\n' + '='.repeat(60))

    // Test 3: Encryption Service
    console.log('\n📦 Test Suite 3: Encryption Service\n')
    await testEncryptionService()

    console.log('\n' + '='.repeat(60))
    console.log('\n✅ All test suites complete!')
  } catch (error) {
    console.error('\n❌ Error running tests:', error)
    throw error
  }
}

// Expose functions to window for browser console access
if (typeof window !== 'undefined') {
  (window as any).testDocumentSizes = testVariousDocumentSizes;
  (window as any).testGunService = testGunService;
  (window as any).testEncryptionService = testEncryptionService;
//  (window as any).testNewGunSEAScheme = testNewGunSEAScheme;
  (window as any).runAllTests = runAllTests;
  (window as any).listUsers = listUsers;
  (window as any).listUsersDetailed = listUsersDetailed;
  (window as any).getUserById = getUserById;
  (window as any).clearGunDB = clearGunDBLocalStorage;
  (window as any).gunService = gunService;
  console.log('🧪 Dev console functions available:')
  console.log('   - window.testDocumentSizes() - Test encryption with various document sizes')
  console.log('   - window.testGunService() - Test GunDB service operations')
  console.log('   - window.testEncryptionService() - Test encryption service (full test suite)')
//  console.log('   - window.testNewGunSEAScheme() - Test new GunDB + SEA security scheme')
  console.log('   - window.runAllTests() - Run all test suites')
  console.log('   - window.listUsers() - Returns array of all users (profiles + SEA)')
  console.log('   - window.listUsersDetailed() - Prints formatted user list')
  console.log('   - window.getUserById(userId) - Get specific user by ID')
  console.log('   - window.clearGunDB(options) - Clear local GunDB storage')
//  console.log('\n📋 Copy-paste examples:')
//  console.log('   window.runAllTests() - Run all tests')
//  console.log('   window.testDocumentSizes() - Test document encryption')
//  console.log('   window.testGunService() - Test GunDB service')
//  console.log('   window.testEncryptionService() - Test encryption service')
//  console.log('   window.testNewGunSEAScheme() - Test new GunDB + SEA scheme')
//  console.log('   window.listUsers().then(users => console.log(users));')
//  console.log('   window.listUsersDetailed().then(() => console.log("Done"));')
//  console.log('   window.getUserById("user-id").then(user => console.log(user));')
//  console.log('   window.clearGunDB().then(() => console.log("Cleared!"));')
//  console.log('   window.clearAllGunDBData().then(() => console.log("All cleared!"));')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { gunService } from './services/gunService'
import { encryptionService } from './services/encryptionService'
import { testVariousDocumentSizes } from './services/__tests__/testDocumentSizes'
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

// Expose functions to window for browser console access
if (typeof window !== 'undefined') {
  (window as any).testDocumentSizes = testVariousDocumentSizes;
  (window as any).listUsers = listUsers;
  (window as any).listUsersDetailed = listUsersDetailed;
  (window as any).getUserById = getUserById;
  (window as any).listSEAUsers = listSEAUsers;
  (window as any).clearGunDB = clearGunDBLocalStorage;
  (window as any).clearAllGunDBData = clearAllGunDBData;
  console.log('🧪 Dev console functions available:');
  console.log('   - window.testDocumentSizes()');
  console.log('   - window.listUsers() - Returns array of all users (profiles + SEA)');
  console.log('   - window.listUsersDetailed() - Prints formatted user list');
  console.log('   - window.getUserById(userId) - Get specific user by ID');
  console.log('   - window.listSEAUsers() - List SEA-authenticated users only');
  console.log('   - window.clearGunDB(options) - Clear local GunDB storage');
  console.log('   - window.clearAllGunDBData() - Clear all GunDB data (alias)');
  console.log('\n📋 Copy-paste examples:');
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

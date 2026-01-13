/**
 * GunDB Service Browser Tests
 *
 * Tests for GunDB service operations that can be run from the browser console.
 */

import { gunService, GunService } from '../gunService'
import type { User, Document, GunError } from '../../types/gun'
import { GunErrorCode } from '../../types/gun'
import { TestRunner, printTestSummary, type TestSuiteResult } from '../../utils/testRunner'

/**
 * Test GunDB Service initialization
 */
async function testInitialization(): Promise<TestSuiteResult> {
  console.log('🧪 Testing GunDB Service Initialization...\n')

  const runner = new TestRunner('Initialization')

  await runner.run('Initialize service', async () => {
    gunService.initialize()
    const isReady = gunService.isReady()
    if (!isReady) {
      throw new Error('Service not ready')
    }
  })

  await runner.run('Check connection state', async () => {
    const connectionState = gunService.getConnectionState()
    console.log(`  Connection state: ${connectionState}`)
  })

  await runner.run('Get GunDB instance', async () => {
    const instance = gunService.getInstance()
    if (!instance) {
      throw new Error('Instance is null')
    }
  })

  await runner.run('Re-initialization warning', async () => {
    gunService.initialize()
  })

  console.log('\n✅ Initialization tests complete!')
  runner.printResults()
  return runner.getResults()
}

/**
 * Test user operations
 */
async function testUserOperations(): Promise<TestSuiteResult> {
  console.log('🧪 Testing User Operations...\n')

  const runner = new TestRunner('User Operations')

  const timestamp = Date.now()
  const testUsername = `testuser_${timestamp}`
  const testPassword = 'testpassword123'
  let seaUser: any = null

  await runner.run('Create SEA user', async () => {
    const user = await gunService.createSEAUser(testUsername, testPassword)
    if (!user || !user.pub) {
      throw new Error('No pub key returned')
    }
    seaUser = user
    console.log(`  User created: ${user.alias} (${user.pub.substring(0, 20)}...)`)
  })

  await runner.run('Put user profile', async () => {
    if (!seaUser) {
      throw new Error('User not created')
    }
    const userProfile: Partial<User> = {
      profile: {
        username: testUsername,
        publicKey: seaUser.pub,
      },
      settings: {
        theme: 'dark',
      },
    }
    await gunService.putUserProfile(seaUser.pub, userProfile)
    await new Promise(resolve => setTimeout(resolve, 800))
  })

  await runner.run('Get user by ID', async () => {
    if (!seaUser) {
      throw new Error('User not created')
    }
    const user = await gunService.getUser(seaUser.pub)
    if (!user) {
      throw new Error('User not found')
    }
    const hasProfile = user.profile !== undefined && user.profile !== null
    const hasUsername = user.profile?.username === testUsername
    const hasPublicKey = user.profile?.publicKey === seaUser.pub
    const hasSettings = user.settings !== undefined
    const hasTheme = user.settings?.theme === 'dark'

    if (!hasProfile || !hasUsername || !hasPublicKey || !hasSettings || !hasTheme) {
      const missing = []
      if (!hasProfile) missing.push('profile')
      if (!hasUsername) missing.push('username')
      if (!hasPublicKey) missing.push('publicKey')
      if (!hasSettings) missing.push('settings')
      if (!hasTheme) missing.push('theme')
      throw new Error(`Missing data: ${missing.join(', ')}`)
    }
    console.log(`  Username: ${user.profile.username}`)
    console.log(`  Theme: ${user.settings?.theme || 'N/A'}`)
  })

  await runner.run('Authenticate SEA user', async () => {
    const gun = gunService.getInstance()
    if (gun) {
      gun.user().leave()
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    const authUser = await gunService.authenticateSEAUser(testUsername, testPassword)
    if (!authUser || !authUser.pub) {
      throw new Error('No pub key returned')
    }
    console.log(`  User authenticated: ${authUser.alias}`)
  })

  console.log('\n✅ User operations tests complete!')
  runner.printResults()
  return runner.getResults()
}

/**
 * Test document operations
 */
async function testDocumentOperations(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Document Operations...\n')

  const runner = new TestRunner('Document Operations')

  const timestamp = Date.now()
  const docId = `testdoc_${timestamp}`
  const testContent = 'This is a test document'

  const document: Document = {
    metadata: {
      title: 'Test Document',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastModifiedBy: 'test-user',
    },
    encryptedContent: testContent,
    contentIV: 'test-iv',
    sharing: {
      owner: 'test-user',
      isPublic: false,
      readAccess: [],
      writeAccess: [],
    },
  }

  await runner.run('Create document', async () => {
    await gunService.createDocument(docId, document)
    await new Promise(resolve => setTimeout(resolve, 800))
  })

  await runner.run('Get document by ID', async () => {
    const retrievedDoc = await gunService.getDocument(docId)
    if (!retrievedDoc) {
      throw new Error('Document not found')
    }
    const hasMetadata = retrievedDoc.metadata !== undefined && retrievedDoc.metadata !== null
    const hasTitle = retrievedDoc.metadata?.title === 'Test Document'
    const hasEncryptedContent = retrievedDoc.encryptedContent === testContent
    const hasContentIV = retrievedDoc.contentIV === 'test-iv'
    const hasSharing = retrievedDoc.sharing !== undefined && retrievedDoc.sharing !== null
    const hasOwner = retrievedDoc.sharing?.owner === 'test-user'

    if (
      !hasMetadata ||
      !hasTitle ||
      !hasEncryptedContent ||
      !hasContentIV ||
      !hasSharing ||
      !hasOwner
    ) {
      const missing = []
      if (!hasMetadata) missing.push('metadata')
      if (!hasTitle) missing.push('title')
      if (!hasEncryptedContent) missing.push('encryptedContent')
      if (!hasContentIV) missing.push('contentIV')
      if (!hasSharing) missing.push('sharing')
      if (!hasOwner) missing.push('owner')
      throw new Error(`Missing data: ${missing.join(', ')}`)
    }
    console.log(`  Title: ${retrievedDoc.metadata.title}`)
    console.log(`  Content length: ${retrievedDoc.encryptedContent.length} chars`)
  })

  await runner.run('Update document', async () => {
    const updatedTitle = 'Updated Test Document'
    const updates: Partial<Document> = {
      metadata: {
        title: updatedTitle,
        createdAt: document.metadata.createdAt,
        updatedAt: Date.now(),
        lastModifiedBy: 'test-user',
      },
    }
    await gunService.updateDocument(docId, updates)
    await new Promise(resolve => setTimeout(resolve, 400))
    const updatedDoc = await gunService.getDocument(docId)

    if (!updatedDoc || updatedDoc.metadata?.title !== updatedTitle) {
      const actualTitle = updatedDoc?.metadata?.title || 'missing'
      throw new Error(`Title mismatch: got "${actualTitle}"`)
    }
    console.log(`  New title: ${updatedDoc.metadata.title}`)
  })

  await runner.run('List documents', async () => {
    const gun = gunService.getInstance()
    if (!gun || !gun.user().is) {
      throw new Error('Not authenticated')
    }
    const userId = gun.user().is!.pub
    const docList = await gunService.listDocuments(userId)
    console.log(`  Documents listed: ${docList.length} found`)
  })

  await runner.run('Delete document', async () => {
    await gunService.deleteDocument(docId)
  })

  console.log('\n✅ Document operations tests complete!')
  runner.printResults()
  return runner.getResults()
}

/**
 * Test subscriptions
 */
async function testSubscriptions(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Subscriptions...\n')

  const runner = new TestRunner('Subscriptions')

  const timestamp = Date.now()
  const docId = `testdoc_sub_${timestamp}`

  await runner.run('Subscribe to document', async () => {
    let subscriptionTriggered = false

    const unsubscribeDoc = gunService.subscribeToDocument(docId, doc => {
      subscriptionTriggered = true
      if (doc) {
        console.log(`  📡 Document update received: ${doc.metadata.title}`)
      } else {
        console.log('  📡 Document deleted')
      }
    })

    const document: Document = {
      metadata: {
        title: 'Subscription Test Document',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'test-user',
      },
      encryptedContent: 'test content',
      contentIV: 'test-iv',
      sharing: {
        owner: 'test-user',
        isPublic: false,
        readAccess: [],
        writeAccess: [],
      },
    }
    await gunService.createDocument(docId, document)
    await new Promise(resolve => setTimeout(resolve, 500))

    if (!subscriptionTriggered) {
      throw new Error('Subscription not triggered')
    }

    unsubscribeDoc()
    try {
      await gunService.deleteDocument(docId)
    } catch {}
  })

  await runner.run('Subscribe to user', async () => {
    const gun = gunService.getInstance()
    if (!gun || !gun.user().is) {
      throw new Error('Not authenticated')
    }

    const userId = gun.user().is!.pub
    let userSubscriptionTriggered = false

    const unsubscribeUser = gunService.subscribeToUser(userId, user => {
      userSubscriptionTriggered = true
      if (user) {
        console.log(`  📡 User update received: ${user.profile?.username || 'N/A'}`)
      }
    })

    await gunService.putUserProfile(userId, {
      profile: {
        username: 'updated-username',
      },
    })
    await new Promise(resolve => setTimeout(resolve, 500))

    if (!userSubscriptionTriggered) {
      throw new Error('Subscription not triggered')
    }

    unsubscribeUser()
  })

  console.log('\n✅ Subscription tests complete!')
  runner.printResults()
  return runner.getResults()
}

/**
 * Test error handling
 */
async function testErrorHandling(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Error Handling...\n')

  const runner = new TestRunner('Error Handling')

  await runner.run('Get non-existent user', async () => {
    const user = await gunService.getUser('non-existent-user-id')
    if (user !== null) {
      throw new Error('Expected null')
    }
  })

  await runner.run('Get non-existent document', async () => {
    const doc = await gunService.getDocument('non-existent-doc-id')
    if (doc !== null) {
      throw new Error('Expected null')
    }
  })

  await runner.run('Update non-existent document', async () => {
    try {
      await gunService.updateDocument('non-existent-doc-id', {
        metadata: {
          title: 'Updated',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'test',
        },
      })
      throw new Error('Update should have failed')
    } catch (error) {
      const gunError = error as GunError
      if (gunError.code !== GunErrorCode.NOT_FOUND) {
        throw new Error(`Expected NOT_FOUND error, got: ${gunError.message}`)
      }
    }
  })

  await runner.run('Operations without initialization', async () => {
    const uninitializedService = new GunService()
    try {
      await uninitializedService.getUser('test-id')
      throw new Error('Operation should have failed')
    } catch (error) {
      const gunError = error as GunError
      if (gunError.code !== GunErrorCode.CONNECTION_FAILED) {
        throw new Error(`Expected CONNECTION_FAILED error, got: ${gunError.message}`)
      }
    }
  })

  console.log('\n✅ Error handling tests complete!')
  runner.printResults()
  return runner.getResults()
}

/**
 * Test connection state management
 */
async function testConnectionState(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Connection State Management...\n')

  const runner = new TestRunner('Connection State')

  await runner.run('Get connection state', async () => {
    const state = gunService.getConnectionState()
    console.log(`  Connection state: ${state}`)
  })

  await runner.run('Check offline status', async () => {
    const isOffline = gunService.isOffline()
    console.log(`  Is offline: ${isOffline}`)
  })

  await runner.run('Retry connection', async () => {
    await gunService.retryConnection()
    const newState = gunService.getConnectionState()
    console.log(`  Connection retry completed, new state: ${newState}`)
  })

  console.log('\n✅ Connection state tests complete!')
  runner.printResults()
  return runner.getResults()
}

/**
 * Run all GunDB Service tests
 */
export async function testGunService(): Promise<void> {
  console.log('🚀 Starting GunDB Service Tests\n')
  console.log('='.repeat(60))

  // Check if a user is already logged in and log them out
  const gun = gunService.getInstance()
  if (gun) {
    const currentUser = gun.user()
    if (currentUser.is && currentUser.is.pub) {
      console.log(
        `\n📝 Pre-test: User already logged in (${currentUser.is.pub.substring(0, 20)}...), logging out...`
      )
      gun.user().leave()
      await new Promise(resolve => setTimeout(resolve, 500))
      console.log('   ✅ Logged out and waited 500ms\n')
    }
  }

  const suiteResults: TestSuiteResult[] = []

  const initResult = await testInitialization()
  suiteResults.push(initResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const userResult = await testUserOperations()
  suiteResults.push(userResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const docResult = await testDocumentOperations()
  suiteResults.push(docResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const subResult = await testSubscriptions()
  suiteResults.push(subResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const errorResult = await testErrorHandling()
  suiteResults.push(errorResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const connResult = await testConnectionState()
  suiteResults.push(connResult)
  console.log('\n' + '='.repeat(60))

  // Final cleanup: Log out any test user
  if (gun) {
    const finalUser = gun.user()
    if (finalUser.is && finalUser.is.pub) {
      console.log('\n📝 Cleanup: Logging out test user')
      gun.user().leave()
      console.log('   ✅ Logged out')
    }
  }

  // Print summary
  printTestSummary(suiteResults)
}

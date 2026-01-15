import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { AuthModal } from './components/AuthModal'
import { AuthComponent } from './components/AuthComponent'
import { ErrorModal } from './components/ErrorModal'
import { useErrorStore } from './stores/errorStore'
import { StatusBar } from './components/StatusBar'

function App() {
  const { isAuthenticated, isLoading, checkSession, logout, user } = useAuthStore()
  const { setError } = useErrorStore()
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Set up global error handlers
  useEffect(() => {
    // Handle unhandled errors
    const handleError = (event: ErrorEvent) => {
      setError(event.error || event.message)
    }

    // Handle unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      setError(event.reason)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [setError])

  // Check for existing session on mount
  useEffect(() => {
    checkSession().catch(error => {
      setError(error)
    })
  }, [checkSession, setError])

  // Show auth modal if not authenticated and not loading
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowAuthModal(true)
    } else {
      setShowAuthModal(false)
    }
  }, [isAuthenticated, isLoading])

  return (
    <div className="app">
      <header className="app-header">
        <h1>MarkdownMyWords</h1>
        {isAuthenticated && <AuthComponent user={user} onLogout={logout} />}
      </header>

      <main className="app-main">
        {isLoading ? (
          <div className="loading">Loading...</div>
        ) : isAuthenticated ? (
          <div className="app-content">
            <p>You are logged in! Your documents will appear here.</p>
          </div>
        ) : (
          <div className="app-content">
            <p>Please log in to continue.</p>
          </div>
        )}
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={isAuthenticated ? () => setShowAuthModal(false) : undefined}
        defaultTab="login"
      />

      <ErrorModal />

      <StatusBar />
    </div>
  )
}

export default App

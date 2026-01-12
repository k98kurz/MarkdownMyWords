import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { AuthModal } from './components/AuthModal';
import { ErrorModal } from './components/ErrorModal';
import { useErrorStore } from './stores/errorStore';

function App() {
  const { isAuthenticated, isLoading, checkSession, logout, user } = useAuthStore();
  const { setError } = useErrorStore();
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Set up global error handlers
  useEffect(() => {
    // Handle unhandled errors
    const handleError = (event: ErrorEvent) => {
      setError(event.error || event.message);
    };

    // Handle unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      setError(event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [setError]);

  // Check for existing session on mount
  useEffect(() => {
    checkSession().catch((error) => {
      setError(error);
    });
  }, [checkSession, setError]);

  // Show auth modal if not authenticated and not loading
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowAuthModal(true);
    } else {
      setShowAuthModal(false);
    }
  }, [isAuthenticated, isLoading]);

  // Get username from user object
  const getUsername = () => {
    if (!user) return null;
    const userIs = (user as any).is;
    if (userIs) {
      // Prefer alias if it exists and is not a public key
      if (userIs.alias && !userIs.alias.includes('.')) {
        return userIs.alias;
      }
      // Fallback to pub key (truncated) if no alias
      if (userIs.pub) {
        return userIs.pub.substring(0, 20) + '...';
      }
    }
    return null;
  };

  const username = getUsername();

  return (
    <div className="app">
      <header className="app-header">
        <h1>MarkdownMyWords</h1>
        {isAuthenticated && username && (
          <div className="user-info">
            <span>Welcome, {username}!</span>
            <button onClick={logout} className="logout-button">
              Logout
            </button>
          </div>
        )}
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
    </div>
  );
}

export default App;

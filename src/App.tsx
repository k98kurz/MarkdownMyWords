import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AuthModal } from './components/AuthModal';
import { AuthComponent } from './components/AuthComponent';
import { ErrorModal } from './components/ErrorModal';
import { useErrorStore } from './stores/errorStore';
import { StatusBar } from './components/StatusBar';
import { DocumentList } from './components/DocumentList';
import { DocumentEditor } from './components/DocumentEditor';
import { NotFound } from './components/NotFound';

function App() {
  const { isAuthenticated, isLoading, checkSession, logout, user, username } =
    useAuthStore();
  const { setError } = useErrorStore();
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setError(event.error || event.message);
    };

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

  useEffect(() => {
    checkSession().catch(error => {
      setError(error);
    });
  }, [checkSession, setError]);

  useEffect(() => {
    if (isAuthenticated) {
      setShowAuthModal(false);
    } else {
      setShowAuthModal(true);
    }
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen pb-12">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-xl font-semibold text-card-foreground">
          MarkdownMyWords
        </h1>
        {isAuthenticated && (
          <AuthComponent user={user} username={username} onLogout={logout} />
        )}
      </header>

      <main>
        {isLoading ? (
          <div className="px-8 py-16 text-center text-lg">Loading...</div>
        ) : isAuthenticated ? (
          <div className="px-8 py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/docs" replace />} />
              <Route path="/docs" element={<DocumentList />} />
              <Route path="/doc/new" element={<DocumentEditor />} />
              <Route path="/doc/:docId" element={<DocumentEditor />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        ) : (
          <div className="px-8 py-16 text-center">
            <p className="text-lg text-muted-foreground">
              Please log in to continue.
            </p>
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
  );
}

export default App;

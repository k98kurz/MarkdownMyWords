import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AuthModal } from './components/AuthModal';
import { AuthComponent } from './components/AuthComponent';
import { SettingsModal } from './components/SettingsModal';
import { ErrorModal } from './components/ErrorModal';
import { useErrorStore } from './stores/errorStore';
import { StatusBar } from './components/StatusBar';
import { DocumentList } from './components/DocumentList';
import { DocumentEditor } from './components/DocumentEditor';
import { NotFound } from './components/NotFound';
import { HomePage } from './components/HomePage';
import { AppWidthProvider, useAppWidth } from './contexts/AppWidthContext';

function AppContent() {
  const { appWidth, setAppWidth } = useAppWidth();
  const { isAuthenticated, isLoading, checkSession, logout, user, username } =
    useAuthStore();
  const { setError } = useErrorStore();
  const location = useLocation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [defaultTab, setDefaultTab] = useState<'login' | 'register'>('login');

  const handleOpenAuthModal = (tab: 'login' | 'register') => {
    setDefaultTab(tab);
    setShowAuthModal(true);
  };

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
      const isDocumentRoute = location.pathname.match(/^\/doc\/[^/]+\/[^/]+$/);
      const isHomePage = location.pathname === '/';
      setShowAuthModal(!isDocumentRoute && !isHomePage);
    }
  }, [isAuthenticated, location.pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      setAppWidth('80rem');
    }
  }, [isAuthenticated, setAppWidth]);

  return (
    <div
      className="min-h-screen mx-auto"
      style={{ maxWidth: appWidth } as React.CSSProperties}
    >
      <header className="flex items-center justify-between border-b border-border-20 px-6 py-4">
        <Link to="/">
          <h1 className="text-xl font-semibold text-card-foreground">
            MarkdownMyWords
          </h1>
        </Link>
        <AuthComponent
          user={user}
          username={username}
          onLogout={logout}
          isAuthenticated={isAuthenticated}
          onLogin={!isAuthenticated ? () => setShowAuthModal(true) : undefined}
          onOpenSettings={() => setShowSettingsModal(true)}
        />
      </header>

      <main>
        {isLoading ? (
          <div className="px-8 py-16 text-center text-lg">Loading...</div>
        ) : (
          <div className="px-4 py-4 md:px-8">
            <Routes>
              {/* Public document route - accessible to guests */}
              <Route path="/doc/:userPub/:docId" element={<DocumentEditor />} />

              {/* Authenticated-only routes */}
              {isAuthenticated ? (
                <>
                  <Route
                    path="/"
                    element={<HomePage onOpenAuthModal={handleOpenAuthModal} />}
                  />
                  <Route path="/docs" element={<DocumentList />} />
                  <Route path="/doc/new" element={<DocumentEditor />} />
                </>
              ) : (
                <Route
                  path="/"
                  element={<HomePage onOpenAuthModal={handleOpenAuthModal} />}
                />
              )}

              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        )}
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultTab={defaultTab}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      <ErrorModal />

      <StatusBar />
    </div>
  );
}

function App() {
  return (
    <AppWidthProvider>
      <AppContent />
    </AppWidthProvider>
  );
}

export default App;

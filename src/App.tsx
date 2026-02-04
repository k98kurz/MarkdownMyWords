import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useDocumentStore } from './stores/documentStore';
import { AuthModal } from './components/AuthModal';
import { AuthComponent } from './components/AuthComponent';
import { ErrorModal } from './components/ErrorModal';
import { useErrorStore } from './stores/errorStore';
import { StatusBar } from './components/StatusBar';
import { DocumentList } from './components/DocumentList';
import { DocumentEditor } from './components/DocumentEditor';

function App() {
  const { isAuthenticated, isLoading, checkSession, logout, user } =
    useAuthStore();
  const { setError } = useErrorStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [currentDocId, setCurrentDocId] = useState<string | undefined>(
    undefined
  );
  const {
    status: docStatus,
    error: docError,
    listDocuments,
    clearError: clearDocError,
    clearCurrentDocument,
  } = useDocumentStore();

  // Set up global error handlers
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

  // Check for existing session on mount
  useEffect(() => {
    checkSession().catch(error => {
      setError(error);
    });
  }, [checkSession, setError]);

  // Load documents when user authenticates
  useEffect(() => {
    if (isAuthenticated) {
      listDocuments().catch(err => {
        if (err.code !== 'NETWORK_ERROR') {
          setError(err.message);
        }
      });
    }
  }, [isAuthenticated, listDocuments, setError]);

  // Show auth modal if not authenticated
  // Keep modal open during loading and only close on successful authentication
  useEffect(() => {
    if (isAuthenticated) {
      setShowAuthModal(false);
    } else {
      setShowAuthModal(true);
    }
  }, [isAuthenticated]);

  const handleRetry = () => {
    clearDocError();
    listDocuments();
  };

  const handleCreateNew = () => {
    clearCurrentDocument();
    setCurrentDocId(undefined);
    setView('editor');
  };

  const handleDocumentSelect = (docId: string) => {
    setCurrentDocId(docId);
    setView('editor');
  };

  const handleCloseEditor = async () => {
    clearCurrentDocument();
    setView('list');
    setCurrentDocId(undefined);
    await listDocuments();
  };

  const renderDocumentStatus = () => {
    if (docStatus === 'LOADING' && view === 'list') {
      return <div className="loading">Loading documents...</div>;
    }
    if (docError) {
      return (
        <div className="error">
          <p>{docError}</p>
          <button onClick={handleRetry}>Retry</button>
        </div>
      );
    }
    if (docStatus === 'SAVING') {
      return <div className="saving">Saving...</div>;
    }
    return null;
  };

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
            {renderDocumentStatus()}
            <>
              {view === 'list' ? (
                <DocumentList
                  onDocumentSelect={handleDocumentSelect}
                  onCreateNew={handleCreateNew}
                />
              ) : (
                <DocumentEditor
                  docId={currentDocId}
                  onClose={handleCloseEditor}
                />
              )}
            </>
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
  );
}

export default App;

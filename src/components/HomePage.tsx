import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { usePwaInstall } from '@/contexts/PwaInstallContext';

interface HomePageProps {
  onOpenAuthModal: (tab: 'login' | 'register') => void;
}

export function HomePage({ onOpenAuthModal }: HomePageProps) {
  const { isAuthenticated } = useAuthStore();
  const { canInstall, promptInstall, isInstalled, isInstalling } =
    usePwaInstall();

  if (isAuthenticated) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
        <p className="mb-6 text-muted-foreground">
          This dashboard doesn't have anything yet
        </p>
        <Link to="/docs">
          <Button variant="primary" size="lg">
            Go to Documents
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
        <h1 className="mb-6 text-3xl font-bold text-card-foreground text-center">
          Encrypted Markdown Editor
        </h1>

        <ul className="mb-8 space-y-3 text-lg text-card-foreground text-center">
          <li>• End-to-end encrypted document storage</li>
          <li>• Markdown with live preview and Mermaid diagram support</li>
          <li>• Share documents securely with password/key protection</li>
          <li>
            • Coming eventually: collaborative editing and AI review/revise via
            OpenRouter
          </li>
        </ul>

        {canInstall && (
          <div className="mb-6 flex items-center justify-center">
            <Button
              onClick={promptInstall}
              disabled={isInstalled || isInstalling}
              variant="ghost"
              size="md"
              className="gap-2"
            >
              {isInstalling ? (
                <Spinner size="sm" />
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4v4"
                  />
                </svg>
              )}
              {isInstalled ? 'Installed' : 'Install Web App'}
            </Button>
          </div>
        )}

        <div className="mb-8 flex gap-6 text-lg">
          <a
            href="https://github.com/k98kurz/MarkdownMyWords"
            target="_blank"
            rel="noopener noreferrer"
          >
            Repository
          </a>
          <Link to="/readme">Readme</Link>
          <a
            href="https://pycelium.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Pycelium Project Homepage
          </a>
        </div>

        <div className="flex gap-4">
          <Button variant="primary" onClick={() => onOpenAuthModal('login')}>
            Login
          </Button>
          <Button
            variant="secondary"
            onClick={() => onOpenAuthModal('register')}
          >
            Register
          </Button>
        </div>

        <h2 className="mt-8 mb-3 text-lg text-card-foreground">
          Migration Notice
        </h2>
        <p className="mb-3 text-center">
          This app has switched from GunDB to Holster. GunDB was fundamentally
          flawed and ultimately unusable: it stored everything in localStorage
          and ignored the configuration to use IndexedDB; this resulted in the
          entire app breaking in May 2026. The replacement for GunDB, Holster,
          which is actively maintained (in contrast to GunDB), has resolved
          these issues. The app now works properly with IndexedDB and should not
          break as easily. However, if you used this app previously, your
          localStorage might be full of old GunDB crap.
        </p>
        <p className="text-center">
          If you have any problems, use the button in the Settings modal (top
          right) to clear localStorage.
        </p>
      </div>
    </>
  );
}

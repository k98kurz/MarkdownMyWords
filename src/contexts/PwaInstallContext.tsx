import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';

interface UserChoice {
  outcome: 'accepted' | 'dismissed';
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<UserChoice>;
  userChoice: Promise<UserChoice>;
  platforms: string[];
}

interface PwaInstallContextType {
  canInstall: boolean;
  promptInstall: () => Promise<void>;
  isInstalled: boolean;
  isInstalling: boolean;
}

const PwaInstallContext = createContext<PwaInstallContextType | undefined>(
  undefined
);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
      console.log('✅ beforeinstallprompt event captured');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      console.log('✅ PWA installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    console.log('🧪 PWA install listeners set up');

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt || isInstalled || isInstalling) {
      console.log(
        '⚠️ Cannot install: no prompt or already installed/installing'
      );
      return;
    }

    setIsInstalling(true);
    try {
      const result = await deferredPrompt.prompt();
      console.log(`Install prompt was: ${result.outcome}`);
    } catch (error) {
      console.error('❌ Failed to install PWA:', error);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const value: PwaInstallContextType = {
    canInstall,
    promptInstall,
    isInstalled,
    isInstalling,
  };

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (context === undefined) {
    throw new Error('usePwaInstall must be used within PwaInstallProvider');
  }
  return context;
}

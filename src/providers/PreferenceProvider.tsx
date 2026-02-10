import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';

export interface EditorPreferences {
  syntaxHighlightingEnabled: boolean;
}

interface PreferenceContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  editorPreferences: EditorPreferences;
  setEditorPreference: <K extends keyof EditorPreferences>(
    key: K,
    value: EditorPreferences[K]
  ) => void;
}

const PreferenceContext = createContext<PreferenceContextType | undefined>(
  undefined
);

export function PreferenceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    return stored || 'system';
  });
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');
  const [editorPreferences, setEditorPreferencesState] =
    useState<EditorPreferences>(() => {
      const stored = localStorage.getItem('editorPreferences');
      if (stored) {
        try {
          return JSON.parse(stored) as EditorPreferences;
        } catch {
          return { syntaxHighlightingEnabled: true };
        }
      }
      return { syntaxHighlightingEnabled: true };
    });

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      let effectiveTheme: 'light' | 'dark';
      if (theme === 'system') {
        effectiveTheme = mediaQuery.matches ? 'dark' : 'light';
      } else {
        effectiveTheme = theme;
      }
      setResolvedTheme(effectiveTheme);

      if (effectiveTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    const handleChange = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const setEditorPreference = <K extends keyof EditorPreferences>(
    key: K,
    value: EditorPreferences[K]
  ) => {
    setEditorPreferencesState(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('editorPreferences', JSON.stringify(next));
      return next;
    });
  };

  return (
    <PreferenceContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        editorPreferences,
        setEditorPreference,
      }}
    >
      {children}
    </PreferenceContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferenceContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferenceProvider');
  }
  return context;
}

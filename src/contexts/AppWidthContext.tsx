import { createContext, useContext, useState, type ReactNode } from 'react';

interface AppWidthContextType {
  appWidth: string;
  setAppWidth: (width: string) => void;
}

const AppWidthContext = createContext<AppWidthContextType | undefined>(
  undefined
);

interface AppWidthProviderProps {
  children: ReactNode;
  defaultWidth?: string;
}

export function AppWidthProvider({
  children,
  defaultWidth = '80rem',
}: AppWidthProviderProps) {
  const [appWidth, setAppWidth] = useState<string>(defaultWidth);

  return (
    <AppWidthContext.Provider value={{ appWidth, setAppWidth }}>
      {children}
    </AppWidthContext.Provider>
  );
}

export function useAppWidth(): AppWidthContextType {
  const context = useContext(AppWidthContext);
  if (context === undefined) {
    throw new Error('useAppWidth must be used within an AppWidthProvider');
  }
  return context;
}

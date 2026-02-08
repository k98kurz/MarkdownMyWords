interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function Select({ className, error, children, ...props }: SelectProps) {
  return (
    <select
      className={`w-full rounded-md border border-border-20 bg-background-5 px-3 py-2 text-sm text-card-foreground transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 focus:bg-background-10 ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : ''} ${className || ''}`}
      {...props}
    >
      {children}
    </select>
  );
}

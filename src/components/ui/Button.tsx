interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary:
      'bg-primary text-white hover:bg-primary-hover focus:ring-offset-background',
    secondary:
      'bg-secondary-bg-10 text-foreground-90 border border-secondary-bg-20 hover:bg-secondary-bg-15 focus:ring-offset-background',
    ghost:
      'text-card-foreground hover:bg-muted-10 focus:ring-offset-background',
    danger:
      'bg-destructive text-destructive-foreground hover:bg-destructive-20 focus:ring-offset-background',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className || ''}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-white" />
      )}
      {children}
    </button>
  );
}

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
      'bg-primary-600 text-white hover:bg-primary-700 focus:ring-offset-slate-900 dark:focus:ring-offset-slate-950',
    secondary:
      'bg-slate-100 text-slate-900 hover:bg-slate-200 focus:ring-offset-white dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-950',
    ghost:
      'hover:bg-slate-100 text-slate-700 focus:ring-offset-white dark:hover:bg-slate-800 dark:text-slate-300 dark:focus:ring-offset-slate-950',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 focus:ring-offset-slate-900 dark:focus:ring-offset-slate-950',
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

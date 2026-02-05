interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'danger' | 'success';
  children: React.ReactNode;
}

export function Badge({
  variant = 'default',
  className,
  children,
  ...props
}: BadgeProps) {
  const variantClasses = {
    default:
      'bg-primary-10 border border-primary-25 text-primary dark:text-primary-300',
    primary:
      'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
    danger: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
    success:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${variantClasses[variant]} ${className || ''}`}
      {...props}
    >
      {children}
    </span>
  );
}

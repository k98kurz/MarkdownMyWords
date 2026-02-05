interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
  children: React.ReactNode;
}

export function Label({ className, htmlFor, children, ...props }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-1.5 block text-sm font-medium text-card-foreground-90 ${className || ''}`}
      {...props}
    >
      {children}
    </label>
  );
}

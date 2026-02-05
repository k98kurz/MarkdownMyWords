import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
      <h1 className="mb-4 text-4xl font-bold text-card-foreground">
        404 - Not Found
      </h1>
      <p className="mb-8 text-lg text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <Link
        to="/"
        className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#535bf2]"
        style={{ backgroundColor: '#646cff' }}
      >
        Start Over
      </Link>
    </div>
  );
}

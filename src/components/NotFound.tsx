import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="not-found">
      <h1>404 - Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <Link to="/" className="primary">
        Start Over
      </Link>
    </div>
  );
}

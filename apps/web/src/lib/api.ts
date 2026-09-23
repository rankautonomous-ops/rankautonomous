/**
 * Resolves the backend API URL across environments (SSR, Browser, Local, Netlify).
 * Ensures that production builds on Netlify automatically route to Render if
 * env vars were not explicitly populated, while local development continues
 * to point to localhost:4000.
 */
export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    return isLocal
      ? 'http://localhost:4000'
      : 'https://rankautonomous-api.onrender.com';
  }

  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://rankautonomous-api.onrender.com'
      : 'http://localhost:4000')
  );
}

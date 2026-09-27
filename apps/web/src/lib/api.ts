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

import { createClient } from './supabase/client';

let refreshPromise: Promise<string | null> | null = null;

/**
 * A centralized wrapper for API fetch requests.
 * Automatically injects the Authorization Bearer token from Supabase.
 * If a 401 Unauthorized is returned, it attempts to refresh the session exactly once.
 * Uses a single-flight promise to prevent concurrent 401 requests from triggering multiple refreshes.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  
  const apiUrl = getApiUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint}`;
  
  const makeRequest = async (token: string | null) => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, { ...options, headers });
  };
  
  let response = await makeRequest(data.session?.access_token || null);
  
  // If we receive a 401, it means the token is missing, expired, or invalid.
  if (response.status === 401 && data.session) {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const { data: refreshData, error } = await supabase.auth.refreshSession();
          if (error || !refreshData.session) {
            await supabase.auth.signOut();
            if (typeof window !== 'undefined') {
              window.location.href = `/login?redirectTo=${encodeURIComponent(window.location.pathname)}&expired=true`;
            }
            return null;
          }
          return refreshData.session.access_token;
        } finally {
          refreshPromise = null;
        }
      })();
    }
    
    const newToken = await refreshPromise;
    if (newToken) {
      // Retry request exactly once with the new token
      response = await makeRequest(newToken);
    }
  }
  
  return response;
}

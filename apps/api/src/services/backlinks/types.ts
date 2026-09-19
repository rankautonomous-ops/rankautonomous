export type FetchErrorCode = 
  | 'TIMEOUT'
  | 'SSRF_BLOCKED'
  | 'ROBOTS_BLOCKED'
  | 'TOO_LARGE'
  | 'TOO_MANY_REDIRECTS'
  | 'DNS_FAILURE'
  | 'UNSUPPORTED_PROTOCOL'
  | 'INVALID_URL'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface FetchResult {
  /** Indicates if the fetch completed a successful HTTP request, even if it's a 4xx/5xx status */
  success: boolean;
  
  /** The final URL after resolving any redirects */
  finalUrl: string;
  
  /** HTTP Status Code (e.g. 200, 404, 500), undefined if request never completed */
  statusCode?: number;
  
  /** Response Content-Type header (e.g. text/html, application/pdf) */
  contentType?: string;
  
  /** The text body of the response (if allowed to read) */
  body?: string;
  
  /** Number of redirects followed during the fetch */
  redirectCount: number;
  
  /** The structured error code if success is false */
  errorCode?: FetchErrorCode;
  
  /** The raw error message string */
  errorMessage?: string;
}

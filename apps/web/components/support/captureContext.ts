/**
 * Auto-captures portal/page/user context for support tickets.
 * Designed for extraction into a shared support plugin.
 */

export interface CapturedContext {
  portalKey: string;
  environment: string;
  pageUrl: string;
  pageRoute: string;
  pageTitle: string;
  browserInfo: {
    userAgent: string;
    language: string;
    platform: string;
    vendor: string;
  };
  viewportInfo: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  consoleErrors: string[];
  failedApiRequests: FailedRequest[];
  timestamp: string;
}

export interface FailedRequest {
  url: string;
  method: string;
  status: number | string;
  timestamp: string;
}

// ─── Console Error Capture ─────────────────────────────
const recentErrors: string[] = [];
const MAX_ERRORS = 10;

if (typeof window !== 'undefined') {
  const origError = console.error;
  console.error = (...args: any[]) => {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    recentErrors.push(msg.substring(0, 500));
    if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
    origError.apply(console, args);
  };

  // Capture unhandled errors
  window.addEventListener('error', (e) => {
    recentErrors.push(`[Unhandled] ${e.message} at ${e.filename}:${e.lineno}`);
    if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
  });
}

// ─── Failed API Request Capture ────────────────────────
const recentFailedRequests: FailedRequest[] = [];
const MAX_FAILED_REQUESTS = 5;

if (typeof window !== 'undefined') {
  const origFetch = window.fetch;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await origFetch(...args);
    if (!response.ok) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const method = (args[1]?.method || 'GET').toUpperCase();
      // Only capture API requests, not static assets
      if (url.includes('/v1/') || url.includes('/api/')) {
        recentFailedRequests.push({
          url: url.replace(/https?:\/\/[^/]+/, ''), // Strip origin
          method,
          status: response.status,
          timestamp: new Date().toISOString(),
        });
        if (recentFailedRequests.length > MAX_FAILED_REQUESTS) recentFailedRequests.shift();
      }
    }
    return response;
  };
}

// ─── Main Capture Function ─────────────────────────────
export function captureContext(): CapturedContext {
  const isProduction = typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    !window.location.hostname.includes('127.0.0.1');

  return {
    portalKey: 'pharmaopsflow',
    environment: isProduction ? 'production' : 'development',
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    pageRoute: typeof window !== 'undefined' ? window.location.pathname : '',
    pageTitle: typeof document !== 'undefined' ? document.title : '',
    browserInfo: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      language: typeof navigator !== 'undefined' ? navigator.language : '',
      platform: typeof navigator !== 'undefined' ? navigator.platform : '',
      vendor: typeof navigator !== 'undefined' ? navigator.vendor : '',
    },
    viewportInfo: {
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    },
    consoleErrors: [...recentErrors],
    failedApiRequests: [...recentFailedRequests],
    timestamp: new Date().toISOString(),
  };
}

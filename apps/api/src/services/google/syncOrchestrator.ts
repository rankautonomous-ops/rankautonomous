import { syncAnalyticsForWebsite } from './syncGa4';
import { syncSearchConsoleForWebsite } from './syncGsc';

/**
 * Orchestrates the synchronization of all active Google integrations for a website.
 * Runs each provider sync independently so that one failure does not halt the other.
 */
export async function syncGoogleIntegrations(websiteId: string, userId: string) {
  // We run both syncs. If an integration doesn't exist or isn't active,
  // the individual sync function will safely return a "not connected" or "inactive" status.
  
  const [searchConsoleResult, analyticsResult] = await Promise.all([
    syncSearchConsoleForWebsite(websiteId, userId).catch((err) => ({
      success: false,
      status: 'ERROR',
      error: err.message || 'Unexpected orchestrator error',
    })),
    syncAnalyticsForWebsite(websiteId, userId).catch((err) => ({
      success: false,
      status: 'ERROR',
      error: err.message || 'Unexpected orchestrator error',
    })),
  ]);

  return {
    success: searchConsoleResult.success || analyticsResult.success,
    websiteId,
    searchConsole: searchConsoleResult,
    analytics: analyticsResult,
  };
}

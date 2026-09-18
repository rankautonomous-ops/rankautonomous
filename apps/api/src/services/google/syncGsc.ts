import prisma from '../../lib/database';
import {
  GOOGLE_PROVIDERS,
  GoogleIntegrationConfig,
  GoogleOAuthError,
  getValidAccessTokenForIntegration,
  performRequest,
} from './index';

/**
 * Synchronizes Google Search Console performance data for a specific website.
 */
export async function syncSearchConsoleForWebsite(websiteId: string, userId: string) {
  const integration = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: GOOGLE_PROVIDERS.SEARCH_CONSOLE,
      },
    },
    include: {
      website: true,
    },
  });

  if (!integration) {
    return { success: false, reason: 'NOT_CONNECTED' };
  }

  if (integration.website.userId !== userId) {
    throw new GoogleOAuthError('Unauthorized', 'UNAUTHORIZED', 403);
  }

  if (integration.status !== 'ACTIVE') {
    return { success: false, reason: 'INTEGRATION_INACTIVE' };
  }

  const config = (integration.config as unknown as GoogleIntegrationConfig) || {};
  if (!config.selectedProperty) {
    return { success: false, reason: 'NO_PROPERTY_SELECTED' };
  }

  const siteUrl = config.selectedProperty;

  try {
    // 1. Mark as syncing
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncStatus: 'SYNCING',
      },
    });

    // 2. Get Access Token
    const accessToken = await getValidAccessTokenForIntegration(integration.id);

    // 3. Define date range (Last 30 days)
    const endDate = new Date();
    // Offset endDate by 2 days because GSC data usually has a 2-day delay
    endDate.setDate(endDate.getDate() - 2);
    
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    const startYMD = startDate.toISOString().split('T')[0];
    const endYMD = endDate.toISOString().split('T')[0];

    // 4. Fetch from API
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const res = await performRequest(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: startYMD,
        endDate: endYMD,
        dimensions: ['date', 'query', 'page', 'device', 'country'],
        rowLimit: 25000,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Google API returned ${res.status}: ${errData?.error?.message || 'Unknown error'}`);
    }

    const data = await res.json();
    const rows = data.rows || [];

    let processedCount = 0;

    if (rows.length > 0) {
      // Chunk the updates to avoid huge transactions
      const chunkSize = 1000;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        
        await prisma.$transaction(
          chunk.map((row: any) => {
            const dateStr = row.keys[0]; // e.g. "2023-09-01"
            const query = row.keys[1];
            const page = row.keys[2];
            const device = row.keys[3];
            const country = row.keys[4];

            return prisma.searchPerformanceRecord.upsert({
              where: {
                websiteId_date_query_page_device_country: {
                  websiteId,
                  date: new Date(dateStr),
                  query,
                  page,
                  device,
                  country,
                },
              },
              update: {
                clicks: row.clicks || 0,
                impressions: row.impressions || 0,
                ctr: row.ctr || 0,
                position: row.position || 0,
              },
              create: {
                websiteId,
                date: new Date(dateStr),
                query,
                page,
                device,
                country,
                clicks: row.clicks || 0,
                impressions: row.impressions || 0,
                ctr: row.ctr || 0,
                position: row.position || 0,
              },
            });
          })
        );
        processedCount += chunk.length;
      }
    }

    // 6. Update integration status
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        lastSyncError: null,
      },
    });

    return { success: true, status: 'COMPLETED', recordsProcessed: processedCount };
  } catch (error: any) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'ERROR',
        lastSyncError: error.message || 'Unknown error during sync',
      },
    });

    return { success: false, status: 'ERROR', error: error.message };
  }
}

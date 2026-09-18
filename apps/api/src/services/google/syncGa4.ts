import prisma from '../../lib/database';
import {
  GOOGLE_PROVIDERS,
  GoogleIntegrationConfig,
  GoogleOAuthError,
  getValidAccessTokenForIntegration,
  performRequest,
} from './index';

/**
 * Synchronizes Google Analytics 4 data for a specific website.
 */
export async function syncAnalyticsForWebsite(websiteId: string, userId: string) {
  const integration = await prisma.integration.findUnique({
    where: {
      websiteId_provider: {
        websiteId,
        provider: GOOGLE_PROVIDERS.ANALYTICS,
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

  // GA4 property ID is usually in the format "properties/123456789"
  const propertyId = config.selectedProperty;

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
    // Offset by 1 day as today's data is incomplete
    endDate.setDate(endDate.getDate() - 1);
    
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    const startYMD = startDate.toISOString().split('T')[0];
    const endYMD = endDate.toISOString().split('T')[0];

    // 4. Fetch from Analytics Data API
    // Ensure we don't URL-encode the slash in "properties/1234"
    const url = `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`;
    
    const res = await performRequest(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: startYMD, endDate: endYMD }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'engagementRate' }
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionDefaultChannelGroup',
            stringFilter: {
              value: 'Organic Search',
              matchType: 'EXACT'
            }
          }
        },
        limit: 10000,
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
      // Chunk updates
      const chunkSize = 1000;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        
        await prisma.$transaction(
          chunk.map((row: any) => {
            // GA4 returns date as YYYYMMDD
            const dateStrRaw = row.dimensionValues[0].value;
            const year = dateStrRaw.substring(0, 4);
            const month = dateStrRaw.substring(4, 6);
            const day = dateStrRaw.substring(6, 8);
            const dateObj = new Date(`${year}-${month}-${day}T00:00:00Z`);

            const activeUsers = parseInt(row.metricValues[0].value, 10) || 0;
            const sessions = parseInt(row.metricValues[1].value, 10) || 0;
            const screenPageViews = parseInt(row.metricValues[2].value, 10) || 0;
            const engagementRate = parseFloat(row.metricValues[3].value) || 0;

            const metrics = {
              activeUsers,
              sessions,
              screenPageViews,
              engagementRate,
              organicTraffic: sessions // mapping for generic term
            };

            return prisma.analyticsSnapshot.upsert({
              where: {
                websiteId_source_date: {
                  websiteId,
                  source: GOOGLE_PROVIDERS.ANALYTICS,
                  date: dateObj,
                },
              },
              update: {
                metrics: metrics as any,
              },
              create: {
                websiteId,
                source: GOOGLE_PROVIDERS.ANALYTICS,
                date: dateObj,
                metrics: metrics as any,
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

    return { success: true, status: 'COMPLETED', snapshotsProcessed: processedCount };
  } catch (error: any) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'ERROR',
        lastSyncError: error.message || 'Unknown error during GA4 sync',
      },
    });

    return { success: false, status: 'ERROR', error: error.message };
  }
}

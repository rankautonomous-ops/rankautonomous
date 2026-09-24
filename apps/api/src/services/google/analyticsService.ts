import { getValidAccessTokenForIntegration } from './service';
import { performRequest } from './client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getAnalyticsData(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  metrics: string[] = ['sessions']
) {
  const website = await prisma.website.findFirst({
    where: { url: siteUrl, userId }
  });
  if (!website) return null;

  const integration = await prisma.integration.findUnique({
    where: { websiteId_provider: { websiteId: website.id, provider: 'GOOGLE' } }
  });

  if (!integration) return null;
  const config = integration.config as any;
  if (!config || !config.ga4PropertyId) return null;

  const accessToken = await getValidAccessTokenForIntegration(integration.id);
  const propertyId = config.ga4PropertyId.replace('properties/', '');
  
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await performRequest(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: startDate.split('T')[0], endDate: endDate.split('T')[0] }],
      metrics: metrics.map(m => ({ name: m }))
    })
  });

  if (!res.ok) {
    throw new Error('Failed to fetch GA4 data');
  }

  return res.json();
}

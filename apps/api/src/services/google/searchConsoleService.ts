import { getValidAccessTokenForIntegration } from './service';
import { performRequest } from './client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getSearchConsoleData(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[] = ['date']
) {
  const website = await prisma.website.findFirst({
    where: { url: siteUrl, userId }
  });
  if (!website) return null;

  const integration = await prisma.integration.findUnique({
    where: { websiteId_provider: { websiteId: website.id, provider: 'GOOGLE' } }
  });

  if (!integration) return null;

  const accessToken = await getValidAccessTokenForIntegration(integration.id);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await performRequest(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate: startDate.split('T')[0],
      endDate: endDate.split('T')[0],
      dimensions
    })
  });

  if (!res.ok) {
    throw new Error('Failed to fetch search console data');
  }

  return res.json();
}

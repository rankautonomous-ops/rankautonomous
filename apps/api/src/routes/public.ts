import { Router } from 'express';
import { runFreeAnalysis } from '../services/freeAnalysis';

const router = Router();

// Simple in-memory rate limiter for anonymous IPs
const rateLimitMap = new Map<string, { count: number, timestamp: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 3; // 3 requests per 15 mins

router.post('/free-analysis', async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Rate Limiting Logic
    const record = rateLimitMap.get(ip);
    if (record) {
      if (now - record.timestamp < RATE_LIMIT_WINDOW) {
        if (record.count >= MAX_REQUESTS) {
          return res.status(429).json({ message: 'Rate limit exceeded. Please try again later or sign up.' });
        }
        record.count++;
      } else {
        rateLimitMap.set(ip, { count: 1, timestamp: now });
      }
    } else {
      rateLimitMap.set(ip, { count: 1, timestamp: now });
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'URL is required' });
    }

    const result = await runFreeAnalysis(url);
    return res.json(result);
  } catch (err: any) {
    console.error('[Free Analysis Error]:', err);
    return res.status(400).json({ message: err.message || 'Failed to analyze website.' });
  }
});

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

router.get('/rss/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    
    // We need to import PrismaClient here if it's not at the top. Let me add it.
    // I'll add the import at the top later, but for now I'll require it inside or at the top.
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const website = await prisma.website.findUnique({
      where: { id: websiteId }
    });

    if (!website) {
      return res.status(404).json({ message: 'Website not found' });
    }

    const articles = await prisma.article.findMany({
      where: { 
        websiteId,
        status: 'PUBLISHED'
      },
      orderBy: { publishedAt: 'desc' },
      take: 50
    });

    const lastBuildDate = articles.length > 0 && articles[0].publishedAt 
      ? new Date(articles[0].publishedAt).toUTCString()
      : new Date().toUTCString();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankautonomous.vercel.app';

    let rss = `<?xml version="1.0" encoding="UTF-8" ?>\n`;
    rss += `<rss version="2.0">\n`;
    rss += `  <channel>\n`;
    rss += `    <title>${escapeXml(website.domain)} - RankAutonomous Feed</title>\n`;
    rss += `    <link>${escapeXml(website.url || `https://${website.domain}`)}</link>\n`;
    rss += `    <description>Latest published articles</description>\n`;
    rss += `    <lastBuildDate>${lastBuildDate}</lastBuildDate>\n`;
    rss += `    <generator>RankAutonomous RSS</generator>\n`;

    for (const article of articles) {
      const pubDate = article.publishedAt ? new Date(article.publishedAt).toUTCString() : new Date().toUTCString();
      const articleUrl = `${website.url || `https://${website.domain}`}/${article.slug || article.id}`;
      
      rss += `    <item>\n`;
      rss += `      <title>${escapeXml(article.title || 'Untitled')}</title>\n`;
      rss += `      <link>${escapeXml(articleUrl)}</link>\n`;
      rss += `      <guid>${escapeXml(article.id)}</guid>\n`;
      if (article.metaDescription) {
        rss += `      <description>${escapeXml(article.metaDescription)}</description>\n`;
      }
      rss += `      <pubDate>${pubDate}</pubDate>\n`;
      rss += `    </item>\n`;
    }

    rss += `  </channel>\n`;
    rss += `</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    return res.send(rss);
  } catch (err: any) {
    console.error('[RSS Generation Error]:', err);
    return res.status(500).json({ message: 'Failed to generate RSS feed.' });
  }
});

export default router;

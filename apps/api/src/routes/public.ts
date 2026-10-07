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

export default router;

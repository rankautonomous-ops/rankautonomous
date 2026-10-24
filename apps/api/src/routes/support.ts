import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import prisma from '../lib/database';
import { getAiProvider } from '../services/aiProvider';

const router = Router();

// In-memory rate limiter for support chat
const supportRateLimitMap = new Map<string, { count: number, timestamp: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PUBLIC = 5; 
const MAX_REQUESTS_AUTH = 15;

const KNOWLEDGE_BASE = `
You are the RankAutonomous AI Support Assistant.
RankAutonomous is an autonomous SEO and AI-search visibility platform.

Core Philosophy: Analyze → Create → Build → Grow.

Features:
- Free Website Analysis: A limited scan of the homepage available publicly.
- SEO Audits: Deep scanning of the website structure, performance, technical SEO, and content, giving a 0-100 score.
- Keyword Research: Find keywords, get AI suggestions, and view search volume/difficulty.
- Competitor Research: Analyze competitor domains for content gaps and keyword opportunities.
- Content Engine: Daily AI article generation based on keyword strategy, with a Content Calendar.
- Backlinks: Discovers backlink opportunities and manages outreach campaigns. Verifies active backlinks.
- Integrations: Google Search Console (GSC) for search performance data. Google Analytics 4 (GA4) integration. Fully supports 18 CMS publishing integrations including WordPress, Shopify, Webflow, Ghost, Notion, Wix, BigCommerce, Duda, HubSpot, HighLevel, Squarespace, Framer, and custom webhooks.
- Reports: Monthly SEO score and metrics reports.

Limitations & Rules:
- RankAutonomous does NOT guarantee Google rankings.
- RankAutonomous does NOT control external AI search rankings directly (like ChatGPT/Claude).
- Do NOT provide database credentials, stripe keys, passwords, or system secrets.
- Provide thorough, comprehensive, and articulate responses with step-by-step guidance.
- Address every part of multi-part user questions completely without omitting details or cutting off mid-sentence.
- Use structured formatting (such as bullet points, numbered steps, and clear section headers) for technical explanations and workflows.
- Remain helpful, accurate, and actionable.
- If asked an unrelated question, politely refuse and state you only provide RankAutonomous support.
- If the user reports a technical issue, provide general troubleshooting and suggest they contact human support if unresolved.
`;

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const lastMessage = messages[messages.length - 1];
    if (typeof lastMessage.content !== 'string' || lastMessage.content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content cannot be empty.' });
    }

    if (lastMessage.content.length > 2000) {
      return res.status(400).json({ error: 'Message exceeds the 2000 character limit.' });
    }

    // Optional Authentication
    let userEmail: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const { data: authData } = await supabase.auth.getUser(token);
        if (authData?.user) {
          userEmail = authData.user.email || null;
        }
      }
    }

    // Rate Limiting
    const forwarded = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
    const ip = forwarded || req.ip || req.socket.remoteAddress || 'unknown';
    const limitKey = userEmail ? `user:${userEmail}` : `ip:${ip}`;
    const maxReqs = userEmail ? MAX_REQUESTS_AUTH : MAX_REQUESTS_PUBLIC;
    const now = Date.now();

    const record = supportRateLimitMap.get(limitKey);
    if (record) {
      if (now - record.timestamp < RATE_LIMIT_WINDOW) {
        if (record.count >= maxReqs) {
          return res.status(429).json({ error: 'Rate limit exceeded. Please wait before asking more questions.' });
        }
        record.count++;
      } else {
        supportRateLimitMap.set(limitKey, { count: 1, timestamp: now });
      }
    } else {
      supportRateLimitMap.set(limitKey, { count: 1, timestamp: now });
    }

    let contextualPrompt = KNOWLEDGE_BASE;
    if (userEmail) {
      contextualPrompt += `\nContext: The user is currently authenticated with email: ${userEmail}. Guide them using features available in the dashboard.`;
    } else {
      contextualPrompt += `\nContext: The user is an unauthenticated public visitor. Focus on explaining what the product does, pricing, and how to get started.`;
    }

    // Formatting conversation history for the provider
    // Provide up to the last 8 messages for robust multi-turn context
    let conversationHistory = '';
    const recentMessages = messages.slice(-8);
    for (const msg of recentMessages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      conversationHistory += `${role}: ${msg.content}\n`;
    }

    const aiProvider = getAiProvider();
    const maxTokens = parseInt(process.env.SUPPORT_CHAT_MAX_TOKENS || '2048', 10);
    const responseText = await aiProvider.generateCompletion({
      task: 'chat',
      systemPrompt: contextualPrompt,
      userPrompt: conversationHistory,
      maxTokens: isNaN(maxTokens) || maxTokens < 500 ? 2048 : maxTokens,
      temperature: 0.5
    });

    return res.json({ reply: responseText });

  } catch (err: any) {
    console.error('[Support API Error]:', err);
    const msg = err.message || 'An error occurred processing your request.';
    return res.status(err.statusCode || 500).json({ error: msg });
  }
});

export default router;

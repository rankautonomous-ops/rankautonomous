/**
 * Simple, robust server-side HTML sanitizer for AI-generated article content.
 * Strips dangerous tags (<script>, <iframe>, <style>, etc.), on* handlers, and javascript: links.
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let sanitized = html
    // Remove script tags and contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and contents
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove iframe tags and contents
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove object / embed / applet tags
    .replace(/<(object|embed|applet|form|input|button|textarea|select)\b[^>]*>/gi, '')
    .replace(/<\/(object|embed|applet|form|input|button|textarea|select)>/gi, '')
    // Remove on* event handlers (e.g. onload, onclick, onerror)
    .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    // Remove javascript: and data: pseudo-protocols in href/src
    .replace(/(href|src)\s*=\s*(['"]?)\s*(?:javascript|data|vbscript):/gi, '$1=$2#');

  return sanitized;
}

/**
 * Normalizes and sanitizes a URL slug.
 */
export function sanitizeSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') return 'article';
  const clean = slug
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  return clean || 'article';
}

export interface ValidatedContentGeneration {
  title: string;
  metaDescription: string;
  slug: string;
  headings: string[];
  content: string;
  internalLinks: string[];
  imageSuggestions: string[];
  cta: string;
}

export function validateContentGenerationOutput(parsed: any): ValidatedContentGeneration {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AI output must be an object');
  }

  const rawTitle = String(parsed.title || '').trim();
  const rawMetaDescription = String(parsed.metaDescription || '').trim();
  const rawSlug = String(parsed.slug || '').trim();
  const rawContent = String(parsed.content || '').trim();

  if (!rawTitle) throw new Error('Missing title in AI output');
  if (!rawContent) throw new Error('Missing content in AI output');

  const title = rawTitle.slice(0, 200);
  const metaDescription = rawMetaDescription.slice(0, 350);
  const slug = sanitizeSlug(rawSlug || rawTitle);
  const content = sanitizeHtml(rawContent.slice(0, 50000));

  const headings: string[] = Array.isArray(parsed.headings)
    ? parsed.headings.map((h: any) => String(h || '').trim().slice(0, 150)).filter(Boolean).slice(0, 50)
    : [];

  const internalLinks: string[] = Array.isArray(parsed.internalLinks)
    ? parsed.internalLinks.map((l: any) => String(l || '').trim()).filter(Boolean).slice(0, 30)
    : [];

  const imageSuggestions: string[] = Array.isArray(parsed.imageSuggestions)
    ? parsed.imageSuggestions.map((img: any) => String(img || '').trim().slice(0, 250)).filter(Boolean).slice(0, 20)
    : [];

  const cta = String(parsed.cta || '').trim().slice(0, 300);

  return {
    title,
    metaDescription,
    slug,
    headings,
    content,
    internalLinks,
    imageSuggestions,
    cta,
  };
}

export interface ValidatedContentReview {
  score: number;
  summary: string;
  strengths: string[];
  issues: string[];
  recommendations: string[];
}

export function validateContentReviewOutput(parsed: any): ValidatedContentReview {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AI output must be an object');
  }

  const score = parseInt(parsed.score, 10);
  if (isNaN(score) || score < 0 || score > 100) {
    throw new Error('Invalid score in AI review output');
  }

  const summary = String(parsed.summary || '').trim().slice(0, 1500);

  const strengths: string[] = Array.isArray(parsed.strengths)
    ? parsed.strengths.map((s: any) => String(s || '').trim().slice(0, 250)).filter(Boolean).slice(0, 20)
    : [];

  const issues: string[] = Array.isArray(parsed.issues)
    ? parsed.issues.map((i: any) => String(i || '').trim().slice(0, 250)).filter(Boolean).slice(0, 20)
    : [];

  const recommendations: string[] = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.map((r: any) => String(r || '').trim().slice(0, 250)).filter(Boolean).slice(0, 20)
    : [];

  return {
    score,
    summary,
    strengths,
    issues,
    recommendations,
  };
}

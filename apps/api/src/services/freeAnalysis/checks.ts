import * as cheerio from 'cheerio';
import { URL } from 'url';
import {
  HttpResponseData,
  AnalysisCategory,
  AnalysisCheck,
  AnalysisFinding,
  CategoryResult
} from './types';

export interface CheckExecutionInput {
  http: HttpResponseData;
  robotsTxt: {
    accessible: boolean;
    statusCode: number | null;
    content: string | null;
    disallowsRoot: boolean;
  };
}

export function runAllWebsiteChecks(input: CheckExecutionInput): {
  categories: CategoryResult[];
  metadata: any;
} {
  const { http, robotsTxt } = input;
  const $ = cheerio.load(http.html || '');

  // Extract core HTML elements
  const title = $('title').first().text().trim() || null;
  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[name="Description"]').attr('content')?.trim() ||
    null;

  const h1Elements: string[] = [];
  $('h1').each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) h1Elements.push(txt);
  });

  const canonicalAttr = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const htmlLang = $('html').attr('lang')?.trim() || null;

  // Visible text word count
  const clone = $('body').clone();
  clone.find('script, style, noscript, svg, nav, footer').remove();
  const visibleText = clone.text().replace(/\s+/g, ' ').trim();
  const wordCount = visibleText ? visibleText.split(/\s+/).length : 0;

  // Open Graph metadata
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null;
  const ogDescription = $('meta[property="og:description"]').attr('content')?.trim() || null;
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || null;
  const ogUrl = $('meta[property="og:url"]').attr('content')?.trim() || null;
  const ogType = $('meta[property="og:type"]').attr('content')?.trim() || null;

  // Twitter metadata
  const twitterCard = $('meta[name="twitter:card"]').attr('content')?.trim() || null;
  const twitterTitle = $('meta[name="twitter:title"]').attr('content')?.trim() || null;
  const twitterDescription = $('meta[name="twitter:description"]').attr('content')?.trim() || null;
  const twitterImage = $('meta[name="twitter:image"]').attr('content')?.trim() || null;

  // Robots directives
  const metaRobots = $('meta[name="robots"]').attr('content')?.trim() || null;
  const metaGooglebot = $('meta[name="googlebot"]').attr('content')?.trim() || null;
  const combinedRobots = `${metaRobots || ''} ${metaGooglebot || ''}`.toLowerCase();
  const isNoindex = combinedRobots.includes('noindex') || (http.headers['x-robots-tag'] || '').toLowerCase().includes('noindex');
  const isNofollow = combinedRobots.includes('nofollow') || (http.headers['x-robots-tag'] || '').toLowerCase().includes('nofollow');

  // JSON-LD Structured Data
  const jsonLdTypes: string[] = [];
  const jsonLdErrors: string[] = [];
  let jsonLdCount = 0;

  $('script[type="application/ld+json"]').each((_, el) => {
    jsonLdCount++;
    const rawContent = $(el).html()?.trim() || '';
    if (!rawContent) return;

    try {
      const parsed = JSON.parse(rawContent);
      const extractTypes = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj['@type']) {
          const t = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
          for (const item of t) {
            if (typeof item === 'string' && !jsonLdTypes.includes(item)) {
              jsonLdTypes.push(item);
            }
          }
        }
        if (Array.isArray(obj['@graph'])) {
          obj['@graph'].forEach(extractTypes);
        }
      };

      if (Array.isArray(parsed)) {
        parsed.forEach(extractTypes);
      } else {
        extractTypes(parsed);
      }
    } catch (parseErr: any) {
      jsonLdErrors.push(parseErr.message || 'Invalid JSON syntax');
    }
  });

  const categories: CategoryResult[] = [
    evalTechnicalSeo(http, canonicalAttr, htmlLang),
    evalPerformance(http, $),
    evalSecurity(http),
    evalMetadataAndContent(title, description, h1Elements, wordCount, $),
    evalImagesAndAccessibility($, http.finalUrl),
    evalSocialSharing(ogTitle, ogDescription, ogImage, ogUrl, ogType, twitterCard, twitterImage),
    evalStructuredData(jsonLdCount, jsonLdTypes, jsonLdErrors, $),
    evalIndexability(isNoindex, isNofollow, metaRobots, http.headers['x-robots-tag'] || null, robotsTxt, canonicalAttr, http.finalUrl)
  ];

  const metadata = {
    title,
    description,
    canonical: canonicalAttr,
    language: htmlLang,
    h1Count: h1Elements.length,
    h1s: h1Elements,
    wordCount,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      image: ogImage,
      url: ogUrl,
      type: ogType
    },
    twitterCard: {
      card: twitterCard,
      title: twitterTitle,
      description: twitterDescription,
      image: twitterImage
    },
    structuredData: {
      types: jsonLdTypes,
      rawCount: jsonLdCount,
      hasMalformedJsonLd: jsonLdErrors.length > 0,
      malformedErrors: jsonLdErrors
    },
    robotsDirectives: {
      metaRobots,
      xRobotsTag: http.headers['x-robots-tag'] || null,
      isNoindex,
      isNofollow
    }
  };

  return { categories, metadata };
}

// -------------------------------------------------------------
// Category 1: Technical SEO
// -------------------------------------------------------------
function evalTechnicalSeo(
  http: HttpResponseData,
  canonicalAttr: string | null,
  htmlLang: string | null
): CategoryResult {
  const category: AnalysisCategory = 'Technical SEO';
  const checks: AnalysisCheck[] = [];
  const findings: AnalysisFinding[] = [];
  let score = 100;

  // 1. HTTP Status Code
  if (http.statusCode >= 200 && http.statusCode < 300) {
    checks.push({
      id: 'http-status',
      name: 'HTTP Status Code',
      category,
      status: 'PASSED',
      message: `The server responded with valid HTTP status code ${http.statusCode}.`,
      evidence: `HTTP ${http.statusCode} ${http.statusText}`
    });
  } else if (http.statusCode >= 500) {
    score -= 40;
    const f: AnalysisFinding = {
      id: 'http-server-error',
      category,
      priority: 'CRITICAL',
      title: `Server Error (${http.statusCode})`,
      description: `The website returned a 5xx internal server error.`,
      evidence: `HTTP ${http.statusCode} ${http.statusText}`,
      recommendation: 'Check web server logs and application health to resolve backend errors.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'http-status',
      name: 'HTTP Status Code',
      category,
      status: 'FAILED',
      severity: 'CRITICAL',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    score -= 25;
    const f: AnalysisFinding = {
      id: 'http-client-error',
      category,
      priority: 'HIGH',
      title: `Unsuccessful HTTP Status (${http.statusCode})`,
      description: `The website responded with HTTP status ${http.statusCode}.`,
      evidence: `HTTP ${http.statusCode} ${http.statusText}`,
      recommendation: 'Ensure public pages return an HTTP 200 OK status.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'http-status',
      name: 'HTTP Status Code',
      category,
      status: 'FAILED',
      severity: 'HIGH',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 2. Redirect Handling
  if (http.redirectCount === 0) {
    checks.push({
      id: 'redirects',
      name: 'Redirect Chains',
      category,
      status: 'PASSED',
      message: 'Direct response without unnecessary redirect hops.',
      evidence: '0 redirects'
    });
  } else if (http.redirectCount <= 2) {
    checks.push({
      id: 'redirects',
      name: 'Redirect Chains',
      category,
      status: 'PASSED',
      message: `Clean redirect to canonical destination (${http.redirectCount} hop).`,
      evidence: `Redirects: ${http.redirectCount} (${http.redirectChain.join(' -> ')})`
    });
  } else {
    score -= 10;
    const f: AnalysisFinding = {
      id: 'excessive-redirects',
      category,
      priority: 'MEDIUM',
      title: 'Excessive Redirects Detected',
      description: `The page went through ${http.redirectCount} redirects before reaching its final URL. Redirect chains add latency and waste crawl budget.`,
      evidence: `Chain: ${http.redirectChain.join(' -> ')}`,
      recommendation: 'Update internal links and server rules to redirect directly to the final destination in a single hop.',
      affectedUrl: http.initialUrl
    };
    findings.push(f);
    checks.push({
      id: 'redirects',
      name: 'Redirect Chains',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 3. Canonical Tag
  if (!canonicalAttr) {
    score -= 15;
    const f: AnalysisFinding = {
      id: 'missing-canonical',
      category,
      priority: 'MEDIUM',
      title: 'Missing Canonical URL Tag',
      description: 'The page does not declare a canonical URL tag (<link rel="canonical">). Canonical tags prevent duplicate content issues.',
      evidence: 'No <link rel="canonical"> element found in HTML head.',
      recommendation: `Add a canonical tag pointing to the preferred URL: <link rel="canonical" href="${http.finalUrl}" />`,
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'canonical-tag',
      name: 'Canonical URL Tag',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    let isValidUrl = true;
    let isCrossDomain = false;
    try {
      const parsedCanonical = new URL(canonicalAttr, http.finalUrl);
      const parsedFinal = new URL(http.finalUrl);
      if (parsedCanonical.hostname !== parsedFinal.hostname) {
        isCrossDomain = true;
      }
    } catch {
      isValidUrl = false;
    }

    if (!isValidUrl) {
      score -= 15;
      const f: AnalysisFinding = {
        id: 'malformed-canonical',
        category,
        priority: 'HIGH',
        title: 'Malformed Canonical Tag',
        description: `The canonical URL "${canonicalAttr}" is not a valid absolute or relative URL.`,
        evidence: `href="${canonicalAttr}"`,
        recommendation: 'Provide a valid, fully qualified canonical URL.',
        affectedUrl: http.finalUrl
      };
      findings.push(f);
      checks.push({
        id: 'canonical-tag',
        name: 'Canonical URL Tag',
        category,
        status: 'FAILED',
        severity: 'HIGH',
        message: f.description,
        evidence: f.evidence,
        recommendation: f.recommendation
      });
    } else if (isCrossDomain) {
      const f: AnalysisFinding = {
        id: 'cross-domain-canonical',
        category,
        priority: 'LOW',
        title: 'Cross-Domain Canonical Tag (Advisory)',
        description: `The canonical URL points to a different domain (${canonicalAttr}). Verify if this page is intended to be syndicated.`,
        evidence: `Canonical: ${canonicalAttr} (Current: ${http.finalUrl})`,
        recommendation: 'Confirm whether this page is intended to attribute search authority to an external domain.',
        affectedUrl: http.finalUrl
      };
      findings.push(f);
      checks.push({
        id: 'canonical-tag',
        name: 'Canonical URL Tag',
        category,
        status: 'ADVISORY',
        severity: 'LOW',
        message: f.description,
        evidence: f.evidence,
        recommendation: f.recommendation
      });
    } else {
      checks.push({
        id: 'canonical-tag',
        name: 'Canonical URL Tag',
        category,
        status: 'PASSED',
        message: 'Canonical tag is properly configured.',
        evidence: `href="${canonicalAttr}"`
      });
    }
  }

  // 4. HTML Language Declaration
  if (htmlLang) {
    checks.push({
      id: 'html-lang',
      name: 'HTML Language Declaration',
      category,
      status: 'PASSED',
      message: `Page language is declared as "${htmlLang}".`,
      evidence: `<html lang="${htmlLang}">`
    });
  } else {
    score -= 5;
    const f: AnalysisFinding = {
      id: 'missing-html-lang',
      category,
      priority: 'LOW',
      title: 'Missing HTML Language Attribute',
      description: 'The <html> tag does not specify a "lang" attribute. Specifying language aids international search engines and screen readers.',
      evidence: '<html> tag lacks lang="..." attribute.',
      recommendation: 'Add the appropriate language code to the <html> tag, e.g. <html lang="en">.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'html-lang',
      name: 'HTML Language Declaration',
      category,
      status: 'FAILED',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  const passedCount = checks.filter(c => c.status === 'PASSED').length;
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  const skippedCount = checks.filter(c => c.status === 'SKIPPED').length;

  return {
    category,
    score: Math.max(0, score),
    checksPerformed: checks.length,
    checksPassed: passedCount,
    checksFailed: failedCount,
    checksSkipped: skippedCount,
    findings,
    checks
  };
}

// -------------------------------------------------------------
// Category 2: Performance
// -------------------------------------------------------------
function evalPerformance(http: HttpResponseData, $: cheerio.CheerioAPI): CategoryResult {
  const category: AnalysisCategory = 'Performance';
  const checks: AnalysisCheck[] = [];
  const findings: AnalysisFinding[] = [];
  let score = 100;

  // 1. Server Response Latency / TTFB Approximation
  const ttfb = http.timings.ttfbMs;
  if (ttfb <= 600) {
    checks.push({
      id: 'ttfb',
      name: 'Server Response Time (TTFB Approximation)',
      category,
      status: 'PASSED',
      message: `Fast server response time (${ttfb} ms). Google recommends under 600 ms.`,
      evidence: `Measured TTFB: ${ttfb} ms (Total: ${http.timings.totalMs} ms)`
    });
  } else if (ttfb <= 1800) {
    score -= 15;
    const f: AnalysisFinding = {
      id: 'slow-ttfb',
      category,
      priority: 'MEDIUM',
      title: 'Suboptimal Server Response Time (TTFB)',
      description: `Observed time-to-first-byte was ${ttfb} ms. A TTFB above 600 ms delays browser rendering and crawler processing.`,
      evidence: `Measured TTFB: ${ttfb} ms (Total: ${http.timings.totalMs} ms)`,
      recommendation: 'Implement server-side caching, optimize database queries, or place a CDN / edge cache in front of your origin.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'ttfb',
      name: 'Server Response Time (TTFB Approximation)',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    score -= 30;
    const f: AnalysisFinding = {
      id: 'critical-ttfb',
      category,
      priority: 'HIGH',
      title: 'High Server Response Latency',
      description: `Observed server response time was ${ttfb} ms (> 1.8s). Slow TTFB severely degrades user experience and search ranking signals.`,
      evidence: `Measured TTFB: ${ttfb} ms (Total: ${http.timings.totalMs} ms)`,
      recommendation: 'Audit server infrastructure, enable full page caching, and optimize backend execution.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'ttfb',
      name: 'Server Response Time (TTFB Approximation)',
      category,
      status: 'FAILED',
      severity: 'HIGH',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 2. HTML Document Size
  const sizeBytes = http.htmlSizeBytes;
  const sizeKb = Math.round(sizeBytes / 1024);
  if (sizeBytes <= 100 * 1024) {
    checks.push({
      id: 'html-size',
      name: 'HTML Document Payload Size',
      category,
      status: 'PASSED',
      message: `Optimal HTML size (${sizeKb} KB). Clean DOM structure under 100 KB.`,
      evidence: `${sizeKb} KB (${sizeBytes.toLocaleString()} bytes)`
    });
  } else if (sizeBytes <= 500 * 1024) {
    checks.push({
      id: 'html-size',
      name: 'HTML Document Payload Size',
      category,
      status: 'PASSED',
      message: `Moderate HTML document size (${sizeKb} KB). Within acceptable bounds.`,
      evidence: `${sizeKb} KB (${sizeBytes.toLocaleString()} bytes)`
    });
  } else if (sizeBytes <= 2 * 1024 * 1024) {
    score -= 10;
    const f: AnalysisFinding = {
      id: 'heavy-html',
      category,
      priority: 'LOW',
      title: 'Heavy HTML Document Size',
      description: `The HTML document payload is ${sizeKb} KB. Large HTML documents increase parsing time and mobile memory usage.`,
      evidence: `${sizeKb} KB (${sizeBytes.toLocaleString()} bytes)`,
      recommendation: 'Minify HTML, reduce inline CSS/JS scripts, and paginate large lists or complex tables.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'html-size',
      name: 'HTML Document Payload Size',
      category,
      status: 'FAILED',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    score -= 25;
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
    const f: AnalysisFinding = {
      id: 'excessive-html-size',
      category,
      priority: 'HIGH',
      title: 'Excessive HTML Document Size (> 2 MB)',
      description: `The HTML document is ${sizeMb} MB. Such large documents trigger search engine download limits and cause noticeable browser lag.`,
      evidence: `${sizeMb} MB (${sizeBytes.toLocaleString()} bytes)`,
      recommendation: 'Remove massive inlined data blobs, SVGs, or oversized DOM structures.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'html-size',
      name: 'HTML Document Payload Size',
      category,
      status: 'FAILED',
      severity: 'HIGH',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 3. HTTP Text Compression
  const encoding = (http.contentEncoding || '').toLowerCase();
  const isCompressed = encoding.includes('gzip') || encoding.includes('br') || encoding.includes('deflate');
  if (isCompressed) {
    checks.push({
      id: 'compression',
      name: 'HTTP Text Compression',
      category,
      status: 'PASSED',
      message: `Response is compressed using ${http.contentEncoding}.`,
      evidence: `content-encoding: ${http.contentEncoding}`
    });
  } else if (sizeBytes > 50 * 1024) {
    score -= 15;
    const f: AnalysisFinding = {
      id: 'missing-compression',
      category,
      priority: 'MEDIUM',
      title: 'HTTP Compression Not Enabled',
      description: `The HTML response is transferred uncompressed (${sizeKb} KB). Enabling Brotli or Gzip compression typically reduces transfer size by 60-80%.`,
      evidence: 'No content-encoding header found on response.',
      recommendation: 'Enable Gzip or Brotli compression in your web server (Nginx, Cloudflare, Apache, Caddy).',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'compression',
      name: 'HTTP Text Compression',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    checks.push({
      id: 'compression',
      name: 'HTTP Text Compression',
      category,
      status: 'PASSED',
      message: `Document is small (${sizeKb} KB); compression overhead is negligible.`,
      evidence: 'Uncompressed (small file)'
    });
  }

  // 4. Caching Headers
  const cacheControl = http.headers['cache-control'] || null;
  const etag = http.headers['etag'] || null;
  if (cacheControl || etag) {
    checks.push({
      id: 'caching',
      name: 'HTTP Caching Headers',
      category,
      status: 'PASSED',
      message: 'HTTP caching or revalidation headers are configured.',
      evidence: cacheControl ? `cache-control: ${cacheControl}` : `etag: ${etag}`
    });
  } else {
    checks.push({
      id: 'caching',
      name: 'HTTP Caching Headers',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: 'Missing Cache-Control or ETag headers on HTML response.',
      evidence: 'Neither cache-control nor etag was returned.',
      recommendation: 'Configure appropriate cache headers or ETag validation to enable browser caching.'
    });
  }

  // 5. Render-Blocking Resources in <head>
  let blockingScripts = 0;
  $('head script[src]').each((_, el) => {
    const asyncAttr = $(el).attr('async');
    const deferAttr = $(el).attr('defer');
    const typeAttr = $(el).attr('type');
    if (asyncAttr === undefined && deferAttr === undefined && typeAttr !== 'module') {
      blockingScripts++;
    }
  });

  const stylesheetCount = $('head link[rel="stylesheet"]').length;

  if (blockingScripts === 0) {
    checks.push({
      id: 'render-blocking-scripts',
      name: 'Render-Blocking Scripts',
      category,
      status: 'PASSED',
      message: 'No synchronous render-blocking scripts detected in the <head>.',
      evidence: '0 render-blocking <head> scripts'
    });
  } else {
    score -= 10;
    const f: AnalysisFinding = {
      id: 'render-blocking-scripts-found',
      category,
      priority: 'LOW',
      title: 'Render-Blocking Scripts in <head>',
      description: `Detected ${blockingScripts} synchronous JavaScript files in the <head>. Synchronous scripts halt HTML parsing until downloaded.`,
      evidence: `Found ${blockingScripts} render-blocking script tag(s).`,
      recommendation: 'Add the "defer" or "async" attribute, convert to ES modules, or move non-critical scripts to the end of the body.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'render-blocking-scripts',
      name: 'Render-Blocking Scripts',
      category,
      status: 'FAILED',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 6. Explicit Image Dimensions
  let imagesWithoutDimensions = 0;
  let totalImages = 0;
  $('img').each((_, el) => {
    totalImages++;
    const width = $(el).attr('width');
    const height = $(el).attr('height');
    if (!width || !height) {
      imagesWithoutDimensions++;
    }
  });

  if (totalImages === 0 || imagesWithoutDimensions === 0) {
    checks.push({
      id: 'image-dimensions',
      name: 'Image Dimension Attributes',
      category,
      status: 'PASSED',
      message: totalImages === 0 ? 'No images on page.' : 'All detected images specify explicit width and height attributes.',
      evidence: `${totalImages} total images evaluated`
    });
  } else {
    score -= 5;
    const f: AnalysisFinding = {
      id: 'missing-image-dimensions',
      category,
      priority: 'LOW',
      title: 'Images Missing Width or Height Attributes',
      description: `${imagesWithoutDimensions} of ${totalImages} image(s) lack explicit width and height attributes. This can cause Cumulative Layout Shift (CLS).`,
      evidence: `${imagesWithoutDimensions} image(s) missing width/height`,
      recommendation: 'Always set width and height attributes on <img> tags so browsers can reserve layout space prior to image download.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'image-dimensions',
      name: 'Image Dimension Attributes',
      category,
      status: 'FAILED',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  const passedCount = checks.filter(c => c.status === 'PASSED').length;
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  const skippedCount = checks.filter(c => c.status === 'SKIPPED').length;

  return {
    category,
    score: Math.max(0, score),
    checksPerformed: checks.length,
    checksPassed: passedCount,
    checksFailed: failedCount,
    checksSkipped: skippedCount,
    findings,
    checks
  };
}

// -------------------------------------------------------------
// Category 3: Security & HTTPS
// -------------------------------------------------------------
function evalSecurity(http: HttpResponseData): CategoryResult {
  const category: AnalysisCategory = 'Security & HTTPS';
  const checks: AnalysisCheck[] = [];
  const findings: AnalysisFinding[] = [];
  let score = 100;

  // 1. HTTPS Protocol
  if (http.isHttps) {
    checks.push({
      id: 'https-protocol',
      name: 'HTTPS Connection',
      category,
      status: 'PASSED',
      message: 'Website is served securely over encrypted HTTPS.',
      evidence: `Protocol: ${http.tls?.protocol || 'HTTPS'}`
    });
  } else {
    score -= 40;
    const f: AnalysisFinding = {
      id: 'insecure-http',
      category,
      priority: 'HIGH',
      title: 'Website Served Over Insecure HTTP',
      description: 'The website is served over unencrypted plain HTTP. Browsers flag non-HTTPS sites as "Not Secure" and search engines apply a ranking penalty.',
      evidence: `URL: ${http.finalUrl}`,
      recommendation: 'Install an SSL/TLS certificate and configure automatic HTTP to HTTPS redirects.',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'https-protocol',
      name: 'HTTPS Connection',
      category,
      status: 'FAILED',
      severity: 'HIGH',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 2. TLS Certificate Validity
  if (http.isHttps) {
    if (http.tls) {
      if (http.tls.authorized && (http.tls.daysRemaining === null || http.tls.daysRemaining > 14)) {
        checks.push({
          id: 'tls-cert',
          name: 'TLS Certificate Validity',
          category,
          status: 'PASSED',
          message: `Valid SSL/TLS certificate issued by ${http.tls.issuer || 'Trusted CA'}.`,
          evidence: `Issuer: ${http.tls.issuer}, Days remaining: ${http.tls.daysRemaining ?? 'N/A'}`
        });
      } else if (!http.tls.authorized) {
        score -= 35;
        const f: AnalysisFinding = {
          id: 'invalid-ssl-cert',
          category,
          priority: 'CRITICAL',
          title: 'Invalid SSL/TLS Certificate',
          description: `The SSL certificate validation failed: ${http.tls.authorizationError || 'Unauthorized certificate'}. Users will see severe browser security warnings.`,
          evidence: `Error: ${http.tls.authorizationError}`,
          recommendation: 'Renew or reconfigure your SSL/TLS certificate with a trusted Certificate Authority.',
          affectedUrl: http.finalUrl
        };
        findings.push(f);
        checks.push({
          id: 'tls-cert',
          name: 'TLS Certificate Validity',
          category,
          status: 'FAILED',
          severity: 'CRITICAL',
          message: f.description,
          evidence: f.evidence,
          recommendation: f.recommendation
        });
      } else if (http.tls.daysRemaining !== null && http.tls.daysRemaining <= 14) {
        score -= 15;
        const f: AnalysisFinding = {
          id: 'cert-expiring-soon',
          category,
          priority: 'HIGH',
          title: `SSL Certificate Expiring Soon (${http.tls.daysRemaining} days)`,
          description: `The SSL certificate will expire in ${http.tls.daysRemaining} days. If not renewed, your website will become inaccessible to visitors.`,
          evidence: `Expires on: ${http.tls.validTo}`,
          recommendation: 'Renew your SSL certificate immediately through your host or Let\'s Encrypt / Cloudflare.',
          affectedUrl: http.finalUrl
        };
        findings.push(f);
        checks.push({
          id: 'tls-cert',
          name: 'TLS Certificate Validity',
          category,
          status: 'FAILED',
          severity: 'HIGH',
          message: f.description,
          evidence: f.evidence,
          recommendation: f.recommendation
        });
      }
    } else {
      checks.push({
        id: 'tls-cert',
        name: 'TLS Certificate Validity',
        category,
        status: 'PASSED',
        message: 'TLS connection established successfully.',
        evidence: 'TLS handshake succeeded'
      });
    }
  } else {
    checks.push({
      id: 'tls-cert',
      name: 'TLS Certificate Validity',
      category,
      status: 'SKIPPED',
      message: 'Skipped because website is served over plain HTTP.',
      evidence: 'HTTP only'
    });
  }

  // 3. Strict-Transport-Security (HSTS)
  const hsts = http.headers['strict-transport-security'];
  if (http.isHttps && hsts) {
    checks.push({
      id: 'hsts',
      name: 'Strict-Transport-Security (HSTS)',
      category,
      status: 'PASSED',
      message: 'HSTS header is enabled, enforcing secure browser connections.',
      evidence: `strict-transport-security: ${hsts}`
    });
  } else if (http.isHttps) {
    score -= 10;
    const f: AnalysisFinding = {
      id: 'missing-hsts',
      category,
      priority: 'MEDIUM',
      title: 'Missing Strict-Transport-Security (HSTS) Header',
      description: 'The HSTS header protects against cookie hijacking and SSL-stripping attacks by instructing browsers to always use HTTPS.',
      evidence: 'No strict-transport-security header returned.',
      recommendation: 'Add the header: Strict-Transport-Security: max-age=31536000; includeSubDomains',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'hsts',
      name: 'Strict-Transport-Security (HSTS)',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 4. X-Content-Type-Options
  const xcto = http.headers['x-content-type-options'];
  if (xcto && xcto.toLowerCase().includes('nosniff')) {
    checks.push({
      id: 'x-content-type-options',
      name: 'X-Content-Type-Options',
      category,
      status: 'PASSED',
      message: 'MIME-sniffing protection enabled with "nosniff".',
      evidence: `x-content-type-options: ${xcto}`
    });
  } else {
    score -= 5;
    const f: AnalysisFinding = {
      id: 'missing-xcto',
      category,
      priority: 'LOW',
      title: 'Missing X-Content-Type-Options Header',
      description: 'Prevents browsers from MIME-sniffing a response away from the declared content-type.',
      evidence: 'x-content-type-options: nosniff header is missing.',
      recommendation: 'Add the header: X-Content-Type-Options: nosniff',
      affectedUrl: http.finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'x-content-type-options',
      name: 'X-Content-Type-Options',
      category,
      status: 'FAILED',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 5. Content-Security-Policy (CSP)
  const csp = http.headers['content-security-policy'];
  if (csp) {
    checks.push({
      id: 'csp',
      name: 'Content-Security-Policy (CSP)',
      category,
      status: 'PASSED',
      message: 'Content-Security-Policy header is configured.',
      evidence: `content-security-policy: ${csp.substring(0, 100)}...`
    });
  } else {
    checks.push({
      id: 'csp',
      name: 'Content-Security-Policy (CSP)',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: 'Content-Security-Policy (CSP) is not declared. CSP mitigates XSS attacks.',
      evidence: 'No content-security-policy header found.',
      recommendation: 'Configure a basic CSP defining approved script and style sources.'
    });
  }

  // 6. X-Frame-Options
  const xfo = http.headers['x-frame-options'];
  if (xfo && (xfo.toUpperCase().includes('DENY') || xfo.toUpperCase().includes('SAMEORIGIN'))) {
    checks.push({
      id: 'x-frame-options',
      name: 'X-Frame-Options (Clickjacking Protection)',
      category,
      status: 'PASSED',
      message: `Clickjacking protection enabled with "${xfo}".`,
      evidence: `x-frame-options: ${xfo}`
    });
  } else {
    checks.push({
      id: 'x-frame-options',
      name: 'X-Frame-Options (Clickjacking Protection)',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: 'X-Frame-Options header is absent. Framing should be restricted unless embedding is intended.',
      evidence: 'No x-frame-options header found.',
      recommendation: 'Add X-Frame-Options: SAMEORIGIN to prevent unauthorized iframe embedding.'
    });
  }

  // 7. Referrer-Policy
  const refPolicy = http.headers['referrer-policy'];
  if (refPolicy) {
    checks.push({
      id: 'referrer-policy',
      name: 'Referrer-Policy Header',
      category,
      status: 'PASSED',
      message: `Referrer policy is configured as "${refPolicy}".`,
      evidence: `referrer-policy: ${refPolicy}`
    });
  } else {
    checks.push({
      id: 'referrer-policy',
      name: 'Referrer-Policy Header',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: 'Missing Referrer-Policy header.',
      evidence: 'No referrer-policy header found.',
      recommendation: 'Configure Referrer-Policy: strict-origin-when-cross-origin to safeguard user privacy.'
    });
  }

  const passedCount = checks.filter(c => c.status === 'PASSED').length;
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  const skippedCount = checks.filter(c => c.status === 'SKIPPED').length;

  return {
    category,
    score: Math.max(0, score),
    checksPerformed: checks.length,
    checksPassed: passedCount,
    checksFailed: failedCount,
    checksSkipped: skippedCount,
    findings,
    checks
  };
}

// -------------------------------------------------------------
// Category 4: Metadata & Content Structure
// -------------------------------------------------------------
function evalMetadataAndContent(
  title: string | null,
  description: string | null,
  h1Elements: string[],
  wordCount: number,
  $: cheerio.CheerioAPI
): CategoryResult {
  const category: AnalysisCategory = 'Metadata & Content Structure';
  const checks: AnalysisCheck[] = [];
  const findings: AnalysisFinding[] = [];
  let score = 100;

  // 1. Title Tag Presence and Length
  if (!title) {
    score -= 25;
    const f: AnalysisFinding = {
      id: 'missing-title',
      category,
      priority: 'HIGH',
      title: 'Missing <title> Tag',
      description: 'The page has no title element. The title tag is one of the most critical on-page ranking factors and SERP display elements.',
      evidence: 'No <title> tag found in HTML.',
      recommendation: 'Add a concise, keyword-focused <title> tag between 30 and 60 characters.'
    };
    findings.push(f);
    checks.push({
      id: 'title-tag',
      name: 'Title Tag',
      category,
      status: 'FAILED',
      severity: 'HIGH',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else if (title.length >= 30 && title.length <= 60) {
    checks.push({
      id: 'title-tag',
      name: 'Title Tag',
      category,
      status: 'PASSED',
      message: `Title length is optimal (${title.length} characters).`,
      evidence: `"${title}" (${title.length} chars)`
    });
  } else if (title.length < 30) {
    score -= 5;
    const f: AnalysisFinding = {
      id: 'short-title',
      category,
      priority: 'LOW',
      title: 'Short Title Tag (Advisory)',
      description: `Title tag length is ${title.length} characters. Optimal title length for Google search results is between 30 and 60 characters.`,
      evidence: `"${title}" (${title.length} chars)`,
      recommendation: 'Expand your title tag to include relevant context, target keywords, and brand identity.'
    };
    findings.push(f);
    checks.push({
      id: 'title-tag',
      name: 'Title Tag',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    score -= 5;
    const f: AnalysisFinding = {
      id: 'long-title',
      category,
      priority: 'LOW',
      title: 'Long Title Tag (May Truncate)',
      description: `Title tag length is ${title.length} characters. Titles exceeding 60 characters risk truncation in search results.`,
      evidence: `"${title}" (${title.length} chars)`,
      recommendation: 'Trim your title tag to under 60 characters so the entire message is visible in search snippets.'
    };
    findings.push(f);
    checks.push({
      id: 'title-tag',
      name: 'Title Tag',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 2. Meta Description Presence and Length
  if (!description) {
    score -= 20;
    const f: AnalysisFinding = {
      id: 'missing-meta-description',
      category,
      priority: 'HIGH',
      title: 'Missing Meta Description',
      description: 'The page lacks a meta description tag. While not a direct ranking factor, meta descriptions directly drive search result click-through rates (CTR).',
      evidence: 'No <meta name="description"> tag found.',
      recommendation: 'Add a compelling meta description between 70 and 160 characters summarizing the page.'
    };
    findings.push(f);
    checks.push({
      id: 'meta-description',
      name: 'Meta Description',
      category,
      status: 'FAILED',
      severity: 'HIGH',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else if (description.length >= 70 && description.length <= 160) {
    checks.push({
      id: 'meta-description',
      name: 'Meta Description',
      category,
      status: 'PASSED',
      message: `Meta description length is optimal (${description.length} characters).`,
      evidence: `"${description}" (${description.length} chars)`
    });
  } else {
    score -= 5;
    const f: AnalysisFinding = {
      id: 'suboptimal-meta-description',
      category,
      priority: 'LOW',
      title: 'Suboptimal Meta Description Length',
      description: `Meta description length is ${description.length} characters. Recommended length is between 70 and 160 characters.`,
      evidence: `"${description}" (${description.length} chars)`,
      recommendation: 'Adjust description length to between 70 and 160 characters to optimize snippet appearance.'
    };
    findings.push(f);
    checks.push({
      id: 'meta-description',
      name: 'Meta Description',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 3. H1 Headings
  if (h1Elements.length === 0) {
    score -= 20;
    const f: AnalysisFinding = {
      id: 'missing-h1',
      category,
      priority: 'HIGH',
      title: 'Missing <h1> Heading',
      description: 'No <h1> heading was found on the page. The H1 heading is vital for defining the primary topic for search crawlers and users.',
      evidence: '0 <h1> tags found.',
      recommendation: 'Add a single primary <h1> element that clearly describes the page subject.'
    };
    findings.push(f);
    checks.push({
      id: 'h1-heading',
      name: 'H1 Primary Heading',
      category,
      status: 'FAILED',
      severity: 'HIGH',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else if (h1Elements.length === 1) {
    checks.push({
      id: 'h1-heading',
      name: 'H1 Primary Heading',
      category,
      status: 'PASSED',
      message: 'Exactly one primary <h1> heading detected.',
      evidence: `<h1>${h1Elements[0]}</h1>`
    });
  } else {
    score -= 5;
    const f: AnalysisFinding = {
      id: 'multiple-h1',
      category,
      priority: 'LOW',
      title: 'Multiple <h1> Headings (Advisory)',
      description: `Found ${h1Elements.length} <h1> headings. Modern HTML allows multiple H1s, but search engines recommend a single clear main topic heading.`,
      evidence: `Found ${h1Elements.length} H1s: ${h1Elements.slice(0, 3).map(h => `"${h}"`).join(', ')}${h1Elements.length > 3 ? '...' : ''}`,
      recommendation: 'Consider reserving <h1> for the primary page title and using <h2>-<h6> for sub-sections.'
    };
    findings.push(f);
    checks.push({
      id: 'h1-heading',
      name: 'H1 Primary Heading',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 4. Empty Headings
  let emptyHeadingsCount = 0;
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const text = $(el).text().trim();
    if (!text && $(el).find('img').length === 0) {
      emptyHeadingsCount++;
    }
  });

  if (emptyHeadingsCount === 0) {
    checks.push({
      id: 'empty-headings',
      name: 'Empty Headings',
      category,
      status: 'PASSED',
      message: 'All headings contain descriptive text content.',
      evidence: '0 empty headings'
    });
  } else {
    score -= 5;
    const f: AnalysisFinding = {
      id: 'empty-headings-detected',
      category,
      priority: 'LOW',
      title: 'Empty Heading Tags Detected',
      description: `Found ${emptyHeadingsCount} heading tag(s) with no text content. Empty headings cause accessibility and structural confusion.`,
      evidence: `${emptyHeadingsCount} empty heading tag(s)`,
      recommendation: 'Remove empty heading tags or provide meaningful descriptive text.'
    };
    findings.push(f);
    checks.push({
      id: 'empty-headings',
      name: 'Empty Headings',
      category,
      status: 'FAILED',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 5. Content Word Count
  if (wordCount >= 300) {
    checks.push({
      id: 'word-count',
      name: 'Content Depth (Word Count)',
      category,
      status: 'PASSED',
      message: `Substantial text content (${wordCount} words).`,
      evidence: `${wordCount} words detected in main body`
    });
  } else {
    score -= 10;
    const f: AnalysisFinding = {
      id: 'thin-content',
      category,
      priority: 'MEDIUM',
      title: 'Thin Content Detected',
      description: `The page contains only ${wordCount} words. Pages with fewer than 300 words are vulnerable to search quality classification as thin content.`,
      evidence: `${wordCount} words detected`,
      recommendation: 'Expand content with informative explanations, FAQs, and topical coverage to reach at least 300 words.'
    };
    findings.push(f);
    checks.push({
      id: 'word-count',
      name: 'Content Depth (Word Count)',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  const passedCount = checks.filter(c => c.status === 'PASSED').length;
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  const skippedCount = checks.filter(c => c.status === 'SKIPPED').length;

  return {
    category,
    score: Math.max(0, score),
    checksPerformed: checks.length,
    checksPassed: passedCount,
    checksFailed: failedCount,
    checksSkipped: skippedCount,
    findings,
    checks
  };
}

// -------------------------------------------------------------
// Category 5: Images & Accessibility
// -------------------------------------------------------------
function evalImagesAndAccessibility($: cheerio.CheerioAPI, finalUrl: string): CategoryResult {
  const category: AnalysisCategory = 'Images & Accessibility';
  const checks: AnalysisCheck[] = [];
  const findings: AnalysisFinding[] = [];
  let score = 100;

  let totalImages = 0;
  let missingAlt = 0;
  let emptyAltNonDecorative = 0;
  let malformedSrc = 0;

  $('img').each((_, el) => {
    totalImages++;
    const alt = $(el).attr('alt');
    const role = $(el).attr('role');
    const ariaHidden = $(el).attr('aria-hidden');
    const src = $(el).attr('src')?.trim();

    if (!src) {
      malformedSrc++;
    }

    if (alt === undefined) {
      missingAlt++;
    } else if (alt === '') {
      const isDecorative = role === 'presentation' || role === 'none' || ariaHidden === 'true';
      if (!isDecorative) {
        emptyAltNonDecorative++;
      }
    }
  });

  // 1. Missing Alt Attributes
  if (totalImages === 0) {
    checks.push({
      id: 'image-alt-tags',
      name: 'Image Alternative Text (Alt Attributes)',
      category,
      status: 'PASSED',
      message: 'No images present on the page.',
      evidence: '0 images'
    });
  } else if (missingAlt === 0) {
    checks.push({
      id: 'image-alt-tags',
      name: 'Image Alternative Text (Alt Attributes)',
      category,
      status: 'PASSED',
      message: `All ${totalImages} images specify alt attributes.`,
      evidence: `${totalImages} image(s) with alt attributes`
    });
  } else {
    const penalty = Math.min(30, missingAlt * 5);
    score -= penalty;
    const f: AnalysisFinding = {
      id: 'missing-image-alt',
      category,
      priority: missingAlt > 3 ? 'HIGH' : 'MEDIUM',
      title: 'Images Missing Alt Attributes',
      description: `${missingAlt} of ${totalImages} image(s) are missing alt attributes entirely. Search engines and screen readers rely on alt attributes to understand image content.`,
      evidence: `${missingAlt} image(s) missing alt attribute`,
      recommendation: 'Add descriptive alt text to all informative images. For purely decorative images, explicitly specify alt="" with role="presentation".',
      affectedUrl: finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'image-alt-tags',
      name: 'Image Alternative Text (Alt Attributes)',
      category,
      status: 'FAILED',
      severity: f.priority,
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  // 2. Empty Alt Attributes (Non-Decorative)
  if (emptyAltNonDecorative > 0) {
    checks.push({
      id: 'empty-alt-text',
      name: 'Empty Alternative Text (Decorative vs Informative)',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: `Found ${emptyAltNonDecorative} image(s) with empty alt="" not marked as decorative.`,
      evidence: `${emptyAltNonDecorative} image(s) have alt="" without role="presentation"`,
      recommendation: 'If these images communicate information, provide descriptive alt text. If decorative, add role="presentation" to silence accessibility linters.'
    });
  } else {
    checks.push({
      id: 'empty-alt-text',
      name: 'Empty Alternative Text (Decorative vs Informative)',
      category,
      status: 'PASSED',
      message: 'No unflagged empty alt attributes found.',
      evidence: 'Clean alt markup'
    });
  }

  // 3. Malformed Image Sources
  if (malformedSrc > 0) {
    score -= 10;
    const f: AnalysisFinding = {
      id: 'malformed-image-src',
      category,
      priority: 'LOW',
      title: 'Images with Missing or Empty src',
      description: `Detected ${malformedSrc} <img> tag(s) with empty or missing src attribute.`,
      evidence: `${malformedSrc} <img> tags missing src`,
      recommendation: 'Ensure all <img> tags reference valid image URLs.',
      affectedUrl: finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'image-src',
      name: 'Image Source URLs',
      category,
      status: 'FAILED',
      severity: 'LOW',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    checks.push({
      id: 'image-src',
      name: 'Image Source URLs',
      category,
      status: 'PASSED',
      message: 'All image tags have defined source paths.',
      evidence: 'All images have src'
    });
  }

  const passedCount = checks.filter(c => c.status === 'PASSED').length;
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  const skippedCount = checks.filter(c => c.status === 'SKIPPED').length;

  return {
    category,
    score: Math.max(0, score),
    checksPerformed: checks.length,
    checksPassed: passedCount,
    checksFailed: failedCount,
    checksSkipped: skippedCount,
    findings,
    checks
  };
}

// -------------------------------------------------------------
// Category 6: Social Sharing
// -------------------------------------------------------------
function evalSocialSharing(
  ogTitle: string | null,
  ogDescription: string | null,
  ogImage: string | null,
  ogUrl: string | null,
  ogType: string | null,
  twitterCard: string | null,
  twitterImage: string | null
): CategoryResult {
  const category: AnalysisCategory = 'Social Sharing';
  const checks: AnalysisCheck[] = [];
  const findings: AnalysisFinding[] = [];
  let score = 100;

  // 1. Open Graph Title
  if (ogTitle) {
    checks.push({
      id: 'og-title',
      name: 'Open Graph Title (og:title)',
      category,
      status: 'PASSED',
      message: 'Open Graph title tag is present.',
      evidence: `og:title="${ogTitle}"`
    });
  } else {
    score -= 10;
    checks.push({
      id: 'og-title',
      name: 'Open Graph Title (og:title)',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: 'Missing og:title tag for social media previews.',
      evidence: 'No meta property="og:title" found.',
      recommendation: 'Add <meta property="og:title" content="..." /> for enhanced social card rendering.'
    });
  }

  // 2. Open Graph Description
  if (ogDescription) {
    checks.push({
      id: 'og-description',
      name: 'Open Graph Description (og:description)',
      category,
      status: 'PASSED',
      message: 'Open Graph description tag is present.',
      evidence: `og:description="${ogDescription}"`
    });
  } else {
    score -= 10;
    checks.push({
      id: 'og-description',
      name: 'Open Graph Description (og:description)',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: 'Missing og:description tag.',
      evidence: 'No meta property="og:description" found.',
      recommendation: 'Add <meta property="og:description" content="..." />.'
    });
  }

  // 3. Open Graph Image
  if (!ogImage) {
    score -= 25;
    const f: AnalysisFinding = {
      id: 'missing-og-image',
      category,
      priority: 'MEDIUM',
      title: 'Missing Open Graph Image (og:image)',
      description: 'The page lacks an og:image tag. Links shared on LinkedIn, Facebook, Slack, and messaging apps will lack visual thumbnail cards.',
      evidence: 'No meta property="og:image" found.',
      recommendation: 'Add a high-resolution 1200x630px image URL: <meta property="og:image" content="https://yourdomain.com/og-image.jpg" />'
    };
    findings.push(f);
    checks.push({
      id: 'og-image',
      name: 'Open Graph Image (og:image)',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    const isAbsolute = ogImage.startsWith('http://') || ogImage.startsWith('https://');
    if (!isAbsolute) {
      score -= 10;
      const f: AnalysisFinding = {
        id: 'relative-og-image',
        category,
        priority: 'LOW',
        title: 'Open Graph Image Uses Relative URL',
        description: `og:image points to a relative path ("${ogImage}"). Social crawlers require a fully qualified absolute URL with scheme and host.`,
        evidence: `og:image="${ogImage}"`,
        recommendation: 'Update og:image to a full absolute URL (e.g. https://example.com/image.jpg).'
      };
      findings.push(f);
      checks.push({
        id: 'og-image',
        name: 'Open Graph Image (og:image)',
        category,
        status: 'FAILED',
        severity: 'LOW',
        message: f.description,
        evidence: f.evidence,
        recommendation: f.recommendation
      });
    } else {
      checks.push({
        id: 'og-image',
        name: 'Open Graph Image (og:image)',
        category,
        status: 'PASSED',
        message: 'Open Graph image is specified with an absolute URL.',
        evidence: `og:image="${ogImage}"`
      });
    }
  }

  // 4. Twitter Card Metadata
  if (twitterCard) {
    checks.push({
      id: 'twitter-card',
      name: 'Twitter Card (twitter:card)',
      category,
      status: 'PASSED',
      message: `Twitter Card format configured as "${twitterCard}".`,
      evidence: `twitter:card="${twitterCard}"`
    });
  } else {
    checks.push({
      id: 'twitter-card',
      name: 'Twitter Card (twitter:card)',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: 'Missing twitter:card metadata tag. Twitter will fall back to Open Graph if present.',
      evidence: 'No meta name="twitter:card" found.',
      recommendation: 'Add <meta name="twitter:card" content="summary_large_image" /> for rich Twitter/X cards.'
    });
  }

  const passedCount = checks.filter(c => c.status === 'PASSED').length;
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  const skippedCount = checks.filter(c => c.status === 'SKIPPED').length;

  return {
    category,
    score: Math.max(0, score),
    checksPerformed: checks.length,
    checksPassed: passedCount,
    checksFailed: failedCount,
    checksSkipped: skippedCount,
    findings,
    checks
  };
}

// -------------------------------------------------------------
// Category 7: Structured Data
// -------------------------------------------------------------
function evalStructuredData(
  jsonLdCount: number,
  jsonLdTypes: string[],
  jsonLdErrors: string[],
  $: cheerio.CheerioAPI
): CategoryResult {
  const category: AnalysisCategory = 'Structured Data';
  const checks: AnalysisCheck[] = [];
  const findings: AnalysisFinding[] = [];
  let score = 100;

  // 1. JSON-LD Syntax Validity
  if (jsonLdErrors.length > 0) {
    score -= 40;
    const f: AnalysisFinding = {
      id: 'malformed-json-ld',
      category,
      priority: 'HIGH',
      title: 'Malformed JSON-LD Syntax Detected',
      description: `Detected syntax error in <script type="application/ld+json">: ${jsonLdErrors[0]}. Search engines will fail to parse this structured data.`,
      evidence: `JSON Parse Error: ${jsonLdErrors.join('; ')}`,
      recommendation: 'Validate your JSON-LD with a JSON linter and ensure quotes and commas are formatted correctly.'
    };
    findings.push(f);
    checks.push({
      id: 'json-ld-syntax',
      name: 'JSON-LD Syntax Validity',
      category,
      status: 'FAILED',
      severity: 'HIGH',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else if (jsonLdCount > 0) {
    checks.push({
      id: 'json-ld-syntax',
      name: 'JSON-LD Syntax Validity',
      category,
      status: 'PASSED',
      message: `All ${jsonLdCount} JSON-LD block(s) parsed as valid JSON.`,
      evidence: `${jsonLdCount} valid block(s)`
    });
  } else {
    checks.push({
      id: 'json-ld-syntax',
      name: 'JSON-LD Syntax Validity',
      category,
      status: 'SKIPPED',
      message: 'No JSON-LD script tags found on page.',
      evidence: '0 JSON-LD scripts'
    });
  }

  // 2. Schema.org Entity Types Detected
  const microdataCount = $('[itemscope]').length;

  if (jsonLdTypes.length > 0) {
    checks.push({
      id: 'schema-entities',
      name: 'Schema.org Entity Types Detected',
      category,
      status: 'PASSED',
      message: `Detected Schema.org types: ${jsonLdTypes.join(', ')}.`,
      evidence: `Types: ${jsonLdTypes.join(', ')}`
    });
  } else if (microdataCount > 0) {
    checks.push({
      id: 'schema-entities',
      name: 'Schema.org Entity Types Detected',
      category,
      status: 'PASSED',
      message: `Detected ${microdataCount} Microdata item(s).`,
      evidence: `${microdataCount} itemscope element(s)`
    });
  } else {
    score -= 25;
    const f: AnalysisFinding = {
      id: 'missing-structured-data',
      category,
      priority: 'MEDIUM',
      title: 'No Schema.org Structured Data Detected',
      description: 'The page lacks Schema.org structured data (JSON-LD or Microdata). Adding structured data helps search engines and AI assistants understand your organization, products, and articles.',
      evidence: '0 Schema.org entities detected.',
      recommendation: 'Add JSON-LD markup declaring Organization, WebSite, or Article schemas.'
    };
    findings.push(f);
    checks.push({
      id: 'schema-entities',
      name: 'Schema.org Entity Types Detected',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  }

  const passedCount = checks.filter(c => c.status === 'PASSED').length;
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  const skippedCount = checks.filter(c => c.status === 'SKIPPED').length;

  return {
    category,
    score: Math.max(0, score),
    checksPerformed: checks.length,
    checksPassed: passedCount,
    checksFailed: failedCount,
    checksSkipped: skippedCount,
    findings,
    checks
  };
}

// -------------------------------------------------------------
// Category 8: Indexability & Crawling
// -------------------------------------------------------------
function evalIndexability(
  isNoindex: boolean,
  isNofollow: boolean,
  metaRobots: string | null,
  xRobotsHeader: string | null,
  robotsTxt: { accessible: boolean; statusCode: number | null; content: string | null; disallowsRoot: boolean },
  canonicalAttr: string | null,
  finalUrl: string
): CategoryResult {
  const category: AnalysisCategory = 'Indexability & Crawling';
  const checks: AnalysisCheck[] = [];
  const findings: AnalysisFinding[] = [];
  let score = 100;

  // 1. Meta Robots Noindex
  if (isNoindex) {
    score -= 40;
    const evidence = metaRobots ? `meta robots="${metaRobots}"` : `X-Robots-Tag: ${xRobotsHeader}`;
    const f: AnalysisFinding = {
      id: 'noindex-directive',
      category,
      priority: 'CRITICAL',
      title: 'Indexation Blocked ("noindex" Directive)',
      description: 'A "noindex" directive was detected on this page. Search engines are instructed NOT to include this page in search indexes.',
      evidence,
      recommendation: 'If this page is intended for public search traffic, remove the "noindex" directive from your meta tags and response headers.',
      affectedUrl: finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'robots-noindex',
      name: 'Search Engine Indexability Directive',
      category,
      status: 'FAILED',
      severity: 'CRITICAL',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    checks.push({
      id: 'robots-noindex',
      name: 'Search Engine Indexability Directive',
      category,
      status: 'PASSED',
      message: 'Page permits search engine indexing (no "noindex" directive detected).',
      evidence: metaRobots ? `robots="${metaRobots}"` : 'Default indexable'
    });
  }

  // 2. Robots.txt Availability and Root Crawling
  if (robotsTxt.accessible) {
    if (robotsTxt.disallowsRoot) {
      score -= 30;
      const f: AnalysisFinding = {
        id: 'robots-disallow-root',
        category,
        priority: 'HIGH',
        title: 'Robots.txt Blocks Entire Site (Disallow: /)',
        description: 'Your robots.txt file contains a rule disallowing all crawlers from accessing the root directory ("/"). This prevents search bots from discovering any pages.',
        evidence: 'Disallow: / detected in robots.txt',
        recommendation: 'Review your robots.txt file and remove the root disallow rule for general search crawlers.',
        affectedUrl: `${new URL(finalUrl).origin}/robots.txt`
      };
      findings.push(f);
      checks.push({
        id: 'robots-txt',
        name: 'Robots.txt File & Root Directives',
        category,
        status: 'FAILED',
        severity: 'HIGH',
        message: f.description,
        evidence: f.evidence,
        recommendation: f.recommendation
      });
    } else {
      checks.push({
        id: 'robots-txt',
        name: 'Robots.txt File & Root Directives',
        category,
        status: 'PASSED',
        message: 'robots.txt is accessible and allows search engine crawling.',
        evidence: `HTTP ${robotsTxt.statusCode} OK`
      });
    }
  } else {
    checks.push({
      id: 'robots-txt',
      name: 'Robots.txt File & Root Directives',
      category,
      status: 'ADVISORY',
      severity: 'LOW',
      message: 'robots.txt was not found (HTTP 404). While search engines default to indexing all URLs, having a robots.txt is standard practice.',
      evidence: robotsTxt.statusCode ? `HTTP ${robotsTxt.statusCode}` : 'Not accessible',
      recommendation: 'Create a robots.txt file at the root of your domain to guide crawlers and declare sitemaps.'
    });
  }

  // 3. Indexability & Canonical Conflicts
  if (isNoindex && canonicalAttr) {
    score -= 10;
    const f: AnalysisFinding = {
      id: 'noindex-canonical-conflict',
      category,
      priority: 'MEDIUM',
      title: 'Conflict: "noindex" with Canonical Tag',
      description: 'The page has both a "noindex" directive and a canonical tag. Search engines may ignore the canonical tag when noindex is applied.',
      evidence: `noindex present with canonical="${canonicalAttr}"`,
      recommendation: 'Remove noindex if the page should be indexed via canonicalization, or remove the canonical if deindexing is intentional.',
      affectedUrl: finalUrl
    };
    findings.push(f);
    checks.push({
      id: 'indexability-conflicts',
      name: 'Indexability & Canonical Directives',
      category,
      status: 'FAILED',
      severity: 'MEDIUM',
      message: f.description,
      evidence: f.evidence,
      recommendation: f.recommendation
    });
  } else {
    checks.push({
      id: 'indexability-conflicts',
      name: 'Indexability & Canonical Directives',
      category,
      status: 'PASSED',
      message: 'No directive conflicts detected between canonical tags and robots directives.',
      evidence: 'Clean directive configuration'
    });
  }

  const passedCount = checks.filter(c => c.status === 'PASSED').length;
  const failedCount = checks.filter(c => c.status === 'FAILED').length;
  const skippedCount = checks.filter(c => c.status === 'SKIPPED').length;

  return {
    category,
    score: Math.max(0, score),
    checksPerformed: checks.length,
    checksPassed: passedCount,
    checksFailed: failedCount,
    checksSkipped: skippedCount,
    findings,
    checks
  };
}

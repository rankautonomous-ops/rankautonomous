import { describe, it, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import dns from 'dns';
import http from 'http';
import https from 'https';
import { fetchSafely, isPrivateIP, validateUrlPreflight } from '../services/backlinks/backlinkFetcher';

describe('Backlink Fetcher SSRF and Security Tests', () => {
  
  after(() => {
    mock.restoreAll();
  });

  describe('isPrivateIP validations', () => {
    it('rejects localhost IPv4', () => {
      assert.strictEqual(isPrivateIP('127.0.0.1'), true);
      assert.strictEqual(isPrivateIP('127.1.2.3'), true);
    });

    it('rejects 10.x.x.x', () => {
      assert.strictEqual(isPrivateIP('10.0.0.1'), true);
    });

    it('rejects 172.16.x.x to 172.31.x.x', () => {
      assert.strictEqual(isPrivateIP('172.16.0.1'), true);
      assert.strictEqual(isPrivateIP('172.31.255.255'), true);
      // But allows 172.32
      assert.strictEqual(isPrivateIP('172.32.0.1'), false);
    });

    it('rejects 192.168.x.x', () => {
      assert.strictEqual(isPrivateIP('192.168.1.1'), true);
    });

    it('rejects metadata IPs (169.254.x.x)', () => {
      assert.strictEqual(isPrivateIP('169.254.169.254'), true);
    });

    it('rejects 0.0.0.0', () => {
      assert.strictEqual(isPrivateIP('0.0.0.0'), true);
    });

    it('rejects CGNAT (100.64.0.0/10)', () => {
      assert.strictEqual(isPrivateIP('100.64.0.1'), true);
      assert.strictEqual(isPrivateIP('100.127.255.255'), true);
      assert.strictEqual(isPrivateIP('100.128.0.1'), false);
    });

    it('rejects IPv6 loopback and private', () => {
      assert.strictEqual(isPrivateIP('::1'), true);
      assert.strictEqual(isPrivateIP('0:0:0:0:0:0:0:1'), true);
      assert.strictEqual(isPrivateIP('fc00::1'), true); // Unique local
      assert.strictEqual(isPrivateIP('fe80::1'), true); // Link local
      assert.strictEqual(isPrivateIP('::ffff:127.0.0.1'), true); // IPv4-mapped
    });

    it('allows valid public IPs', () => {
      assert.strictEqual(isPrivateIP('8.8.8.8'), false);
      assert.strictEqual(isPrivateIP('1.1.1.1'), false);
      assert.strictEqual(isPrivateIP('142.250.190.46'), false);
      assert.strictEqual(isPrivateIP('2607:f8b0:4005:80b::200e'), false);
    });
  });

  describe('validateUrlPreflight', () => {
    it('rejects invalid URLs', () => {
      const result = validateUrlPreflight('not-a-url');
      assert.strictEqual(result.valid, false);
      if (!result.valid) assert.strictEqual(result.errorCode, 'INVALID_URL');
    });

    it('rejects dangerous protocols (javascript, file, ftp)', () => {
      assert.strictEqual(validateUrlPreflight('javascript:alert(1)').valid, false);
      assert.strictEqual(validateUrlPreflight('file:///etc/passwd').valid, false);
      assert.strictEqual(validateUrlPreflight('ftp://server.com').valid, false);
    });

    it('rejects localhost domain early', () => {
      const result = validateUrlPreflight('http://localhost:3000');
      assert.strictEqual(result.valid, false);
      if (!result.valid) assert.strictEqual(result.errorCode, 'SSRF_BLOCKED');
    });
  });

  describe('DNS Rebinding & Network Protection (fetchSafely)', () => {
    afterEach(() => {
      mock.restoreAll();
    });

    it('prevents DNS rebinding by intercepting the lookup callback', async () => {
      mock.method(dns, 'lookup', (hostname: any, options: any, cb: any) => {
        cb(null, '127.0.0.1', 4);
      });

      const res = await fetchSafely('https://innocent-looking-domain.com');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'SSRF_BLOCKED');
      assert.ok(res.errorMessage?.includes('SSRF blocked'));
    });

    it('handles timeout correctly', async () => {
      // Mock dns to return a public IP
      mock.method(dns, 'lookup', (hostname: any, options: any, cb: any) => {
        cb(null, '8.8.8.8', 4);
      });

      // Mock http.request to never emit response or end, forcing timeout
      mock.method(https, 'request', (options: any, cb: any) => {
        const req = {
          on: (event: string, handler: any) => {
            if (event === 'timeout') {
              // Trigger timeout immediately for test speed
              setTimeout(handler, 10);
            }
          },
          end: () => {},
          destroy: () => {}
        };
        return req;
      });

      const res = await fetchSafely('https://timeout-test.com');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'TIMEOUT');
    });

    it('enforces maximum redirect limit (3)', async () => {
      mock.method(dns, 'lookup', (hostname: any, options: any, cb: any) => {
        cb(null, '8.8.8.8', 4); // valid IP
      });

      let reqCount = 0;
      mock.method(https, 'request', (options: any, cb: any) => {
        reqCount++;
        const res = {
          statusCode: 301,
          headers: { location: `https://redirect-loop.com/${reqCount}` },
          on: () => {},
          resume: () => {}
        };
        const req = {
          on: () => {},
          end: () => cb(res),
          destroy: () => {}
        };
        return req;
      });

      const res = await fetchSafely('https://redirect-loop.com');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'TOO_MANY_REDIRECTS');
      // Should follow 3 redirects and fail on the 4th request.
      assert.strictEqual(res.redirectCount, 3);
    });

    it('enforces maximum response size limit (5MB)', async () => {
      mock.method(dns, 'lookup', (hostname: any, options: any, cb: any) => {
        cb(null, '8.8.8.8', 4);
      });

      mock.method(https, 'request', (options: any, cb: any) => {
        const res = {
          statusCode: 200,
          headers: { 'content-type': 'text/html' },
          on: (event: string, handler: any) => {
            if (event === 'data') {
              // Emit two 3MB chunks (6MB total) to trigger limit
              handler(Buffer.alloc(3 * 1024 * 1024, 'a'));
              handler(Buffer.alloc(3 * 1024 * 1024, 'b'));
            }
          },
          resume: () => {}
        };
        const req = {
          on: () => {},
          end: () => cb(res),
          destroy: () => {} // must implement destroy for aborting
        };
        return req;
      });

      const res = await fetchSafely('https://huge-file.com');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'TOO_LARGE');
    });

    it('respects robots.txt blocking', async () => {
      // Mock lookup for the robots.txt and actual fetch
      mock.method(dns, 'lookup', (hostname: any, options: any, cb: any) => {
        cb(null, '8.8.8.8', 4);
      });

      mock.method(https, 'request', (options: any, cb: any) => {
        if (options.path === '/robots.txt') {
          const res = {
            statusCode: 200,
            headers: { 'content-type': 'text/plain' },
            on: (event: string, handler: any) => {
              if (event === 'data') {
                handler(Buffer.from('User-agent: RankAutonomousBot\nDisallow: /'));
              }
              if (event === 'end') handler();
            },
            resume: () => {}
          };
          const req = { on: () => {}, end: () => cb(res), destroy: () => {} };
          return req;
        }
        
        // Should not reach here, but if it does, return 200
        const res = {
          statusCode: 200,
          headers: { 'content-type': 'text/html' },
          on: (e: string, handler: any) => { if(e==='end') handler(); },
          resume: () => {}
        };
        return { on: () => {}, end: () => cb(res), destroy: () => {} };
      });

      const res = await fetchSafely('https://blocked-by-robots.com/page');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorCode, 'ROBOTS_BLOCKED');
    });
  });
});

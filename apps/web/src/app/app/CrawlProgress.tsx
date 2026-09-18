'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, XCircle, CheckCircle, Play, AlertCircle, RotateCcw } from 'lucide-react';

interface CrawlProgressProps {
  websiteId: string;
  initialStatus: string;
  token: string;
  onCrawlComplete?: () => void;
}

interface CrawlStatus {
  status: string;
  totalUrls: number;
  crawledUrls: number;
  failedUrls: number;
  progress: number;
  error?: string | null;
}

export default function CrawlProgress({ websiteId, initialStatus, token, onCrawlComplete }: CrawlProgressProps) {
  const [crawlData, setCrawlData] = useState<CrawlStatus | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [localStatus, setLocalStatus] = useState(initialStatus);

  const fetchProgress = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/crawl`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setCrawlData(data);
        
        if (data.status === 'COMPLETED' || data.status === 'FAILED' || data.status === 'CANCELLED') {
          setLocalStatus(data.status === 'COMPLETED' ? 'ACTIVE' : data.status);
          if (data.status === 'COMPLETED' && onCrawlComplete) {
            onCrawlComplete();
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch crawl progress:', err);
    }
  };

  useEffect(() => {
    fetchProgress();
    let intervalId: NodeJS.Timeout;

    // Poll while crawl is running
    if (
      localStatus === 'ANALYZING' ||
      crawlData?.status === 'CRAWLING' ||
      crawlData?.status === 'PENDING'
    ) {
      intervalId = setInterval(fetchProgress, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [websiteId, token, localStatus, crawlData?.status]);

  const handleStartOrRetry = async () => {
    setIsStarting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/crawl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        setCrawlData({
          status: 'PENDING',
          totalUrls: 1,
          crawledUrls: 0,
          failedUrls: 0,
          progress: 0,
          error: null
        });
        setLocalStatus('ANALYZING');
      }
    } catch (e) {
      console.error('Failed to trigger crawl:', e);
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      await fetch(`${apiUrl}/api/websites/${websiteId}/crawl/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setLocalStatus('CANCELLED');
      setCrawlData(prev => prev ? { ...prev, status: 'CANCELLED' } : null);
    } catch (e) {
      console.error('Cancel failed', e);
    } finally {
      setIsCancelling(false);
    }
  };

  const isNotStarted = !crawlData || crawlData.status === 'NOT_STARTED';
  const isActive = crawlData?.status === 'CRAWLING' || crawlData?.status === 'PENDING';
  const isComplete = crawlData?.status === 'COMPLETED';
  const isFailed = crawlData?.status === 'FAILED';
  const isCancelled = crawlData?.status === 'CANCELLED';

  const progressPercent = crawlData ? Math.min(100, Math.round(crawlData.progress * 100)) : 0;
  const displayCrawlStatus = isNotStarted ? 'NOT STARTED' : (crawlData?.status || 'NOT STARTED');

  return (
    <div style={{ marginTop: '20px', padding: '20px 24px', background: 'var(--surface-soft, #fbf8f5)', borderRadius: 'var(--radius-md, 16px)', border: '1px solid var(--border, #ded9d4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text, #111111)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isNotStarted ? <Play size={16} color="#c69752" /> :
           isActive ? <RefreshCw size={16} color="#8c423d" className="animate-spin" /> : 
           isComplete ? <CheckCircle size={16} color="var(--success, #6f9b7c)" /> : 
           isCancelled ? <XCircle size={16} color="var(--text-secondary, #5f5b58)" /> :
           <XCircle size={16} color="var(--error, #c66f6f)" />}
          {isNotStarted ? 'Website connected. Ready for first crawl.' :
           isActive ? 'Crawling Website Pages...' : 
           isComplete ? 'Website Crawl Completed' : 
           isCancelled ? 'Crawl Cancelled' : 'Crawl Failed'}
        </h3>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          {isNotStarted && (
            <button 
              type="button"
              onClick={handleStartOrRetry}
              disabled={isStarting}
              style={{
                background: 'var(--text, #111111)',
                border: 'none',
                color: '#ffffff',
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm, 10px)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isStarting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isStarting ? 0.7 : 1
              }}
            >
              {isStarting ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
              {isStarting ? 'Starting Crawl...' : 'Start Crawl'}
            </button>
          )}

          {isActive && (
            <button 
              type="button"
              onClick={handleCancel}
              disabled={isCancelling}
              style={{
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--border, #ded9d4)',
                color: 'var(--error, #c66f6f)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm, 10px)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isCancelling ? 'not-allowed' : 'pointer',
                opacity: isCancelling ? 0.5 : 1
              }}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Crawl'}
            </button>
          )}

          {isFailed && (
            <button 
              type="button"
              onClick={handleStartOrRetry}
              disabled={isStarting}
              style={{
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--error, #c66f6f)',
                color: 'var(--error, #c66f6f)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm, 10px)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isStarting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isStarting ? 0.7 : 1
              }}
            >
              {isStarting ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              {isStarting ? 'Retrying...' : 'Retry Crawl'}
            </button>
          )}

          {isComplete && (
            <button 
              type="button"
              onClick={handleStartOrRetry}
              disabled={isStarting}
              style={{
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--border, #ded9d4)',
                color: 'var(--text, #111111)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm, 10px)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isStarting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isStarting ? 0.7 : 1
              }}
            >
              {isStarting ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              {isStarting ? 'Starting...' : 'Rerun Crawl'}
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar (hidden when not started) */}
      {!isNotStarted && (
        <div style={{ background: 'var(--border, #ded9d4)', height: '6px', borderRadius: '9999px', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ 
            height: '100%', 
            background: isComplete ? 'var(--success, #6f9b7c)' : isFailed ? 'var(--error, #c66f6f)' : 'var(--text, #111111)', 
            width: `${progressPercent}%`,
            transition: 'width 0.5s ease-out'
          }} />
        </div>
      )}

      {/* Subtext when not started */}
      {isNotStarted && (
        <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--text-secondary, #5f5b58)', lineHeight: '1.5' }}>
          Launch our autonomous crawler to discover pages, check robots.txt, evaluate status codes, and unlock your technical SEO audit.
        </p>
      )}

      {/* Persisted Error Details */}
      {isFailed && crawlData?.error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: '8px', border: '1px solid var(--error, #c66f6f)', marginBottom: '14px', fontSize: '13px', color: 'var(--error, #c66f6f)' }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <AlertCircle size={14} /> Crawl Error:
          </strong>
          {crawlData.error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '12px', color: 'var(--text-secondary, #5f5b58)' }}>
        <div>
          <div style={{ color: 'var(--text, #111111)', fontWeight: 700, fontSize: '14px' }}>{crawlData?.crawledUrls || 0}</div>
          <div>Pages Crawled</div>
        </div>
        <div>
          <div style={{ color: 'var(--text, #111111)', fontWeight: 700, fontSize: '14px' }}>{crawlData?.totalUrls || 0}</div>
          <div>Pages Discovered</div>
        </div>
        <div>
          <div style={{ color: (crawlData?.failedUrls || 0) > 0 ? 'var(--error, #c66f6f)' : 'var(--text, #111111)', fontWeight: 700, fontSize: '14px' }}>
            {crawlData?.failedUrls || 0}
          </div>
          <div>Pages Failed</div>
        </div>
        <div>
          <div style={{ color: 'var(--text, #111111)', fontWeight: 700, fontSize: '14px' }}>
            {displayCrawlStatus}
          </div>
          <div>Crawl Status</div>
        </div>
      </div>
    </div>
  );
}

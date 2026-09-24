'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import { Play, Check, X, RefreshCw, Edit3, Globe, ShieldCheck, Link as LinkIcon, Image, AlignLeft, Sparkles, ArrowLeft, ExternalLink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import styles from '../../app.module.css';
import contentStyles from '../content.module.css';

export default function ArticleWorkspace({ articleId }: { articleId: string }) {
  const [activeWebsite, setActiveWebsite] = useState<any>(null);
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [editedMetaDesc, setEditedMetaDesc] = useState('');
  const [editedSlug, setEditedSlug] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // WordPress CMS state
  const [wpIntegration, setWpIntegration] = useState<{ connected: boolean; integration?: any } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string | null>(null);
  const [showWpModal, setShowWpModal] = useState(false);
  const [wpUrl, setWpUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpPassword, setWpPassword] = useState('');
  const [wpConnecting, setWpConnecting] = useState(false);
  const [wpError, setWpError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchWorkspaceData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const siteRes = await fetch(`${apiUrl}/api/websites/active`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!siteRes.ok) throw new Error('No active website');
      const siteData = await siteRes.json();
      const targetSite = siteData.website || siteData;
      setActiveWebsite(targetSite);
      
      const artRes = await fetch(`${apiUrl}/api/websites/${targetSite.id}/articles/${articleId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!artRes.ok) throw new Error('Failed to load article');
      const artData = await artRes.json();
      const loadedArticle = artData.article || artData;
      setArticle(loadedArticle);
      
      if (loadedArticle.content && !editedContent) {
        setEditedContent(loadedArticle.content);
      }
      if (loadedArticle.title && !editedTitle) {
        setEditedTitle(loadedArticle.title);
      }
      if (loadedArticle.metaDescription && !editedMetaDesc) {
        setEditedMetaDesc(loadedArticle.metaDescription);
      }
      if (loadedArticle.slug && !editedSlug) {
        setEditedSlug(loadedArticle.slug);
      }

      // Check WordPress integration
      try {
        const wpRes = await fetch(`${apiUrl}/api/websites/${targetSite.id}/integrations/wordpress`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (wpRes.ok) {
          const wpData = await wpRes.json();
          setWpIntegration(wpData);
          if (wpData.integration?.config?.siteUrl) {
            setWpUrl(wpData.integration.config.siteUrl);
          }
          if (wpData.integration?.config?.username) {
            setWpUsername(wpData.integration.config.username);
          }
        }
      } catch (wpErr) {
        console.warn('WordPress integration check error:', wpErr);
      }

      // If there is an active job, poll for completion
      if (
        loadedArticle.latestJob &&
        (loadedArticle.latestJob.status === 'QUEUED' || loadedArticle.latestJob.status === 'PROCESSING')
      ) {
        checkJobStatus(targetSite.id, loadedArticle, session.access_token);
      } else {
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load workspace.');
    } finally {
      setLoading(false);
    }
  };

  const checkJobStatus = async (websiteId: string, currentArticle: any, token: string) => {
    const currentStatus = currentArticle.status;
    let attempts = 0;
    setIsProcessing(true);

    const poll = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${apiUrl}/api/websites/${websiteId}/articles/${articleId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const polledArt = data.article || data;
          
          if (
            polledArt.status !== currentStatus || 
            (polledArt.latestJob && (polledArt.latestJob.status === 'COMPLETED' || polledArt.latestJob.status === 'FAILED'))
          ) {
            clearInterval(poll);
            setArticle(polledArt);
            if (polledArt.content) setEditedContent(polledArt.content);
            if (polledArt.title) setEditedTitle(polledArt.title);
            if (polledArt.metaDescription) setEditedMetaDesc(polledArt.metaDescription);
            if (polledArt.slug) setEditedSlug(polledArt.slug);
            setIsProcessing(false);
          }
        }
      } catch (e) {
        console.error('Polling error', e);
      }
      if (attempts > 60) { // 3 minutes timeout
        clearInterval(poll);
        setIsProcessing(false);
      }
    }, 3000);
  };

  useEffect(() => {
    fetchWorkspaceData();
  }, [articleId]);

  const handleAction = async (action: 'generate' | 'review' | 'transition', payload?: any) => {
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/articles/${articleId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: payload ? JSON.stringify(payload) : undefined
      });

      if (res.ok) {
        fetchWorkspaceData();
      } else {
        const errData = await res.json();
        alert(errData.error || errData.message || `Failed to ${action} article`);
        setIsProcessing(false);
      }
    } catch (err) {
      console.error(err);
      alert('An unexpected error occurred');
      setIsProcessing(false);
    }
  };

  const handleConnectWordPress = async (e: React.FormEvent) => {
    e.preventDefault();
    setWpConnecting(true);
    setWpError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/integrations/wordpress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          siteUrl: wpUrl,
          username: wpUsername,
          applicationPassword: wpPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to connect WordPress');
      }
      setWpIntegration({ connected: true, integration: data.integration });
      setShowWpModal(false);
      setWpPassword('');
      alert('WordPress site connected successfully!');
    } catch (err: any) {
      setWpError(err.message || 'Connection failed');
    } finally {
      setWpConnecting(false);
    }
  };

  const handlePublishArticle = async (postStatus: 'publish' | 'draft' = 'publish') => {
    setIsPublishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/articles/${articleId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ postStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to publish to WordPress');
      }
      setArticle(data.article);
      setPublishSuccessMsg(
        postStatus === 'publish'
          ? `Successfully published to WordPress! Post #${data.publicationInfo.postId}`
          : `Saved as draft on WordPress! Post #${data.publicationInfo.postId}`
      );
      setTimeout(() => setPublishSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Error publishing to WordPress');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUpdateWordPressPost = async () => {
    setIsPublishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/articles/${articleId}/publish`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update WordPress post');
      }
      setArticle(data.article);
      setPublishSuccessMsg('WordPress post updated successfully!');
      setTimeout(() => setPublishSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Error updating WordPress post');
    } finally {
      setIsPublishing(false);
    }
  };

  const saveArticle = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/articles/${articleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          title: editedTitle,
          metaDescription: editedMetaDesc,
          slug: editedSlug,
          content: editedContent
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setArticle(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save changes');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving article');
    }
  };

  if (loading) {
    return (
      <div className={styles.card} style={{ textAlign: 'center', padding: '60px 24px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading article studio...</p>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className={styles.card} style={{ textAlign: 'center', padding: '60px 24px' }}>
        <p style={{ color: 'var(--error, #c66f6f)', marginBottom: '16px' }}>{error || 'Article not found.'}</p>
        <Link href="/app/content" className={styles.primaryButton}>
          Back to Content Engine →
        </Link>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'IDEA': return <span className={`${contentStyles.badge} ${contentStyles.badgeIdea}`}>Idea</span>;
      case 'DRAFT': return <span className={`${contentStyles.badge} ${contentStyles.badgeDraft}`}>Draft</span>;
      case 'AI_REVIEW': return <span className={`${contentStyles.badge} ${contentStyles.badgeReview}`}>AI Review</span>;
      case 'USER_REVIEW': return <span className={`${contentStyles.badge} ${contentStyles.badgeReview}`}>User Review</span>;
      case 'APPROVED': return <span className={`${contentStyles.badge} ${contentStyles.badgeApproved}`}>Approved</span>;
      case 'PUBLISHED': return <span className={`${contentStyles.badge} ${contentStyles.badgePublished}`}>Published</span>;
      default: return <span className={contentStyles.badge}>{status}</span>;
    }
  };

  const renderReviewPanel = () => {
    if (!article.aiReviewData) {
      return (
        <div className={styles.card} style={{ marginBottom: '24px' }}>
          <h3 className={styles.cardTitle}>
            <Sparkles size={18} color="#8c423d" />
            AI Review
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', marginTop: '12px' }}>
            No review generated yet. Once draft content is generated, request an AI Review to inspect strengths, issues, and content depth.
          </p>
        </div>
      );
    }

    const review = article.aiReviewData;
    let scoreClass = contentStyles.mediumScore;
    if (review.score >= 80) scoreClass = contentStyles.goodScore;
    else if (review.score < 60) scoreClass = contentStyles.badScore;

    return (
      <div className={styles.card} style={{ marginBottom: '24px' }}>
        <h3 className={styles.cardTitle}>
          <Sparkles size={18} color="#8c423d" />
          AI Review
        </h3>

        <div className={`${contentStyles.reviewScore} ${scoreClass}`}>
          {review.score}
          <span style={{ fontSize: '18px', color: 'var(--text-muted)', fontWeight: 500 }}>/100</span>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', marginBottom: '8px', lineHeight: '1.5' }}>
          {review.summary}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', marginBottom: '20px' }}>
          Internal Content Readiness Score
        </p>

        <div className={contentStyles.reviewPanel}>
          {review.issues && review.issues.length > 0 && (
            <div className={contentStyles.reviewSection}>
              <h4 style={{ color: 'var(--error)' }}>
                <X size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                Issues ({review.issues.length})
              </h4>
              <ul className={contentStyles.reviewList}>
                {review.issues.map((issue: string, i: number) => <li key={i}>{issue}</li>)}
              </ul>
            </div>
          )}

          {review.recommendations && review.recommendations.length > 0 && (
            <div className={contentStyles.reviewSection}>
              <h4>
                <ShieldCheck size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                Suggestions
              </h4>
              <ul className={contentStyles.reviewList}>
                {review.recommendations.map((rec: string, i: number) => <li key={i}>{rec}</li>)}
              </ul>
            </div>
          )}

          {review.strengths && review.strengths.length > 0 && (
            <div className={contentStyles.reviewSection}>
              <h4 style={{ color: 'var(--success)' }}>
                <Check size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                Strengths
              </h4>
              <ul className={contentStyles.reviewList}>
                {review.strengths.map((strength: string, i: number) => <li key={i}>{strength}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderActionsPanel = () => {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Workflow Actions</h3>
        <p className={styles.cardDescription} style={{ marginBottom: '16px' }}>
          Current State: <strong>{article.status}</strong>
        </p>

        <div className={contentStyles.actionPanel} style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          {['IDEA', 'PLANNED', 'SCHEDULED'].includes(article.status) && (
            <>
              <button 
                className={styles.primaryButton} 
                disabled={isProcessing}
                onClick={() => handleAction('generate')}
                style={{ width: '100%', marginBottom: '8px' }}
              >
                <Play size={16} /> Generate Article
              </button>
              <button 
                className={styles.secondaryButton} 
                disabled={isProcessing}
                onClick={() => handleAction('transition', { targetStatus: 'CANCELLED' })}
                style={{ width: '100%' }}
              >
                <X size={16} /> Cancel Plan
              </button>
            </>
          )}

          {article.status === 'GENERATING' && (
            <div style={{ padding: '12px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--primary)' }} />
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>AI is currently generating this article...</p>
            </div>
          )}

          {article.status === 'FAILED' && (
            <button 
              className={styles.primaryButton} 
              disabled={isProcessing}
              onClick={() => handleAction('generate')}
              style={{ width: '100%' }}
            >
              <RefreshCw size={16} /> Retry Generation
            </button>
          )}

          {article.status === 'DRAFT' && (
            <>
              <button 
                className={styles.secondaryButton} 
                disabled={isProcessing || !article.content}
                onClick={() => handleAction('review')}
                style={{ width: '100%' }}
              >
                <RefreshCw size={16} className={isProcessing ? 'animate-spin' : ''} />
                Request AI Review
              </button>
              
              <button 
                className={styles.primaryButton} 
                disabled={isProcessing}
                onClick={() => handleAction('transition', { targetStatus: 'USER_REVIEW' })}
                style={{ width: '100%' }}
              >
                <Check size={16} /> Move to User Review
              </button>
            </>
          )}

          {article.status === 'AI_REVIEW' && (
            <button 
              className={styles.primaryButton} 
              disabled={isProcessing}
              onClick={() => handleAction('transition', { targetStatus: 'USER_REVIEW' })}
              style={{ width: '100%' }}
            >
              <Check size={16} /> Proceed to User Review
            </button>
          )}

          {article.status === 'USER_REVIEW' && (
            <>
              <button 
                className={styles.primaryButton} 
                disabled={isProcessing}
                onClick={() => handleAction('transition', { targetStatus: 'APPROVED' })}
                style={{ width: '100%' }}
              >
                <Check size={16} /> Approve Article
              </button>
              <button 
                className={styles.secondaryButton} 
                disabled={isProcessing}
                onClick={() => handleAction('transition', { targetStatus: 'DRAFT' })}
                style={{ width: '100%' }}
              >
                <Edit3 size={16} /> Return to Draft
              </button>
            </>
          )}

          {article.status === 'APPROVED' && (
            <>
              {publishSuccessMsg && (
                <div style={{ padding: '10px 12px', background: '#edf7ee', border: '1px solid #b6e2be', borderRadius: 'var(--radius-sm)', color: '#2e6b3b', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  <CheckCircle size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                  {publishSuccessMsg}
                </div>
              )}

              {wpIntegration?.connected ? (
                <>
                  <button 
                    className={styles.primaryButton} 
                    disabled={isProcessing || isPublishing}
                    onClick={() => handlePublishArticle('publish')}
                    style={{ width: '100%' }}
                  >
                    {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                    Publish to WordPress
                  </button>
                  <button 
                    className={styles.secondaryButton} 
                    disabled={isProcessing || isPublishing}
                    onClick={() => handlePublishArticle('draft')}
                    style={{ width: '100%' }}
                  >
                    Save as WordPress Draft
                  </button>
                </>
              ) : (
                <div style={{ padding: '12px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textAlign: 'center', marginBottom: '8px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
                    WordPress is not connected. Connect your site to publish directly.
                  </p>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => setShowWpModal(true)}
                    style={{ width: '100%', fontSize: '13px' }}
                  >
                    <Globe size={14} /> Connect WordPress
                  </button>
                </div>
              )}

              <button 
                className={styles.secondaryButton} 
                disabled={isProcessing || isPublishing}
                onClick={() => handleAction('transition', { targetStatus: 'PUBLISHED' })}
                style={{ width: '100%', fontSize: '12px' }}
                title="Mark as published in RankAutonomous without sending to WordPress"
              >
                Mark as Published (Manual)
              </button>
              <button 
                className={styles.secondaryButton} 
                disabled={isProcessing || isPublishing}
                onClick={() => handleAction('transition', { targetStatus: 'USER_REVIEW' })}
                style={{ width: '100%' }}
              >
                <Edit3 size={16} /> Reopen Review
              </button>
            </>
          )}

          {article.status === 'PUBLISHED' && (
            <>
              {publishSuccessMsg && (
                <div style={{ padding: '10px 12px', background: '#edf7ee', border: '1px solid #b6e2be', borderRadius: 'var(--radius-sm)', color: '#2e6b3b', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  <CheckCircle size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                  {publishSuccessMsg}
                </div>
              )}

              {article.cmsPublicationInfo?.provider === 'WORDPRESS' ? (
                <div style={{ padding: '14px', background: '#edf7ee', border: '1px solid #b6e2be', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2e6b3b', fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
                    <CheckCircle size={16} /> Live on WordPress
                  </div>
                  <div style={{ fontSize: '12px', color: '#1b4d26', lineHeight: 1.5, marginBottom: '10px' }}>
                    <div>Post ID: <strong>#{article.cmsPublicationInfo.postId}</strong></div>
                    <div>Status: <strong>{article.cmsPublicationInfo.status?.toUpperCase()}</strong></div>
                  </div>
                  {article.cmsPublicationInfo.postUrl && (
                    <a
                      href={article.cmsPublicationInfo.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.primaryButton}
                      style={{ width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none', fontSize: '13px', padding: '8px 12px' }}
                    >
                      View Live Post <ExternalLink size={14} />
                    </a>
                  )}
                  <button
                    className={styles.secondaryButton}
                    disabled={isPublishing}
                    onClick={handleUpdateWordPressPost}
                    style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
                  >
                    {isPublishing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Sync Edits to WordPress
                  </button>
                </div>
              ) : (
                <div style={{ padding: '12px', background: '#edf7ee', border: '1px solid #b6e2be', borderRadius: 'var(--radius-sm)', textAlign: 'center', color: '#2e6b3b', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  ✓ Article is marked as Published
                </div>
              )}

              {(!article.cmsPublicationInfo || article.cmsPublicationInfo.provider !== 'WORDPRESS') && wpIntegration?.connected && (
                <button
                  className={styles.primaryButton}
                  disabled={isPublishing}
                  onClick={() => handlePublishArticle('publish')}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  <Globe size={16} /> Publish to WordPress Now
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const headings = article.seoData?.headings || [];
  const imageSuggestions = article.seoData?.imageSuggestions || [];
  const internalLinks = Array.isArray(article.internalLinks) ? article.internalLinks : [];

  return (
    <div>
      <div className={contentStyles.workspaceHeader}>
        <div className={contentStyles.breadcrumb}>
          <Link href="/app/content" className={contentStyles.breadcrumbLink}>
            <ArrowLeft size={16} />
            Back to Content Engine
          </Link>
        </div>
        <div>
          {getStatusBadge(article.status)}
        </div>
      </div>

      <div className={contentStyles.workspaceLayout}>
        <div className={contentStyles.mainPanel}>
          <div className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
                  {article.title || article.topic}
                </h1>
                <div style={{ display: 'flex', gap: '12px', color: 'var(--text-secondary)', fontSize: '13px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>Target: <strong>{article.primaryKeyword || article.targetKeyword || 'None'}</strong></span>
                  <span>•</span>
                  <span>{article.wordCount || 0} target words</span>
                  <span>•</span>
                  <span>Tone: {article.tone || 'Professional'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {saveSuccess && <span style={{ color: 'var(--success)', fontSize: '13px', fontWeight: 600 }}>✓ Saved!</span>}
                <button
                  onClick={saveArticle}
                  className={styles.secondaryButton}
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Save Changes
                </button>
              </div>
            </div>

            {isProcessing ? (
              <div className={contentStyles.progressPoller}>
                <div className={contentStyles.spinner}></div>
                <h3 style={{ color: 'var(--text)', margin: '0 0 8px 0', fontSize: '18px' }}>AI Operation In Progress...</h3>
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>
                  Synthesizing search intent, content depth, and semantic NLP keywords.
                </p>
              </div>
            ) : article.status === 'IDEA' ? (
              <div className={contentStyles.emptyState} style={{ marginTop: 0 }}>
                <Edit3 className={contentStyles.emptyIcon} />
                <h3 className={contentStyles.emptyTitle}>Ready to Generate</h3>
                <p className={contentStyles.emptyDesc}>
                  Your topic and target keyword are configured. Click "Generate Article" in the sidebar to create your first draft.
                </p>
              </div>
            ) : (
              <div>
                {/* Metadata editor */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Article Title</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>URL Slug</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={editedSlug}
                      onChange={(e) => setEditedSlug(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup} style={{ marginBottom: '20px' }}>
                  <label className={styles.label}>Meta Description</label>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={editedMetaDesc}
                    onChange={(e) => setEditedMetaDesc(e.target.value)}
                  />
                </div>

                {/* Content Editor */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Article Body (Semantic HTML)</label>
                  <textarea
                    className={styles.textarea}
                    style={{ minHeight: '500px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6' }}
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    placeholder="Article content..."
                  />
                </div>

                {/* Headings & Structure */}
                {headings.length > 0 && (
                  <div className={contentStyles.outlineCard}>
                    <div className={contentStyles.outlineTitle}>
                      <AlignLeft size={16} /> Article Outline
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {headings.map((h: string, idx: number) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Internal Links */}
                {internalLinks.length > 0 && (
                  <div className={contentStyles.outlineCard}>
                    <div className={contentStyles.outlineTitle}>
                      <LinkIcon size={16} /> Verified Internal Links
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text)', fontSize: '13px' }}>
                      {internalLinks.map((url: string, idx: number) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Image Suggestions */}
                {imageSuggestions.length > 0 && (
                  <div className={contentStyles.outlineCard}>
                    <div className={contentStyles.outlineTitle}>
                      <Image size={16} /> Media &amp; Image Suggestions
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {imageSuggestions.map((img: string, idx: number) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{img}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={contentStyles.sidePanel}>
          {renderReviewPanel()}
          {renderActionsPanel()}
        </div>
      </div>

      {/* WordPress Connection Modal */}
      {showWpModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className={styles.card} style={{ maxWidth: '480px', width: '100%', background: 'var(--surface-raised, #ffffff)', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
                Connect WordPress Site
              </h3>
              <button
                onClick={() => setShowWpModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
              Enable 1-click publishing to your WordPress blog using official WordPress Application Passwords.
            </p>

            {wpError && (
              <div style={{ padding: '10px 12px', background: 'var(--error-light, #fef2f2)', border: '1px solid var(--error, #ef4444)', borderRadius: 'var(--radius-sm)', color: 'var(--error, #b91c1c)', fontSize: '13px', marginBottom: '16px' }}>
                <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                {wpError}
              </div>
            )}

            <form onSubmit={handleConnectWordPress}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>
                  WordPress Site URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://myblog.com"
                  value={wpUrl}
                  onChange={(e) => setWpUrl(e.target.value)}
                  className={styles.input}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>
                  WordPress Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="admin or editor_user"
                  value={wpUsername}
                  onChange={(e) => setWpUsername(e.target.value)}
                  className={styles.input}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>
                  Application Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={wpPassword}
                  onChange={(e) => setWpPassword(e.target.value)}
                  className={styles.input}
                  style={{ width: '100%' }}
                />
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Generated in WP Admin &gt; Users &gt; Profile &gt; Application Passwords.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setShowWpModal(false)}
                  disabled={wpConnecting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={wpConnecting}
                >
                  {wpConnecting ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                  {wpConnecting ? 'Verifying...' : 'Connect & Verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { Plus, FileText, Type, Tag, Calendar, ArrowRight, Sparkles } from 'lucide-react';
import styles from '../app.module.css';
import contentStyles from './content.module.css';

export default function ContentDashboard() {
  const [activeWebsite, setActiveWebsite] = useState<any>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter Tabs: All, Ideas, Drafts, Review, Approved, Published
  const [activeTab, setActiveTab] = useState<'ALL' | 'IDEA' | 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED'>('ALL');

  // New Article Form
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newTargetKeyword, setNewTargetKeyword] = useState('');
  const [newWordCount, setNewWordCount] = useState(1500);

  const router = useRouter();
  const supabase = createClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchActiveWebsite();
  }, []);

  const fetchActiveWebsite = async () => {
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
      
      if (targetSite?.id) {
        fetchArticles(targetSite.id, session.access_token);
      }
    } catch (err: any) {
      console.error(err);
      setError('Please connect a website in Onboarding before managing content.');
      setLoading(false);
    }
  };

  const fetchArticles = async (websiteId: string, token: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/articles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setArticles(Array.isArray(data) ? data : (data.articles || []));
      }
    } catch (err) {
      console.error('Failed to load articles', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim() || !newTargetKeyword.trim() || !activeWebsite) return;

    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          topic: newTopic.trim(),
          primaryKeyword: newTargetKeyword.trim(),
          targetKeyword: newTargetKeyword.trim(),
          wordCount: newWordCount,
        })
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/app/content/${data.id}`);
      } else {
        const errData = await res.json();
        alert(errData.error || errData.message || 'Failed to create article');
      }
    } catch (err) {
      console.error(err);
      alert('An unexpected error occurred');
    } finally {
      setIsCreating(false);
    }
  };

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

  const filteredArticles = articles.filter(art => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'IDEA') return art.status === 'IDEA';
    if (activeTab === 'DRAFT') return art.status === 'DRAFT';
    if (activeTab === 'REVIEW') return art.status === 'AI_REVIEW' || art.status === 'USER_REVIEW';
    if (activeTab === 'APPROVED') return art.status === 'APPROVED';
    if (activeTab === 'PUBLISHED') return art.status === 'PUBLISHED';
    return true;
  });

  if (loading) {
    return (
      <div className={styles.card} style={{ textAlign: 'center', padding: '60px 24px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading content workspace...</p>
      </div>
    );
  }

  if (error || !activeWebsite) {
    return (
      <div className={styles.card} style={{ textAlign: 'center', padding: '60px 24px' }}>
        <p style={{ color: 'var(--error, #c66f6f)', marginBottom: '16px' }}>{error || 'No active website found.'}</p>
        <a href="/app/onboarding" className={styles.primaryButton}>
          Go to Onboarding →
        </a>
      </div>
    );
  }

  return (
    <div className={contentStyles.contentContainer}>
      {/* Top Bar: Action to trigger creation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div className={contentStyles.tabsRow} style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`${contentStyles.tabButton} ${activeTab === 'ALL' ? contentStyles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('ALL')}
          >
            All Articles ({articles.length})
          </button>
          <button
            type="button"
            className={`${contentStyles.tabButton} ${activeTab === 'IDEA' ? contentStyles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('IDEA')}
          >
            Ideas ({articles.filter(a => a.status === 'IDEA').length})
          </button>
          <button
            type="button"
            className={`${contentStyles.tabButton} ${activeTab === 'DRAFT' ? contentStyles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('DRAFT')}
          >
            Drafts ({articles.filter(a => a.status === 'DRAFT').length})
          </button>
          <button
            type="button"
            className={`${contentStyles.tabButton} ${activeTab === 'REVIEW' ? contentStyles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('REVIEW')}
          >
            In Review ({articles.filter(a => a.status === 'AI_REVIEW' || a.status === 'USER_REVIEW').length})
          </button>
          <button
            type="button"
            className={`${contentStyles.tabButton} ${activeTab === 'APPROVED' ? contentStyles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('APPROVED')}
          >
            Approved ({articles.filter(a => a.status === 'APPROVED').length})
          </button>
          <button
            type="button"
            className={`${contentStyles.tabButton} ${activeTab === 'PUBLISHED' ? contentStyles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('PUBLISHED')}
          >
            Published ({articles.filter(a => a.status === 'PUBLISHED').length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={styles.primaryButton}
        >
          <Plus size={16} />
          <span>{showCreateForm ? 'Cancel' : 'Create Article'}</span>
        </button>
      </div>

      {/* Creation form dropdown card */}
      {showCreateForm && (
        <div className={styles.card} style={{ marginBottom: '32px' }}>
          <h3 className={styles.cardTitle}>Configure New Article</h3>
          <p className={styles.cardDescription} style={{ marginBottom: '20px' }}>
            Set the topic, primary search keyword, and target length for AI generation.
          </p>
          <form onSubmit={handleCreateArticle} className={styles.form} style={{ maxWidth: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', alignItems: 'end' }}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Topic / Article Title</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g. How to Improve Local SEO for Small Businesses"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Target Keyword</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g. local seo for small businesses"
                  value={newTargetKeyword}
                  onChange={(e) => setNewTargetKeyword(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formGroup} style={{ maxWidth: '160px' }}>
                <label className={styles.label}>Target Words</label>
                <input
                  type="number"
                  className={styles.input}
                  min="300"
                  max="5000"
                  step="100"
                  value={newWordCount}
                  onChange={(e) => setNewWordCount(parseInt(e.target.value))}
                  required
                />
              </div>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className={styles.secondaryButton}
              >
                Cancel
              </button>
              <button type="submit" className={styles.primaryButton} disabled={isCreating}>
                <Plus size={16} />
                <span>{isCreating ? 'Creating...' : 'Initialize Article →'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pipeline Grid of Editorial Cards */}
      <div>
        {filteredArticles.length === 0 ? (
          <div className={contentStyles.emptyState}>
            <FileText className={contentStyles.emptyIcon} />
            <h3 className={contentStyles.emptyTitle}>No articles in this stage</h3>
            <p className={contentStyles.emptyDesc}>
              {articles.length === 0
                ? 'Turn your keyword strategy into search-focused content with AI. Click "Create Article" above to draft your first post.'
                : 'No articles match the selected pipeline filter. Switch tabs to see drafts or published posts.'}
            </p>
            {articles.length === 0 && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className={styles.primaryButton}
              >
                <Plus size={16} /> Create Your First Article
              </button>
            )}
          </div>
        ) : (
          <div className={contentStyles.grid}>
            {filteredArticles.map((article) => (
              <div 
                key={article.id} 
                className={contentStyles.articleCard}
                onClick={() => router.push(`/app/content/${article.id}`)}
              >
                <div>
                  <div className={contentStyles.cardHeader}>
                    {getStatusBadge(article.status)}
                    {article.aiReviewData?.score != null && (
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        AI Review: {article.aiReviewData.score}/100
                      </span>
                    )}
                  </div>

                  <h3 className={contentStyles.cardTitle}>
                    {article.title || article.topic}
                  </h3>

                  <div style={{ marginTop: '14px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Target keyword:</span>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>
                      {article.primaryKeyword || article.targetKeyword || 'None specified'}
                    </div>
                  </div>
                </div>

                <div>
                  <ul className={contentStyles.metaList}>
                    <li className={contentStyles.metaItem}>
                      <Type className={contentStyles.metaIcon} />
                      <span>{article.wordCount ? `${article.wordCount} words` : 'Word count pending'}</span>
                    </li>
                    <li className={contentStyles.metaItem}>
                      <Calendar className={contentStyles.metaIcon} />
                      <span>Created {new Date(article.createdAt).toLocaleDateString()}</span>
                    </li>
                  </ul>

                  <div className={contentStyles.cardFooter}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {article.status === 'IDEA' ? 'Ready to generate' : 'Open writing studio'}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      Open <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

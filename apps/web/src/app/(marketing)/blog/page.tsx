import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/blog/posts';
import styles from '@/components/marketing/marketing.module.css';
import blogStyles from './blog.module.css';
import { ArrowRight, BookOpen } from 'lucide-react';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankautonomous.com';

export const metadata: Metadata = {
  title: 'Blog | RankAutonomous - Autonomous SEO & Generative Engine Optimization',
  description:
    'In-depth research, benchmarks, and tactical guides on autonomous SEO, AI search ranking (GEO), and scaling organic traffic.',
  alternates: {
    canonical: `${baseUrl}/blog`,
  },
  openGraph: {
    title: 'RankAutonomous Blog - Autonomous SEO & AI Search Intelligence',
    description:
      'In-depth research, benchmarks, and tactical guides on autonomous SEO, AI search ranking (GEO), and scaling organic traffic.',
    url: `${baseUrl}/blog`,
    siteName: 'RankAutonomous',
    type: 'website',
  },
};

export default function BlogListingPage() {
  const posts = getAllPosts();

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHero}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-pill)', color: '#8c423d', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
          <BookOpen size={16} /> The RankAutonomous Blog
        </div>
        <h1 className={styles.pageTitle}>Autonomous SEO &amp; AI Search Intelligence</h1>
        <p className={styles.pageSubtitle}>
          Actionable frameworks, technical benchmarks, and continuous organic growth playbooks for the new era of search.
        </p>
      </div>

      <div className={blogStyles.blogListingGrid}>
        {posts.map((post) => {
          const formattedDate = new Date(post.publishedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          return (
            <Link key={post.slug} href={`/blog/${post.slug}`} className={blogStyles.articleCard}>
              <div>
                <div className={blogStyles.cardMetaRow}>
                  <span className={blogStyles.categoryBadge}>{post.category}</span>
                  <span className={blogStyles.readTime}>{post.readTime}</span>
                </div>
                <h2 className={blogStyles.articleCardTitle}>{post.title}</h2>
                <p className={blogStyles.articleCardExcerpt}>{post.excerpt}</p>
              </div>

              <div className={blogStyles.cardFooter}>
                <div className={blogStyles.authorInfo}>
                  <span className={blogStyles.authorName}>{post.author.name}</span>
                  <span className={blogStyles.publishDate}>{formattedDate}</span>
                </div>
                <span className={blogStyles.readLink}>
                  Read <ArrowRight size={14} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

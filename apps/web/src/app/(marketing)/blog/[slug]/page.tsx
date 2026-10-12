import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { getPostBySlug, getAllPosts } from '@/lib/blog/posts';
import blogStyles from '../blog.module.css';
import styles from '@/components/marketing/marketing.module.css';
import { ArrowRight, ChevronRight, Clock, Calendar } from 'lucide-react';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankautonomous.com';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found | RankAutonomous Blog',
    };
  }

  const postUrl = `${baseUrl}/blog/${post.slug}`;

  return {
    title: `${post.title} | RankAutonomous`,
    description: post.excerpt,
    keywords: post.keywords,
    alternates: {
      canonical: postUrl,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: postUrl,
      siteName: 'RankAutonomous',
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author.name],
      tags: post.keywords,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const formattedDate = new Date(post.publishedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    author: {
      '@type': 'Person',
      name: post.author.name,
      jobTitle: post.author.role,
    },
    datePublished: post.publishedAt,
    publisher: {
      '@type': 'Organization',
      name: 'RankAutonomous',
      url: baseUrl,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${baseUrl}/blog/${post.slug}`,
    },
  };

  return (
    <article className={blogStyles.articleContainer}>
      {/* Structured Schema for Search Engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumbs */}
      <nav className={blogStyles.breadcrumbs} aria-label="Breadcrumbs">
        <Link href="/" className={blogStyles.breadcrumbLink}>Home</Link>
        <ChevronRight size={14} />
        <Link href="/blog" className={blogStyles.breadcrumbLink}>Blog</Link>
        <ChevronRight size={14} />
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{post.category}</span>
      </nav>

      {/* Header */}
      <header className={blogStyles.articleHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span className={blogStyles.categoryBadge}>{post.category}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={13} /> {post.readTime}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={13} /> {formattedDate}
          </span>
        </div>

        <h1 className={blogStyles.articleTitle}>{post.title}</h1>
        <p className={blogStyles.articleLead}>{post.excerpt}</p>

        <div className={blogStyles.byline}>
          <div className={blogStyles.authorBlock}>
            <div className={blogStyles.authorAvatar}>
              {post.author.name.charAt(0)}
            </div>
            <div className={blogStyles.authorDetails}>
              <span className={blogStyles.bylineAuthor}>{post.author.name}</span>
              <span className={blogStyles.bylineRole}>{post.author.role}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Article Body */}
      <div className={blogStyles.articleBody}>
        <ReactMarkdown>{post.content}</ReactMarkdown>
      </div>

      {/* Conversion Banner */}
      <section className={blogStyles.articleCtaBox}>
        <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8c423d', display: 'block', marginBottom: '8px' }}>
          Autonomous SEO Platform
        </span>
        <h2 className={blogStyles.ctaBoxTitle}>Ready to put your organic growth on autopilot?</h2>
        <p className={blogStyles.ctaBoxDesc}>
          RankAutonomous continuously analyzes your website, generates publish-ready articles, discovers keyword gaps, and pushes directly to your CMS.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/#free-analysis" className={styles.primaryAction} style={{ padding: '14px 28px' }}>
            Scan Your Website Free →
          </Link>
          <Link href="/pricing" className={styles.loginAction} style={{ padding: '14px 24px' }}>
            Explore Plans
          </Link>
        </div>
      </section>
    </article>
  );
}

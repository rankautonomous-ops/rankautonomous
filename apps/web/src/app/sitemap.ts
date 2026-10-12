import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog/posts';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankautonomous.com';
  const staticRoutes = [
    '',
    '/features',
    '/how-it-works',
    '/pricing',
    '/blog',
    '/faq',
    '/contact',
    '/terms',
    '/privacy',
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: (route === '' || route === '/blog' ? 'daily' : 'weekly') as 'daily' | 'weekly',
    priority: route === '' ? 1 : route === '/blog' ? 0.9 : 0.8,
  }));

  const blogPosts = getAllPosts();
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  return [...staticEntries, ...blogEntries];
}

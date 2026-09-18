import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankautonomous.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'RankAutonomous — Put Your SEO on Autopilot',
    template: '%s | RankAutonomous',
  },
  description:
    'RankAutonomous uses AI to continuously analyze your website, create rank-ready SEO content, discover link-building opportunities, and accelerate organic search traffic.',
  keywords: [
    'AI SEO',
    'automated SEO',
    'link building SaaS',
    'AI article generator',
    'SEO automation platform',
    'organic search growth',
    'keyword tracking',
    'technical SEO audit',
  ],
  authors: [{ name: 'RankAutonomous Team', url: siteUrl }],
  creator: 'RankAutonomous',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    title: 'RankAutonomous — Put Your SEO on Autopilot',
    description:
      'RankAutonomous uses AI to continuously analyze your website, create rank-ready SEO content, discover link-building opportunities, and accelerate organic search traffic.',
    siteName: 'RankAutonomous',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RankAutonomous — Put Your SEO on Autopilot',
    description:
      'AI-powered SEO & link-building SaaS. Continuous analysis, daily rank-ready content, and high-authority backlink discovery.',
    creator: '@RankAutonomous',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

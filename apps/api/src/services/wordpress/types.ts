export interface WordPressCredentials {
  username: string;
  applicationPassword: string;
}

export interface WordPressConfig {
  siteUrl: string;
  username: string;
  siteName?: string;
  lastTestedAt?: string;
  wpVersion?: string;
  canPublish?: boolean;
}

export interface WordPressPostPayload {
  title: string;
  content: string;
  slug?: string;
  status: 'publish' | 'draft' | 'future' | 'pending' | 'private';
  excerpt?: string;
  date_gmt?: string;
}

export interface WordPressPostResponse {
  id: number;
  date: string;
  date_gmt: string;
  slug: string;
  status: string;
  link: string;
  title?: { rendered: string; raw?: string };
  content?: { rendered: string; raw?: string };
  excerpt?: { rendered: string; raw?: string };
}

export interface WordPressUserResponse {
  id: number;
  name: string;
  slug: string;
  capabilities?: Record<string, boolean>;
  roles?: string[];
}

export interface CmsPublicationInfo {
  provider: 'WORDPRESS';
  postId: number;
  postUrl: string;
  status: string;
  publishedAt: string;
  lastSyncedAt?: string;
  siteUrl: string;
}

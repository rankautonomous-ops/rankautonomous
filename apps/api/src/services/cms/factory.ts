import { CmsConnection } from '@prisma/client';
import { CmsProvider, CmsProviderError } from './types';
import { decryptJson } from '../../lib/encryption';
import { WordPressCmsProvider } from './providers/WordPressProvider';
import { ShopifyCmsProvider } from './providers/ShopifyProvider';
import { WebflowCmsProvider } from './providers/WebflowProvider';
import { CustomCmsProvider } from './providers/CustomProvider';
import { ComingSoonProvider } from './providers/ComingSoonProvider';
import { GhostProvider } from './providers/GhostProvider';
import { NotionProvider } from './providers/NotionProvider';
import { RssProvider } from './providers/RssProvider';

export function createCmsProvider(connection: CmsConnection): CmsProvider {
  let credentials: any = {};
  if (connection.credentials) {
    try {
      credentials = decryptJson<any>(connection.credentials);
    } catch (e) {
      throw new CmsProviderError('Failed to decrypt CMS credentials.');
    }
  }

  const config = (connection.metadata as any) || {};

  switch (connection.provider) {
    case 'WORDPRESS':
    case 'WORDPRESS_COM':
      return new WordPressCmsProvider(connection.baseUrl || '', credentials);
    case 'SHOPIFY':
      return new ShopifyCmsProvider(connection.baseUrl || '', credentials, config);
    case 'WEBFLOW':
      return new WebflowCmsProvider(credentials, config);
    case 'CUSTOM':
    case 'WEBHOOK':
    case 'NEXTJS':
      return new CustomCmsProvider(connection.baseUrl || '', credentials, config);
    case 'GHOST':
      return new GhostProvider(connection.baseUrl || '', credentials);
    case 'NOTION':
      return new NotionProvider(credentials, config);
    case 'RSS':
      return new RssProvider(config);
    case 'WIX':
    case 'SQUARESPACE':
    case 'BIGCOMMERCE':
    case 'DUDA':
    case 'HUBSPOT':
    case 'HIGHLEVEL':
    case 'FRAMER':
    case 'LOVABLE':
      return new ComingSoonProvider(connection.provider);
    default:
      throw new CmsProviderError(`Provider ${connection.provider} is not supported.`);
  }
}


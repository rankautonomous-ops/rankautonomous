import { CmsConnection } from '@prisma/client';
import { CmsProvider, CmsProviderError } from './types';
import { decryptJson } from '../../lib/encryption';
import { WordPressCmsProvider } from './providers/WordPressProvider';
import { ShopifyCmsProvider } from './providers/ShopifyProvider';
import { WebflowCmsProvider } from './providers/WebflowProvider';
import { CustomCmsProvider } from './providers/CustomProvider';
import { GhostProvider } from './providers/GhostProvider';
import { NotionProvider } from './providers/NotionProvider';
import { RssProvider } from './providers/RssProvider';
import { WixProvider } from './providers/WixProvider';
import { SquarespaceProvider } from './providers/SquarespaceProvider';
import { BigCommerceProvider } from './providers/BigCommerceProvider';
import { DudaProvider } from './providers/DudaProvider';
import { HubSpotProvider } from './providers/HubSpotProvider';
import { HighLevelProvider } from './providers/HighLevelProvider';
import { FramerProvider } from './providers/FramerProvider';
import { LovableProvider } from './providers/LovableProvider';

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
      return new WixProvider(connection.baseUrl || '', credentials, config);
    case 'SQUARESPACE':
      return new SquarespaceProvider(connection.baseUrl || '', credentials, config);
    case 'BIGCOMMERCE':
      return new BigCommerceProvider(connection.baseUrl || '', credentials, config);
    case 'DUDA':
      return new DudaProvider(connection.baseUrl || '', credentials, config);
    case 'HUBSPOT':
      return new HubSpotProvider(connection.baseUrl || '', credentials, config);
    case 'HIGHLEVEL':
      return new HighLevelProvider(connection.baseUrl || '', credentials, config);
    case 'FRAMER':
      return new FramerProvider(connection.baseUrl || '', credentials, config);
    case 'LOVABLE':
      return new LovableProvider(connection.baseUrl || '', credentials, config);
    default:
      throw new CmsProviderError(`Provider ${connection.provider} is not supported.`);
  }
}


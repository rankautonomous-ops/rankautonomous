import { CmsConnection } from '@prisma/client';
import { CmsProvider, CmsProviderError } from './types';
import { decryptJson } from '../../lib/encryption';
import { WordPressCmsProvider } from './providers/WordPressProvider';
import { ShopifyCmsProvider } from './providers/ShopifyProvider';
import { WebflowCmsProvider } from './providers/WebflowProvider';
import { CustomCmsProvider } from './providers/CustomProvider';

export function createCmsProvider(connection: CmsConnection): CmsProvider {
  let credentials: any = {};
  if (connection.credentials) {
    try {
      credentials = decryptJson<any>(connection.credentials);
    } catch (e) {
      throw new CmsProviderError('Failed to decrypt CMS credentials.');
    }
  }

  const config = connection.metadata as any || {};

  switch (connection.provider) {
    case 'WORDPRESS':
      return new WordPressCmsProvider(connection.baseUrl || '', credentials);
    case 'SHOPIFY':
      return new ShopifyCmsProvider(connection.baseUrl || '', credentials, config);
    case 'WEBFLOW':
      return new WebflowCmsProvider(credentials, config);
    case 'CUSTOM':
      return new CustomCmsProvider(connection.baseUrl || '', credentials, config);
    default:
      throw new CmsProviderError(`Provider ${connection.provider} is not supported.`);
  }
}

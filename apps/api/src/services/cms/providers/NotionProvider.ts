import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { Client } from '@notionhq/client';

export class NotionProvider implements CmsProvider {
  private notion: Client;
  private databaseId: string;
  private config: any;

  constructor(credentials: any, config: any) {
    if (!credentials?.integrationToken) throw new CmsProviderError('Notion integration token is required');
    if (!config?.databaseId) throw new CmsProviderError('Notion destination Database ID is required');

    this.notion = new Client({ auth: credentials.integrationToken });
    this.databaseId = config.databaseId;
    this.config = config || {};
  }

  async testConnection(): Promise<boolean> {
    try {
      const db: any = await this.notion.databases.retrieve({ database_id: this.databaseId });
      if (!db || !db.id) {
        throw new Error('Database not found or access denied');
      }
      return true;
    } catch (e: any) {
      throw new CmsProviderError(`Failed to connect to Notion: ${e.message}`);
    }
  }

  private async getDatabaseSchema(): Promise<Record<string, any> | null> {
    try {
      const db: any = await this.notion.databases.retrieve({ database_id: this.databaseId });
      return db?.properties || null;
    } catch {
      return null;
    }
  }

  private buildProperties(payload: CmsPublishPayload, schema?: Record<string, any> | null): Record<string, any> {
    const fieldMapping = this.config.fieldMapping || {};

    // 1. Resolve title property key
    let titleKey = this.config.titleProperty || fieldMapping.title;
    if (!titleKey && schema) {
      const found = Object.keys(schema).find((k) => schema[k]?.type === 'title');
      if (found) titleKey = found;
    }
    if (!titleKey) titleKey = 'Name';

    // 2. Resolve status property key
    let statusKey = this.config.statusProperty || fieldMapping.status;
    if (!statusKey && schema) {
      const found = Object.keys(schema).find(
        (k) => (schema[k]?.type === 'status' || schema[k]?.type === 'select') && /status|state|publish/i.test(k)
      );
      if (found) statusKey = found;
    }
    if (!statusKey) statusKey = 'Status';

    const isPublished = payload.status === 'publish';
    const statusVal = isPublished ? 'Published' : 'Draft';

    const properties: Record<string, any> = {
      [titleKey]: {
        title: [
          {
            type: 'text',
            text: {
              content: (payload.title || '').substring(0, 2000),
            },
          },
        ],
      },
    };

    // Determine whether to use 'status' or 'select' for statusKey
    const propMeta = schema?.[statusKey];
    if (propMeta?.type === 'status' || this.config.statusType === 'status') {
      properties[statusKey] = {
        status: {
          name: statusVal,
        },
      };
    } else {
      properties[statusKey] = {
        select: {
          name: statusVal,
        },
      };
    }

    // 3. Optional slug property
    const slugKey = this.config.slugProperty || fieldMapping.slug;
    if (slugKey && payload.slug) {
      if (schema?.[slugKey]?.type === 'url') {
        properties[slugKey] = {
          url: payload.slug.startsWith('http') ? payload.slug : `https://example.com/${payload.slug}`,
        };
      } else {
        properties[slugKey] = {
          rich_text: [
            {
              type: 'text',
              text: {
                content: payload.slug.substring(0, 2000),
              },
            },
          ],
        };
      }
    }

    // 4. Optional excerpt property
    const excerptKey = this.config.excerptProperty || fieldMapping.excerpt;
    if (excerptKey && payload.excerpt) {
      properties[excerptKey] = {
        rich_text: [
          {
            type: 'text',
            text: {
              content: payload.excerpt.substring(0, 2000),
            },
          },
        ],
      };
    }

    return properties;
  }

  private convertMarkdownToBlocks(markdown: string): any[] {
    if (!markdown) return [];
    const lines = markdown.split('\n');
    const blocks: any[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('### ')) {
        blocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: line.substring(4).substring(0, 2000) } }],
          },
        });
      } else if (line.startsWith('## ')) {
        blocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: line.substring(3).substring(0, 2000) } }],
          },
        });
      } else if (line.startsWith('# ')) {
        blocks.push({
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [{ type: 'text', text: { content: line.substring(2).substring(0, 2000) } }],
          },
        });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: line.substring(2).substring(0, 2000) } }],
          },
        });
      } else if (/^\d+\.\s/.test(line)) {
        const textContent = line.replace(/^\d+\.\s/, '');
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: [{ type: 'text', text: { content: textContent.substring(0, 2000) } }],
          },
        });
      } else if (line.startsWith('> ')) {
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: {
            rich_text: [{ type: 'text', text: { content: line.substring(2).substring(0, 2000) } }],
          },
        });
      } else {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: line.substring(0, 2000) } }],
          },
        });
      }
    }

    return blocks;
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const schema = await this.getDatabaseSchema();
      const properties = this.buildProperties(payload, schema);
      const blocks = this.convertMarkdownToBlocks(payload.content);

      // Notion allows up to 100 children upon page creation
      const initialChildren = blocks.slice(0, 100);
      const remainingChildren = blocks.slice(100);

      const res = await this.notion.pages.create({
        parent: { type: 'database_id', database_id: this.databaseId },
        properties,
        children: initialChildren,
      });

      // Append any remaining blocks if content was > 100 blocks
      if (remainingChildren.length > 0) {
        for (let i = 0; i < remainingChildren.length; i += 100) {
          const chunk = remainingChildren.slice(i, i + 100);
          await this.notion.blocks.children.append({
            block_id: res.id,
            children: chunk,
          }).catch(() => null);
        }
      }

      return {
        status: 'PUBLISHED',
        remoteId: res.id,
        remoteUrl: (res as any).url || `https://notion.so/${res.id.replace(/-/g, '')}`,
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Notion publish failed' };
    }
  }

  async updateArticle(remoteId: string, payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      const schema = await this.getDatabaseSchema();
      const properties = this.buildProperties(payload, schema);

      // 1. Update page properties (title, status, slug, excerpt)
      const res = await this.notion.pages.update({
        page_id: remoteId,
        properties,
      });

      // 2. Synchronize article body blocks:
      // Retrieve existing children blocks and delete them to avoid duplicates
      try {
        const existingBlocks = await this.notion.blocks.children.list({ block_id: remoteId });
        if (existingBlocks && Array.isArray(existingBlocks.results)) {
          for (const block of existingBlocks.results) {
            await this.notion.blocks.delete({ block_id: block.id }).catch(() => null);
          }
        }
      } catch {
        // If block deletion fails, proceed to append updated content
      }

      // 3. Append updated article body blocks
      const newBlocks = this.convertMarkdownToBlocks(payload.content);
      if (newBlocks.length > 0) {
        for (let i = 0; i < newBlocks.length; i += 100) {
          const chunk = newBlocks.slice(i, i + 100);
          await this.notion.blocks.children.append({
            block_id: remoteId,
            children: chunk,
          }).catch(() => null);
        }
      }

      return {
        status: 'PUBLISHED',
        remoteId: res.id,
        remoteUrl: (res as any).url || `https://notion.so/${res.id.replace(/-/g, '')}`,
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Notion update failed' };
    }
  }

  async deleteArticle(remoteId: string): Promise<boolean> {
    try {
      await this.notion.blocks.delete({ block_id: remoteId });
      return true;
    } catch (err: any) {
      throw new CmsProviderError(err.message || 'Failed to delete Notion page');
    }
  }
}

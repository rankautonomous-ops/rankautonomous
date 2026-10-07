import { CmsProvider, CmsPublishPayload, CmsPublishResult, CmsProviderError } from '../types';
import { Client } from '@notionhq/client';

export class NotionProvider implements CmsProvider {
  private notion: Client;
  private databaseId: string;

  constructor(credentials: any, config: any) {
    if (!credentials?.integrationToken) throw new CmsProviderError('Notion integration token is required');
    if (!config?.databaseId) throw new CmsProviderError('Notion destination Database ID is required');

    this.notion = new Client({ auth: credentials.integrationToken });
    this.databaseId = config.databaseId;
  }

  async testConnection(): Promise<boolean> {
    try {
      const db = await this.notion.databases.retrieve({ database_id: this.databaseId });
      return true;
    } catch (e: any) {
      throw new CmsProviderError(`Failed to connect to Notion: ${e.message}`);
    }
  }

  private convertMarkdownToBlocks(markdown: string): any[] {
    // A simplified conversion from markdown to Notion paragraph blocks
    const lines = markdown.split('\n').filter(l => l.trim().length > 0);
    return lines.slice(0, 100).map(line => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: line.substring(0, 2000), // Notion limit is 2000 chars per text block
            },
          },
        ],
      },
    }));
  }

  async publishArticle(payload: CmsPublishPayload): Promise<CmsPublishResult> {
    try {
      // Basic duplicate protection by querying database for title if we wanted to
      // But let's just create it directly for now since duplicate by title is less strict than slug.
      const res = await this.notion.pages.create({
        parent: { type: 'database_id', database_id: this.databaseId },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: payload.title,
                },
              },
            ],
          },
          Status: {
            select: {
              name: payload.status === 'publish' ? 'Published' : 'Draft'
            }
          }
        },
        children: this.convertMarkdownToBlocks(payload.content)
      });

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
      // Updating content in Notion is complex (requires deleting and recreating blocks)
      // For this simplified version, we'll just update the title and status.
      const res = await this.notion.pages.update({
        page_id: remoteId,
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: payload.title,
                },
              },
            ],
          },
          Status: {
            select: {
              name: payload.status === 'publish' ? 'Published' : 'Draft'
            }
          }
        }
      });

      return {
        status: 'PUBLISHED',
        remoteId: res.id,
        remoteUrl: (res as any).url || `https://notion.so/${res.id.replace(/-/g, '')}`,
      };
    } catch (err: any) {
      return { status: 'FAILED', error: err.message || 'Notion update failed' };
    }
  }
}


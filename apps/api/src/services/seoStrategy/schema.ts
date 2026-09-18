import { SeoStrategyOutput } from './types';

export function validateStrategyOutput(data: any): SeoStrategyOutput {
  if (typeof data !== 'object' || data === null) throw new Error('Root must be an object');
  
  if (typeof data.executiveSummary !== 'string') throw new Error('executiveSummary must be a string');
  if (!Array.isArray(data.priorityActions)) throw new Error('priorityActions must be an array');
  
  for (const item of data.priorityActions) {
    if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(item.priority)) throw new Error('Invalid priority in priorityActions');
    if (typeof item.category !== 'string') throw new Error('category must be string');
    if (typeof item.action !== 'string') throw new Error('action must be string');
    if (typeof item.reason !== 'string') throw new Error('reason must be string');
    if (item.affectedPages !== undefined && !Array.isArray(item.affectedPages)) throw new Error('affectedPages must be array');
  }

  if (typeof data.keywordStrategy !== 'object' || data.keywordStrategy === null) throw new Error('keywordStrategy must be object');
  if (typeof data.keywordStrategy.primaryFocus !== 'string') throw new Error('primaryFocus must be string');
  if (!Array.isArray(data.keywordStrategy.themes)) throw new Error('themes must be array');
  for (const theme of data.keywordStrategy.themes) {
    if (typeof theme.theme !== 'string') throw new Error('theme must be string');
    if (!['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL'].includes(theme.intent)) throw new Error('Invalid intent in keywordStrategy');
    if (!Array.isArray(theme.recommendedPages)) throw new Error('recommendedPages must be array');
  }

  if (!Array.isArray(data.contentStrategy)) throw new Error('contentStrategy must be array');
  for (const item of data.contentStrategy) {
    if (typeof item.topic !== 'string') throw new Error('topic must be string');
    if (typeof item.primaryKeyword !== 'string') throw new Error('primaryKeyword must be string');
    if (!['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL'].includes(item.intent)) throw new Error('Invalid intent in contentStrategy');
    if (typeof item.contentType !== 'string') throw new Error('contentType must be string');
    if (typeof item.targetAudience !== 'string') throw new Error('targetAudience must be string');
    if (typeof item.targetUrl !== 'string') throw new Error('targetUrl must be string');
    if (typeof item.rationale !== 'string') throw new Error('rationale must be string');
  }

  if (typeof data.internalLinkingStrategy !== 'object' || data.internalLinkingStrategy === null) throw new Error('internalLinkingStrategy must be object');
  if (!Array.isArray(data.internalLinkingStrategy.pagesNeedingLinks)) throw new Error('pagesNeedingLinks must be array');
  if (!Array.isArray(data.internalLinkingStrategy.opportunities)) throw new Error('opportunities must be array');
  for (const opp of data.internalLinkingStrategy.opportunities) {
    if (typeof opp.sourceUrl !== 'string') throw new Error('sourceUrl must be string');
    if (typeof opp.targetUrl !== 'string') throw new Error('targetUrl must be string');
    if (typeof opp.anchorTextTheme !== 'string') throw new Error('anchorTextTheme must be string');
  }

  if (!Array.isArray(data.technicalStrategy)) throw new Error('technicalStrategy must be array');
  for (const tech of data.technicalStrategy) {
    if (typeof tech.issue !== 'string') throw new Error('issue must be string');
    if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(tech.priority)) throw new Error('Invalid priority in technicalStrategy');
    if (typeof tech.recommendation !== 'string') throw new Error('recommendation must be string');
  }

  if (typeof data.backlinkStrategy !== 'object' || data.backlinkStrategy === null) throw new Error('backlinkStrategy must be object');
  if (typeof data.backlinkStrategy.approach !== 'string') throw new Error('approach must be string');
  if (!Array.isArray(data.backlinkStrategy.tactics)) throw new Error('tactics must be array');

  return data as SeoStrategyOutput;
}

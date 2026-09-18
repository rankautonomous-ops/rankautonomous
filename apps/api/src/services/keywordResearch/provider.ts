import { IKeywordResearchProvider } from './types';

let currentProvider: IKeywordResearchProvider | null = null;

export function setKeywordResearchProvider(provider: IKeywordResearchProvider) {
  currentProvider = provider;
}

export function getKeywordResearchProvider(): IKeywordResearchProvider | null {
  return currentProvider;
}

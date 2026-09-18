/**
 * Normalizes a keyword by:
 * - Trimming leading/trailing whitespace
 * - Collapsing multiple spaces into a single space
 * - Lowercasing
 * - Removing special punctuation safely (e.g., keeping hyphens but removing stray punctuation that doesn't add meaning)
 */
export function normalizeKeyword(keyword: string): string {
  if (!keyword) return '';
  return keyword
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove most non-word chars except spaces and hyphens
    .replace(/\s+/g, ' '); // Collapse multiple spaces
}

/**
 * Deterministic clustering algorithm.
 * Since we don't have an AI semantic model, we group keywords based on exact sub-word overlap
 * and stem-like overlap.
 * 
 * If a keyword cannot be clustered, we return null (Unclustered).
 */
export function clusterKeywords(normalizedKeywords: string[]): Record<string, string | null> {
  const clusters: Record<string, string | null> = {};
  
  if (!normalizedKeywords.length) {
    return clusters;
  }

  // Very simple clustering: if keyword A contains keyword B (and B > 3 chars), they cluster under B.
  // We sort by length ascending to find the shortest 'root' keywords first.
  const sorted = [...normalizedKeywords].sort((a, b) => a.length - b.length);

  const rootClusters: string[] = [];

  for (const kw of sorted) {
    let foundCluster = false;
    // Check if kw contains any existing root cluster
    for (const root of rootClusters) {
      if (root.length >= 3 && kw.includes(root)) {
        clusters[kw] = root;
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      // It becomes a new root cluster if it's long enough, else it's unclustered
      if (kw.length >= 3) {
        rootClusters.push(kw);
        clusters[kw] = kw; // A root clusters to itself
      } else {
        clusters[kw] = null;
      }
    }
  }

  return clusters;
}

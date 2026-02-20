import type { HealthcareEntity, SelectedEntity } from '$lib/types';

export function fuzzyMatch(text: string, query: string): number {
  if (!query) return 0;
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Substring match = highest score
  if (textLower.includes(queryLower)) {
    return 1000 - textLower.indexOf(queryLower);
  }

  // Character-order fuzzy match
  let textIndex = 0;
  let queryIndex = 0;
  let score = 0;
  let lastMatch = -1;

  while (textIndex < text.length && queryIndex < query.length) {
    if (textLower[textIndex] === queryLower[queryIndex]) {
      score += lastMatch === textIndex - 1 ? 10 : 1;
      lastMatch = textIndex;
      queryIndex++;
    }
    textIndex++;
  }

  return queryIndex === query.length ? score : 0;
}

export function searchEntities(
  entities: HealthcareEntity[],
  query: string,
  limit = 8
): SelectedEntity[] {
  if (!query.trim()) return [];

  return entities
    .map(e => ({
      name: e.n,
      cik: e.c,
      score: Math.max(fuzzyMatch(e.n, query), fuzzyMatch(e.c, query)),
    }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ name, cik }) => ({ name, cik }));
}

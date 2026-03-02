import type { OIGExclusion, OIGMatch } from '$lib/types';

interface LetterData {
  individuals: Record<string, OIGExclusion[]>;
  businesses: Record<string, OIGExclusion[]>;
}

/** Per-letter cache: letter -> parsed JSON data */
const cache = new Map<string, LetterData>();

/** In-flight fetches to avoid duplicate requests */
const pending = new Map<string, Promise<LetterData>>();

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function letterOf(s: string): string {
  const norm = s.replace(/[^a-zA-Z]/g, '');
  if (!norm) return '_';
  const first = norm.charAt(0).toLowerCase();
  return first >= 'a' && first <= 'z' ? first : '_';
}

async function loadLetter(letter: string, origin: string): Promise<LetterData> {
  const cached = cache.get(letter);
  if (cached) return cached;

  const inflight = pending.get(letter);
  if (inflight) return inflight;

  const promise = (async (): Promise<LetterData> => {
    const empty: LetterData = { individuals: {}, businesses: {} };
    try {
      const url = `${origin}/data/oig/${letter}.json`;
      const resp = await globalThis.fetch(url);
      if (!resp.ok) {
        console.warn(`OIG letter ${letter}: fetch returned ${resp.status}`);
        cache.set(letter, empty);
        return empty;
      }
      const data: LetterData = await resp.json();
      cache.set(letter, data);
      return data;
    } catch (err) {
      console.warn(`OIG letter ${letter}: fetch failed:`, err);
      cache.set(letter, empty);
      return empty;
    } finally {
      pending.delete(letter);
    }
  })();

  pending.set(letter, promise);
  return promise;
}

/**
 * No-op for backward compatibility. Data loads lazily per letter.
 */
export async function loadOIGData(_origin?: string): Promise<void> {
  // Data is now loaded on demand per letter in search functions.
}

export async function searchIndividual(
  firstName: string,
  lastName: string,
  _middleName?: string,
  origin?: string
): Promise<OIGMatch[]> {
  if (!origin || !lastName) return [];

  const letter = letterOf(lastName);
  const data = await loadLetter(letter, origin);
  const individuals = data.individuals;

  const matches: OIGMatch[] = [];

  // Exact match: lastName + firstName
  const exactKey = normalizeKey(lastName + firstName);
  const exact = individuals[exactKey];
  if (exact) {
    for (const e of exact) {
      matches.push({ ...e, matchType: 'exact' });
    }
  }

  // Partial match: lastName only, then check firstName prefix
  if (matches.length === 0) {
    const lastNameNorm = normalizeKey(lastName);
    for (const [key, exclusions] of Object.entries(individuals)) {
      if (key.startsWith(lastNameNorm) && key !== exactKey) {
        for (const e of exclusions) {
          const fnNorm = normalizeKey(firstName);
          const eFnNorm = normalizeKey(e.firstName);
          if (eFnNorm.startsWith(fnNorm) || fnNorm.startsWith(eFnNorm)) {
            matches.push({ ...e, matchType: 'partial' });
          }
        }
      }
    }
  }

  return matches;
}

export async function searchBusiness(
  busName: string,
  origin?: string
): Promise<OIGMatch[]> {
  if (!origin || !busName) return [];

  const letter = letterOf(busName);
  const data = await loadLetter(letter, origin);
  const businesses = data.businesses;

  const key = normalizeKey(busName);
  const exact = businesses[key];
  if (exact) {
    return exact.map(e => ({ ...e, matchType: 'business' as const }));
  }

  // Partial business match within same letter bucket
  const matches: OIGMatch[] = [];
  for (const [k, exclusions] of Object.entries(businesses)) {
    if (k.includes(key) || key.includes(k)) {
      for (const e of exclusions) {
        matches.push({ ...e, matchType: 'business' });
      }
    }
    if (matches.length >= 10) break;
  }

  return matches;
}

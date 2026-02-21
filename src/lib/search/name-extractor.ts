import type { ParsedName } from '$lib/types';

// Compound last name prefixes - when followed by another capitalized word, these form a single last name
const COMPOUND_PREFIXES = new Set([
	'le', 'la', 'de', 'del', 'van', 'von', 'di', 'el', 'al', 'ben', 'ibn',
	'mc', 'mac', 'st', 'san', 'den', 'der', 'het', 'ten', 'ter', 'los', 'las',
	'da', 'das', 'do', 'dos', 'du',
]);

// Common words that are NOT names - used to filter false positives
const NON_NAME_WORDS = new Set([
  'the', 'and', 'for', 'not', 'but', 'with', 'from', 'into', 'upon', 'that',
  'this', 'will', 'have', 'been', 'were', 'are', 'was', 'has', 'had', 'may',
  'can', 'our', 'his', 'her', 'its', 'who', 'how', 'all', 'any', 'each',
  'both', 'such', 'than', 'also', 'when', 'then', 'very', 'must', 'just',
  'only', 'made', 'make', 'per', 'pro', 'did', 'does', 'done',
  'chief', 'officer', 'director', 'president', 'secretary', 'treasurer',
  'chairman', 'chairwoman', 'executive', 'senior', 'vice', 'general',
  'assistant', 'associate', 'managing', 'principal', 'acting', 'interim',
  'ceo', 'cfo', 'coo', 'cto', 'cso', 'cmo', 'cro', 'cio',
  'compensation', 'committee', 'audit', 'governance', 'nominations',
  'nominees', 'nominee', 'board', 'directors', 'report', 'annual',
  'financial', 'fiscal', 'quarter', 'year', 'period', 'date',
  'table', 'contents', 'section', 'article', 'item', 'part', 'exhibit',
  'pursuant', 'thereof', 'herein', 'hereto', 'hereby', 'whereas',
  'shares', 'stock', 'equity', 'securities', 'common', 'preferred',
  'corporation', 'company', 'inc', 'llc', 'llp', 'ltd', 'corp',
  'under', 'over', 'above', 'below', 'between', 'among', 'through',
  'during', 'before', 'after', 'since', 'until', 'while', 'about',
  'dear', 'shareholders', 'stockholders', 'members', 'investors',
  'notice', 'proxy', 'statement', 'form', 'schedule', 'amendment',
  'expanding', 'access', 'well', 'positioned', 'encourage',
  'involves', 'brings', 'receives', 'effective', 'following',
  'evaluations', 'appointment', 'performance', 'program', 'matters',
  'clinical', 'global', 'innovative', 'worldwide', 'product',
  'code', 'covers', 'risk', 'business', 'qualified', 'independence',
  'qualification', 'standards', 'skills', 'considerations', 'candidates',
  'affiliated', 'entities', 'calendar', 'continue', 'receive',
  'internal', 'external', 'auditor', 'counsel', 'advisor', 'consultant',
  'group', 'fund', 'trust', 'capital', 'partners', 'partnership',
  'europe', 'asia', 'africa', 'america', 'pacific', 'atlantic',
  'north', 'south', 'east', 'west', 'central', 'international',
  'award', 'awards', 'modifications', 'modification', 'ratio',
  'pay', 'salary', 'bonus', 'grant', 'grants', 'vested', 'unvested',
  'total', 'summary', 'plan', 'plans', 'option', 'options', 'benefit',
  'benefits', 'pension', 'retirement', 'deferred', 'incentive',
  'termination', 'change', 'control', 'potential', 'payments',
  'holdings', 'ownership', 'requirements', 'guidelines', 'policies',
  'related', 'transactions', 'certain', 'relationships', 'review',
  'approval', 'process', 'procedures', 'information', 'additional',
  'proposal', 'proposals', 'vote', 'voting', 'resolution',
  'advisory', 'ratification', 'selection', 'appointment',
]);

// Common name prefixes/suffixes to validate we have real names
const NAME_PREFIXES = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'hon', 'rev', 'sir', 'dame',
]);

const NAME_SUFFIXES = new Set([
  'jr', 'sr', 'ii', 'iii', 'iv', 'md', 'phd', 'esq', 'cpa', 'jd',
  'dds', 'dvm', 'rn', 'do', 'dpm', 'od', 'np', 'pa',
]);

function isLikelyName(word: string): boolean {
  const lower = word.toLowerCase().replace(/[.,;:]/g, '');
  if (lower.length < 2) return false;
  if (NON_NAME_WORDS.has(lower)) return false;
  // Must start with uppercase
  if (!/^[A-Z]/.test(word)) return false;
  // Should not be all uppercase (likely a heading/label)
  if (word.length > 3 && word === word.toUpperCase()) return false;
  // Should not contain digits
  if (/\d/.test(word)) return false;
  return true;
}

function isMiddleInitial(s: string): boolean {
  return /^[A-Z]\.?$/.test(s);
}

export function parseFullName(raw: string, source = ''): ParsedName | null {
  const cleaned = raw.trim()
    .replace(/\s+/g, ' ')
    .replace(/^(Dr|Mr|Mrs|Ms|Prof|Hon|Rev)\.?\s+/i, '');

  // Remove suffixes
  const withoutSuffix = cleaned
    .replace(/,?\s+(Jr|Sr|II|III|IV|MD|PhD|Esq|CPA|JD|DDS|DVM|RN|DO)\.?\s*$/i, '');

  const parts = withoutSuffix.split(' ').filter(Boolean);
  if (parts.length < 2) return null;

  // Validate that parts look like actual name components
  const firstPart = parts[0];
  const lastPart = parts[parts.length - 1];

  if (!isLikelyName(firstPart) && !isMiddleInitial(firstPart)) return null;
  if (!isLikelyName(lastPart)) return null;

  // Handle "Last, First Middle" format
  if (firstPart.endsWith(',')) {
    const lastName = firstPart.replace(',', '');
    if (!isLikelyName(lastName)) return null;
    return {
      lastName,
      firstName: parts[1],
      middleName: parts.slice(2).join(' ') || undefined,
      fullName: cleaned,
      source,
    };
  }

  // Handle compound last name prefixes (e.g., "Josh Le Vine" -> lastName="Le Vine")
  if (parts.length >= 3) {
    const penultimate = parts[parts.length - 2];
    if (COMPOUND_PREFIXES.has(penultimate.toLowerCase())) {
      const compoundLast = penultimate + ' ' + lastPart;
      return {
        firstName: firstPart,
        lastName: compoundLast,
        middleName: parts.length > 3 ? parts.slice(1, -2).join(' ') : undefined,
        fullName: cleaned,
        source,
      };
    }
  }

  // Handle "First Middle Last" format
  return {
    firstName: firstPart,
    lastName: lastPart,
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined,
    fullName: cleaned,
    source,
  };
}

export function extractNamesFromText(html: string, source: string): ParsedName[] {
  // Strip HTML tags for cleaner extraction
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ');

  const names: ParsedName[] = [];
  const seen = new Set<string>();

  function addName(parsed: ParsedName | null) {
    if (!parsed) return;
    const key = `${parsed.firstName.toLowerCase()}_${parsed.lastName.toLowerCase()}`;
    if (seen.has(key)) return;

    // Final validation: both first and last name should look like real names
    if (!isLikelyName(parsed.firstName) && !isMiddleInitial(parsed.firstName)) return;
    if (!isLikelyName(parsed.lastName)) return;
    // Names are typically 2-30 chars each
    if (parsed.firstName.length > 25 || parsed.lastName.length > 30) return;
    if (parsed.firstName.length < 2 || parsed.lastName.length < 2) return;

    seen.add(key);
    names.push(parsed);
  }

  // Pattern 1: /s/ signature blocks (most reliable)
  // Matches: "/s/ John Smith", "/s/ John A. Smith", "/s/ John Andrew Smith", "/s/ Josh Le Vine"
  const sigPattern = /\/s\/\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+(?:\s+(?:Jr|Sr|II|III|IV)\.?)?)/g;
  let match;
  while ((match = sigPattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  // Pattern 2: "By: Name" in signature lines
  const byPattern = /By:\s*(?:\/s\/\s*)?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)/g;
  while ((match = byPattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  // Pattern 3: Name, Title pattern (comma-separated on same line context)
  // "Albert Bourla, Chief Executive Officer"
  // "David M. Denton, Chief Financial Officer"
  const nameTitlePattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\s*,\s*(?:Chief|President|Vice|Executive|Senior|Director|Chairman|Chairwoman|Secretary|Treasurer|General\s+Counsel|Controller)/g;
  while ((match = nameTitlePattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  // Pattern 4: Title: Name pattern
  // "Chief Executive Officer: Albert Bourla"
  // "CEO Albert Bourla"
  const titleNamePattern = /(?:Chief\s+(?:Executive|Financial|Operating|Scientific|Medical|Technology|Business|Commercial|Legal)\s+Officer|CEO|CFO|COO|CTO|CSO|CMO|President|Chairman|Chairwoman|Secretary|Treasurer|Controller|General\s+Counsel)[:\s]+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)/g;
  while ((match = titleNamePattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  // Pattern 5: SGML header names
  const sgmlPattern = /FILED BY:\s*(.+?)(?:\n|$)/gi;
  while ((match = sgmlPattern.exec(text)) !== null) {
    const raw = match[1].trim();
    // SGML names are often all-caps company names, only parse if mixed case
    if (raw !== raw.toUpperCase()) {
      addName(parseFullName(raw, source));
    }
  }

  // Pattern 6: DEF 14A director/nominee lists - "Name Age Director Since"
  // These are structured as: "FirstName LastName digits digits"
  const directorPattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\s+\d{2,3}\s+\d{4}/g;
  while ((match = directorPattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  // Pattern 7: "Name has served as" / "Name was appointed" / "Name joined"
  const narrativePattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\s+(?:has\s+served|was\s+appointed|joined|serves?\s+as|has\s+been|became|is\s+the|was\s+named|was\s+elected)/g;
  while ((match = narrativePattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  // Pattern 8: "Name resigned" / "Name departed" / "Name was terminated" / "Name stepped down"
  const departurePattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\s*,?\s*(?:resigned|departed|was\s+terminated|stepped\s+down|was\s+removed|was\s+replaced|left\s+the|ceased|retired)/g;
  while ((match = departurePattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  // Pattern 9: "Name, [role] of [Company]" / "Name, a director" / "Name, the former"
  const rolePattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\s*,\s*(?:a\s+(?:director|member|partner|consultant|officer|former)|the\s+(?:former|current|then)|our\s+(?:former|current)|who\s+(?:served|was|is|has)|formerly)/g;
  while ((match = rolePattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  // Pattern 10: "Name was [appointed/hired/retained] as"
  const hiredPattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\s+was\s+(?:appointed|hired|retained|engaged|named|elected|designated)\s+(?:as|to)/g;
  while ((match = hiredPattern.exec(text)) !== null) {
    addName(parseFullName(match[1], source));
  }

  return names;
}

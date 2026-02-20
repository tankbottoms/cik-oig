import { readFileSync } from 'fs';
import { join } from 'path';
import type { OIGExclusion, OIGMatch } from '$lib/types';

let individuals: Map<string, OIGExclusion[]> | null = null;
let businesses: Map<string, OIGExclusion[]> | null = null;
let loaded = false;

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function loadOIGData(): void {
  if (loaded) return;

  individuals = new Map();
  businesses = new Map();

  const csvPath = join(process.cwd(), 'static', 'csvs', 'UPDATED.csv');
  let raw: string;

  try {
    raw = readFileSync(csvPath, 'utf-8');
  } catch {
    console.warn('OIG CSV not found at', csvPath, '- run "bun run data:oig" first');
    loaded = true;
    return;
  }

  const lines = raw.split('\n');
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    if (fields.length < 18) continue;

    // CSV columns: LASTNAME,FIRSTNAME,MIDNAME,BUSNAME,GENERAL,SPECIALTY,
    //   UPIN,NPI,DOB,ADDRESS,CITY,STATE,ZIP,EXCLTYPE,EXCLDATE,REINDATE,WAIVERDATE,WVRSTATE
    const exclusion: OIGExclusion = {
      lastName: fields[0] || '',
      firstName: fields[1] || '',
      midName: fields[2] || '',
      busName: fields[3] || '',
      general: fields[4] || '',
      specialty: fields[5] || '',
      upin: fields[6] || '',
      npi: fields[7] || '',
      dob: fields[8] || '',
      address: fields[9] || '',
      city: fields[10] || '',
      state: fields[11] || '',
      zip: fields[12] || '',
      exclType: fields[13] || '',
      exclDate: fields[14] || '',
      reinDate: fields[15] || '',
      waiverDate: fields[16] || '',
      waiverState: fields[17] || '',
    };

    // Index individuals
    if (exclusion.lastName) {
      const key = normalizeKey(exclusion.lastName + exclusion.firstName);
      const existing = individuals.get(key) || [];
      existing.push(exclusion);
      individuals.set(key, existing);
    }

    // Index businesses
    if (exclusion.busName) {
      const key = normalizeKey(exclusion.busName);
      const existing = businesses.get(key) || [];
      existing.push(exclusion);
      businesses.set(key, existing);
    }
  }

  loaded = true;
  console.log(
    `OIG data loaded: ${individuals.size} individual keys, ${businesses.size} business keys`
  );
}

export function searchIndividual(
  firstName: string,
  lastName: string,
  middleName?: string
): OIGMatch[] {
  if (!individuals) loadOIGData();
  if (!individuals) return [];

  const matches: OIGMatch[] = [];

  // Exact match: lastName + firstName
  const exactKey = normalizeKey(lastName + firstName);
  const exact = individuals.get(exactKey);
  if (exact) {
    for (const e of exact) {
      matches.push({ ...e, matchType: 'exact' });
    }
  }

  // Partial match: lastName only, then check firstName prefix
  if (matches.length === 0) {
    const lastNameNorm = normalizeKey(lastName);
    for (const [key, exclusions] of individuals) {
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

export function searchBusiness(busName: string): OIGMatch[] {
  if (!businesses) loadOIGData();
  if (!businesses) return [];

  const key = normalizeKey(busName);
  const exact = businesses.get(key);
  if (exact) {
    return exact.map(e => ({ ...e, matchType: 'business' as const }));
  }

  // Partial business match
  const matches: OIGMatch[] = [];
  for (const [k, exclusions] of businesses) {
    if (k.includes(key) || key.includes(k)) {
      for (const e of exclusions) {
        matches.push({ ...e, matchType: 'business' });
      }
    }
    if (matches.length >= 10) break;
  }

  return matches;
}

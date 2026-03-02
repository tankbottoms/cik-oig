/**
 * Build pre-indexed OIG exclusion JSON files from UPDATED.csv.
 * Splits data by first letter into static/data/oig/{a-z,_}.json
 * for on-demand loading at runtime (matches CIK data pattern).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dir, '..', 'static', 'csvs', 'UPDATED.csv');
const OUT_DIR = join(__dir, '..', 'static', 'data', 'oig');

interface OIGRecord {
  lastName: string;
  firstName: string;
  midName: string;
  busName: string;
  general: string;
  specialty: string;
  upin: string;
  npi: string;
  dob: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  exclType: string;
  exclDate: string;
  reinDate: string;
  waiverDate: string;
  waiverState: string;
}

interface LetterBucket {
  individuals: Record<string, OIGRecord[]>;
  businesses: Record<string, OIGRecord[]>;
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

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function letterOf(s: string): string {
  const first = s.charAt(0).toLowerCase();
  return first >= 'a' && first <= 'z' ? first : '_';
}

// Read CSV
console.log(`Reading CSV from: ${CSV_PATH}`);
const raw = readFileSync(CSV_PATH, 'utf-8');
const lines = raw.split('\n');
console.log(`Total lines: ${lines.length}`);

// Initialize buckets for a-z + _
const buckets = new Map<string, LetterBucket>();
for (let c = 97; c <= 122; c++) {
  buckets.set(String.fromCharCode(c), { individuals: {}, businesses: {} });
}
buckets.set('_', { individuals: {}, businesses: {} });

let individualCount = 0;
let businessCount = 0;
let skippedCount = 0;

// Parse rows (skip header)
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const fields = parseCSVLine(line);
  if (fields.length < 18) {
    skippedCount++;
    continue;
  }

  const record: OIGRecord = {
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

  // Index individuals by first letter of lastName
  if (record.lastName) {
    const letter = letterOf(record.lastName);
    const bucket = buckets.get(letter)!;
    const key = normalizeKey(record.lastName + record.firstName);
    if (!bucket.individuals[key]) bucket.individuals[key] = [];
    bucket.individuals[key].push(record);
    individualCount++;
  }

  // Index businesses by first letter of busName
  if (record.busName) {
    const letter = letterOf(record.busName);
    const bucket = buckets.get(letter)!;
    const key = normalizeKey(record.busName);
    if (!bucket.businesses[key]) bucket.businesses[key] = [];
    bucket.businesses[key].push(record);
    businessCount++;
  }
}

// Write JSON files
mkdirSync(OUT_DIR, { recursive: true });

let totalSize = 0;
for (const [letter, bucket] of buckets) {
  const outPath = join(OUT_DIR, `${letter}.json`);
  const json = JSON.stringify(bucket);
  writeFileSync(outPath, json);
  totalSize += json.length;
  const indKeys = Object.keys(bucket.individuals).length;
  const busKeys = Object.keys(bucket.businesses).length;
  if (indKeys > 0 || busKeys > 0) {
    console.log(`  ${letter}.json: ${indKeys} individual keys, ${busKeys} business keys (${(json.length / 1024).toFixed(0)} KB)`);
  }
}

console.log(`\nDone.`);
console.log(`  Individuals indexed: ${individualCount}`);
console.log(`  Businesses indexed: ${businessCount}`);
console.log(`  Rows skipped: ${skippedCount}`);
console.log(`  Files written: ${buckets.size}`);
console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

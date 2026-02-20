import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const dataPath = process.env.EDGAR_CIK_DATA_PATH
  || join(import.meta.dir, '..', '..', 'edgar-cik-cli', 'data', 'cik-lookup-data.txt');

console.log(`Reading CIK data from: ${dataPath}`);
const raw = readFileSync(dataPath, 'utf-8');
const lines = raw.split('\n').filter(Boolean);
console.log(`Total lines: ${lines.length}`);

// Group by first alpha character of name
const buckets: Record<string, Array<{ n: string; c: string }>> = {};
const seen = new Set<string>();
let total = 0;

for (const line of lines) {
  const lastColon = line.lastIndexOf(':');
  if (lastColon <= 0) continue;
  const secondLastColon = line.lastIndexOf(':', lastColon - 1);
  if (secondLastColon < 0) continue;

  const name = line.substring(0, secondLastColon).trim();
  const cik = line.substring(secondLastColon + 1, lastColon).trim();

  if (!name || !cik) continue;

  // Deduplicate by CIK (keep first occurrence)
  const key = `${cik}_${name}`;
  if (seen.has(key)) continue;
  seen.add(key);

  // Determine bucket by first alphabetic character
  const firstAlpha = name.match(/[a-zA-Z]/);
  const bucket = firstAlpha ? firstAlpha[0].toLowerCase() : '_';

  if (!buckets[bucket]) buckets[bucket] = [];
  buckets[bucket].push({ n: name, c: cik.padStart(10, '0') });
  total++;
}

console.log(`Total unique entities: ${total}`);

// Sort each bucket by name
for (const key of Object.keys(buckets)) {
  buckets[key].sort((a, b) => a.n.localeCompare(b.n));
}

// Write individual bucket files
const outDir = join(import.meta.dir, '..', 'static', 'data');
mkdirSync(outDir, { recursive: true });

const manifest: Record<string, { file: string; count: number; sizeKB: number }> = {};

for (const [key, entries] of Object.entries(buckets)) {
  const filename = `cik_${key}.json`;
  const filepath = join(outDir, filename);
  const content = JSON.stringify(entries);
  writeFileSync(filepath, content);
  const sizeKB = Math.round(content.length / 1024);
  manifest[key] = { file: filename, count: entries.length, sizeKB };
  console.log(`  ${filename}: ${entries.length} entities (${sizeKB} KB)`);
}

// Write manifest
const manifestPath = join(outDir, 'cik-manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Also keep the healthcare-filtered subset for quick reference
const HEALTHCARE_KEYWORDS = [
  'pharma', 'medical', 'health', 'biotech', 'hospital', 'surgical',
  'dental', 'diagnostic', 'therapeut', 'oncol', 'cardio', 'neuro',
  'ortho', 'pathol', 'clinic', 'nursing', 'lab ', 'labs', 'optic',
  'ophthalm', 'biolog', 'genomic', 'bioscien', 'medic', 'drug',
  'vaccine', 'immun', 'dermat', 'radiol', 'urgent care',
  'home health', 'hospice', 'wellness', 'rehab', 'psych',
  'behavioral', 'ambulan', 'anesthes', 'fertility', 'ivf',
  'plasma', 'blood', 'organ', 'prosth', 'implant', 'stent',
  'catheter', 'ventilat', 'dialysis', 'insulin', 'rx ', 'hmo',
  'ppo', 'medicare', 'medicaid', 'tricare'
];

const healthcareEntities: Array<{ n: string; c: string }> = [];
const healthcareSeen = new Set<string>();

for (const entries of Object.values(buckets)) {
  for (const e of entries) {
    const nameLower = e.n.toLowerCase();
    if (HEALTHCARE_KEYWORDS.some(kw => nameLower.includes(kw)) && !healthcareSeen.has(e.c)) {
      healthcareSeen.add(e.c);
      healthcareEntities.push(e);
    }
  }
}

healthcareEntities.sort((a, b) => a.n.localeCompare(b.n));
const hcPath = join(outDir, 'healthcare-ciks.json');
writeFileSync(hcPath, JSON.stringify(healthcareEntities));
console.log(`\nHealthcare subset: ${healthcareEntities.length} entities (${Math.round(JSON.stringify(healthcareEntities).length / 1024)} KB)`);

console.log(`\nManifest: ${manifestPath}`);
console.log(`Total files: ${Object.keys(manifest).length + 2}`);

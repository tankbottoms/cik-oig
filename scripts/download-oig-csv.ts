import { mkdirSync } from 'fs';
import { join } from 'path';

const OIG_URL = 'https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv';
const outDir = join(import.meta.dir, '..', 'static', 'csvs');
const outPath = join(outDir, 'UPDATED.csv');

mkdirSync(outDir, { recursive: true });

console.log(`Downloading OIG exclusion list from: ${OIG_URL}`);

const resp = await fetch(OIG_URL, {
  headers: {
    'User-Agent': 'CIK-OIG-Check/1.0 (healthcare exclusion checker)',
  },
});

if (!resp.ok) {
  console.error(`Failed to download: ${resp.status} ${resp.statusText}`);
  process.exit(1);
}

const csv = await resp.text();
await Bun.write(outPath, csv);

const lines = csv.split('\n').length;
console.log(`Downloaded: ${lines} rows`);
console.log(`Written to: ${outPath}`);
console.log(`File size: ${(csv.length / 1024 / 1024).toFixed(1)} MB`);

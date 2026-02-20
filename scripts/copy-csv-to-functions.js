// Post-build: copy OIG CSV into Vercel serverless function bundles
// so the function can read it from disk instead of fetching from CDN
import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const CSV_SRC = 'static/csvs/UPDATED.csv';
const FUNCTIONS_DIR = '.vercel/output/functions';

if (!existsSync(CSV_SRC)) {
  console.log('No OIG CSV to copy (static/csvs/UPDATED.csv not found)');
  process.exit(0);
}

if (!existsSync(FUNCTIONS_DIR)) {
  console.log('No .vercel/output/functions directory - skipping CSV copy');
  process.exit(0);
}

function findFuncDirs(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      if (entry.name.endsWith('.func')) {
        results.push(fullPath);
      } else {
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            results.push(...findFuncDirs(fullPath));
          }
        } catch {}
      }
    }
  }
  return results;
}

const funcDirs = findFuncDirs(FUNCTIONS_DIR);

for (const funcDir of funcDirs) {
  const destDir = join(funcDir, 'static', 'csvs');
  mkdirSync(destDir, { recursive: true });
  copyFileSync(CSV_SRC, join(destDir, 'UPDATED.csv'));
  console.log(`Copied OIG CSV to ${destDir}/UPDATED.csv`);
}

if (funcDirs.length === 0) {
  console.log('No .func directories found - CSV not copied');
}

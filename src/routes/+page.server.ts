import type { PageServerLoad } from './$types';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

export const load: PageServerLoad = async ({ fetch }) => {
  // Try multiple paths for the manifest (works locally and on Vercel)
  const possiblePaths = [
    join(process.cwd(), 'static', 'data', 'cik-manifest.json'),
    resolve(fileURLToPath(import.meta.url), '../../../../static/data/cik-manifest.json'),
  ];

  let manifest: Record<string, { file: string; count: number; sizeKB: number }> = {};

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      manifest = JSON.parse(readFileSync(p, 'utf-8'));
      break;
    }
  }

  // Fallback: fetch from static path (works on Vercel where files are served by CDN)
  if (Object.keys(manifest).length === 0) {
    try {
      const resp = await fetch('/data/cik-manifest.json');
      if (resp.ok) {
        manifest = await resp.json();
      }
    } catch {
      console.warn('cik-manifest.json not found');
    }
  }

  const buckets = Object.entries(manifest).map(([key, info]) => ({
    key,
    file: info.file,
    count: info.count,
    sizeKB: info.sizeKB,
  }));

  const totalEntities = buckets.reduce((sum, b) => sum + b.count, 0);

  return { buckets, totalEntities };
};

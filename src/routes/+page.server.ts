import type { PageServerLoad } from './$types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const load: PageServerLoad = async () => {
  const dataDir = join(process.cwd(), 'static', 'data');
  const manifestPath = join(dataDir, 'cik-manifest.json');

  let manifest: Record<string, { file: string; count: number; sizeKB: number }> = {};

  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } else {
    console.warn('cik-manifest.json not found - run "bun run data:ciks" first');
  }

  // Pass available bucket keys so the client knows what to load
  const buckets = Object.entries(manifest).map(([key, info]) => ({
    key,
    file: info.file,
    count: info.count,
    sizeKB: info.sizeKB,
  }));

  const totalEntities = buckets.reduce((sum, b) => sum + b.count, 0);

  return { buckets, totalEntities };
};

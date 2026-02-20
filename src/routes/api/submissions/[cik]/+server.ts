import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimitedFetch } from '$lib/sec/rate-limiter';

const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'CIK-OIG-Check admin@example.com';

export const GET: RequestHandler = async ({ params }) => {
  const cik = params.cik.padStart(10, '0');
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;

  try {
    const resp = await rateLimitedFetch(url, {
      'User-Agent': SEC_USER_AGENT,
      'Accept-Encoding': 'gzip, deflate',
    });

    if (!resp.ok) {
      return json({ error: resp.statusText }, { status: resp.status });
    }

    const data = await resp.json();

    return json({
      cik: data.cik,
      name: data.name,
      sic: data.sic,
      sicDescription: data.sicDescription,
      tickers: data.tickers || [],
      filings: (data.filings?.recent?.accessionNumber || []).map((acc: string, i: number) => ({
        accession: acc,
        date: data.filings.recent.filingDate[i],
        form: data.filings.recent.form[i],
        primaryDoc: data.filings.recent.primaryDocument[i],
        size: data.filings.recent.size[i],
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
};

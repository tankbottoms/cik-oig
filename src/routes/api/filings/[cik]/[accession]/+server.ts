import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimitedFetch } from '$lib/sec/rate-limiter';
import { extractNamesFromText } from '$lib/search/name-extractor';

const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'CIK-OIG-Check admin@example.com';

export const GET: RequestHandler = async ({ params, url: reqUrl }) => {
  const cik = params.cik.replace(/^0+/, '') || params.cik;
  const accessionDashed = params.accession;
  const accessionNoDash = accessionDashed.replace(/-/g, '');
  const primaryDoc = reqUrl.searchParams.get('doc') || '';
  const form = reqUrl.searchParams.get('form') || '';

  if (!primaryDoc) {
    return json({ error: 'Missing doc query parameter' }, { status: 400 });
  }

  // SEC Archives URL uses no-dash accession in path
  const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDash}/${primaryDoc}`;

  try {
    let resp = await rateLimitedFetch(filingUrl, {
      'User-Agent': SEC_USER_AGENT,
      'Accept-Encoding': 'gzip, deflate',
    });

    // Fallback: try with dashed accession (some older filings)
    if (!resp.ok && resp.status === 404) {
      const altUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionDashed}/${primaryDoc}`;
      resp = await rateLimitedFetch(altUrl, {
        'User-Agent': SEC_USER_AGENT,
        'Accept-Encoding': 'gzip, deflate',
      });
    }

    if (!resp.ok) {
      return json({ error: `SEC returned ${resp.status}` }, { status: resp.status });
    }

    const text = await resp.text();
    const source = `${form} ${accessionDashed}`;
    const names = extractNamesFromText(text, source);

    return json({
      accession: accessionDashed,
      form,
      url: resp.url,
      namesFound: names.length,
      names,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
};

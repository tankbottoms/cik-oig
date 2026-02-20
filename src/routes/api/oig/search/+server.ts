import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadOIGData, searchIndividual, searchBusiness } from '$lib/data/oig-parser';
import type { OIGSearchResult } from '$lib/types';

export const POST: RequestHandler = async ({ request, fetch }) => {
  // Await OIG data load (passes fetch for CDN fallback on Vercel)
  await loadOIGData(fetch);

  const body = await request.json();
  const { names = [], businesses = [] } = body as {
    names: Array<{ firstName: string; lastName: string; middleName?: string }>;
    businesses?: string[];
  };

  const results: OIGSearchResult[] = [];

  // Check individuals
  for (const name of names) {
    const matches = searchIndividual(name.firstName, name.lastName, name.middleName);
    const queriedName = `${name.firstName} ${name.middleName ? name.middleName + ' ' : ''}${name.lastName}`;

    let status: OIGSearchResult['status'] = 'CLEAR';
    if (matches.some(m => m.matchType === 'exact')) {
      status = 'MATCH';
    } else if (matches.length > 0) {
      status = 'POSSIBLE_MATCH';
    }

    results.push({ queriedName, matches, status });
  }

  // Check businesses
  for (const busName of businesses) {
    const matches = searchBusiness(busName);

    let status: OIGSearchResult['status'] = 'CLEAR';
    if (matches.some(m => m.matchType === 'business')) {
      status = matches.some(m => m.matchType === 'business') ? 'MATCH' : 'POSSIBLE_MATCH';
    }

    results.push({ queriedName: busName, matches, status });
  }

  return json({ results });
};

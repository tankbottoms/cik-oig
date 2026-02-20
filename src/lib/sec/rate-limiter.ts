const RATE_LIMIT_MS = 110; // ~9 req/s to stay under SEC's 10/s
let lastRequest = 0;

export async function rateLimitedFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastRequest);
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  lastRequest = Date.now();

  return fetch(url, { headers });
}

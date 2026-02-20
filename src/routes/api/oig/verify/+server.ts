import type { RequestHandler } from '@sveltejs/kit';

const OIG_URL = 'https://exclusions.oig.hhs.gov/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractField(html: string, name: string): string {
	const re = new RegExp(`id="${name}"[^>]*value="([^"]*)"`, 'i');
	const match = html.match(re);
	return match?.[1] || '';
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

// Extract Set-Cookie values from response headers
function extractCookies(resp: Response): string {
	const cookies: string[] = [];
	resp.headers.forEach((value, key) => {
		if (key.toLowerCase() === 'set-cookie') {
			// Extract just the cookie name=value part
			const cookiePart = value.split(';')[0];
			if (cookiePart) cookies.push(cookiePart);
		}
	});
	return cookies.join('; ');
}

async function fetchWithCookies(url: string): Promise<{ html: string; cookies: string }> {
	// Step 1: Initial request - OIG redirects to set cookies
	const resp1 = await fetch(url, {
		headers: { 'User-Agent': UA, 'Accept': 'text/html' },
		redirect: 'manual',
	});

	let cookies = extractCookies(resp1);
	const location = resp1.headers.get('location');

	if (resp1.status >= 300 && resp1.status < 400 && location) {
		// Step 2: Follow redirect with cookies
		const redirectUrl = new URL(location, url).toString();
		const resp2 = await fetch(redirectUrl, {
			headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Cookie': cookies },
			redirect: 'manual',
		});

		const moreCookies = extractCookies(resp2);
		if (moreCookies) cookies = cookies ? `${cookies}; ${moreCookies}` : moreCookies;

		// If there's another redirect, follow it
		const location2 = resp2.headers.get('location');
		if (resp2.status >= 300 && resp2.status < 400 && location2) {
			const redirectUrl2 = new URL(location2, url).toString();
			const resp3 = await fetch(redirectUrl2, {
				headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Cookie': cookies },
			});
			const moreCookies3 = extractCookies(resp3);
			if (moreCookies3) cookies = cookies ? `${cookies}; ${moreCookies3}` : moreCookies3;
			return { html: await resp3.text(), cookies };
		}

		return { html: await resp2.text(), cookies };
	}

	return { html: await resp1.text(), cookies };
}

export const GET: RequestHandler = async ({ url }) => {
	const lastName = url.searchParams.get('lastName') || '';
	const firstName = url.searchParams.get('firstName') || '';

	if (!lastName) {
		return new Response('Missing lastName parameter', { status: 400 });
	}

	try {
		const { html, cookies } = await fetchWithCookies(OIG_URL);

		const viewState = extractField(html, '__VIEWSTATE');
		const viewStateGenerator = extractField(html, '__VIEWSTATEGENERATOR');
		const eventValidation = extractField(html, '__EVENTVALIDATION');

		if (!viewState || !eventValidation) {
			return new Response('Failed to extract ASP.NET tokens from OIG page', { status: 502 });
		}

		// Now POST the search to OIG server-side to get search results
		const formData = new URLSearchParams();
		formData.set('__VIEWSTATE', viewState);
		formData.set('__VIEWSTATEGENERATOR', viewStateGenerator);
		formData.set('__EVENTVALIDATION', eventValidation);
		formData.set('__EVENTTARGET', '');
		formData.set('__EVENTARGUMENT', '');
		formData.set('ctl00$cpExclusions$txtSPLastName', lastName);
		formData.set('ctl00$cpExclusions$txtSPFirstName', firstName);
		formData.set('ctl00$cpExclusions$ibSearchSP.x', '40');
		formData.set('ctl00$cpExclusions$ibSearchSP.y', '10');

		const searchResp = await fetch(OIG_URL, {
			method: 'POST',
			headers: {
				'User-Agent': UA,
				'Accept': 'text/html',
				'Content-Type': 'application/x-www-form-urlencoded',
				'Cookie': cookies,
				'Referer': OIG_URL,
			},
			body: formData.toString(),
			redirect: 'follow',
		});

		if (!searchResp.ok) {
			return new Response(`OIG search failed: ${searchResp.status}`, { status: 502 });
		}

		const searchHtml = await searchResp.text();

		// Rewrite relative URLs to absolute
		const rewritten = searchHtml
			.replace(/href="(?!https?:\/\/|mailto:)([^"]+)"/g, (_, path) => {
				if (path.startsWith('/')) return `href="https://exclusions.oig.hhs.gov${path}"`;
				if (path.startsWith('javascript:')) return `href="#"`;
				return `href="https://exclusions.oig.hhs.gov/${path}"`;
			})
			.replace(/src="(?!https?:\/\/)([^"]+)"/g, (_, path) => {
				if (path.startsWith('/')) return `src="https://exclusions.oig.hhs.gov${path}"`;
				return `src="https://exclusions.oig.hhs.gov/${path}"`;
			})
			.replace(/<form[^>]*action="[^"]*"/, '<form action="#" onsubmit="return false;"');

		return new Response(rewritten, {
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
	} catch (err) {
		return new Response(`Error: ${err instanceof Error ? err.message : 'Unknown'}`, { status: 500 });
	}
};

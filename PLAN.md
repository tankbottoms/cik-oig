# CIK-OIG: SEC EDGAR Entity Search + OIG Exclusion Cross-Reference

## Purpose

A single-page web application that lets users search for healthcare-related SEC EDGAR entities, pull their accession filings, extract affiliated individual/entity names from those filings, and cross-reference them against the HHS OIG exclusion list (UPDATED.csv). Users can also directly type a name to check against the OIG exclusion list without going through EDGAR.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun 1.x |
| Framework | SvelteKit 5.x (Svelte 5 runes) |
| Language | TypeScript 5.x |
| Styling | CSS variables (neo-brutalist design system, no Tailwind) |
| Icons | Font Awesome Pro 6.x (fa-thin weight) |
| Fonts | System monospace stack: `ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace` |

---

## Data Sources

### 1. CIK Lookup Cache (pre-filtered healthcare)

**Source:** SEC EDGAR `cik-lookup-data.txt` (~1M lines, `NAME:CIK:` format)

**Pre-processing step (build-time):** Filter the full 1M+ entity list down to healthcare/medical SIC codes. Store as `static/data/healthcare-ciks.json`.

**Healthcare SIC code ranges:**

| SIC Range | Description |
|-----------|-------------|
| 2830-2836 | Pharmaceutical preparations, biologicals |
| 3841-3851 | Surgical/medical instruments, ophthalmic goods |
| 5047 | Medical/dental supplies wholesale |
| 5122 | Drugs, drug proprietaries, sundries wholesale |
| 7011 | Health services (if applicable) |
| 8000-8099 | Health services (offices, hospitals, nursing, labs, home health) |

**Problem:** The `cik-lookup-data.txt` file only has `NAME:CIK` pairs - no SIC codes. SIC codes come from the submissions API (`data.sec.gov/submissions/CIK{padded}.json`).

**Strategy:** Use a two-tier approach:

1. **Tier 1 - keyword filter (build-time, fast):** Scan all 1M entity names for healthcare keywords (`pharma`, `medical`, `health`, `biotech`, `hospital`, `surgical`, `dental`, `diagnostic`, `therapeut`, `oncol`, `cardio`, `neuro`, `ortho`, `pathol`, `clinic`, `nursing`, `labs`, `optic`, `ophthalm`, `biolog`, etc.). This produces a rough candidate list (~10-30K entities). Store as `static/data/healthcare-ciks.json` as an array of `{ name: string, cik: string }`.

2. **Tier 2 - SIC verification (runtime, on-demand):** When a user selects an entity, the submissions API call returns the SIC code, which can be displayed in the UI as confirmation.

**JSON format for `static/data/healthcare-ciks.json`:**

```json
[
  { "n": "PFIZER INC", "c": "0000078003" },
  { "n": "UNITEDHEALTH GROUP INC", "c": "0000731766" }
]
```

Short keys (`n`, `c`) to minimize file size since this ships to the browser.

### 2. OIG Exclusion List

**Source:** `https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv` (~15MB)

**CSV columns:**

```
LASTNAME, FIRSTNAME, MIDNAME, BUSNAME, GENERAL, SPECIALTY,
UPIN, NPI, DOB, ADDRESS, CITY, STATE, ZIP,
EXCLTYPE, EXCLDATE, REINDATE, WAIVERDATE, WVRSTATE
```

**Key fields for matching:**
- `LASTNAME` + `FIRSTNAME` + `MIDNAME` - individual name matching
- `BUSNAME` - business/entity name matching
- `EXCLTYPE` - exclusion authority code (e.g., `1128a1`, `1128b5`)
- `EXCLDATE` - date of exclusion (YYYYMMDD)
- `REINDATE` - reinstatement date (00000000 if still excluded)
- `SPECIALTY` - medical specialty
- `STATE` - state
- `NPI` - National Provider Identifier

**Storage:** Download at build time and place at `static/csvs/UPDATED.csv`. Parse into a searchable structure at runtime on the server side.

**Server-side parsed format (in-memory):**

```typescript
interface OIGExclusion {
  lastName: string;
  firstName: string;
  midName: string;
  busName: string;
  general: string;
  specialty: string;
  npi: string;
  state: string;
  exclType: string;
  exclDate: string;     // YYYYMMDD
  reinDate: string;     // YYYYMMDD or 00000000
}
```

### 3. SEC EDGAR Submissions API (runtime)

**Endpoint:** `https://data.sec.gov/submissions/CIK{10-digit-padded}.json`

**Required header:** `User-Agent: CIK-OIG-Check contact@example.com` (must be real contact)

**Rate limit:** 10 requests/second max from SEC

**Response structure (key fields):**

```typescript
{
  cik: string,
  name: string,
  sic: string,
  sicDescription: string,
  tickers: string[],
  filings: {
    recent: {
      accessionNumber: string[],   // parallel arrays
      filingDate: string[],
      form: string[],
      primaryDocument: string[],
      size: number[]
    }
  }
}
```

### 4. SEC EDGAR Filing Documents (runtime)

**Filing directory URL:**
```
https://www.sec.gov/Archives/edgar/data/{CIK-no-leading-zeros}/{accession-no-hyphens}/
```

**Individual file URL:**
```
https://www.sec.gov/Archives/edgar/data/{CIK-no-leading-zeros}/{accession-no-hyphens}/{filename}
```

---

## Architecture

```
src/
  routes/
    +page.svelte              # Main (only) page - search UI
    +page.server.ts           # SSR load - pre-load healthcare CIK list
    api/
      submissions/
        [cik]/
          +server.ts          # Proxy: fetch SEC submissions, return JSON
      filings/
        [cik]/
          [accession]/
            +server.ts        # Proxy: fetch filing docs, extract names
      oig/
        search/
          +server.ts          # Search OIG exclusion list by name(s)
  lib/
    data/
      healthcare-filter.ts    # Build-time: filter CIKs by healthcare keywords
      oig-parser.ts           # Parse UPDATED.csv into searchable structure
    sec/
      submissions.ts          # Fetch + parse SEC submissions API
      filing-parser.ts        # Download filing HTML/text, extract names via regex
      rate-limiter.ts         # Respect SEC 10 req/s limit
    search/
      fuzzy-match.ts          # Fuzzy search algorithm (port from edgar-cik-cli)
      name-extractor.ts       # Parse extracted strings into first/last names
      oig-matcher.ts          # Match extracted names against OIG list
    types.ts                  # Shared TypeScript interfaces
    stores.ts                 # Svelte stores for reactive state
  app.css                     # Neo-brutalist design system CSS variables + components
static/
  data/
    healthcare-ciks.json      # Pre-filtered healthcare entity list
  csvs/
    UPDATED.csv               # OIG exclusion list (downloaded at build time)
scripts/
  filter-healthcare-ciks.ts   # Build script: filter full CIK list -> healthcare subset
  download-oig-csv.ts         # Build script: download latest UPDATED.csv
```

---

## Page Layout and UI Flow

### Initial State - Search View

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                                                              │
│                                                              │
│           ┌──────────────────────────────────────┐           │
│           │ SEC EDGAR CIK OIG CHECK              │           │
│           │ [Dynamic Associates ████] [_______]   │           │
│           │                          [SEARCH]     │           │
│           └──────────────────────────────────────┘           │
│           ┌──────────────────────────────────────┐           │
│           │ PFIZER INC (0000078003)              │           │
│           │ JOHNSON & JOHNSON (0000200406)       │           │
│           │ UNITEDHEALTH GROUP INC (0000731766)  │           │
│           └──────────────────────────────────────┘           │
│                                                              │
│                                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Behavior:**

- Centered search box, vertically offset ~30% from top (Google-style)
- Placeholder text in input: `SEC EDGAR CIK OIG CHECK`
- As user types, a dropdown appears below with fuzzy-matched healthcare entities
- Dropdown items show: `ENTITY NAME (CIK NUMBER)`
- Clicking/selecting a result converts it into a **badge** inside the search box: `[ENTITY NAME | CIK]` with an X to remove
- Multiple badges can be added (multi-entity search)
- User can also type a plain name (not from the CIK list) for direct OIG lookup
- SEARCH button or Enter triggers the pipeline

### Active Search State - Results View

When search is triggered, the page transitions. The search box moves up (but stays functional), and the results area appears below.

```
┌──────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────┐    │
│  │ [PFIZER INC | 0000078003] [_________________] [SEARCH] │  │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  EXTRACTED NAMES                                  OIG STATUS │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Albert Bourla          CEO      [CLEAR]              │    │
│  │ David M. Denton        CFO      [CLEAR]              │    │
│  │ Mikael Dolsten         CSO      [MATCH - 1128a1]     │    │
│  │ ... loading more names                               │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  FILING DOWNLOAD LOG                                         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ > Fetching submissions for CIK 0000078003...         │    │
│  │ > Found 847 filings (2024-12-31 to 1996-03-15)      │    │
│  │ > [10-K] 2024-02-22  pfizer-20231231.htm   1.2 MB   │    │
│  │ > [10-Q] 2024-08-01  pfe-20240630.htm      856 KB   │    │
│  │ > [8-K]  2024-01-25  pfe-20240125.htm      45 KB    │    │
│  │ > Scanning pfizer-20231231.htm for names...          │    │
│  │ > Found: Albert Bourla, David M. Denton              │    │
│  │ > Checking OIG exclusion list...                     │    │
│  │ > Albert Bourla - NOT FOUND                          │    │
│  │ > David M. Denton - NOT FOUND                        │    │
│  │ _                                                    │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. SearchBox Component (`src/routes/+page.svelte` - inline)

**State:**

```typescript
let query = $state('');
let selectedEntities: Array<{ name: string; cik: string }> = $state([]);
let dropdownResults: Array<{ name: string; cik: string }> = $state([]);
let dropdownVisible = $state(false);
let highlightedIndex = $state(0);
let isSearching = $state(false);
```

**Behavior:**
- Input field with badge rendering inside (badges are inline elements before the text input)
- On keystroke: debounce 150ms, then call `fuzzyMatch()` on the healthcare CIK cache
- Dropdown: max 8 results, keyboard navigable (up/down/enter/escape)
- Badge format: rectangular (border-radius: 0), pastel background, entity name + CIK, X button to remove
- If input text doesn't match any CIK entity, treat it as a direct name for OIG search
- SEARCH button: disabled when no badges and no text, triggers `startPipeline()`

### 2. Fuzzy Match (`src/lib/search/fuzzy-match.ts`)

Port from `edgar-cik-cli/src/research-ui.ts` (lines 34-92):

```typescript
export function fuzzyMatch(text: string, query: string): number {
  if (!query) return 0;
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Substring match = highest score
  if (textLower.includes(queryLower)) {
    return 1000 - textLower.indexOf(queryLower);
  }

  // Character-order fuzzy match
  let textIndex = 0, queryIndex = 0, score = 0, lastMatch = -1;
  while (textIndex < text.length && queryIndex < query.length) {
    if (textLower[textIndex] === queryLower[queryIndex]) {
      score += (lastMatch === textIndex - 1) ? 10 : 1;
      lastMatch = textIndex;
      queryIndex++;
    }
    textIndex++;
  }
  return queryIndex === query.length ? score : 0;
}

export function searchEntities(
  entities: Array<{ n: string; c: string }>,
  query: string,
  limit = 8
): Array<{ name: string; cik: string }> {
  if (!query.trim()) return [];

  return entities
    .map(e => ({ name: e.n, cik: e.c, score: Math.max(fuzzyMatch(e.n, query), fuzzyMatch(e.c, query)) }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ name, cik }) => ({ name, cik }));
}
```

This runs **client-side** against the pre-loaded `healthcare-ciks.json`.

### 3. SEC Submissions Proxy (`src/routes/api/submissions/[cik]/+server.ts`)

**Why a proxy:** The SEC requires a specific User-Agent and has rate limits. Browser CORS would block direct calls. The server proxy adds the User-Agent header and enforces rate limiting.

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SEC_USER_AGENT = 'CIK-OIG-Check admin@example.com'; // configure in .env
const RATE_LIMIT_MS = 110; // ~9 req/s to stay under 10/s
let lastRequest = 0;

export const GET: RequestHandler = async ({ params }) => {
  const cik = params.cik.padStart(10, '0');

  // Rate limit
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastRequest);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();

  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': SEC_USER_AGENT, 'Accept-Encoding': 'gzip, deflate' }
  });

  if (!resp.ok) return json({ error: resp.statusText }, { status: resp.status });
  const data = await resp.json();

  // Return slim payload: company info + filings list
  return json({
    cik: data.cik,
    name: data.name,
    sic: data.sic,
    sicDescription: data.sicDescription,
    tickers: data.tickers,
    filings: data.filings.recent.accessionNumber.map((acc: string, i: number) => ({
      accession: acc,
      date: data.filings.recent.filingDate[i],
      form: data.filings.recent.form[i],
      primaryDoc: data.filings.recent.primaryDocument[i],
      size: data.filings.recent.size[i],
    }))
  });
};
```

### 4. Filing Parser / Name Extractor (`src/routes/api/filings/[cik]/[accession]/+server.ts`)

**Purpose:** Fetch a specific filing document from SEC, extract person/entity names.

**Approach:**
1. Construct the filing URL from CIK + accession number
2. Fetch the primary document (HTML or text)
3. Apply regex patterns to extract names from signature blocks, officer/director sections, exhibit headers

**Name extraction regex patterns:**

```typescript
// Signature blocks: "By: /s/ John Smith" or "Signature: John Smith"
const signaturePattern = /(?:\/s\/|By:\s*|Signature:\s*)([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)/g;

// Officer/Director titles followed by names
const officerPattern = /(?:Chief\s+\w+\s+Officer|Director|President|Secretary|Treasurer|Chairman|Vice\s+President)[\s,:\-]+([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)/gi;

// Name followed by title
const nameTitlePattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)[\s,]+(?:Chief|Director|President|Secretary|Treasurer|Chairman|Vice|CEO|CFO|COO|CTO|CSO)/g;

// "Name" fields in SGML headers
const sgmlNamePattern = /(?:FILED BY|COMPANY CONFORMED NAME|PERSON NAME):\s*(.+)/gi;
```

**Name normalization** (`src/lib/search/name-extractor.ts`):

```typescript
interface ParsedName {
  firstName: string;
  lastName: string;
  middleName?: string;
  fullName: string;
  source: string;  // which filing/pattern found it
}

export function parseFullName(raw: string): ParsedName | null {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return null;

  // Handle "Last, First Middle" format
  if (parts[0].endsWith(',')) {
    return {
      lastName: parts[0].replace(',', ''),
      firstName: parts[1],
      middleName: parts.slice(2).join(' ') || undefined,
      fullName: raw.trim(),
      source: ''
    };
  }

  // Handle "First Middle Last" format
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined,
    fullName: raw.trim(),
    source: ''
  };
}
```

### 5. OIG Matcher (`src/routes/api/oig/search/+server.ts`)

**Initialization:** On server start, parse `static/csvs/UPDATED.csv` into memory. Build lookup maps:

```typescript
// In-memory structures built once at startup
let individuals: Map<string, OIGExclusion[]>;  // key: "lastname_firstname" normalized
let businesses: Map<string, OIGExclusion[]>;   // key: normalized business name

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function loadOIGData(): void {
  // Parse CSV line by line
  // For each row:
  //   If LASTNAME is non-empty: add to individuals map
  //   If BUSNAME is non-empty: add to businesses map
}
```

**Search endpoint accepts:**

```typescript
// POST /api/oig/search
{
  names: Array<{
    firstName: string;
    lastName: string;
    middleName?: string;
  }>;
  businesses?: string[];
}
```

**Matching strategy:**
1. **Exact match:** `normalizeKey(lastName + firstName)` lookup in Map
2. **Partial match:** If no exact match, try `lastName` only, then check firstName substring
3. **Business match:** `normalizeKey(busName)` lookup

**Response:**

```typescript
{
  results: Array<{
    queriedName: string;
    matches: Array<{
      lastName: string;
      firstName: string;
      midName: string;
      busName: string;
      specialty: string;
      state: string;
      exclType: string;
      exclDate: string;
      reinDate: string;
      matchType: 'exact' | 'partial' | 'business';
    }>;
    status: 'CLEAR' | 'MATCH' | 'POSSIBLE_MATCH';
  }>;
}
```

### 6. Terminal Log Component (inline in `+page.svelte`)

A scrolling log area styled like a terminal. Uses a Svelte store to push log lines as processing happens.

```typescript
// src/lib/stores.ts
import { writable } from 'svelte/store';

export interface LogLine {
  timestamp: number;
  text: string;
  type: 'info' | 'fetch' | 'found' | 'match' | 'clear' | 'error';
}

export const logLines = writable<LogLine[]>([]);
export const extractedNames = writable<ExtractedNameResult[]>([]);

export function addLog(text: string, type: LogLine['type'] = 'info') {
  logLines.update(lines => [...lines, { timestamp: Date.now(), text, type }]);
}
```

**CSS for terminal log:**

```css
.terminal-log {
  background: var(--color-bg-alt);
  border: 1px solid var(--color-border-light);
  border-radius: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  padding: var(--spacing-md);
  max-height: 400px;
  overflow-y: auto;
  box-shadow: 2px 2px 0px var(--color-shadow);
}

.log-line { padding: 2px 0; }
.log-line.fetch { color: var(--color-link); }
.log-line.found { color: var(--color-success); }
.log-line.match { color: var(--color-error); font-weight: 600; }
.log-line.clear { color: var(--color-text-muted); }
.log-line.error { color: var(--color-error); }
.log-line::before { content: '> '; color: var(--color-text-muted); }
```

### 7. Names Result Panel (inline in `+page.svelte`)

Displays extracted names with their OIG check status. Appears above the terminal log.

```typescript
interface ExtractedNameResult {
  name: ParsedName;
  oigStatus: 'pending' | 'clear' | 'match' | 'possible_match';
  oigMatches?: OIGMatch[];
  source: string; // which filing it came from
}
```

**Each row shows:**
- Full name
- Source filing (form type + date)
- OIG status badge: `[CLEAR]` (green), `[MATCH - exclType]` (red), `[CHECKING...]` (grey), `[POSSIBLE]` (amber)

---

## Processing Pipeline (Client-Initiated, Server-Executed)

When the user clicks SEARCH:

```
1. Client sends selected CIKs to /api/submissions/[cik]
   └─ For each CIK:
      a. Server fetches SEC submissions API
      b. Returns company info + filing list
      c. Client logs: "Found N filings (date range)"

2. Client iterates through filings (prioritize 10-K, 10-Q, DEF 14A, 8-K)
   └─ For each relevant filing:
      a. Client sends to /api/filings/[cik]/[accession]
      b. Server fetches primary document from SEC
      c. Server applies name extraction regex
      d. Server returns extracted names
      e. Client logs: "[FORM] DATE  filename  SIZE"
      f. Client logs: "Found: Name1, Name2, ..."
      g. Client adds names to extractedNames store (deduped)

3. After 2-3 names are extracted, client starts OIG checks in parallel
   └─ Client batches names and sends to /api/oig/search
      a. Server checks against in-memory OIG data
      b. Returns match/clear status per name
      c. Client updates name result panel
      d. Client logs: "Name - CLEAR" or "Name - MATCH (exclType)"

4. Process continues until all priority filings are scanned
   └─ Final log: "Complete. N names extracted, M checked, X matches found"
```

**Filing priority order for name extraction:**
1. `DEF 14A` (proxy statements - richest source of officer/director names)
2. `10-K` (annual reports - signature blocks, officer listings)
3. `10-Q` (quarterly - signature blocks)
4. `8-K` (current reports - appointment/departure disclosures)
5. All others (secondary priority)

**Limit:** Process the 20 most recent filings of each priority type to keep response time reasonable. This is configurable.

---

## Build Scripts

### `scripts/filter-healthcare-ciks.ts`

```typescript
// Reads: ~/Developer/edgar-cik-cli/data/cik-lookup-data.txt (1M+ lines)
// Writes: static/data/healthcare-ciks.json

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

// Read line by line, match keywords, output JSON array
```

Run: `bun run scripts/filter-healthcare-ciks.ts`

### `scripts/download-oig-csv.ts`

```typescript
// Downloads: https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv
// Writes: static/csvs/UPDATED.csv

const resp = await fetch('https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv');
const csv = await resp.text();
Bun.write('static/csvs/UPDATED.csv', csv);
```

Run: `bun run scripts/download-oig-csv.ts`

### package.json scripts

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "bun run scripts/filter-healthcare-ciks.ts && bun run scripts/download-oig-csv.ts && vite build",
    "preview": "vite preview",
    "data:ciks": "bun run scripts/filter-healthcare-ciks.ts",
    "data:oig": "bun run scripts/download-oig-csv.ts",
    "data:all": "bun run data:ciks && bun run data:oig"
  }
}
```

---

## CSS Design System

Use the full neo-brutalist design system from `~/.claude/global-context/neo-brutalist.md`. Key rules:

- **All border-radius: 0** (badges, buttons, inputs, cards, panels)
- **Hard offset shadows:** `box-shadow: 2px 2px 0px var(--color-shadow)`
- **Monospace everything:** `var(--font-mono)` for body, labels, badges, inputs
- **No blurred shadows, no gradients, no pills, no rounded corners**
- **Font Awesome thin** (`fa-thin`) icons only, never solid/regular
- **No emojis**
- **Pastel badge colors:** 12-20% opacity backgrounds with solid borders

**Badge colors for OIG status:**

| Status | Background | Border | Text |
|--------|-----------|--------|------|
| CLEAR | `rgba(40, 167, 69, 0.15)` | `#28a745` | `#28a745` |
| MATCH | `rgba(220, 53, 69, 0.15)` | `#dc3545` | `#dc3545` |
| POSSIBLE | `rgba(255, 193, 7, 0.15)` | `#ffc107` | `#92400e` |
| CHECKING | `rgba(102, 102, 102, 0.1)` | `#666` | `#666` |

**Entity badge in search box:**

```css
.entity-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.5rem;
  background: rgba(92, 107, 192, 0.15);
  border: 1px solid var(--scheme-shell);
  color: var(--scheme-shell);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0;
  text-transform: uppercase;
}

.entity-badge .remove {
  cursor: pointer;
  opacity: 0.6;
}

.entity-badge .remove:hover {
  opacity: 1;
}
```

---

## Environment Variables

```env
# .env
SEC_USER_AGENT="CIK-OIG-Check admin@yourdomain.com"    # Required by SEC
EDGAR_CIK_DATA_PATH="../edgar-cik-cli/data/cik-lookup-data.txt"  # Source for build script
```

---

## Implementation Order

### Phase 1: Project Setup + Static Data

1. `bun create svelte@latest` with TypeScript, SvelteKit 5
2. Set up `app.css` with full neo-brutalist CSS variables and component classes
3. Write `scripts/filter-healthcare-ciks.ts` - filter CIK data
4. Write `scripts/download-oig-csv.ts` - fetch OIG CSV
5. Run both scripts to generate `static/data/healthcare-ciks.json` and `static/csvs/UPDATED.csv`

### Phase 2: Search UI

6. Build the main page layout: centered search box with badge input
7. Implement `fuzzy-match.ts` (port from edgar-cik-cli)
8. Wire up search input -> fuzzy match -> dropdown results
9. Implement badge creation on entity selection
10. Implement direct text input mode (non-CIK name search)

### Phase 3: Server API Endpoints

11. Build `/api/submissions/[cik]` - SEC proxy with rate limiting
12. Build `/api/filings/[cik]/[accession]` - filing fetch + name extraction
13. Build `/api/oig/search` - OIG exclusion list search
14. Write `oig-parser.ts` - CSV parse + in-memory index
15. Write `filing-parser.ts` - name extraction regex
16. Write `name-extractor.ts` - raw string -> first/last name parsing

### Phase 4: Processing Pipeline + Terminal Log

17. Build the terminal log component (scrolling, color-coded)
18. Build the names result panel (extracted names + OIG status badges)
19. Wire up the full pipeline: search -> submissions -> filings -> names -> OIG check
20. Implement streaming updates (EventSource/SSE or polling) for real-time log output
21. Add progress indicators and completion state

### Phase 5: Polish + Direct Name Search

22. Support direct name input (bypass EDGAR, go straight to OIG check)
23. Dark mode support (CSS variable swap)
24. Responsive layout (mobile breakpoints per neo-brutalist spec)
25. Error handling: SEC rate limit backoff, network failures, malformed data
26. Loading states and empty states

---

## Key Decisions

1. **Server-side SEC calls only** - SEC requires User-Agent and blocks CORS. All EDGAR fetches go through SvelteKit server endpoints.

2. **Pre-filtered CIK list** - The full 1M entity list is too large for the browser. Filter at build time using keyword matching on entity names. The healthcare subset should be ~10-30K entities, which is manageable as a JSON file (~1-3MB).

3. **OIG CSV in-memory on server** - 15MB CSV parsed once at server start into Maps for O(1) lookup. No database needed.

4. **Name extraction is imperfect** - Regex-based name extraction from SEC filings will have false positives/negatives. The UI should make it clear these are "extracted" names and the user should verify matches.

5. **Rate limiting is server-side** - A single rate limiter instance in the server process ensures SEC compliance regardless of concurrent users.

6. **No persistent storage** - This is a search/check tool. No database, no user accounts, no saved searches. Everything is ephemeral per session.

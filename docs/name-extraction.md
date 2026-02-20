# Name Extraction Patterns

The name extractor (`src/lib/search/name-extractor.ts`) processes SEC filing HTML to identify person names. It applies 10 regex patterns sequentially, deduplicating by `firstName_lastName` key.

## Pre-processing

1. Strip `<style>` and `<script>` blocks
2. Remove all HTML tags
3. Decode HTML entities (`&nbsp;`, `&amp;`, `&#NNN;`)
4. Normalize whitespace to single spaces

## Validation

Each candidate name must pass:

- Starts with uppercase letter
- Not in the ~150 word blocklist (titles, legal terms, financial jargon)
- Not all-uppercase (likely a heading) if longer than 3 characters
- No digits
- First name: 2-25 characters
- Last name: 2-30 characters
- At least 2 name parts (first + last minimum)

## Blocklist Categories

- **Titles**: chief, officer, director, president, secretary, treasurer, chairman, etc.
- **Abbreviations**: CEO, CFO, COO, CTO, CSO, CMO, CRO, CIO
- **Corporate**: corporation, company, inc, llc, llp, ltd, corp
- **Legal**: pursuant, thereof, herein, hereto, hereby, whereas
- **Financial**: shares, stock, equity, securities, compensation, audit
- **Geographic**: europe, asia, africa, america, pacific, atlantic, north, south, east, west

## Name Prefixes (stripped)

Dr, Mr, Mrs, Ms, Prof, Hon, Rev, Sir, Dame

## Name Suffixes (stripped)

Jr, Sr, II, III, IV, MD, PhD, Esq, CPA, JD, DDS, DVM, RN, DO, DPM, OD, NP, PA

## Patterns

### Pattern 1: /s/ Signature Blocks

The most reliable extraction pattern. SEC filings use `/s/` to denote electronic signatures.

```regex
/\/s\/\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+(?:\s+(?:Jr|Sr|II|III|IV)\.?)?)/g
```

**Matches**: `/s/ John A. Smith`, `/s/ Jane Elizabeth Doe Jr.`

### Pattern 2: By: Signature Lines

Formal signature blocks that start with "By:".

```regex
/By:\s*(?:\/s\/\s*)?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)/g
```

**Matches**: `By: John Smith`, `By: /s/ Jane Doe`

### Pattern 3: Name, Title

Person names followed by a corporate title.

```regex
/([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)\s*,\s*(?:Chief|President|Vice|Executive|Senior|Director|Chairman|Chairwoman|Secretary|Treasurer|General\s+Counsel|Controller)/g
```

**Matches**: `Albert Bourla, Chief Executive Officer`, `David M. Denton, Chief Financial Officer`

### Pattern 4: Title: Name

Corporate title followed by a person name.

```regex
/(?:Chief\s+(?:Executive|Financial|Operating|...)Officer|CEO|CFO|...)[:\s]+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)/g
```

**Matches**: `CEO: Albert Bourla`, `Chief Financial Officer: David Denton`

### Pattern 5: SGML Headers

Filed-by headers in SGML-format filing metadata.

```regex
/FILED BY:\s*(.+?)(?:\n|$)/gi
```

**Matches**: `FILED BY: John Smith` (only if mixed case -- all-caps company names are skipped)

### Pattern 6: Director/Nominee Lists (DEF 14A)

Structured tables listing directors with age and year.

```regex
/([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)\s+\d{2,3}\s+\d{4}/g
```

**Matches**: `Jane Doe 58 2019` (name, age, year)

### Pattern 7: Narrative Context

Names that appear in narrative text with action verbs.

```regex
/([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)\s+(?:has\s+served|was\s+appointed|joined|serves?\s+as|has\s+been|became|is\s+the|was\s+named|was\s+elected)/g
```

**Matches**: `Jane Doe has served as`, `John Smith was appointed as`

### Pattern 8: Departures

Names associated with departure language.

```regex
/([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)\s*,?\s*(?:resigned|departed|was\s+terminated|stepped\s+down|was\s+removed|was\s+replaced|left\s+the|ceased|retired)/g
```

**Matches**: `Robert Spertell, resigned as`, `Jane Doe stepped down`

### Pattern 9: Role Descriptions

Names followed by role-describing phrases.

```regex
/([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)\s*,\s*(?:a\s+(?:director|member|partner|...)|the\s+(?:former|current|then)|our\s+(?:former|current)|who\s+(?:served|was|...)|formerly)/g
```

**Matches**: `Jane Doe, a director`, `John Smith, the former CEO`

### Pattern 10: Appointments

Names with appointment/hiring language.

```regex
/([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)*\s+[A-Z][a-z]+)\s+was\s+(?:appointed|hired|retained|engaged|named|elected|designated)\s+(?:as|to)/g
```

**Matches**: `John Smith was appointed as`, `Jane Doe was named to`

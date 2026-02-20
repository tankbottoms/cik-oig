# Data Sources and Update URLs

## SEC EDGAR

### CIK Entity List

Full list of all SEC-registered entities with CIK numbers.

- **Source**: SEC EDGAR Company Search
- **Format**: Text file, `NAME:CIK:` per line
- **Size**: ~85 MB raw, 52 MB bucketed JSON
- **Entities**: 1,021,688
- **Update**: Manual download from SEC

The raw file is parsed into 27 alpha-bucketed JSON files for client-side fuzzy search. Each bucket contains entities whose name starts with that letter.

| Bucket | Count | Size |
|--------|-------|------|
| a | 54,408 | 3.8 MB |
| b | 47,321 | 3.3 MB |
| c | 61,429 | 4.3 MB |
| d | 33,180 | 2.3 MB |
| e | 28,766 | 2.0 MB |
| f | 33,000 | 2.3 MB |
| g | 29,764 | 2.1 MB |
| h | 25,893 | 1.8 MB |
| i | 24,474 | 1.7 MB |
| j | 15,755 | 752 KB |
| k | 13,539 | 952 KB |
| l | 23,543 | 1.6 MB |
| m | 48,052 | 3.4 MB |
| n | 19,760 | 1.4 MB |
| o | 12,457 | 880 KB |
| p | 45,180 | 3.1 MB |
| q | 2,578 | 184 KB |
| r | 27,519 | 1.9 MB |
| s | 66,804 | 4.7 MB |
| t | 42,753 | 3.0 MB |
| u | 10,044 | 712 KB |
| v | 13,362 | 940 KB |
| w | 20,997 | 1.5 MB |
| x | 2,429 | 172 KB |
| y | 3,201 | 228 KB |
| z | 3,017 | 216 KB |
| _ | 212,423 | -- |

### Submissions API (Runtime)

```
https://data.sec.gov/submissions/CIK{10-digit-zero-padded-CIK}.json
```

Returns company metadata (name, SIC, tickers, addresses) and recent filings (accession numbers, dates, forms, primary documents). Arrays are parallel-indexed.

**Rate limit**: 10 requests per second, requires `User-Agent` header.

### Filing Documents (Runtime)

```
https://www.sec.gov/Archives/edgar/data/{CIK_NO_ZEROS}/{ACCESSION_NO_HYPHENS}/{FILENAME}
```

Individual filing documents (HTML). Used to extract names.

### Full-Text Search API (EFTS)

```
https://efts.sec.gov/LATEST/search-index?q="{query}"&forms={form}&dateRange=custom&startdt={YYYY-MM-DD}&enddt={YYYY-MM-DD}
```

Used for searching filing content across all entities.

## OIG LEIE

### Exclusion CSV

- **URL**: `https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv`
- **Format**: CSV with 18 fields
- **Records**: 82,714
- **Size**: 15 MB
- **Update**: Monthly (1st of each month)
- **Script**: `bun run data:oig`

CSV columns:

| # | Field | Description |
|---|-------|-------------|
| 0 | LASTNAME | Last name |
| 1 | FIRSTNAME | First name |
| 2 | MIDNAME | Middle name |
| 3 | BUSNAME | Business name |
| 4 | GENERAL | General classification |
| 5 | SPECIALTY | Medical specialty |
| 6 | UPIN | Unique Physician ID Number |
| 7 | NPI | National Provider Identifier |
| 8 | DOB | Date of birth (YYYYMMDD) |
| 9 | ADDRESS | Street address |
| 10 | CITY | City |
| 11 | STATE | State |
| 12 | ZIP | ZIP code |
| 13 | EXCLTYPE | Exclusion type (e.g., 1128b4, 1128a1) |
| 14 | EXCLDATE | Exclusion date (YYYYMMDD) |
| 15 | REINDATE | Reinstatement date (YYYYMMDD or 00000000) |
| 16 | WAIVERDATE | Waiver date (YYYYMMDD or 00000000) |
| 17 | WVRSTATE | Waiver state |

### OIG Verification Page

- **URL**: `https://exclusions.oig.hhs.gov/`
- **Technology**: ASP.NET WebForms
- **Form fields**: `ctl00$cpExclusions$txtSPLastName`, `ctl00$cpExclusions$txtSPFirstName`
- **Submit**: Image button `ctl00$cpExclusions$ibSearchSP`
- **Required tokens**: `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`
- **Cookie handling**: ASP.NET session cookie with detection redirect (`AspxAutoDetectCookieSupport=1`)

The server-side proxy at `/api/oig/verify` handles this flow:

1. Fetch homepage, extract Set-Cookie headers
2. Follow redirect chain (cookie detection)
3. Extract ASP.NET ViewState/EventValidation tokens
4. POST search form with cookies and tokens
5. Return results HTML with URLs rewritten to absolute paths

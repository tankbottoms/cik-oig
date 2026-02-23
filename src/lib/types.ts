export interface HealthcareEntity {
  n: string; // name
  c: string; // CIK (10-digit padded)
}

export interface SelectedEntity {
  name: string;
  cik: string;
  pinned?: boolean;
  color?: string;
  earliestFiling?: string;
  latestFiling?: string;
  formTypes?: string[];
  filingCount?: number;
  sicCode?: string;
  sicDescription?: string;
  tickers?: string[];
}

export interface EntityGroup {
  id: string;
  name: string;
  color: string;
  entityCiks: string[];
  entityNames?: Record<string, string>;
  createdAt: number;
}

export interface SECSubmission {
  cik: string;
  name: string;
  sic: string;
  sicDescription: string;
  tickers: string[];
  filings: SECFiling[];
}

export interface SECFiling {
  accession: string;
  date: string;
  form: string;
  primaryDoc: string;
  size: number;
}

export interface FilingRef {
  form: string;
  date: string;
  accession: string;
  primaryDoc: string;
  cik: string;
  url: string;
}

export interface ParsedName {
  firstName: string;
  lastName: string;
  middleName?: string;
  fullName: string;
  source: string;
}

export interface OIGExclusion {
  lastName: string;
  firstName: string;
  midName: string;
  busName: string;
  general: string;
  specialty: string;
  upin: string;
  npi: string;
  dob: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  exclType: string;
  exclDate: string;
  reinDate: string;
  waiverDate: string;
  waiverState: string;
}

export interface OIGMatch extends OIGExclusion {
  matchType: 'exact' | 'partial' | 'business';
}

export interface OIGSearchResult {
  queriedName: string;
  matches: OIGMatch[];
  status: 'CLEAR' | 'MATCH' | 'POSSIBLE_MATCH';
}

export interface ExtractedNameResult {
  name: ParsedName;
  oigStatus: 'pending' | 'clear' | 'match' | 'possible_match';
  oigMatches?: OIGMatch[];
  source: string;
  filings: FilingRef[];
  pinned: boolean;
}

export interface LogLine {
  timestamp: number;
  text: string;
  type: 'info' | 'fetch' | 'found' | 'match' | 'clear' | 'error';
  url?: string;
}

export type SearchMode = 'entity' | 'person' | 'individual';

export interface PersistedFavorites {
  version: 1;
  entities: SelectedEntity[];
  groups: EntityGroup[];
  persons: Array<{ firstName: string; lastName: string; middleName?: string; fullName: string }>;
  entityHistory: SelectedEntity[];
  settings: {
    darkMode: boolean;
    defaultSearchMode: SearchMode;
  };
}

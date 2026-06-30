// Ticketmaster event search — the concert-form counterpart to utils/spotify.ts.
// The Discovery API key can't ship in the client bundle, so we call the
// `concert-search` Edge Function, which holds the key and proxies the search.
//
// Each result maps 1:1 onto the concert composer's fields, so picking one fills
// artist + date/time + venue + ticket link at once.

import { supabase } from './supabase/client';

export interface ConcertEvent {
  id: string;
  artist: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM:SS, or null when time is TBA
  venue: string; // "Venue, City"
  ticketUrl: string;
  imageUrl: string;
}

interface SearchResponse {
  results?: ConcertEvent[];
  page?: number;
  totalPages?: number;
  ok?: false;
  message?: string;
}

// Optional filters layered on top of the keyword search. countryCode '' searches
// worldwide; stateCode (e.g. 'NY') narrows a US search; startDate/endDate bound
// the window (YYYY-MM-DD); page drives "Load more" (zero-based).
export interface ConcertSearchOptions {
  countryCode?: string;
  stateCode?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
}

export interface ConcertSearchResult {
  results: ConcertEvent[];
  page: number;
  // Total pages available upstream — lets the UI know when to hide "Load more".
  totalPages: number;
}

// US states + DC for the state filter (Ticketmaster expects the 2-letter code).
export const US_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'Washington DC' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

const EMPTY: ConcertSearchResult = { results: [], page: 0, totalPages: 0 };

export async function searchConcerts(
  term: string,
  opts: ConcertSearchOptions = {},
): Promise<ConcertSearchResult> {
  const q = term.trim();
  if (!q) return EMPTY;
  const { data, error } = await supabase.functions.invoke<SearchResponse>('concert-search', {
    body: {
      term: q,
      countryCode: opts.countryCode ?? 'US',
      stateCode: opts.stateCode ?? '',
      startDate: opts.startDate ?? '',
      endDate: opts.endDate ?? '',
      page: opts.page ?? 0,
    },
  });
  if (error || !data || data.ok === false) return EMPTY;
  return {
    results: data.results ?? [],
    page: data.page ?? 0,
    totalPages: data.totalPages ?? 0,
  };
}

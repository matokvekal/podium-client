// Pure logic for the /admin2026 dashboard — the shape of GET /api/v1/admin/analytics and the
// two things worth testing without a DOM (this repo has no jsdom): the display date format and
// the newest-first ordering the spec is emphatic about.

export type AnalyticsRangeKey = "7" | "30" | "90" | "all";

export const RANGE_OPTIONS: { key: AnalyticsRangeKey; label: string }[] = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "all", label: "All" },
];

export const DEFAULT_RANGE: AnalyticsRangeKey = "30";

export interface DailyRow {
  /** YYYY-MM-DD from the server. */
  date: string;
  newUsers: number;
  newRides: number;
  newParticipants: number;
}

export interface CountryRow {
  countryCode: string;
  users: number;
  rides: number;
}

export interface AnalyticsResponse {
  generatedAt: string;
  rangeDays: number | null;
  totals: {
    users: number;
    rideCreators: number;
    rides: number;
    currentRegistrations: number;
    historicalJoins: number;
    countries: number;
  };
  rides: { public: number; registered: number; private: number };
  daily: DailyRow[];
  countries: CountryRow[];
}

/**
 * `2026-09-07` -> `07/09/2026`. Parses the parts by hand rather than `new Date(...)` so the
 * result never shifts by a timezone (the server sends a plain calendar date, no time).
 * Returns the input unchanged if it is not the expected shape.
 */
export function formatDisplayDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

/**
 * Newest first, by the real date value (string compare is correct for `YYYY-MM-DD`). The
 * server already sorts this way; sorting again on the client means a reordered or concatenated
 * response can never render an oldest-first timeline. Does not mutate the input.
 */
export function sortDailyNewestFirst(rows: readonly DailyRow[]): DailyRow[] {
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** ISO 3166-1 alpha-2 -> a name for the few countries this app actually sees. Falls back to
 *  the code so an unknown one still renders. */
const COUNTRY_NAMES: Record<string, string> = {
  IL: "Israel",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  DE: "Germany",
  US: "United States",
  GB: "United Kingdom",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code?.toUpperCase()] ?? code;
}

/** A flag emoji from a 2-letter code (regional-indicator letters). Empty for a bad code. */
export function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code ?? "")) return "";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** Grouping thousands with commas (as in the spec: 1,240) — locale-agnostic, no library. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const s = Math.round(n).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

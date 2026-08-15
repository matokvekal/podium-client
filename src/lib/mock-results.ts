// Mock event results — route + rider list — until the server actually has
// GET /events/:eventId/results (see plan/server-tasks.md). Every shape here is exactly what
// that endpoint will return, so wiring resultsStore.ts to a real apiRequest call later is a
// one-function swap, not a rewrite of this page.
//
// avatarUrl is null on every rider except a couple of seeded examples — an event participant
// only ever gets one from a real Google sign-in; never fabricated for the rest, same rule
// this session already applied to event cover images.

export type RiderStatus = "finished" | "dnf" | "dns" | "racing" | "not_started";

export interface SplitResult {
  splitId: string;
  time: string | null;
  gap: string | null;
  place: number | null;
}

export interface RiderResult {
  id: string;
  bib: string | null;
  name: string;
  avatarUrl: string | null;
  countryCode: string;
  category: string | null;
  team: string | null;
  status: RiderStatus;
  totalTime: string | null;
  gap: string | null;
  overallPlace: number | null;
  categoryPlace: number | null;
  distanceKm: number;
  splits: SplitResult[];
}

export interface RouteSplit {
  id: string;
  name: string;
  discipline: "road" | "gravel" | "mtb";
  distanceKm: number;
  order: number;
}

export interface EventRoute {
  points: [number, number][];
  distanceKm: number;
  elevationM: number | null;
  splits: RouteSplit[];
}

export interface EventOrganizerInfo {
  name: string;
  phone: string | null;
  countryCode: string;
}

export interface EventResults {
  organizer: EventOrganizerInfo;
  route: EventRoute;
  riders: RiderResult[];
}

// A short loop near the Sea of Galilee — plausible for a local ride/race, not a real course.
const SINGLE_STAGE_ROUTE: [number, number][] = [
  [32.8156, 35.5397],
  [32.8301, 35.5512],
  [32.8459, 35.5601],
  [32.8523, 35.5789],
  [32.8462, 35.5978],
  [32.8301, 35.6045],
  [32.8144, 35.5967],
  [32.805, 35.5789],
  [32.8072, 35.5578],
  [32.8156, 35.5397],
];

const SPLIT_STAGE_ROUTE: [number, number][] = [
  [31.7767, 35.2345],
  [31.7923, 35.2612],
  [31.8102, 35.2789],
  [31.8267, 35.2934],
  [31.8412, 35.3123], // ~80km mark — gravel/MTB transition
  [31.8523, 35.3345],
  [31.8601, 35.3567],
  [31.8489, 35.3712],
  [31.8312, 35.3634],
];

const MEN_OPEN = "Men Open";
const WOMEN_OPEN = "Women Open";
const MEN_40 = "Men 40-49";

function rider(input: {
  id: string;
  bib: string;
  name: string;
  countryCode: string;
  category: string;
  team: string | null;
  status: RiderStatus;
  totalTime: string | null;
  gap: string | null;
  overallPlace: number | null;
  categoryPlace: number | null;
  distanceKm: number;
  avatarUrl?: string | null;
  splits?: SplitResult[];
}): RiderResult {
  return { avatarUrl: null, splits: [], ...input };
}

const GRAVEL_CHAMPIONSHIP_RIDERS: RiderResult[] = [
  rider({
    id: "r1",
    bib: "101",
    name: "Noa Peretz",
    countryCode: "IL",
    category: WOMEN_OPEN,
    team: "Team Galilee",
    status: "finished",
    totalTime: "2:14:03",
    gap: null,
    overallPlace: 1,
    categoryPlace: 1,
    distanceKm: 62,
    avatarUrl: "https://lh3.googleusercontent.com/a/mock-avatar-1",
  }),
  rider({
    id: "r2",
    bib: "42",
    name: "Yossi Katz",
    countryCode: "IL",
    category: MEN_OPEN,
    team: "Team Galilee",
    status: "finished",
    totalTime: "2:02:41",
    gap: null,
    overallPlace: 2,
    categoryPlace: 1,
    distanceKm: 62,
  }),
  rider({
    id: "r3",
    bib: "17",
    name: "Marco Bellini",
    countryCode: "IT",
    category: MEN_OPEN,
    team: null,
    status: "finished",
    totalTime: "2:04:58",
    gap: "+2:17",
    overallPlace: 3,
    categoryPlace: 2,
    distanceKm: 62,
    avatarUrl: "https://lh3.googleusercontent.com/a/mock-avatar-2",
  }),
  rider({
    id: "r4",
    bib: "58",
    name: "Dana Cohen",
    countryCode: "IL",
    category: WOMEN_OPEN,
    team: "Desert Wheels",
    status: "finished",
    totalTime: "2:19:22",
    gap: "+5:19",
    overallPlace: 6,
    categoryPlace: 2,
    distanceKm: 62,
  }),
  rider({
    id: "r5",
    bib: "9",
    name: "Amir Shalev",
    countryCode: "IL",
    category: MEN_40,
    team: "Desert Wheels",
    status: "finished",
    totalTime: "2:11:05",
    gap: "+8:24",
    overallPlace: 4,
    categoryPlace: 1,
    distanceKm: 62,
  }),
  rider({
    id: "r6",
    bib: "73",
    name: "Lior Ben-David",
    countryCode: "IL",
    category: MEN_OPEN,
    team: null,
    status: "dnf",
    totalTime: null,
    gap: null,
    overallPlace: null,
    categoryPlace: null,
    distanceKm: 38,
  }),
  rider({
    id: "r7",
    bib: "24",
    name: "Sophie Laurent",
    countryCode: "FR",
    category: WOMEN_OPEN,
    team: "Team Provence",
    status: "finished",
    totalTime: "2:21:40",
    gap: "+7:37",
    overallPlace: 7,
    categoryPlace: 3,
    distanceKm: 62,
  }),
  rider({
    id: "r8",
    bib: "61",
    name: "Eli Mizrahi",
    countryCode: "IL",
    category: MEN_40,
    team: null,
    status: "racing",
    totalTime: null,
    gap: null,
    overallPlace: null,
    categoryPlace: null,
    distanceKm: 45,
  }),
  rider({
    id: "r9",
    bib: "88",
    name: "Tomer Adiv",
    countryCode: "IL",
    category: MEN_OPEN,
    team: "Team Galilee",
    status: "dns",
    totalTime: null,
    gap: null,
    overallPlace: null,
    categoryPlace: null,
    distanceKm: 62,
  }),
  rider({
    id: "r10",
    bib: "33",
    name: "Karin Weiss",
    countryCode: "IL",
    category: WOMEN_OPEN,
    team: null,
    status: "finished",
    totalTime: "2:28:11",
    gap: "+14:08",
    overallPlace: 9,
    categoryPlace: 4,
    distanceKm: 62,
  }),
];

const TOUR_STAGE_RIDERS: RiderResult[] = [
  rider({
    id: "s1",
    bib: "7",
    name: "Idan Rosen",
    countryCode: "IL",
    category: MEN_OPEN,
    team: "Negev Racing",
    status: "finished",
    totalTime: "4:41:02",
    gap: null,
    overallPlace: 1,
    categoryPlace: 1,
    distanceKm: 120,
    splits: [
      { splitId: "sp1", time: "2:58:10", gap: null, place: 1 },
      { splitId: "sp2", time: "1:42:52", gap: null, place: 1 },
    ],
  }),
  rider({
    id: "s2",
    bib: "19",
    name: "Elena Rossi",
    countryCode: "IT",
    category: WOMEN_OPEN,
    team: "Negev Racing",
    status: "finished",
    totalTime: "5:02:44",
    gap: "+21:42",
    overallPlace: 5,
    categoryPlace: 1,
    distanceKm: 120,
    avatarUrl: "https://lh3.googleusercontent.com/a/mock-avatar-3",
    splits: [
      { splitId: "sp1", time: "3:05:00", gap: "+6:50", place: 4 },
      { splitId: "sp2", time: "1:57:44", gap: "+14:52", place: 6 },
    ],
  }),
  rider({
    id: "s3",
    bib: "5",
    name: "Guy Adler",
    countryCode: "IL",
    category: MEN_OPEN,
    team: null,
    status: "dnf",
    totalTime: null,
    gap: null,
    overallPlace: null,
    categoryPlace: null,
    distanceKm: 80,
    splits: [{ splitId: "sp1", time: "3:11:20", gap: "+13:10", place: 8 }],
  }),
];

// Padding beyond the hand-authored riders above — asked for directly, so the rider list on
// EventDetailPage.tsx actually has enough rows to demonstrate its scroll (maxHeight: 60vh)
// instead of always fitting on one screen. RiderResultRow.tsx only ever renders bib/flag/
// name/avatar/team/distance (see its own doc comment — status/time/place are unused, rides
// not races), so these don't need to be interesting, just plausible and plentiful.
const FILLER_FIRST_NAMES = [
  "Roni",
  "Maya",
  "Guy",
  "Shira",
  "Nir",
  "Hila",
  "Omer",
  "Tamar",
  "Ravid",
  "Yael",
  "Assaf",
  "Noga",
];
const FILLER_LAST_NAMES = [
  "Mizrahi",
  "Rosen",
  "Adler",
  "Barak",
  "Golan",
  "Sela",
  "Kaplan",
  "Amrani",
  "Dagan",
  "Levy",
];
const FILLER_COUNTRIES = ["IL", "IT", "FR", "ES", "DE", "NL", "GB", "US"];
const FILLER_TEAMS = ["Weekend Riders", "Coastal Cycling", null, "Hill Climbers Club", null];

function generateFillerRiders(
  count: number,
  idPrefix: string,
  distanceKm: number,
  categories: string[],
): RiderResult[] {
  const list: RiderResult[] = [];
  for (let i = 0; i < count; i++) {
    const first = FILLER_FIRST_NAMES[i % FILLER_FIRST_NAMES.length];
    const last = FILLER_LAST_NAMES[(i * 3) % FILLER_LAST_NAMES.length];
    const place = i + 11;
    list.push(
      rider({
        id: `${idPrefix}-fill-${i}`,
        bib: String(100 + i),
        name: `${first} ${last}`,
        countryCode: FILLER_COUNTRIES[i % FILLER_COUNTRIES.length],
        category: categories[i % categories.length],
        team: FILLER_TEAMS[i % FILLER_TEAMS.length],
        status: "finished",
        totalTime: null,
        gap: `+${place}:00`,
        overallPlace: place,
        categoryPlace: Math.floor(i / categories.length) + 1,
        distanceKm,
      }),
    );
  }
  return list;
}

const MOCK_EVENTS: Record<string, EventResults> = {
  "gravel-championship": {
    organizer: { name: "Dani Katzir", phone: "+972-52-555-0142", countryCode: "IL" },
    route: {
      points: SINGLE_STAGE_ROUTE,
      distanceKm: 62,
      elevationM: 940,
      splits: [],
    },
    riders: [
      ...GRAVEL_CHAMPIONSHIP_RIDERS,
      ...generateFillerRiders(35, "gc", 62, [MEN_OPEN, WOMEN_OPEN, MEN_40]),
    ],
  },
  "tour-stage": {
    organizer: { name: "Negev Racing Club", phone: "+972-54-555-0198", countryCode: "IL" },
    route: {
      points: SPLIT_STAGE_ROUTE,
      distanceKm: 120,
      elevationM: 1680,
      splits: [
        { id: "sp1", name: "Stage 1 — Gravel", discipline: "gravel", distanceKm: 80, order: 1 },
        { id: "sp2", name: "Stage 2 — MTB", discipline: "mtb", distanceKm: 40, order: 2 },
      ],
    },
    riders: [...TOUR_STAGE_RIDERS, ...generateFillerRiders(35, "ts", 120, [MEN_OPEN, WOMEN_OPEN])],
  },
};

const FALLBACK_KEYS = Object.keys(MOCK_EVENTS);

/**
 * Stands in for `GET /events/:eventId/results` (see plan/server-tasks.md). Any real event id
 * that doesn't match a seeded mock key still gets a deterministic result set, picked by a
 * simple hash of the id, so every event card in the app has something to show rather than an
 * empty state everywhere until the server exists.
 */
export async function getEventResults(eventId: string): Promise<EventResults> {
  if (eventId in MOCK_EVENTS) return MOCK_EVENTS[eventId];
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) hash = (Math.imul(hash, 31) + eventId.charCodeAt(i)) | 0;
  const key = FALLBACK_KEYS[Math.abs(hash) % FALLBACK_KEYS.length];
  return MOCK_EVENTS[key];
}

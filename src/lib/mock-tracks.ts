// // Mock track/route library for the "Find Tracks" planner — stands in for a future
// // GET /tracks (see plan/server-tasks.md). Air quality, hazards and POIs are all illustrative
// // mock values; no real provider is chosen for any of them yet.
// //
// // Every track's basedOnEventId points at a mock event id — "all based on other rider
// // events": a track exists because someone rode it as part of an event, not because it was
// // uploaded standalone. That link is informational only in this pass (no deep wiring into
// // EventCreatePage); "Plan a ride with this track" just opens /events/new.

// import { Bike, Footprints, Mountain, PersonStanding, Route } from "lucide-react";

// export type SurfaceType = "road" | "gravel" | "mtb" | "running" | "hiking";
// export type AirQualityLabel = "Good" | "Moderate" | "Unhealthy";
// export type HazardSeverity = "low" | "medium" | "high";

// /** Shared with TracksPage.tsx's surface filter pills and EventCreatePage.tsx's activity-type
//  * chips, so an event's icon always matches what riders see everywhere else. */
// export const SURFACE_TYPE_ICON: Record<SurfaceType, typeof Bike> = {
//   road: Bike,
//   gravel: Route,
//   mtb: Mountain,
//   running: Footprints,
//   hiking: PersonStanding,
// };

// export const SURFACE_TYPE_LABEL: Record<SurfaceType, string> = {
//   road: "Road",
//   gravel: "Gravel",
//   mtb: "MTB",
//   running: "Running",
//   hiking: "Hiking",
// };

// export interface TrackHazard {
//   dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
//   severity: HazardSeverity;
//   description: string;
//   point: [number, number];
// }

// export interface TrackPOI {
//   // "rest" — a plain rest/water stop, not tied to a business (unlike gas/toilet/motel/shop) —
//   // asked for directly so riders know where they can take a break on a longer track.
//   type: "gas" | "toilet" | "motel" | "shop" | "rest";
//   name: string;
//   point: [number, number];
// }

// export interface TrackDay {
//   dayNumber: number;
//   distanceKm: number;
//   climbM: number;
//   points: [number, number][];
// }

// export interface TrackComment {
//   id: string;
//   author: string;
//   text: string;
//   createdAt: string; // ISO, UTC — see lib/time.ts for display conversion
// }

// export interface Track {
//   id: string;
//   name: string;
//   surfaceType: SurfaceType;
//   country: string;
//   countryCode: string;
//   state: string | null;
//   area: string;
//   distanceKm: number;
//   climbM: number;
//   descentM: number;
//   hasBusyRoads: boolean;
//   days: TrackDay[];
//   points: [number, number][];
//   airQuality: { aqi: number; label: AirQualityLabel };
//   hazards: TrackHazard[];
//   pois: TrackPOI[];
//   basedOnEventId: string | null;
//   favorite?: boolean;
//   likes: number;
//   liked?: boolean;
//   comments: TrackComment[];
// }

// function oneDay(points: [number, number][], distanceKm: number, climbM: number): TrackDay[] {
//   return [{ dayNumber: 1, distanceKm, climbM, points }];
// }

// // Likes/comments are added below via a map() over this list, rather than repeated on every
// // literal — same mock data, just not hand-duplicated 11 times.
// type TrackWithoutEngagement = Omit<Track, "likes" | "liked" | "comments">;

// const RAW_TRACKS: TrackWithoutEngagement[] = [
//   {
//     id: "galilee-loop",
//     name: "Galilee Loop",
//     surfaceType: "road",
//     country: "Israel",
//     countryCode: "IL",
//     state: null,
//     area: "Galilee",
//     distanceKm: 102,
//     climbM: 1540,
//     descentM: 1540,
//     hasBusyRoads: false,
//     points: [
//       [32.8156, 35.5397],
//       [32.8459, 35.5601],
//       [32.8523, 35.5789],
//       [32.8301, 35.6045],
//       [32.805, 35.5789],
//       [32.8156, 35.5397],
//     ],
//     days: oneDay(
//       [
//         [32.8156, 35.5397],
//         [32.8459, 35.5601],
//         [32.8523, 35.5789],
//         [32.8301, 35.6045],
//         [32.805, 35.5789],
//         [32.8156, 35.5397],
//       ],
//       102,
//       1540,
//     ),
//     airQuality: { aqi: 42, label: "Good" },
//     hazards: [
//       {
//         dayOfWeek: 5,
//         severity: "medium",
//         description: "Market traffic near Tiberias",
//         point: [32.7922, 35.5312],
//       },
//     ],
//     pois: [
//       { type: "gas", name: "Paz Tiberias", point: [32.79, 35.53] },
//       { type: "shop", name: "Galilee Bike Shop", point: [32.82, 35.56] },
//       { type: "rest", name: "Overlook rest point", point: [32.845, 35.598] },
//     ],
//     basedOnEventId: "gravel-championship",
//     favorite: false,
//   },
//   {
//     id: "negev-gravel",
//     name: "Negev Gravel Crossing",
//     surfaceType: "gravel",
//     country: "Israel",
//     countryCode: "IL",
//     state: null,
//     area: "Negev",
//     distanceKm: 68,
//     climbM: 820,
//     descentM: 900,
//     hasBusyRoads: false,
//     points: [
//       [30.9, 34.85],
//       [30.87, 34.92],
//       [30.82, 34.98],
//       [30.78, 35.05],
//     ],
//     days: oneDay(
//       [
//         [30.9, 34.85],
//         [30.87, 34.92],
//         [30.82, 34.98],
//         [30.78, 35.05],
//       ],
//       68,
//       820,
//     ),
//     airQuality: { aqi: 35, label: "Good" },
//     hazards: [],
//     pois: [{ type: "toilet", name: "Sde Boker rest stop", point: [30.86, 34.93] }],
//     basedOnEventId: null,
//     favorite: false,
//   },
//   {
//     id: "tlv-coast-commute",
//     name: "Tel Aviv Coastal Path",
//     surfaceType: "road",
//     country: "Israel",
//     countryCode: "IL",
//     state: null,
//     area: "Tel Aviv",
//     distanceKm: 24,
//     climbM: 60,
//     descentM: 60,
//     hasBusyRoads: true,
//     points: [
//       [32.05, 34.75],
//       [32.08, 34.77],
//       [32.11, 34.79],
//     ],
//     days: oneDay(
//       [
//         [32.05, 34.75],
//         [32.08, 34.77],
//         [32.11, 34.79],
//       ],
//       24,
//       60,
//     ),
//     airQuality: { aqi: 78, label: "Moderate" },
//     hazards: [
//       {
//         dayOfWeek: 0,
//         severity: "high",
//         description: "Heavy weekend beach traffic on the promenade",
//         point: [32.08, 34.77],
//       },
//       {
//         dayOfWeek: 4,
//         severity: "medium",
//         description: "Rush hour on Hayarkon St",
//         point: [32.09, 34.78],
//       },
//     ],
//     pois: [
//       { type: "toilet", name: "Gordon Beach", point: [32.08, 34.76] },
//       { type: "shop", name: "Coastal Cycles", point: [32.1, 34.78] },
//     ],
//     basedOnEventId: null,
//     favorite: false,
//   },
//   {
//     id: "jerusalem-hills-mtb",
//     name: "Jerusalem Hills MTB",
//     surfaceType: "mtb",
//     country: "Israel",
//     countryCode: "IL",
//     state: null,
//     area: "Jerusalem",
//     distanceKm: 41,
//     climbM: 1120,
//     descentM: 1120,
//     hasBusyRoads: false,
//     points: [
//       [31.77, 35.15],
//       [31.75, 35.19],
//       [31.72, 35.22],
//       [31.74, 35.25],
//     ],
//     days: oneDay(
//       [
//         [31.77, 35.15],
//         [31.75, 35.19],
//         [31.72, 35.22],
//         [31.74, 35.25],
//       ],
//       41,
//       1120,
//     ),
//     airQuality: { aqi: 51, label: "Good" },
//     hazards: [
//       {
//         dayOfWeek: 6,
//         severity: "low",
//         description: "Popular with hikers on Saturdays",
//         point: [31.74, 35.22],
//       },
//     ],
//     pois: [{ type: "motel", name: "Forest Lodge", point: [31.75, 35.2] }],
//     basedOnEventId: null,
//     favorite: false,
//   },
//   {
//     id: "eilat-red-canyon",
//     name: "Eilat Red Canyon Gravel",
//     surfaceType: "gravel",
//     country: "Israel",
//     countryCode: "IL",
//     state: null,
//     area: "Eilat",
//     distanceKm: 55,
//     climbM: 980,
//     descentM: 980,
//     hasBusyRoads: false,
//     points: [
//       [29.58, 34.92],
//       [29.62, 34.96],
//       [29.66, 35.0],
//     ],
//     days: oneDay(
//       [
//         [29.58, 34.92],
//         [29.62, 34.96],
//         [29.66, 35.0],
//       ],
//       55,
//       980,
//     ),
//     airQuality: { aqi: 28, label: "Good" },
//     hazards: [],
//     pois: [
//       { type: "gas", name: "Eilat South Station", point: [29.59, 34.93] },
//       { type: "toilet", name: "Red Canyon car park", point: [29.64, 34.98] },
//     ],
//     basedOnEventId: null,
//     favorite: false,
//   },
//   {
//     id: "provence-3day",
//     name: "Provence 3-Day Tour",
//     surfaceType: "road",
//     country: "France",
//     countryCode: "FR",
//     state: "Provence-Alpes-Côte d'Azur",
//     area: "Luberon",
//     distanceKm: 285,
//     climbM: 4200,
//     descentM: 4150,
//     hasBusyRoads: false,
//     points: [
//       [43.95, 5.05],
//       [44.02, 5.2],
//       [44.1, 5.35],
//       [44.05, 5.5],
//       [43.98, 5.4],
//       [43.9, 5.25],
//     ],
//     days: [
//       {
//         dayNumber: 1,
//         distanceKm: 98,
//         climbM: 1500,
//         points: [
//           [43.95, 5.05],
//           [44.02, 5.2],
//           [44.1, 5.35],
//         ],
//       },
//       {
//         dayNumber: 2,
//         distanceKm: 92,
//         climbM: 1400,
//         points: [
//           [44.1, 5.35],
//           [44.05, 5.5],
//           [43.98, 5.4],
//         ],
//       },
//       {
//         dayNumber: 3,
//         distanceKm: 95,
//         climbM: 1300,
//         points: [
//           [43.98, 5.4],
//           [43.9, 5.25],
//           [43.95, 5.05],
//         ],
//       },
//     ],
//     airQuality: { aqi: 33, label: "Good" },
//     hazards: [
//       {
//         dayOfWeek: 6,
//         severity: "medium",
//         description: "Saturday market traffic through Apt",
//         point: [43.88, 5.4],
//       },
//     ],
//     pois: [
//       { type: "motel", name: "Auberge du Luberon", point: [44.1, 5.35] },
//       { type: "motel", name: "Gîte Sainte-Croix", point: [43.98, 5.4] },
//       { type: "gas", name: "Total Apt", point: [43.88, 5.4] },
//       { type: "shop", name: "Cycles Provence", point: [44.02, 5.2] },
//       { type: "rest", name: "Roadside rest stop", point: [44.06, 5.42] },
//     ],
//     basedOnEventId: "tour-stage",
//     favorite: false,
//   },
//   {
//     id: "dolomites-2day",
//     name: "Dolomites 2-Day Climb Fest",
//     surfaceType: "road",
//     country: "Italy",
//     countryCode: "IT",
//     state: "Trentino-Alto Adige",
//     area: "Dolomites",
//     distanceKm: 156,
//     climbM: 4800,
//     descentM: 4700,
//     hasBusyRoads: true,
//     points: [
//       [46.42, 11.85],
//       [46.48, 11.92],
//       [46.52, 12.0],
//       [46.46, 12.05],
//     ],
//     days: [
//       {
//         dayNumber: 1,
//         distanceKm: 82,
//         climbM: 2600,
//         points: [
//           [46.42, 11.85],
//           [46.48, 11.92],
//           [46.52, 12.0],
//         ],
//       },
//       {
//         dayNumber: 2,
//         distanceKm: 74,
//         climbM: 2200,
//         points: [
//           [46.52, 12.0],
//           [46.46, 12.05],
//           [46.42, 11.85],
//         ],
//       },
//     ],
//     airQuality: { aqi: 20, label: "Good" },
//     hazards: [
//       {
//         dayOfWeek: 0,
//         severity: "high",
//         description: "Sunday tour-bus congestion on the Sella Pass",
//         point: [46.5, 11.93],
//       },
//     ],
//     pois: [
//       { type: "motel", name: "Rifugio Passo Sella", point: [46.5, 11.93] },
//       { type: "gas", name: "IP Canazei", point: [46.48, 11.78] },
//     ],
//     basedOnEventId: null,
//     favorite: false,
//   },
//   {
//     id: "yarkon-park-run",
//     name: "Yarkon Park Run Loop",
//     surfaceType: "running",
//     country: "Israel",
//     countryCode: "IL",
//     state: null,
//     area: "Tel Aviv",
//     distanceKm: 10,
//     climbM: 30,
//     descentM: 30,
//     hasBusyRoads: false,
//     points: [
//       [32.09, 34.79],
//       [32.1, 34.8],
//       [32.105, 34.81],
//       [32.095, 34.8],
//     ],
//     days: oneDay(
//       [
//         [32.09, 34.79],
//         [32.1, 34.8],
//         [32.105, 34.81],
//         [32.095, 34.8],
//       ],
//       10,
//       30,
//     ),
//     airQuality: { aqi: 45, label: "Good" },
//     hazards: [
//       {
//         dayOfWeek: 6,
//         severity: "low",
//         description: "Busy with other runners on Saturday mornings",
//         point: [32.1, 34.8],
//       },
//     ],
//     pois: [
//       { type: "toilet", name: "Yarkon Park facilities", point: [32.1, 34.8] },
//       { type: "shop", name: "Runners' Corner", point: [32.095, 34.79] },
//     ],
//     basedOnEventId: null,
//     favorite: false,
//   },
//   {
//     id: "jaffa-old-city-walk",
//     name: "Jaffa Old City Walk",
//     surfaceType: "hiking",
//     country: "Israel",
//     countryCode: "IL",
//     state: null,
//     area: "Jaffa",
//     distanceKm: 4,
//     climbM: 15,
//     descentM: 15,
//     hasBusyRoads: false,
//     points: [
//       [32.0523, 34.7519],
//       [32.0512, 34.7534],
//       [32.0498, 34.7526],
//     ],
//     days: oneDay(
//       [
//         [32.0523, 34.7519],
//         [32.0512, 34.7534],
//         [32.0498, 34.7526],
//       ],
//       4,
//       15,
//     ),
//     airQuality: { aqi: 40, label: "Good" },
//     hazards: [],
//     pois: [
//       { type: "toilet", name: "Jaffa Port facilities", point: [32.051, 34.752] },
//       { type: "shop", name: "Old Jaffa Market", point: [32.0505, 34.7525] },
//     ],
//     basedOnEventId: null,
//     favorite: false,
//   },
//   {
//     id: "cotswolds-loop",
//     name: "Cotswolds Countryside Loop",
//     surfaceType: "road",
//     country: "England",
//     countryCode: "GB",
//     state: null,
//     area: "Cotswolds",
//     distanceKm: 78,
//     climbM: 980,
//     descentM: 980,
//     hasBusyRoads: false,
//     points: [
//       [51.85, -1.83],
//       [51.88, -1.78],
//       [51.92, -1.75],
//       [51.9, -1.7],
//     ],
//     days: oneDay(
//       [
//         [51.85, -1.83],
//         [51.88, -1.78],
//         [51.92, -1.75],
//         [51.9, -1.7],
//       ],
//       78,
//       980,
//     ),
//     airQuality: { aqi: 25, label: "Good" },
//     hazards: [
//       {
//         dayOfWeek: 0,
//         severity: "medium",
//         description: "Sunday driver traffic through Bourton-on-the-Water",
//         point: [51.88, -1.75],
//       },
//     ],
//     pois: [
//       { type: "motel", name: "The Cotswold Inn", point: [51.88, -1.78] },
//       { type: "gas", name: "Esso Stow", point: [51.92, -1.72] },
//     ],
//     basedOnEventId: null,
//     favorite: false,
//   },
//   {
//     id: "sierra-nevada-gravel",
//     name: "Sierra Nevada Gravel Traverse",
//     surfaceType: "gravel",
//     country: "Spain",
//     countryCode: "ES",
//     state: "Andalusia",
//     area: "Sierra Nevada",
//     distanceKm: 89,
//     climbM: 2100,
//     descentM: 2050,
//     hasBusyRoads: false,
//     points: [
//       [37.05, -3.35],
//       [37.08, -3.28],
//       [37.03, -3.2],
//       [36.98, -3.25],
//     ],
//     days: oneDay(
//       [
//         [37.05, -3.35],
//         [37.08, -3.28],
//         [37.03, -3.2],
//         [36.98, -3.25],
//       ],
//       89,
//       2100,
//     ),
//     airQuality: { aqi: 18, label: "Good" },
//     hazards: [],
//     pois: [
//       { type: "gas", name: "Repsol Güéjar Sierra", point: [37.05, -3.35] },
//       { type: "motel", name: "Refugio Poqueira", point: [37.03, -3.2] },
//     ],
//     basedOnEventId: null,
//     favorite: false,
//   },
// ];

// const SAMPLE_COMMENTS: TrackComment[] = [
//   {
//     id: "c1",
//     author: "Noa P.",
//     text: "Rode this at sunrise, views were incredible.",
//     createdAt: "2026-07-28T04:30:00Z",
//   },
//   {
//     id: "c2",
//     author: "Dan K.",
//     text: "Watch the gravel patch about a third of the way in.",
//     createdAt: "2026-08-02T11:15:00Z",
//   },
//   {
//     id: "c3",
//     author: "Marco B.",
//     text: "Did this as a group ride last month, highly recommend.",
//     createdAt: "2026-08-06T09:00:00Z",
//   },
// ];

// // Deterministic mock engagement per track — no fabricated randomness on every reload, and no
// // need to repeat likes/comments on all 11+ literals above by hand.
// const LIKES_BY_INDEX = [34, 12, 8, 21, 15, 47, 39, 6, 3, 18, 22];

// const TRACKS: Track[] = RAW_TRACKS.map((track, i) => ({
//   ...track,
//   likes: LIKES_BY_INDEX[i % LIKES_BY_INDEX.length],
//   liked: false,
//   comments:
//     i % 3 === 0 ? SAMPLE_COMMENTS.slice(0, 2) : i % 3 === 1 ? SAMPLE_COMMENTS.slice(0, 1) : [],
// }));

// export interface TrackFilters {
//   location?: string;
//   countryCode?: string;
//   surfaceType?: SurfaceType | null;
//   minDistanceKm?: number;
//   maxDistanceKm?: number;
//   minClimbM?: number;
//   maxClimbM?: number;
//   multiDayOnly?: boolean;
//   avoidBusyRoads?: boolean;
// }

// export const DISTANCE_MIN = 1;
// export const DISTANCE_MAX = 350;
// export const CLIMB_MIN = 0;
// export const CLIMB_MAX = 3500;

// /** Stands in for GET /tracks — filtering happens client-side against the mock list, same as
//  * every other mock endpoint this session. */
// export async function getTracks(filters: TrackFilters = {}): Promise<Track[]> {
//   const q = filters.location?.trim().toLowerCase();
//   return TRACKS.filter((track) => {
//     if (filters.countryCode && track.countryCode !== filters.countryCode) return false;
//     if (
//       q &&
//       !track.name.toLowerCase().includes(q) &&
//       !track.country.toLowerCase().includes(q) &&
//       !(track.state ?? "").toLowerCase().includes(q) &&
//       !track.area.toLowerCase().includes(q)
//     ) {
//       return false;
//     }
//     if (filters.surfaceType && track.surfaceType !== filters.surfaceType) return false;
//     if (filters.minDistanceKm != null && track.distanceKm < filters.minDistanceKm) return false;
//     if (filters.maxDistanceKm != null && track.distanceKm > filters.maxDistanceKm) return false;
//     if (filters.minClimbM != null && track.climbM < filters.minClimbM) return false;
//     if (filters.maxClimbM != null && track.climbM > filters.maxClimbM) return false;
//     if (filters.multiDayOnly && track.days.length < 2) return false;
//     if (filters.avoidBusyRoads && track.hasBusyRoads) return false;
//     return true;
//   });
// }

import { Bike, Footprints, Mountain, PersonStanding, Route } from "lucide-react";

export type SurfaceType = "road" | "gravel" | "mtb" | "running" | "hiking";
export type AirQualityLabel = "Good" | "Moderate" | "Unhealthy";
export type HazardSeverity = "low" | "medium" | "high";

export const SURFACE_TYPE_ICON: Record<SurfaceType, typeof Bike> = {
  road: Bike,
  gravel: Route,
  mtb: Mountain,
  running: Footprints,
  hiking: PersonStanding,
};

export const SURFACE_TYPE_LABEL: Record<SurfaceType, string> = {
  road: "Road",
  gravel: "Gravel",
  mtb: "MTB",
  running: "Running",
  hiking: "Hiking",
};

export interface TrackHazard {
  dayOfWeek: number;
  severity: HazardSeverity;
  description: string;
  point: [number, number];
}

export interface TrackPOI {
  type: "gas" | "toilet" | "motel" | "shop" | "rest";
  name: string;
  point: [number, number];
}

export interface TrackDay {
  dayNumber: number;
  distanceKm: number;
  climbM: number;
  points: [number, number][];
}

export interface TrackComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Track {
  id: string;
  name: string;
  surfaceType: SurfaceType;
  country: string;
  countryCode: string;
  state: string | null;
  area: string;
  distanceKm: number;
  climbM: number;
  descentM: number;
  hasBusyRoads: boolean;
  days: TrackDay[];
  points: [number, number][];
  airQuality: { aqi: number; label: AirQualityLabel };
  hazards: TrackHazard[];
  pois: TrackPOI[];
  basedOnEventId: string | null;
  favorite?: boolean;
  likes: number;
  liked?: boolean;
  comments: TrackComment[];
}

export interface TrackFilters {
  location?: string;
  countryCode?: string;
  surfaceType?: SurfaceType | null;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  minClimbM?: number;
  maxClimbM?: number;
  multiDayOnly?: boolean;
  avoidBusyRoads?: boolean;
}

export const DISTANCE_MIN = 1;
export const DISTANCE_MAX = 350;
export const CLIMB_MIN = 0;
export const CLIMB_MAX = 3500;

const TRACKS: Track[] = [
  {
    id: "galilee-loop",
    name: "Galilee Loop",
    surfaceType: "road",
    country: "Israel",
    countryCode: "IL",
    state: null,
    area: "Galilee",
    distanceKm: 102,
    climbM: 1540,
    descentM: 1540,
    hasBusyRoads: false,
    days: [{ dayNumber: 1, distanceKm: 102, climbM: 1540, points: [[32.8156, 35.5397]] }],
    points: [[32.8156, 35.5397]],
    airQuality: { aqi: 42, label: "Good" },
    hazards: [],
    pois: [{ type: "rest", name: "Overlook rest point", point: [32.845, 35.598] }],
    basedOnEventId: "gravel-championship",
    favorite: false,
    likes: 34,
    liked: false,
    comments: [],
  },
  {
    id: "negev-gravel",
    name: "Negev Gravel Crossing",
    surfaceType: "gravel",
    country: "Israel",
    countryCode: "IL",
    state: null,
    area: "Negev",
    distanceKm: 68,
    climbM: 820,
    descentM: 900,
    hasBusyRoads: false,
    days: [{ dayNumber: 1, distanceKm: 68, climbM: 820, points: [[30.9, 34.85]] }],
    points: [[30.9, 34.85]],
    airQuality: { aqi: 35, label: "Good" },
    hazards: [],
    pois: [{ type: "toilet", name: "Sde Boker rest stop", point: [30.86, 34.93] }],
    basedOnEventId: null,
    favorite: false,
    likes: 12,
    liked: false,
    comments: [],
  },
];

export async function getTracks(filters: TrackFilters = {}): Promise<Track[]> {
  const q = filters.location?.trim().toLowerCase();
  return TRACKS.filter((track) => {
    if (filters.countryCode && track.countryCode !== filters.countryCode) return false;
    if (
      q &&
      !track.name.toLowerCase().includes(q) &&
      !track.country.toLowerCase().includes(q) &&
      !(track.state ?? "").toLowerCase().includes(q) &&
      !track.area.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (filters.surfaceType && track.surfaceType !== filters.surfaceType) return false;
    if (filters.minDistanceKm != null && track.distanceKm < filters.minDistanceKm) return false;
    if (filters.maxDistanceKm != null && track.distanceKm > filters.maxDistanceKm) return false;
    if (filters.minClimbM != null && track.climbM < filters.minClimbM) return false;
    if (filters.maxClimbM != null && track.climbM > filters.maxClimbM) return false;
    if (filters.multiDayOnly && track.days.length < 2) return false;
    if (filters.avoidBusyRoads && track.hasBusyRoads) return false;
    return true;
  });
}

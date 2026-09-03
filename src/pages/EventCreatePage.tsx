/**
 * Event create / edit — one component, two modes.
 *
 * Route:    /events/new (create) and /events/:eventId/edit (edit — same component, switches
 *           mode based on whether `:eventId` is present)
 * Loads:    nothing for create; GET /events/:eventId + this event's client-only extras
 *           (store/eventExtrasStore.ts) for edit, to prefill every field — "edit event take
 *           us to like the create so i change anything," confirmed directly. Route/track is
 *           the one thing never prefilled in edit mode: it was never persisted anywhere on
 *           create either (see the Track section's doc comment below), so there's nothing
 *           real to show back — picking a new one just replaces whatever the event has today.
 * Actions:  create: POST /events. Edit: PATCH /events/:eventId. Going live is deliberately not
 *           an action here — moved to EventDetailPage's header ("go live and start not at the
 *           edit mode it at the page afetr i edit," confirmed directly): this page is
 *           create/edit only, one of three modes an event's pages split into (create/edit,
 *           view, live — see App.tsx's routes), and starting the ride belongs to view/live,
 *           not edit.
 * State:    the form fields; `isEditing`/`loadingEvent` track edit-mode loading
 * Calls:    POST /events (create), PATCH /events/:eventId (edit)
 *
 * Race-only fields are hidden on this form on purpose, direct decision: this app is starting
 * with rides only, races come later (by converting a ride or adding real race support — not
 * decided yet). Kind is always sent as "RIDE," displayMode always "standard," requiresBib
 * always false — no Kind/Display-style/bib UI at all, not even a default-to-Ride selector,
 * since there is nothing else to choose right now. `07-api-contract.md` Part 1 is frozen and
 * still requires all three fields in the POST body, so they're still sent, just hardcoded.
 * Re-introduce the Kind/Display-style/bib fieldsets (see git history) once races come back.
 *
 * Activity type (Road/MTB/Gravel/Running — "Hiking" is hidden from the picker for now,
 * matching Find Tracks' SurfaceType) is
 * client-side only — deliberately NOT sent in the POST body. `07-api-contract.md` Part 1 is
 * frozen (the Android app is live against it) and has no field for this; the server has no
 * column to store it in yet either. See plan/server-tasks.md Part C for what real support
 * needs. Picking a value here is honest UI with nowhere to go until that's built — it's
 * shown, just not persisted past this page.
 *
 * Level (Beginner/Intermediate/Masters/Elite/World Tour) and the organizing team are the same
 * "no server column yet" story — but unlike Activity type, both need to actually show up again
 * later (Level so a browsing rider can see the hardness before joining; the team for "each
 * ride can be for group also created by"), so they're persisted client-side via
 * store/eventExtrasStore.ts (localStorage, keyed by the real event id, written right after
 * `POST /events` returns one) rather than just living in this page's local state. Level is
 * distinct from Activity type (what kind of riding) and from ride groups
 * (EventGroupsPage.tsx's actual split-into-groups feature) — this is one label for the whole
 * event, not a per-group thing.
 *
 * The Team field picks (or creates) a real team (store/teamsStore.ts) — a pro team runs
 * several rides a week and wants them gathered into one shared schedule its members can see
 * (TeamDetailPage.tsx), which a plain text label can't do. Picking "+ New team…" creates it on
 * the spot; picking none at all falls back to a plain text name (this ride just isn't part of
 * an ongoing schedule). Selecting a team both links this event into its schedule
 * (`addEventToTeam`) and sets the same display string the old text field did
 * (`organizerGroup`, via `setTeam`), so EventDetailPage's "Organized by" line doesn't need to
 * know which path was used.
 *
 * "Require my approval" (public events only) is the odd one out: same client-only storage as
 * Level/club name, but it can't actually do anything yet — `POST /events/join` always
 * registers a self-joiner immediately (`registration_status` defaults to `'registered'`
 * server-side), never `'waiting_approval'`. This checkbox previews the setting and records the
 * organizer's intent, but until the server makes joining a flagged event land as
 * `waiting_approval`, every self-joiner gets in regardless of what this says. See
 * plan/server-tasks.md for what real support needs.
 *
 * THE TRACK STEP is the one that decides whether a ride happens, and it is two buttons rather
 * than one. It used to be a single "Select map or upload track file" opening CopyTrackSheet,
 * a bottom sheet where the real choice was made from a list of ride NAMES with a
 * "Loading route…" line under each. That put the path almost nobody can use — having a Garmin
 * GPX file to hand — in front of the path almost everybody needs, and presented the second as
 * a file dialog when choosing a route is a visual decision.
 *
 *   Upload track   TrackUploadButton — opens the file picker directly. GPX or CSV, parsed
 *                  client-side (lib/track-gpx.ts, lib/track-csv.ts; no FIT, no Excel, see
 *                  those files). Small, because it serves the minority who have a file.
 *   Browse tracks  TrackGallerySheet — a full-screen, infinitely-scrolling gallery of rides
 *                  that already have a track, each card showing the route drawn, distance,
 *                  climb, the organizer's stated duration and how many riders rode it.
 *
 * Both end in the same two handlers they always did (handleUploadRoute / pickEventToCopy), and
 * a picked ride's route still comes from GET /events/:eventId/route — the same source
 * EventDetailPage uses; a ride with no saved route shows the missing-route state rather than a
 * fabricated one. CopyTrackSheet is untouched and still serves EventGroupsPage.
 *
 * Picking a track also copies the source event's Location/Level/organizing club over —
 * "copy all elements except the date," confirmed directly: the recurring-ride case (same
 * group, same route, new Saturday) shouldn't need retyping everything but the date. Only fills
 * in a field still at its default, so it never overwrites something already typed in by hand
 * before picking a track. `startsAt` is deliberately never touched here.
 *
 * Editing an existing event happens inline on EventDetailPage, owner-only — there is no
 * separate edit screen.
 *
 * The Description field doubles as a "quick add": typing something like "2 groups: strong
 * 50km, weak 20km, next Saturday" is scanned by lib/quick-add-parser.ts for a relative date
 * phrase, which fills in Start time automatically (defaulting to 06:00 when no time is
 * mentioned) — asked for directly, explicitly as keyword matching rather than any real model
 * ("if ther is not to much memory just sujest"), see that file's doc comment. Never overwrites
 * a start time the organizer already set by hand (see `startsAtEdited`).
 *
 * Visuals: redesigned from a neon "cockpit" skin to the app's normal clean light/dark theme
 * (tokens.css), matching EventDetailPage.tsx/EventTile.tsx's redesign — asked for directly.
 * The previous cockpit version is kept at
 * src/_backup-cockpit-design/EventCreatePage.tsx.bak. The readiness meter below the header is
 * a dopamine touch, not a validation gate — the submit button's disabled rule is unrelated
 * (see the mandatory-field check inside `submit`).
 */

import {
  Accessibility,
  AlertTriangle,
  Bike,
  Check,
  Clock,
  Coffee,
  Compass,
  Eye,
  FileText,
  Gauge,
  ImagePlus,
  LifeBuoy,
  Lock,
  MapPin,
  Mountain,
  Radio,
  Ruler,
  ShieldCheck,
  Target,
  Timer,
  Trash2,
  Truck,
  Upload,
  Users
} from "lucide-react";
import { type FormEvent, type KeyboardEvent, lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "../app/ErrorBoundary";
import { SafetySheet } from "../app/SafetySheet";
import { TrackGallerySheet } from "../app/TrackGallerySheet";
import { TrackUploadButton, type UploadedTrack } from "../app/TrackUploadButton";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { effectiveLimits } from "../lib/entitlements";
import type { EventRoute } from "../lib/event-route";
import {
  type EventDetail,
  type EventSummary,
  getCachedEvent,
  putCachedEventDetail,
  viewerKey,
} from "../lib/local-db";
import {
  DURATION_HOUR_OPTIONS,
  DURATION_MINUTE_OPTIONS,
  formatDuration,
  joinDuration,
  splitDuration
} from "../lib/ride-duration";
import { SURFACE_TYPE_ICON, type SurfaceType } from "../lib/surface-types";
import {
  nextUpcomingSaturdayStart,
  parseQuickAdd,
  toDatetimeLocalValue
} from "../lib/quick-add-parser";
import {
  LEVEL_ICON,
  LEVEL_LABEL,
  LEVELS,
  type RiderLevel
} from "../lib/rider-level";
import { validateCreateEventForm } from "../validation/forms";
import { useEventExtrasStore } from "../store/eventExtrasStore";
import { useEventRouteStore } from "../store/eventRouteStore";
import { useEventsStore } from "../store/eventsStore";
import { useLastEventDefaultsStore } from "../store/lastEventDefaultsStore";
import { useTeamsStore } from "../store/teamsStore";
import styles from "./EventCreatePage.module.css";

const RouteMap = lazy(() => import("../app/RouteMap"));

interface ExistingEvent {
  id: string;
  name: string;
  status: string;
  visibility: "public" | "private";
  startsAt: string | null;
  location: string | null;
  /** Optional — not yet in the frozen API contract; older/unmigrated events won't have it. */
  area?: string | null;
  description: string | null;
  requiresApproval: boolean;
  showParticipants: boolean;
  /** Real event columns (sql/010-event-profile.sql). Absent/null on an event created before
   *  the client started sending them; the edit form then falls back to the device-local copy. */
  activityType?: SurfaceType | null;
  level?: RiderLevel | null;
  /** EFFECTIVE elevation gain (m) the server persists — the organizer's manual/imported value,
   *  else the attached route's climb. Prefills the Climb field in edit mode. See
   *  sql/021-events-elevation-gain.sql. */
  elevationGain?: number | null;
  /** Organizer-set ride plan (sql/022-event-ride-plan.sql). Absent on an older server / event;
   *  edit mode then just starts these fields blank. */
  durationMin?: number | null;
  restStops?: number | null;
  isAccessible?: boolean;
  hasSupportVehicle?: boolean;
}

const EVENT_ROUTE_MAX_POINTS = 5000;
const EVENT_ROUTE_MAX_PAYLOAD_BYTES = 900_000;

function downsampleRoutePoints(
  points: [number, number][],
  maxPoints: number
): [number, number][] {
  if (points.length <= maxPoints) return points;
  if (maxPoints <= 2) return [points[0], points[points.length - 1]];

  const result: [number, number][] = [points[0]];
  const interior = points.length - 2;
  const slots = maxPoints - 2;

  for (let i = 1; i <= slots; i += 1) {
    const idx = Math.round((i * interior) / (slots + 1));
    result.push(points[idx]);
  }

  result.push(points[points.length - 1]);
  return result;
}

function routePayloadBytes(
  points: [number, number][],
  distanceKm: number,
  elevationM: number | null
): number {
  const body = JSON.stringify({ points, distanceKm, elevationM });
  return new TextEncoder().encode(body).length;
}

function capRoutePayload(
  points: [number, number][],
  distanceKm: number,
  elevationM: number | null
): [number, number][] {
  let reduced = downsampleRoutePoints(points, EVENT_ROUTE_MAX_POINTS);
  while (
    reduced.length > 2 &&
    routePayloadBytes(reduced, distanceKm, elevationM) >
      EVENT_ROUTE_MAX_PAYLOAD_BYTES
  ) {
    reduced = downsampleRoutePoints(
      reduced,
      Math.max(2, Math.floor(reduced.length / 2))
    );
  }
  return reduced;
}

const ACTIVITY_TYPES: { value: SurfaceType; label: string }[] = [
  { value: "road", label: "Road" },
  { value: "mtb", label: "MTB" },
  { value: "gravel", label: "Gravel" },
  { value: "running", label: "Running" }
  // "hiking" intentionally hidden from the create/edit picker for now; the
  // SurfaceType and display mappings keep it so existing events still render.
];

const NEW_TEAM_OPTION = "__new__";

export function EventCreatePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { eventId } = useParams();
  const isEditing = Boolean(eventId);
  const [searchParams] = useSearchParams();
  const setEventLevel = useEventExtrasStore((s) => s.setLevel);
  const setOrganizerGroup = useEventExtrasStore((s) => s.setOrganizerGroup);
  const setEventTeam = useEventExtrasStore((s) => s.setTeam);
  const setEventActivityType = useEventExtrasStore((s) => s.setActivityType);
  const setEventDistanceClimb = useEventExtrasStore((s) => s.setDistanceClimb);
  const setEventCoverImage = useEventExtrasStore((s) => s.setCoverImage);
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);
  const setEventRoute = useEventRouteStore((s) => s.setRoute);
  const routerLocation = useLocation();
  const pickedTrack = (routerLocation.state ?? null) as {
    fromRouteId?: number;
    fromRouteName?: string | null;
    fromRoutePlace?: string | null;
    fromRouteDistanceKm?: number | null;
    fromRouteClimbM?: number | null;
    fromRouteSurface?: SurfaceType | null;
  } | null;
  const teams = useTeamsStore((s) => s.teams);
  const createTeam = useTeamsStore((s) => s.createTeam);
  const addEventToTeam = useTeamsStore((s) => s.addEventToTeam);
  const setLastDefaults = useLastEventDefaultsStore((s) => s.setDefaults);

  // What the organizer will actually show up as on the start list. Mirrors the server's
  // PARTICIPANT_DISPLAY_COLUMNS — COALESCE(ep.name, first+last, nickname) — with ep.name NULL
  // for a joinAsRider row, so this is the real answer, not a guess. Shown read-only because
  // the create request has no name field to override it with.
  const riderDisplayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() ||
    profile?.nickname?.trim() ||
    null;

  const myTeams = Object.values(teams).filter(
    (t) => profile != null && t.createdBy === profile.id
  );

  // Pre-fill from the last event this organizer created — "all data from my previous will
  // auto fill again but i can change" — so a recurring ride doesn't start from a blank form.
  // Only for create mode; edit mode prefills from the event being edited instead (see effect
  // below). Read once via getState() (not a subscribed hook) since this is only ever used to
  // seed initial state on mount, not to react to later changes.
  const lastDefaults = isEditing
    ? null
    : useLastEventDefaultsStore.getState().defaults;
  const initialTeamId =
    searchParams.get("team") ??
    (lastDefaults?.teamId && teams[lastDefaults.teamId]
      ? lastDefaults.teamId
      : "");

  const [name, setName] = useState("");
  const [activityType, setActivityType] = useState<SurfaceType>(
    lastDefaults?.activityType ?? "mtb"
  );
  const [level, setLevel] = useState<RiderLevel | null>(
    lastDefaults?.level ?? "intermediate"
  );
  // Distance/climb — near the difficulty picker below, same "no server column, persisted via
  // eventExtrasStore" story as Level. Plain strings (not numbers) since these are controlled
  // number inputs that need to hold "" while empty. Auto-filled from whatever route gets
  // picked/uploaded below (see pickEventToCopy/handleUploadRoute), but editable by hand at any
  // point — a route doesn't always carry real elevation, and this is the fallback for that.
  // `*Edited` mirrors `startsAtEdited`: once the organizer types a value in by hand, picking a
  // different route stops overwriting it.
  const [distanceKm, setDistanceKmInput] = useState("");
  const [climbM, setClimbMInput] = useState("");
  const [distanceEdited, setDistanceEdited] = useState(false);
  const [climbEdited, setClimbEdited] = useState(false);
  // Ride plan (sql/022). Duration is the organizer's estimate of how long the ride takes, held
  // as whole minutes — exactly what events.duration_min stores — and picked from two dropdowns
  // rather than typed. `null` is a real value here and means "not stated"; it is not zero.
  // Never derived from distance. `durationEdited` mirrors `climbEdited`: once set by hand,
  // copying a track stops overwriting it. Rest stops is a small count (0 = none, null = not
  // stated). Accessible is a marker the organizer sets for riders who need assistance /
  // adaptive equipment.
  const [durationMin, setDurationMin] = useState<number | null>(
    !isEditing ? (lastDefaults?.durationMin ?? null) : null
  );
  const [durationEdited, setDurationEdited] = useState(false);
  const [restStops, setRestStops] = useState<number | null>(
    !isEditing ? (lastDefaults?.restStops ?? null) : null
  );
  const [isAccessible, setIsAccessible] = useState(
    !isEditing ? (lastDefaults?.isAccessible ?? false) : false
  );
  // Support / sag vehicle following the ride (sql/024). Same shape as isAccessible: a plain
  // boolean the organizer sets, false by default, and false means "none promised" — never a
  // maybe. Riders plan long and remote rides around this, so it is only ever what the organizer
  // actually ticked.
  const [hasSupportVehicle, setHasSupportVehicle] = useState(
    !isEditing ? (lastDefaults?.hasSupportVehicle ?? false) : false
  );
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [teamId, setTeamId] = useState<string>(initialTeamId);
  const [newTeamName, setNewTeamName] = useState("");
  const [organizerGroup, setOrganizerGroupInput] = useState(
    !initialTeamId ? (lastDefaults?.organizerGroup ?? "") : ""
  );
  const [requiresApproval, setRequiresApproval] = useState(
    lastDefaults?.requiresApproval ?? false
  );
  const [ridersListVisible, setRidersListVisible] = useState(
    lastDefaults?.ridersListVisible ?? true
  );
  const [visibility, setVisibility] = useState<"public" | "private">(
    lastDefaults?.visibility ?? "private"
  );
  const [startsAt, setStartsAt] = useState(() =>
    isEditing ? "" : toDatetimeLocalValue(nextUpcomingSaturdayStart())
  );
  const [startsAtEdited, setStartsAtEdited] = useState(false);
  const [dateHint, setDateHint] = useState<string | null>(null);
  const [location, setLocation] = useState(lastDefaults?.location ?? "");
  const [area, setArea] = useState(lastDefaults?.area ?? "");
  const [description, setDescription] = useState("");
  // Create: stays null → the event falls back to the organizer's own profile cover (see
  // app/useOwnerCover.ts). Edit: an event that already has a custom cover keeps it (the effect
  // below re-hydrates this and handleSubmit re-persists it) — the upload UI is just disabled.
  const [coverImageDataUrl, setCoverImageDataUrl] = useState<string | null>(null);
  // "Am I also riding?" — asked for directly ("i need to be asked also if i am also ridewr and
  // what is my nick name"). Create-only (see the field's `!isEditing` guard below): re-asking
  // on every edit save risked adding a duplicate roster row each time.
  //
  // This rides along on the create request itself as `joinAsRider`, which is the ONLY way to
  // put the organizer on the start list as themselves: the server joins them by user_id
  // (event.service.ts's createEvent → upsertParticipant). The previous approach — creating the
  // event, then POSTing the organizer through the manual-add endpoint — wrote a row with
  // user_id NULL, an anonymous rider nobody could match against the signed-in account, so the
  // organizer never got marked "(ME)" and could rejoin as a second, duplicate row.
  //
  // A consequence of joining by account: the roster name comes from the account
  // (COALESCE(first+last, nickname), server-side), not from a per-event nickname. The free-text
  // nickname box that used to sit here is gone rather than kept as decoration — it fed only the
  // manual-add call, and `joinAsRider` carries no name field. Changing that name is an account
  // edit, which is what riderDisplayName below points at.
  //
  // Default CHECKED: the creator is assumed to be riding their own event, so a participant row
  // (and therefore event.myParticipant.id) exists by default — which is what LIVE location
  // sharing needs (LiveEventPage.tsx). Explicitly unticking it sends joinAsRider: false and the
  // organizer stays organizer-only, with no participant row. Nothing here forces every owner
  // into event_participants server-side — that stays gated on joinAsRider (event.service.ts).
  const [imRiding, setImRiding] = useState(true);

  // Edit-mode only, for the Danger Zone below — "ride that i create and didnt start i can
  // delete," asked for directly. Not read anywhere else; the live/finished check right after
  // the fetch below already redirects away before this would ever see those two statuses.
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mandatory-on-create fields (name/map/date) — asked for directly. Clicking Save with any
  // of these unfilled shows a red border instead of blocking the click outright; typing in
  // that field (or picking a route) clears its flag right away, not just on next submit.
  const [invalidName, setInvalidName] = useState(false);
  const [invalidStartsAt, setInvalidStartsAt] = useState(false);
  const [invalidRoute, setInvalidRoute] = useState(false);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<EventSummary | null>(null);
  const [copiedRoute, setCopiedRoute] = useState<EventRoute | null>(null);
  /**
   * A public route picked in Find Tracks (TrackCard's "Plan a ride with this track"), handed
   * over through router state. Held as an ID, not as geometry, because the server can attach
   * the existing library row directly — POST /events/:eventId/route accepts { routeId }, which
   * links this very route instead of storing a second copy of the same line. A fix to the
   * original then reaches every ride using it.
   *
   * Until this existed, that button was a bare <Link to="/events/new"> that passed nothing: the
   * picked track was dropped and the create form opened blank.
   */
  const [fromRouteId, setFromRouteId] = useState<number | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedRestStops, setUploadedRestStops] = useState<
    [number, number][]
  >([]);

  const [loadingEvent, setLoadingEvent] = useState(isEditing);

  // Create mode only: this rider's fresh weekly-ride usage + limit, straight from the server.
  // The cached `profile` can be stale (it's only refreshed on cold start / profile edit), and
  // "how many rides have I made this week" changes every time they create one. Falls back to
  // profile.usage / effectiveLimits(profile) when the fetch fails — see ridesUsed/ridesMax
  // below. Client-side this only disables Save; the server 409s (PLAN_LIMIT) on the real cap.
  const [weekRides, setWeekRides] = useState<{ used: number; max: number } | null>(null);

  // Edit mode — load the existing event + its client-only extras and prefill every field,
  // "edit event take us to like the create so i change anything." Route/track is
  // deliberately not prefilled: it was never persisted anywhere on create either (see the
  // Track section's doc comment above), so there's nothing real to show back.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoadingEvent(true);
    (async () => {
      // Set true once the server answers for difficulty / activity type, so the device-local
      // extras below don't overwrite a real server value with a stale one.
      let serverHasLevel = false;
      let serverHasActivity = false;
      let serverHasElevation = false;
      const cached = await getCachedEvent(eventId);
      if (cached && !cancelled) {
        setName(cached.name);
        setLocation(cached.location ?? "");
        setArea(cached.area ?? "");
        setVisibility(cached.visibility);
        if (cached.startsAt)
          setStartsAt(toDatetimeLocalValue(new Date(cached.startsAt)));
      }
      try {
        const found = await apiRequest<ExistingEvent>(`/events/${eventId}`);
        if (cancelled) return;
        // The server rejects PATCH /events/:eventId once live/finished (Manage mode is
        // add/remove riders + pause/stop only, not general details) — redirect here rather
        // than let the save button fail after a full form load.
        if (found.status === "live" || found.status === "finished") {
          navigate(`/events/${eventId}`, {
            replace: true,
            state: {
              message:
                found.status === "live"
                  ? "This event is live — use Manage to add/remove riders or stop it."
                  : "This event has finished and can no longer be edited."
            }
          });
          return;
        }
        setEventStatus(found.status);
        setName(found.name);
        setLocation(found.location ?? "");
        setArea(found.area ?? "");
        setDescription(found.description ?? "");
        setVisibility(found.visibility);
        if (found.startsAt)
          setStartsAt(toDatetimeLocalValue(new Date(found.startsAt)));
        setRequiresApproval(found.requiresApproval);
        setRidersListVisible(found.showParticipants);
        // Server value wins for difficulty / activity type — it is the same for every device
        // now. The device-local extras below only fill a gap for an event created before the
        // client sent these (or edited on a different device).
        if (found.level) {
          setLevel(found.level);
          serverHasLevel = true;
        }
        if (found.activityType) {
          setActivityType(found.activityType);
          serverHasActivity = true;
        }
        // Server-persisted effective elevation wins — it survives logout/login and is the
        // same on every device. Marked "edited" so re-picking a route (or a stale local
        // extras value below) never silently overwrites what the organizer saved. Replacing
        // the GPX explicitly is still allowed to repopulate it — see handleUploadRoute.
        if (found.elevationGain != null) {
          setClimbMInput(String(found.elevationGain));
          setClimbEdited(true);
          serverHasElevation = true;
        }
        // Ride plan — server is the only source (no local-extras fallback for these).
        if (found.durationMin != null) {
          setDurationMin(found.durationMin);
          setDurationEdited(true);
        }
        if (found.restStops != null) setRestStops(found.restStops);
        setIsAccessible(found.isAccessible ?? false);
        setHasSupportVehicle(found.hasSupportVehicle ?? false);
      } catch {
        // Cached summary (if any) is already on screen — a failed refresh isn't fatal here.
      } finally {
        if (!cancelled) setLoadingEvent(false);
      }

      // Read imperatively (not the reactive `extrasByEvent` above): this must stay out of
      // the effect's dependency array, see comment below.
      const existingExtras = useEventExtrasStore.getState().byEvent[eventId];
      if (existingExtras && !cancelled) {
        if (!serverHasLevel && existingExtras.level) setLevel(existingExtras.level);
        if (!serverHasActivity && existingExtras.activityType)
          setActivityType(existingExtras.activityType);
        if (existingExtras.teamId) setTeamId(existingExtras.teamId);
        else if (existingExtras.organizerGroup)
          setOrganizerGroupInput(existingExtras.organizerGroup);
        if (existingExtras.distanceKm != null) {
          setDistanceKmInput(String(existingExtras.distanceKm));
          setDistanceEdited(true);
        }
        if (!serverHasElevation && existingExtras.climbM != null) {
          setClimbMInput(String(existingExtras.climbM));
          setClimbEdited(true);
        }
        if (existingExtras.coverImageDataUrl) {
          setCoverImageDataUrl(existingExtras.coverImageDataUrl);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately only [eventId, navigate]: this must run once on mount for a given event, not
    // every time extras change afterward (e.g. from picking a team mid-edit), or it would stomp
    // on what the organizer just typed. Extras are read via getState() above specifically so
    // they aren't a reactive dependency here. `navigate` is referentially stable (react-router),
    // so including it doesn't change when this effect actually re-runs.
  }, [eventId, navigate]);

  // Create mode: pull fresh entitlements + usage so "rides used this week" is current, not
  // whatever the cached profile last held. Best-effort — a failed fetch just leaves weekRides
  // null and the render falls back to profile.usage / effectiveLimits(profile).
  useEffect(() => {
    if (isEditing) return;
    let cancelled = false;
    apiRequest<{
      entitlements?: { maxEventsPerWeek: number };
      usage?: { eventsThisWeek: number };
    }>("/users/me")
      .then((me) => {
        if (cancelled || !me.entitlements || !me.usage) return;
        setWeekRides({
          used: me.usage.eventsThisWeek,
          max: me.entitlements.maxEventsPerWeek,
        });
      })
      .catch(() => {
        // Offline / server error — the fallback in ridesUsed/ridesMax covers it.
      });
    return () => {
      cancelled = true;
    };
  }, [isEditing]);

  // Default to the organizer's own team once it's loaded — asked for directly ("if i alredy
  // have my team it bee as default"). Only when nothing was already picked (no ?team= param,
  // nothing chosen by hand yet) and there's exactly one candidate — with more than one, a
  // silent guess would be as likely to pick the wrong squad as the right one.
  useEffect(() => {
    if (teamId || myTeams.length !== 1) return;
    setTeamId(myTeams[0].id);
  }, [myTeams, teamId]);

  // Readiness meter: a dopamine touch, not a gate — the submit button below is still only
  // disabled on an empty name, same rule as before this page had a cockpit skin.
  const readinessFields = [
    activityType,
    name.trim(),
    location.trim(),
    area.trim(),
    startsAt,
    description.trim(),
    copiedFrom || uploadedFileName ? "route" : ""
  ];
  const readinessCount = readinessFields.filter(Boolean).length;
  const readinessPct = Math.round(
    (readinessCount / readinessFields.length) * 100
  );
  const armed = readinessPct === 100;

  // "Rides used this week" — the fresh server fetch wins; the cached profile is the fallback,
  // then the offline defaults. Only gates create mode (editing an existing ride never counts
  // against the weekly create limit). The message frames it as a rolling window because the
  // server's `eventsThisWeek` is "created in the last 7 days".
  const ridesUsed = weekRides?.used ?? profile?.usage?.eventsThisWeek ?? 0;
  const ridesMax = weekRides?.max ?? effectiveLimits(profile).maxEventsPerWeek;
  const hasRidesUsage = weekRides != null || profile?.usage != null;
  const ridesLimitReached = !isEditing && hasRidesUsage && ridesUsed >= ridesMax;
  const weeklyLimitMessage = `You've reached your ${ridesMax} rides this week — it frees up 7 days after your earliest one.`;

  // Auto-fills Distance/Climb from a picked/uploaded route's own numbers — only while the
  // organizer hasn't typed something in by hand (`*Edited`), same "never clobber a hand-typed
  // value" rule startsAtEdited already follows for the quick-add date guess.
  function applyRouteDistanceClimb(route: EventRoute) {
    if (!distanceEdited) setDistanceKmInput(String(route.distanceKm));
    if (!climbEdited)
      setClimbMInput(route.elevationM != null ? String(route.elevationM) : "");
  }

  async function pickEventToCopy(event: EventSummary) {
    setCopiedFrom(event);
    setUploadedFileName(null);
    setUploadedRestStops([]);
    setGalleryOpen(false);
    setCopyLoading(true);
    setInvalidRoute(false);

    // "Copy all elements except the date" — everything about the source event carries over
    // except startsAt, which stays whatever the organizer already set (or leaves blank to set
    // next). Only fills in fields still at their default, so it never clobbers something typed
    // in by hand before picking a track.
    if (!location.trim()) setLocation(event.location ?? "");
    if (!area.trim()) setArea(event.area ?? "");
    // Ride plan carries over as the default too — "if user copy track from other you may copy
    // this also as default time". Same rule as everything else here: only when the organizer
    // hasn't already set it by hand.
    if (!durationEdited && durationMin === null && event.durationMin != null) {
      setDurationMin(event.durationMin);
    }
    if (restStops === null && event.restStops != null) setRestStops(event.restStops);
    if (event.isAccessible) setIsAccessible(true);
    if (event.hasSupportVehicle) setHasSupportVehicle(true);
    const sourceExtras = extrasByEvent[event.id];
    if (level === null && sourceExtras?.level) setLevel(sourceExtras.level);
    if (!teamId && sourceExtras?.teamId) {
      setTeamId(sourceExtras.teamId);
    } else if (
      !teamId &&
      !organizerGroup.trim() &&
      sourceExtras?.organizerGroup
    ) {
      setOrganizerGroupInput(sourceExtras.organizerGroup);
    }

    try {
      const route = await apiRequest<EventRoute | null>(
        `/events/${event.id}/route`
      );
      if (!route) {
        // The source event has no saved route — never fabricate one (BUGS.md: never show
        // mock/fake route). The invalidRoute flag surfaces the missing-route state.
        setCopiedFrom(null);
        setCopiedRoute(null);
        setInvalidRoute(true);
        return;
      }
      setCopiedRoute(route);
      applyRouteDistanceClimb(route);
    } finally {
      setCopyLoading(false);
    }
  }

  function clearCopiedTrack() {
    setCopiedFrom(null);
    setCopiedRoute(null);
    setUploadedFileName(null);
    setUploadedRestStops([]);
    // Only clears values that came from the route being removed — a hand-typed distance/climb
    // stays put, same "never clobber a hand-typed value" rule as everywhere else here.
    if (!distanceEdited) setDistanceKmInput("");
    if (!climbEdited) setClimbMInput("");
  }

  function handleUploadRoute(uploaded: UploadedTrack) {
    setCopiedFrom(null);
    setCopyLoading(false);
    setGalleryOpen(false);
    setCopiedRoute(uploaded.route);
    setUploadedFileName(uploaded.fileName);
    setUploadedRestStops(uploaded.restStops);
    setInvalidRoute(false);
    applyRouteDistanceClimb(uploaded.route);
    // Uploading (or replacing) a GPX is an explicit action: if the new file carries its own
    // elevation, take that number even over a value the organizer typed earlier, and clear the
    // "edited" latch so they can still override it before Save. A file with no elevation data
    // leaves whatever was there — never wiped, never invented.
    if (uploaded.route.elevationM != null) {
      setClimbMInput(String(uploaded.route.elevationM));
      setClimbEdited(false);
    }
  }

  function handleDescriptionChange(value: string) {
    setDescription(value);
    if (startsAtEdited) return; // never override a start time the organizer set by hand
    const found = parseQuickAdd(value);
    if (!found) {
      setDateHint(null);
      return;
    }
    setStartsAt(toDatetimeLocalValue(found.date));
    setDateHint(
      `Detected "${found.label}" → ${found.date.toLocaleDateString()} at ${found.date
        .toTimeString()
        .slice(0, 5)}. Edit Start time above to change it.`
    );
  }

  // Creates the team right away instead of waiting for the whole event to save — asked for
  // directly. Switches the dropdown over to the real team the moment it exists, same as
  // picking any other team, so "New team name" and its Save button both disappear.
  /**
   * Apply a track picked in Find Tracks. Runs once, on create only — never in edit mode, where
   * the form is already showing a saved ride and a stale router state would quietly overwrite
   * it. Every value comes from the route row the rider actually chose; a field the route does
   * not carry (its own name, place, distance, climb, type are all nullable server-side) is left
   * for the organizer to fill rather than defaulted.
   */
  useEffect(() => {
    if (isEditing) return;
    const picked = pickedTrack;
    if (!picked?.fromRouteId) return;
    setFromRouteId(picked.fromRouteId);
    if (picked.fromRoutePlace?.trim()) {
      setLocation((current: string) => current || picked.fromRoutePlace!);
    }
    if (picked.fromRouteDistanceKm != null) {
      setDistanceKmInput((current: string) => current || String(picked.fromRouteDistanceKm));
    }
    if (picked.fromRouteClimbM != null) {
      setClimbMInput((current: string) => current || String(picked.fromRouteClimbM));
    }
    if (picked.fromRouteSurface) setActivityType(picked.fromRouteSurface);
    // Full geometry for the preview map. Best-effort: the attach below works from the id
    // alone, so a failed preview fetch costs a thumbnail, not the route.
    void apiRequest<{ trackPoints?: [number, number][]; distanceKm: number | null; elevationM: number | null }>(
      `/routes/${picked.fromRouteId}`,
    )
      .then((route) => {
        if (route.trackPoints?.length && route.distanceKm != null) {
          setCopiedRoute({
            points: route.trackPoints,
            distanceKm: route.distanceKm,
            elevationM: route.elevationM,
          });
        }
      })
      .catch(() => undefined);
    // Once only — re-running on every render would fight the organizer's own edits.
  }, [isEditing, pickedTrack]);

  function saveNewTeam() {
    if (!newTeamName.trim() || !profile) return;
    const team = createTeam(newTeamName, profile.id);
    setTeamId(team.id);
    setNewTeamName("");
  }

  async function saveExtras(id: string) {
    if (level) setEventLevel(id, level);
    setEventActivityType(id, activityType);

    // The organizer's hand-typed distance/climb win over whatever the route file carried —
    // a GPX often has no elevation at all (elevationM null), and the Climb field is exactly
    // the fallback for that. Computed here so the same numbers go BOTH to the server route
    // (below, so every viewer and a post-logout reload still see them) and to the local
    // extras store (further down, for instant same-device display).
    const parsedDistanceNum = distanceKm.trim() ? Number(distanceKm) : null;
    const parsedClimbNum = climbM.trim() ? Number(climbM) : null;
    const typedDistance =
      parsedDistanceNum != null && !Number.isNaN(parsedDistanceNum) ? parsedDistanceNum : null;
    const typedClimb =
      parsedClimbNum != null && !Number.isNaN(parsedClimbNum) ? parsedClimbNum : null;

    if (fromRouteId != null) {
      // A route picked from the public library: attach the EXISTING row by id. The server's
      // attachLibraryRouteToEvent links it, so the ride runs on the real route rather than on a
      // second copy of the same line — and a later fix to the original reaches every ride using
      // it. Sending its geometry back as new points would fork it instead.
      if (copiedRoute) setEventRoute(id, copiedRoute);
      await apiRequest(`/events/${id}/route`, {
        method: "POST",
        body: { routeId: fromRouteId }
      });
    } else if (copiedRoute) {
      // Instant, same-device feedback (and an offline fallback) — see eventRouteStore.ts.
      setEventRoute(id, copiedRoute);
      // Also persist to the server so every viewer sees the same route. Await this so
      // navigation never races ahead of route persistence.
      const points = capRoutePayload(
        copiedRoute.points,
        copiedRoute.distanceKm,
        copiedRoute.elevationM
      );
      await apiRequest(`/events/${id}/route`, {
        method: "POST",
        body: {
          points,
          distanceKm: typedDistance ?? copiedRoute.distanceKm,
          elevationM: typedClimb ?? copiedRoute.elevationM
        }
      });
    }
    setEventDistanceClimb(id, typedDistance, typedClimb);
    setEventCoverImage(id, coverImageDataUrl);

    if (teamId === NEW_TEAM_OPTION && newTeamName.trim() && profile) {
      const team = createTeam(newTeamName, profile.id);
      setEventTeam(id, team.id, team.name);
      addEventToTeam(team.id, id);
    } else if (teamId && teams[teamId]) {
      setEventTeam(id, teamId, teams[teamId].name);
      addEventToTeam(teamId, id);
    } else if (organizerGroup.trim()) {
      setOrganizerGroup(id, organizerGroup);
    }
  }

  // Enter in any single-line field (name, location, team name, …) would otherwise submit the
  // form natively and jump the page — asked to require an explicit button click instead.
  // Textarea is exempt: Enter there is just a newline, never a submit trigger to begin with.
  function blockEnterSubmit(keyEvent: KeyboardEvent<HTMLFormElement>) {
    if (
      keyEvent.key === "Enter" &&
      (keyEvent.target as HTMLElement).tagName !== "TEXTAREA"
    ) {
      keyEvent.preventDefault();
    }
  }

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();

    // Weekly create limit (create mode only) — UX gate mirroring the server, which is the real
    // authority and returns a 409 (PLAN_LIMIT) if this is somehow bypassed. Return early so the
    // create request is never even attempted once the rider is at their cap.
    if (ridesLimitReached) {
      setError(weeklyLimitMessage);
      return;
    }

    // Mandatory on create: name, map/route, and date — asked for directly. Edit mode only
    // ever requires a name, same as before: route is never prefilled back in edit (see the
    // Track section's doc comment above), so demanding one there would trap every edit behind
    // re-picking a track it already has.
    // Rules live in src/validation/forms.ts — same rules as before, readable in one place.
    const { ok, errors } = validateCreateEventForm({
      name,
      startsAt,
      hasRoute: copiedRoute != null,
      isEditing,
    });
    setInvalidName(errors.name != null);
    setInvalidStartsAt(errors.startsAt != null);
    setInvalidRoute(errors.route != null);
    if (!ok) {
      setError("Fill in the highlighted fields before saving.");
      return;
    }

    // The Climb field's value, parsed — the ONE effective elevation gain the organizer is
    // publishing for this ride (auto-filled from a GPX import, then freely editable). Sent on
    // the create/edit request itself so the server persists it as the authoritative value
    // (events.elevation_gain_m); `null` when the field is empty — never a fabricated number.
    const parsedClimb = climbM.trim() ? Number(climbM) : Number.NaN;
    const elevationGainM =
      Number.isFinite(parsedClimb) && parsedClimb >= 0 ? parsedClimb : null;

    // Ride plan, all sent on the create/edit request itself so the server persists them
    // (events.duration_min / rest_stops / is_accessible). `null` = not stated. `durationMin` is
    // already whole minutes clamped to the server's bound (lib/ride-duration.ts), so there is
    // nothing to parse or validate here — the picker cannot produce anything else.

    setBusy(true);
    setError(null);
    try {
      if (isEditing && eventId) {
        const updated = await apiRequest<ExistingEvent>(`/events/${eventId}`, {
          method: "PATCH",
          // The frozen PATCH /events/:eventId contract only documents name/location/
          // description — visibility/startsAt are sent too since this form collects them and
          // the server should reasonably accept them; flag in server-tasks.md if it doesn't.
          body: {
            name,
            location: location || undefined,
            area: area || undefined,
            description: description || undefined,
            visibility,
            startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
            requiresApproval,
            showParticipants: ridersListVisible,
            // Same as create: real event columns, updateEventSchema accepts them. Sent so an
            // edited difficulty / activity type reaches every viewer, not just this device.
            activityType,
            ...(level ? { level } : {}),
            // The organizer's effective elevation gain — authoritative, server-persisted,
            // survives logout/login and shows the same on every device. `null` clears it
            // (falls back to the attached route's climb).
            elevationGainM,
            // Ride plan — server columns (sql/022). `null` clears duration / rest stops.
            durationMin,
            restStops,
            isAccessible,
            // Support / sag vehicle (sql/024). Always sent, so unticking it on an edit turns
            // the badge back off rather than leaving the old claim standing.
            hasSupportVehicle
          }
        });
        await saveExtras(eventId);
        // Same id, mutated in place — never a new event. Merge the server's updated fields
        // into the list caches so the card shows the new values without waiting for a refetch;
        // EventDetailPage re-fetches GET /events/:id on arrival for the rest.
        useEventsStore.getState().upsertRide(updated as unknown as EventSummary);
        navigate(`/events/${eventId}`);
        return;
      }

      // The one and only request that creates an event. The server returns it already
      // published, so there is deliberately no follow-up PATCH to /status here: creating is a
      // single step, and the share code is usable the moment this resolves. If a freshly
      // created event ever fails to resolve by its code, that is a server-side inconsistency
      // to report, not something for this page to paper over with a retry or a local
      // "published" guess.
      const created = await apiRequest<EventSummary>("/events", {
        method: "POST",
        body: {
          name,
          // Kind/bib/display-mode are hidden on this form on purpose — see the doc comment
          // above. Still sent, since 07-api-contract.md Part 1 is frozen and requires them;
          // just always the RIDE-only defaults for now.
          type: "RIDE",
          requiresBib: false,
          displayMode: "standard",
          visibility,
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          location: location || undefined,
          area: area || undefined,
          description: description || undefined,
          requiresApproval,
          showParticipants: ridersListVisible,
          // Difficulty + activity type are REAL event columns (sql/010-event-profile.sql) and
          // createEventSchema accepts them — the client just never sent them, so every rider
          // fell back to a device-local copy in eventExtrasStore that only the creator's
          // browser had (and that logout now wipes). Sent here so the card and detail show
          // them for every viewer, on every device, after any relogin. `level` is omitted when
          // the organizer cleared the picker.
          activityType,
          ...(level ? { level } : {}),
          // The initial effective elevation gain — from the imported GPX, or typed by hand, or
          // null when neither. Server persists it as events.elevation_gain_m; every viewer and
          // a post-logout reload then see this exact number.
          elevationGainM,
          // Ride plan — server columns (sql/022). Persisted, so every viewer's card fills its
          // "Est. Time" slot and shows the accessibility marker without a device-local copy.
          durationMin,
          restStops,
          isAccessible,
          // Support / sag vehicle (sql/024), on the create request itself for the same reason.
          hasSupportVehicle,
          // "I'm riding too" — part of THIS request on purpose, never a follow-up call. See
          // the imRiding state's doc comment above. Always sent, so an unticked box is an
          // explicit false and the organizer stays off the start list.
          joinAsRider: imRiding
        }
      });
      // The server's response is the authoritative state for this event — file it into both
      // My Rides and the IndexedDB cache before anything else, so the home screen and an
      // offline reopen both see the real event (status included) without waiting for a
      // refetch.
      useEventsStore.getState().upsertRide(created);
      // The POST /events reply is a full EventDetail (owner, isOwner, myParticipant, capacity).
      // Cache it as the detail too — not just the list summary — so opening the new event
      // paints it immediately as the owner's own event, before any refetch.
      void putCachedEventDetail(created.id, viewerKey(profile?.id), created as unknown as EventDetail);
      await saveExtras(created.id);
      setLastDefaults({
        location,
        area,
        activityType,
        level,
        teamId: teamId === NEW_TEAM_OPTION ? "" : teamId,
        organizerGroup,
        visibility,
        requiresApproval,
        ridersListVisible,
        durationMin,
        restStops,
        isAccessible,
        hasSupportVehicle
      });
      // Small delayed success state before redirecting home: requested as a short green
      // confirmation moment, not an instant route jump right after tapping Save.
      setCreateSuccess(true);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1500);
      });
      // Land back on the home screen instead of the new event's own page — asked for
      // directly. The event id/name ride along in router state so the home screen can point
      // straight at it (a banner linking to it) instead of making the organizer hunt for it
      // in the list.
      navigate("/", {
        state: { createdEventId: created.id, createdEventName: name }
      });
    } catch (err) {
      // A 409 naming the weekly plan limit (PLAN_LIMIT / a "week" token) → show the same
      // friendly message the pre-submit gate uses, not the raw server string.
      const weekLimit409 =
        err instanceof ApiError &&
        err.status === 409 &&
        /PLAN_LIMIT|week/i.test(`${err.code ?? ""} ${err.message}`);
      setError(
        weekLimit409
          ? weeklyLimitMessage
          : err instanceof ApiError
            ? err.message
            : "Could not save. Try again."
      );
      setCreateSuccess(false);
    } finally {
      setBusy(false);
    }
  }

  // Danger Zone — "ride that i create and didnt start i can delete... are you sure and delete
  // it will remove from db so other riser at next pull will delete," asked for directly. Real
  // DELETE /events/:eventId (same endpoint EventDetailPage.tsx's "Cancel event" already uses)
  // — the server marks it cancelled, which is is_active = false per
  // 02-database-schema.md, so it stops surfacing in anyone's list on their next fetch, same
  // practical effect as being gone. Inline confirm (`confirmDelete`), not window.confirm — same
  // "not just simple alert" rule this page and EventDetailPage's go-live/finish already follow.
  async function deleteEvent() {
    if (!eventId) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await apiRequest(`/events/${eventId}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete this event."
      );
      setConfirmDelete(false);
    } finally {
      setDeleteBusy(false);
    }
  }

  // Redirect above already sends live/finished events away before this component keeps
  // rendering, so in practice this just excludes cancelled (nothing left to delete twice).
  const canDelete =
    isEditing &&
    eventStatus != null &&
    eventStatus !== "live" &&
    eventStatus !== "finished" &&
    eventStatus !== "cancelled";

  return (
    <section className={styles.page}>
      <div className={styles.deck}>
        <header className={styles.header}>
          <div className={styles.headerIcon}>
            {(() => {
              const TerrainIcon = SURFACE_TYPE_ICON[activityType];
              return <TerrainIcon aria-hidden="true" />;
            })()}
          </div>
          <div>
            <h1 className={styles.title}>
              {isEditing ? "Manage Ride" : "Create new event"}
            </h1>
            <p className={styles.subtitle}>
              {isEditing
                ? "Change anything, then save."
                : "Set the ride plan — riders join with your code."}
            </p>
          </div>
        </header>

        {!isEditing && hasRidesUsage && (
          <p
            className={styles.hint}
            role="status"
            style={{ margin: "0 0 var(--space-2)" }}
            data-at-limit={ridesLimitReached}
          >
            {ridesUsed} / {ridesMax} rides used this week
          </p>
        )}

        {ridesLimitReached && (
          <div className={styles.errorBanner} role="alert">
            <AlertTriangle aria-hidden="true" />
            <p>{weeklyLimitMessage}</p>
          </div>
        )}

        <div className={styles.readiness}>
          <div className={styles.readinessTrack}>
            <div
              className={styles.readinessFill}
              data-armed={armed}
              style={{ width: `${readinessPct}%` }}
            />
          </div>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertTriangle aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}

        {createSuccess && (
          <div
            className={styles.successBanner}
            role="status"
            aria-live="polite"
          >
            <Check aria-hidden="true" />
            <p>Event created successfully.</p>
          </div>
        )}

        {loadingEvent && (
          <p className={styles.hint}>
            <span
              className="spinner"
              aria-hidden="true"
              style={{ marginRight: 6 }}
            />
            Loading event…
          </p>
        )}

        <form onSubmit={submit} onKeyDown={blockEnterSubmit}>
          <fieldset
            className={styles.panel}
            style={{ border: "none", marginBottom: "var(--space-4)" }}
          >
            <legend className={styles.fieldLabel} style={{ marginBottom: 4 }}>
              <Compass aria-hidden="true" />
              Terrain
            </legend>
            <div className={`${styles.chipGroup} ${styles.chipGroupRow}`}>
              {ACTIVITY_TYPES.map((activity) => (
                <label key={activity.value} className={styles.chip}>
                  <input
                    type="radio"
                    name="activityType"
                    className={styles.chipInput}
                    checked={activityType === activity.value}
                    onChange={() => setActivityType(activity.value)}
                  />
                  {activity.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div
            className={styles.field}
            style={{ marginBottom: "var(--space-4)" }}
          >
            <label className={styles.fieldLabel} htmlFor="name">
              <Target aria-hidden="true" />
              Event name
            </label>
            <input
              id="name"
              className={`${styles.input} ${invalidName ? styles.inputInvalid : ""}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setInvalidName(false);
              }}
              placeholder="e.g. Saturday ride"
              required
            />
          </div>

          <fieldset
            className={styles.routeFieldset}
            data-invalid={invalidRoute}
          >
            {copiedFrom || uploadedFileName ? (
              <div className={styles.trackPicked}>
                <div>
                  <div className={styles.trackPickedName}>
                    {copiedFrom
                      ? `Copied from ${copiedFrom.name}`
                      : `Uploaded ${uploadedFileName}`}
                  </div>
                  <div className={styles.trackPickedMeta}>
                    {copyLoading
                      ? "Loading route…"
                      : copiedRoute &&
                        `${copiedRoute.distanceKm} km${copiedRoute.elevationM != null ? ` · ${copiedRoute.elevationM} m climb` : ""}${uploadedRestStops.length > 0 ? ` · ${uploadedRestStops.length} rest stop${uploadedRestStops.length === 1 ? "" : "s"}` : ""}`}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.trackRemove}
                  onClick={clearCopiedTrack}
                  aria-label="Remove track"
                >
                  Remove
                </button>
              </div>
            ) : null}
            {copiedRoute && (
              <div className={styles.mapFrame}>
                <Suspense
                  fallback={
                    <div className={styles.mapLoading}>Scanning route…</div>
                  }
                >
                  <RouteMap
                    points={copiedRoute.points}
                    heightPx={160}
                    restStops={uploadedRestStops}
                  />
                </Suspense>
              </div>
            )}
            {/* Two ways to get a track, side by side and deliberately NOT equal in weight.
                They used to be one button ("Select map or upload track file") that opened a
                sheet where the choice was actually made — which put the path almost nobody can
                use (having a Garmin GPX file to hand) in front of the path almost everybody
                needs. Now the browser is the big one, and uploading is a small, honest button
                next to it for the riders who do have a file. */}
            {!copiedFrom && !uploadedFileName && (
              <div className={styles.trackChoices}>
                <TrackUploadButton
                  onUploadRoute={handleUploadRoute}
                  className={styles.trackUploadBtn}
                >
                  <Upload aria-hidden="true" size={18} className={styles.trackBtnIcon} />
                  <span className={styles.trackUploadLabel}>Upload track</span>
                  <span className={styles.trackUploadHint}>GPX or CSV</span>
                </TrackUploadButton>

                <button
                  type="button"
                  className={styles.trackBrowseBtn}
                  onClick={() => setGalleryOpen(true)}
                >
                  {/* A drawn route rather than an icon: this button's whole job is to say
                      "there are maps behind here", and a generic pin does not. */}
                  <svg
                    className={styles.trackBrowsePreview}
                    viewBox="0 0 120 52"
                    aria-hidden="true"
                  >
                    <polyline
                      className={styles.trackBrowsePreviewLine}
                      points="8,42 24,20 40,30 58,10 76,26 94,16 112,34"
                    />
                    <circle className={styles.trackBrowsePreviewStart} cx="8" cy="42" r="4" />
                    <circle className={styles.trackBrowsePreviewEnd} cx="112" cy="34" r="4" />
                  </svg>
                  <span className={styles.trackBrowseLabel}>Browse tracks</span>
                  <span className={styles.trackBrowseHint}>From rides people have ridden</span>
                </button>
              </div>
            )}
          </fieldset>

          <div className={styles.grid}>
            <div className={styles.colMain}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="team">
                  <Users aria-hidden="true" />
                  Squad / team (optional)
                </label>
                {/* A dropdown, not a row of chips — asked for directly: "no team"/"new team"
                    as chips wasn't clear, and a chip row doesn't scale once an organizer
                    belongs to several teams. Every choice (none / each team / start a new one)
                    lives in the one list. */}
                <div className={styles.teamRow}>
                  <select
                    id="team"
                    className={`${styles.input} ${styles.teamRowInput}`}
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                  >
                    <option value="">No team</option>
                    {myTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                    <option value={NEW_TEAM_OPTION}>+ Start a new team…</option>
                  </select>
                  {teamId === NEW_TEAM_OPTION && (
                    <>
                      <input
                        className={`${styles.input} ${styles.teamRowInput}`}
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="New team name"
                        required
                      />
                      <button
                        type="button"
                        className={styles.trackBtn}
                        onClick={saveNewTeam}
                        disabled={!newTeamName.trim()}
                      >
                        <Check aria-hidden="true" size={14} />
                        Save team
                      </button>
                    </>
                  )}
                  {!teamId && (
                    <input
                      className={`${styles.input} ${styles.teamRowInput}`}
                      value={organizerGroup}
                      onChange={(e) => setOrganizerGroupInput(e.target.value)}
                      placeholder="Or just a name, e.g. Galilee Cycling Club"
                    />
                  )}
                </div>
              </div>

              {/* "Am I also riding?" — asked for directly. Create-only: re-asking on every edit
                  save would risk adding a duplicate roster row each time. Checking it sends
                  joinAsRider on the create request, so the server puts the organizer on the
                  start list linked to their own account. */}
              {!isEditing && (
                <div className={styles.field}>
                  <label className={styles.switchRow}>
                    <input
                      type="checkbox"
                      className={styles.switchInput}
                      checked={imRiding}
                      onChange={(e) => setImRiding(e.target.checked)}
                    />
                    <span className={styles.switchTrack}>
                      <span className={styles.switchThumb} />
                    </span>
                    <span
                      className={`${styles.switchState} ${imRiding ? styles.switchStateOn : ""}`}
                    >
                      {imRiding ? "Yes" : "No"}
                    </span>
                    <span className={styles.switchLabel}>
                      <Bike aria-hidden="true" />
                      I'm riding too
                    </span>
                  </label>
                  {imRiding && (
                    <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>
                      {riderDisplayName
                        ? `You'll appear on the start list as "${riderDisplayName}".`
                        : "You'll appear on the start list under your account name."}{" "}
                      <Link to="/account">Change it in your account.</Link>
                    </p>
                  )}
                </div>
              )}

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="location">
                    <MapPin aria-hidden="true" />
                    Meeting At
                  </label>
                  <input
                    id="location"
                    className={styles.input}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="startsAt">
                    <Clock aria-hidden="true" />
                    Date/time
                  </label>
                  <input
                    id="startsAt"
                    type="datetime-local"
                    className={`${styles.input} ${invalidStartsAt ? styles.inputInvalid : ""}`}
                    value={startsAt}
                    onChange={(e) => {
                      setStartsAt(e.target.value);
                      setStartsAtEdited(true);
                      setDateHint(null);
                      if (e.target.value) setInvalidStartsAt(false);
                    }}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="area">
                  <MapPin aria-hidden="true" />
                  Area
                </label>
                <input
                  id="area"
                  className={styles.input}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="description">
                  <FileText aria-hidden="true" />
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  className={styles.textarea}
                  placeholder={
                    'e.g. "2 groups: strong 50km, weak 20km, next Saturday"'
                  }
                  value={description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                />
                {dateHint && (
                  <p className={`${styles.hint} ${styles["hint--active"]}`}>
                    {dateHint}
                  </p>
                )}
              </div>
            </div>

            <div className={styles.colSide}>
              <div className={styles.field}>
                <span className={styles.fieldLabel} id="levelLabel">
                  <Gauge aria-hidden="true" />
                  Difficulty class
                </span>
                {/* Signal-bars picker, not a dropdown — asked for directly: short stair-step
                    bars like a phone's cellular reception icon, colored like a storm-intensity
                    map (green → purple) as the level climbs toward World Tour. Only one bar
                    lights up at a time — the picked level, not a cumulative fill — with its
                    name written out to the right, large; tapping the already-lit bar again
                    clears back to "not specified," same escape hatch the old dropdown's blank
                    option gave. */}
                <div className={styles.levelRow}>
                  <div
                    className={styles.levelBars}
                    role="group"
                    aria-labelledby="levelLabel"
                  >
                    {LEVELS.map((l, i) => (
                      <button
                        key={l.value}
                        type="button"
                        aria-pressed={level === l.value}
                        aria-label={l.label}
                        title={l.label}
                        className={styles.levelBar}
                        data-level={l.value}
                        data-filled={level === l.value}
                        style={{ height: `${10 + i * 6}px` }}
                        onClick={() =>
                          setLevel(level === l.value ? null : l.value)
                        }
                      />
                    ))}
                  </div>
                  <span
                    className={styles.levelName}
                    data-level={level ?? undefined}
                  >
                    {level ? (
                      <>
                        {(() => {
                          const LevelIcon = LEVEL_ICON[level];
                          return <LevelIcon aria-hidden="true" size={16} />;
                        })()}
                        {LEVEL_LABEL[level]}
                      </>
                    ) : (
                      "Not specified"
                    )}
                  </span>
                </div>
              </div>

              {/* Distance/climb, near the difficulty picker above — auto-filled from whatever
                  route gets picked/uploaded (see applyRouteDistanceClimb), editable by hand at
                  any time — a route doesn't always carry real elevation, and this is the
                  fallback for that ("track length + climb shown on cards near difficulty,
                  editable at create if missing," asked for directly). */}
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="distanceKm">
                    <Ruler aria-hidden="true" />
                    Distance (km)
                  </label>
                  <input
                    id="distanceKm"
                    type="number"
                    min="0"
                    step="0.1"
                    className={styles.input}
                    value={distanceKm}
                    onChange={(e) => {
                      setDistanceKmInput(e.target.value);
                      setDistanceEdited(true);
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="climbM">
                    <Mountain aria-hidden="true" />
                    Climb (m)
                  </label>
                  <input
                    id="climbM"
                    type="number"
                    min="0"
                    step="1"
                    className={styles.input}
                    value={climbM}
                    onChange={(e) => {
                      setClimbMInput(e.target.value);
                      setClimbEdited(true);
                    }}
                  />
                </div>
              </div>

              {/* Ride plan — how long the ride runs and how many rest/regroup stops it has.
                  Shown in the card / detail "Est. Time" slot. Never derived from distance.

                  DURATION, not a start time: how long the group expects to be out, which is a
                  different field from startsAt above and must never be confused with it. Hence
                  "Ride duration", the hours/minutes units printed inside the options, and the
                  "How long the ride takes" hint under the control.

                  Two dropdowns rather than the free-text box + four preset chips this replaced.
                  The old box asked the organizer to type "1", "1.5" or "2:45" and guess what
                  the app would make of it — a bare "1" silently meant an hour, "90" meant
                  ninety HOURS, and anything it could not read raised an error message under a
                  field that had looked fine while typing. On a phone it also opened a keyboard
                  for what is a choice from a short list. A native <select> is a scroll wheel on
                  iOS and Android: thumb-sized targets, no keyboard, nothing unparseable to
                  type, and the value is whole minutes at every moment (lib/ride-duration.ts) so
                  there is no parse step left to fail.

                  Both halves carry a "—" option because "not stated" is a real, common answer
                  for this field and has to stay reachable after a value has been picked. */}
              <div className={styles.ridePlanRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="durationHours">
                    <Timer aria-hidden="true" />
                    Ride duration
                  </label>
                  {(() => {
                    const { hours, mins } = splitDuration(durationMin);
                    // A duration saved before this picker existed (the old free-text field
                    // accepted any minute) can land off the 5-minute grid. Its exact value is
                    // added to the list rather than snapped, so opening Edit and saving again
                    // cannot silently change a ride the organizer never touched.
                    const minuteOptions = DURATION_MINUTE_OPTIONS.includes(mins ?? 0)
                      ? DURATION_MINUTE_OPTIONS
                      : [...DURATION_MINUTE_OPTIONS, mins as number].sort((a, b) => a - b);
                    return (
                      <div className={styles.duration}>
                        <select
                          id="durationHours"
                          className={`${styles.input} ${styles.durationSelect}`}
                          aria-label="Ride duration — hours"
                          value={hours ?? ""}
                          onChange={(e) => {
                            const next = e.target.value === "" ? null : Number(e.target.value);
                            setDurationMin(joinDuration(next, mins));
                            setDurationEdited(true);
                          }}
                        >
                          <option value="">— h</option>
                          {DURATION_HOUR_OPTIONS.map((h) => (
                            <option key={h} value={h}>
                              {h} h
                            </option>
                          ))}
                        </select>
                        <select
                          className={`${styles.input} ${styles.durationSelect}`}
                          aria-label="Ride duration — minutes"
                          value={mins ?? ""}
                          onChange={(e) => {
                            const next = e.target.value === "" ? null : Number(e.target.value);
                            setDurationMin(joinDuration(hours, next));
                            setDurationEdited(true);
                          }}
                        >
                          <option value="">— m</option>
                          {minuteOptions.map((m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, "0")} m
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                  {/* Reads back the stored value in the same words the ride card and the
                      detail page will use, so what the organizer picked and what riders will
                      read are visibly the same thing. */}
                  <p className={styles.hint}>
                    {durationMin == null
                      ? "How long the ride takes. Optional."
                      : `Riders will see “${formatDuration(durationMin)}”.`}
                  </p>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="restStops">
                    <Coffee aria-hidden="true" />
                    Rest stops
                  </label>
                  <input
                    id="restStops"
                    type="number"
                    min="0"
                    max="20"
                    step="1"
                    className={styles.input}
                    value={restStops ?? ""}
                    placeholder="none"
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (!v) {
                        setRestStops(null);
                        return;
                      }
                      const n = Math.max(0, Math.min(20, Math.round(Number(v))));
                      setRestStops(Number.isFinite(n) ? n : null);
                    }}
                  />
                </div>
              </div>

              <fieldset className={styles.panel} style={{ border: "none" }}>
                <legend
                  className={styles.fieldLabel}
                  style={{ marginBottom: 4 }}
                >
                  <Radio aria-hidden="true" />
                  Visibility
                </legend>
                <div className={styles.comms}>
                  <button
                    type="button"
                    className={styles.commsOption}
                    data-active={visibility === "private"}
                    onClick={() => setVisibility("private")}
                  >
                    <Lock aria-hidden="true" />
                    Private
                  </button>
                  <button
                    type="button"
                    className={styles.commsOption}
                    data-tone="broadcast"
                    data-active={visibility === "public"}
                    onClick={() => setVisibility("public")}
                  >
                    <Radio aria-hidden="true" />
                    Public
                  </button>
                </div>
                <label className={styles.switchRow}>
                  <input
                    type="checkbox"
                    className={styles.switchInput}
                    checked={requiresApproval}
                    onChange={(e) => setRequiresApproval(e.target.checked)}
                  />
                  <span className={styles.switchTrack}>
                    <span className={styles.switchThumb} />
                  </span>
                  <span
                    className={`${styles.switchState} ${requiresApproval ? styles.switchStateOn : ""}`}
                  >
                    {requiresApproval ? "Yes" : "No"}
                  </span>
                  <span className={styles.switchLabel}>
                    <ShieldCheck aria-hidden="true" />
                    {visibility === "public"
                      ? "Approve riders before they join"
                      : "Approve invites too"}
                  </span>
                </label>
                <label className={styles.switchRow}>
                  <input
                    type="checkbox"
                    className={styles.switchInput}
                    checked={ridersListVisible}
                    onChange={(e) => setRidersListVisible(e.target.checked)}
                  />
                  <span
                    className={`${styles.switchTrack} ${styles.switchTrackPositive}`}
                  >
                    <span className={styles.switchThumb} />
                  </span>
                  <span
                    className={`${styles.switchState} ${ridersListVisible ? styles.switchStateOnPositive : ""}`}
                  >
                    {ridersListVisible ? "Yes" : "No"}
                  </span>
                  <span className={styles.switchLabel}>
                    <Eye aria-hidden="true" />
                    Riders list visible
                  </span>
                </label>
                {/* Accessibility marker — the organizer's claim that the ride is planned for
                    riders who need assistance or adaptive equipment. A browsing rider who needs
                    that sees it as a chip on the card / detail. */}
                <label className={styles.switchRow}>
                  <input
                    type="checkbox"
                    className={styles.switchInput}
                    checked={isAccessible}
                    onChange={(e) => setIsAccessible(e.target.checked)}
                  />
                  <span
                    className={`${styles.switchTrack} ${styles.switchTrackPositive}`}
                  >
                    <span className={styles.switchThumb} />
                  </span>
                  <span
                    className={`${styles.switchState} ${isAccessible ? styles.switchStateOnPositive : ""}`}
                  >
                    {isAccessible ? "Yes" : "No"}
                  </span>
                  <span className={styles.switchLabel}>
                    <Accessibility aria-hidden="true" />
                    Suitable for riders who need assistance
                  </span>
                </label>
                {/* Support / sag vehicle (sql/024) — a vehicle following the group that can
                    pick up a rider who punctures out, cracks or gets hurt. Optional, off by
                    default, and the same switch shape as the accessibility marker above
                    because it is the same kind of thing: a claim only the organizer can make,
                    which a rider then plans a long or remote ride around. Off therefore means
                    "none promised", never "unknown" — see sql/024-event-support-vehicle.sql. */}
                <label className={styles.switchRow}>
                  <input
                    type="checkbox"
                    className={styles.switchInput}
                    checked={hasSupportVehicle}
                    onChange={(e) => setHasSupportVehicle(e.target.checked)}
                  />
                  <span
                    className={`${styles.switchTrack} ${styles.switchTrackPositive}`}
                  >
                    <span className={styles.switchThumb} />
                  </span>
                  <span
                    className={`${styles.switchState} ${hasSupportVehicle ? styles.switchStateOnPositive : ""}`}
                  >
                    {hasSupportVehicle ? "Yes" : "No"}
                  </span>
                  <span className={styles.switchLabel}>
                    <Truck aria-hidden="true" />
                    Support vehicle
                  </span>
                </label>
              </fieldset>
            </div>
          </div>

          {/* Safety checklist — a small link, opens a sheet with the basic pre-ride kit. Not a
              form field: it disturbs nothing, it's just there for the organizer (and shown
              again on the event page for riders). */}
          <button
            type="button"
            className={styles.safetyLink}
            onClick={() => setSafetyOpen(true)}
          >
            <LifeBuoy aria-hidden="true" size={15} />
            Safety checklist
          </button>

          {/* Event cover — disabled for now. The event automatically uses the organizer's own
              profile cover photo (see app/useOwnerCover.ts / eventCoverBackground), so there is
              nothing to upload here yet. Kept visible, greyed out, so the slot is familiar when
              custom covers ship. */}
          <div className={styles.field} aria-disabled="true">
            <span className={styles.fieldLabel}>
              <ImagePlus aria-hidden="true" />
              Event cover
            </span>
            <button type="button" className={styles.trackBtn} disabled>
              <span className={styles.trackBtnLabel}>
                <ImagePlus aria-hidden="true" size={18} className={styles.trackBtnIcon} />
                Upload cover image — coming soon
              </span>
            </button>
            <p className={styles.hint}>
              Your profile cover photo is used automatically. Custom event covers coming soon.
            </p>
          </div>

          <button
            className={styles.launchBtn}
            type="submit"
            disabled={busy || createSuccess || ridesLimitReached}
          >
            <Bike aria-hidden="true" />
            {createSuccess
              ? "Saved"
              : busy
                ? "Saving…"
                : ridesLimitReached
                  ? "Weekly ride limit reached"
                  : "Save event"}
          </button>
        </form>

        {canDelete && (
          <div className={styles.dangerZone}>
            <div className={styles.dangerZoneHeader}>
              <AlertTriangle aria-hidden="true" />
              Danger zone
            </div>
            {!confirmDelete ? (
              <button
                type="button"
                className={styles.dangerZoneBtn}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden="true" size={15} />
                Delete this event
              </button>
            ) : (
              <div className={styles.dangerZoneConfirm}>
                <p>
                  Are you sure? This removes it for every rider — it stops
                  showing up anywhere the next time anyone's app checks.
                </p>
                <div className={styles.dangerZoneConfirmRow}>
                  <button
                    type="button"
                    className={styles.dangerZoneBtn}
                    disabled={deleteBusy}
                    onClick={deleteEvent}
                  >
                    {deleteBusy ? "Deleting…" : "Yes, delete it"}
                  </button>
                  <button
                    type="button"
                    className="button button--quiet"
                    disabled={deleteBusy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Boundaried: a crash in the gallery must not take the half-filled ride form
            with it, and on a phone the error text rendered here is the only diagnostic
            that can ever come back — there is no console to open. */}
        {galleryOpen && (
          <ErrorBoundary
            title="The track browser hit a problem"
            onDismiss={() => setGalleryOpen(false)}
          >
            <TrackGallerySheet onPick={pickEventToCopy} onClose={() => setGalleryOpen(false)} />
          </ErrorBoundary>
        )}

        {safetyOpen && <SafetySheet onClose={() => setSafetyOpen(false)} />}
      </div>
    </section>
  );
}

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
 * Activity type (Road/MTB/Gravel/Running/Hiking, matching Find Tracks' SurfaceType) is
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
 * "Copy track from an existing event" (below the activity-type picker) is the same story:
 * picks any of the rider's own or other public events, shows its mock route (via
 * lib/mock-results.ts's getEventResults — the same stand-in EventDetailPage uses, so every
 * event already "has" a route to copy) as a live map preview (RouteMap, lazy-loaded), not just
 * distance/climb text, and goes no further than that. There is no `event_routes` attach
 * endpoint yet (plan/08-routes-and-maps.md has the table design, not built) so the picked
 * route is never sent in the POST body either. Uploading your own track file (GPX/TCX/Garmin
 * export, or points from a spreadsheet) is a distinct, bigger feature — deliberately not built
 * here, see plan/server-tasks.md Part C.
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
 * Visuals: cockpit-HUD skin ("F-35 pilot view," black field, neon pink/blue/fluorescent-green
 * glow — asked for directly), scoped to EventCreatePage.module.css's `.page` wrapper only, so
 * every other screen keeps the app's normal light/dark theme. The readiness meter below the
 * header is a dopamine touch, not a validation gate — the submit button's disabled rule is
 * still just `name` non-empty, same as before this pass.
 */

import {
  AlertTriangle,
  Bike,
  Check,
  Clock,
  Compass,
  Eye,
  FileText,
  Gauge,
  Lock,
  Map as MapIcon,
  MapPin,
  Radio,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CopyTrackSheet, type UploadedTrack } from "../app/CopyTrackSheet";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { type EventSummary, getCachedEvent } from "../lib/local-db";
import { type EventRoute, getEventResults } from "../lib/mock-results";
import { SURFACE_TYPE_ICON, type SurfaceType } from "../lib/mock-tracks";
import { parseQuickAdd, toDatetimeLocalValue } from "../lib/quick-add-parser";
import {
  LEVEL_ICON,
  LEVEL_LABEL,
  LEVELS,
  type RiderLevel,
} from "../lib/rider-level";
import { useEventExtrasStore } from "../store/eventExtrasStore";
import { useLastEventDefaultsStore } from "../store/lastEventDefaultsStore";
import { useTeamsStore } from "../store/teamsStore";
import styles from "./EventCreatePage.module.css";

const RouteMap = lazy(() => import("../app/RouteMap"));

interface CreatedEvent {
  id: string;
}

interface ExistingEvent {
  id: string;
  name: string;
  status: string;
  visibility: "public" | "private";
  startsAt: string | null;
  location: string | null;
  description: string | null;
  requiresApproval: boolean;
  showParticipants: boolean;
}

const ACTIVITY_TYPES: { value: SurfaceType; label: string }[] = [
  { value: "road", label: "Road" },
  { value: "mtb", label: "MTB" },
  { value: "gravel", label: "Gravel" },
  { value: "running", label: "Running" },
  { value: "hiking", label: "Hiking" },
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
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);
  const teams = useTeamsStore((s) => s.teams);
  const createTeam = useTeamsStore((s) => s.createTeam);
  const addEventToTeam = useTeamsStore((s) => s.addEventToTeam);
  const setLastDefaults = useLastEventDefaultsStore((s) => s.setDefaults);

  const myTeams = Object.values(teams).filter(
    (t) => profile != null && t.createdBy === profile.id,
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
    lastDefaults?.activityType ?? "mtb",
  );
  const [level, setLevel] = useState<RiderLevel | null>(
    lastDefaults?.level ?? "intermediate",
  );
  const [teamId, setTeamId] = useState<string>(initialTeamId);
  const [newTeamName, setNewTeamName] = useState("");
  const [organizerGroup, setOrganizerGroupInput] = useState(
    !initialTeamId ? (lastDefaults?.organizerGroup ?? "") : "",
  );
  const [requiresApproval, setRequiresApproval] = useState(
    lastDefaults?.requiresApproval ?? false,
  );
  const [ridersListVisible, setRidersListVisible] = useState(
    lastDefaults?.ridersListVisible ?? true,
  );
  const [visibility, setVisibility] = useState<"public" | "private">(
    lastDefaults?.visibility ?? "private",
  );
  const [startsAt, setStartsAt] = useState("");
  const [startsAtEdited, setStartsAtEdited] = useState(false);
  const [dateHint, setDateHint] = useState<string | null>(null);
  const [location, setLocation] = useState(lastDefaults?.location ?? "");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mandatory-on-create fields (name/map/date) — asked for directly. Clicking Save with any
  // of these unfilled shows a red border instead of blocking the click outright; typing in
  // that field (or picking a route) clears its flag right away, not just on next submit.
  const [invalidName, setInvalidName] = useState(false);
  const [invalidStartsAt, setInvalidStartsAt] = useState(false);
  const [invalidRoute, setInvalidRoute] = useState(false);

  const [copySheetOpen, setCopySheetOpen] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<EventSummary | null>(null);
  const [copiedRoute, setCopiedRoute] = useState<EventRoute | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedRestStops, setUploadedRestStops] = useState<
    [number, number][]
  >([]);

  const [loadingEvent, setLoadingEvent] = useState(isEditing);

  // Edit mode — load the existing event + its client-only extras and prefill every field,
  // "edit event take us to like the create so i change anything." Route/track is
  // deliberately not prefilled: it was never persisted anywhere on create either (see the
  // Track section's doc comment above), so there's nothing real to show back.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoadingEvent(true);
    (async () => {
      const cached = await getCachedEvent(eventId);
      if (cached && !cancelled) {
        setName(cached.name);
        setLocation(cached.location ?? "");
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
                  : "This event has finished and can no longer be edited.",
            },
          });
          return;
        }
        setName(found.name);
        setLocation(found.location ?? "");
        setDescription(found.description ?? "");
        setVisibility(found.visibility);
        if (found.startsAt)
          setStartsAt(toDatetimeLocalValue(new Date(found.startsAt)));
        setRequiresApproval(found.requiresApproval);
        setRidersListVisible(found.showParticipants);
      } catch {
        // Cached summary (if any) is already on screen — a failed refresh isn't fatal here.
      } finally {
        if (!cancelled) setLoadingEvent(false);
      }

      // Read imperatively (not the reactive `extrasByEvent` above): this must stay out of
      // the effect's dependency array, see comment below.
      const existingExtras = useEventExtrasStore.getState().byEvent[eventId];
      if (existingExtras && !cancelled) {
        if (existingExtras.level) setLevel(existingExtras.level);
        if (existingExtras.activityType)
          setActivityType(existingExtras.activityType);
        if (existingExtras.teamId) setTeamId(existingExtras.teamId);
        else if (existingExtras.organizerGroup)
          setOrganizerGroupInput(existingExtras.organizerGroup);
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
    startsAt,
    description.trim(),
    copiedFrom || uploadedFileName ? "route" : "",
  ];
  const readinessCount = readinessFields.filter(Boolean).length;
  const readinessPct = Math.round(
    (readinessCount / readinessFields.length) * 100,
  );
  const armed = readinessPct === 100;

  async function pickEventToCopy(event: EventSummary) {
    setCopiedFrom(event);
    setUploadedFileName(null);
    setUploadedRestStops([]);
    setCopySheetOpen(false);
    setCopyLoading(true);
    setInvalidRoute(false);

    // "Copy all elements except the date" — everything about the source event carries over
    // except startsAt, which stays whatever the organizer already set (or leaves blank to set
    // next). Only fills in fields still at their default, so it never clobbers something typed
    // in by hand before picking a track.
    if (!location.trim()) setLocation(event.location ?? "");
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
      const results = await getEventResults(event.id);
      setCopiedRoute(results.route);
    } finally {
      setCopyLoading(false);
    }
  }

  function clearCopiedTrack() {
    setCopiedFrom(null);
    setCopiedRoute(null);
    setUploadedFileName(null);
    setUploadedRestStops([]);
  }

  function handleUploadRoute(uploaded: UploadedTrack) {
    setCopiedFrom(null);
    setCopyLoading(false);
    setCopySheetOpen(false);
    setCopiedRoute(uploaded.route);
    setUploadedFileName(uploaded.fileName);
    setUploadedRestStops(uploaded.restStops);
    setInvalidRoute(false);
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
        .slice(0, 5)}. Edit Start time above to change it.`,
    );
  }

  // Creates the team right away instead of waiting for the whole event to save — asked for
  // directly. Switches the dropdown over to the real team the moment it exists, same as
  // picking any other team, so "New team name" and its Save button both disappear.
  function saveNewTeam() {
    if (!newTeamName.trim() || !profile) return;
    const team = createTeam(newTeamName, profile.id);
    setTeamId(team.id);
    setNewTeamName("");
  }

  function saveExtras(id: string) {
    if (level) setEventLevel(id, level);
    setEventActivityType(id, activityType);

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

    // Mandatory on create: name, map/route, and date — asked for directly. Edit mode only
    // ever requires a name, same as before: route is never prefilled back in edit (see the
    // Track section's doc comment above), so demanding one there would trap every edit behind
    // re-picking a track it already has.
    const missingName = name.trim().length === 0;
    const missingStartsAt = !isEditing && startsAt.trim().length === 0;
    const missingRoute = !isEditing && !copiedFrom && !uploadedFileName;
    setInvalidName(missingName);
    setInvalidStartsAt(missingStartsAt);
    setInvalidRoute(missingRoute);
    if (missingName || missingStartsAt || missingRoute) {
      setError("Fill in the highlighted fields before saving.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (isEditing && eventId) {
        await apiRequest<ExistingEvent>(`/events/${eventId}`, {
          method: "PATCH",
          // The frozen PATCH /events/:eventId contract only documents name/location/
          // description — visibility/startsAt are sent too since this form collects them and
          // the server should reasonably accept them; flag in server-tasks.md if it doesn't.
          body: {
            name,
            location: location || undefined,
            description: description || undefined,
            visibility,
            startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
            requiresApproval,
            showParticipants: ridersListVisible,
          },
        });
        saveExtras(eventId);
        navigate(`/events/${eventId}`);
        return;
      }

      const created = await apiRequest<CreatedEvent>("/events", {
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
          description: description || undefined,
          requiresApproval,
          showParticipants: ridersListVisible,
        },
      });
      saveExtras(created.id);
      setLastDefaults({
        location,
        activityType,
        level,
        teamId: teamId === NEW_TEAM_OPTION ? "" : teamId,
        organizerGroup,
        visibility,
        requiresApproval,
        ridersListVisible,
      });
      // Land back on the home screen instead of the new event's own page — asked for
      // directly. The event id/name ride along in router state so the home screen can point
      // straight at it (a banner linking to it) instead of making the organizer hunt for it
      // in the list.
      navigate("/", {
        state: { createdEventId: created.id, createdEventName: name },
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.cockpit}>
        <span
          className={`${styles.corner} ${styles.cornerTl}`}
          aria-hidden="true"
        />
        <span
          className={`${styles.corner} ${styles.cornerTr}`}
          aria-hidden="true"
        />
        <span
          className={`${styles.corner} ${styles.cornerBl}`}
          aria-hidden="true"
        />
        <span
          className={`${styles.corner} ${styles.cornerBr}`}
          aria-hidden="true"
        />

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
            <div>
              <strong>MISSION ABORT</strong>
              <p>{error}</p>
            </div>
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
            {!copiedFrom && !uploadedFileName && (
              <button
                type="button"
                className={styles.trackBtn}
                onClick={() => setCopySheetOpen(true)}
              >
                <MapIcon
                  aria-hidden="true"
                  size={16}
                  className={styles.trackBtnIcon}
                />
                Select map or upload track file
                <MapIcon
                  aria-hidden="true"
                  size={16}
                  className={styles.trackBtnIconPink}
                />
              </button>
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

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="location">
                    <MapPin aria-hidden="true" />
                    Location
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
                <label className={styles.fieldLabel} htmlFor="description">
                  <FileText aria-hidden="true" />
                  Mission brief
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
                    role="radiogroup"
                    aria-labelledby="levelLabel"
                  >
                    {LEVELS.map((l, i) => (
                      <button
                        key={l.value}
                        type="button"
                        role="radio"
                        aria-checked={level === l.value}
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

              <fieldset className={styles.panel} style={{ border: "none" }}>
                <legend
                  className={styles.fieldLabel}
                  style={{ marginBottom: 4 }}
                >
                  <Radio aria-hidden="true" />
                  Comms channel
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
              </fieldset>
            </div>
          </div>

          <button className={styles.launchBtn} type="submit" disabled={busy}>
            <Bike aria-hidden="true" />
            {busy ? "Saving…" : "Save event"}
          </button>
        </form>

        {copySheetOpen && (
          <CopyTrackSheet
            onPick={pickEventToCopy}
            onUploadRoute={handleUploadRoute}
            onClose={() => setCopySheetOpen(false)}
          />
        )}
      </div>
    </section>
  );
}

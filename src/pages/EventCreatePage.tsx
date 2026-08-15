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
 * Actions:  create: POST /events. Edit: PATCH /events/:eventId, plus a separate "Go live now"
 *           button (PATCH .../status) — asked for directly, a one-tap shortcut distinct from
 *           Save, deliberately skipping EventDetailPage's staged draft→…→live chain (that
 *           page's own Command menu still has the step-by-step version).
 * State:    the form fields; `isEditing`/`eventStatus`/`loadingEvent` track edit-mode loading
 * Calls:    POST /events (create), PATCH /events/:eventId + PATCH /events/:eventId/status
 *           (edit)
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
  Clock,
  Compass,
  FileText,
  Gauge,
  Lock,
  MapPin,
  Plus,
  Radio,
  Route as RouteIcon,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { type FormEvent, lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CopyTrackSheet, type UploadedTrack } from "../app/CopyTrackSheet";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { type EventSummary, getCachedEvent } from "../lib/local-db";
import { type EventRoute, getEventResults } from "../lib/mock-results";
import type { SurfaceType } from "../lib/mock-tracks";
import { parseQuickAdd, toDatetimeLocalValue } from "../lib/quick-add-parser";
import { LEVELS, type RiderLevel } from "../lib/rider-level";
import { useEventExtrasStore } from "../store/eventExtrasStore";
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
  const setRequiresApprovalExtra = useEventExtrasStore((s) => s.setRequiresApproval);
  const setEventTeam = useEventExtrasStore((s) => s.setTeam);
  const setEventActivityType = useEventExtrasStore((s) => s.setActivityType);
  const extrasByEvent = useEventExtrasStore((s) => s.byEvent);
  const teams = useTeamsStore((s) => s.teams);
  const createTeam = useTeamsStore((s) => s.createTeam);
  const addEventToTeam = useTeamsStore((s) => s.addEventToTeam);

  const myTeams = Object.values(teams).filter((t) => profile != null && t.createdBy === profile.id);

  const [name, setName] = useState("");
  const [activityType, setActivityType] = useState<SurfaceType>("road");
  const [level, setLevel] = useState<RiderLevel | null>(null);
  const [teamId, setTeamId] = useState<string>(searchParams.get("team") ?? "");
  const [newTeamName, setNewTeamName] = useState("");
  const [organizerGroup, setOrganizerGroupInput] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [startsAt, setStartsAt] = useState("");
  const [startsAtEdited, setStartsAtEdited] = useState(false);
  const [dateHint, setDateHint] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copySheetOpen, setCopySheetOpen] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<EventSummary | null>(null);
  const [copiedRoute, setCopiedRoute] = useState<EventRoute | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedRestStops, setUploadedRestStops] = useState<[number, number][]>([]);

  const [loadingEvent, setLoadingEvent] = useState(isEditing);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [goingLive, setGoingLive] = useState(false);

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
        if (cached.startsAt) setStartsAt(toDatetimeLocalValue(new Date(cached.startsAt)));
        setEventStatus(cached.status);
      }
      try {
        const found = await apiRequest<ExistingEvent>(`/events/${eventId}`);
        if (cancelled) return;
        setName(found.name);
        setLocation(found.location ?? "");
        setDescription(found.description ?? "");
        setVisibility(found.visibility);
        if (found.startsAt) setStartsAt(toDatetimeLocalValue(new Date(found.startsAt)));
        setEventStatus(found.status);
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
        if (existingExtras.activityType) setActivityType(existingExtras.activityType);
        if (existingExtras.requiresApproval) setRequiresApproval(true);
        if (existingExtras.teamId) setTeamId(existingExtras.teamId);
        else if (existingExtras.organizerGroup)
          setOrganizerGroupInput(existingExtras.organizerGroup);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately only [eventId]: this must run once on mount for a given event, not every
    // time extras change afterward (e.g. from picking a team mid-edit), or it would stomp on
    // what the organizer just typed. Extras are read via getState() above specifically so
    // they aren't a reactive dependency here.
  }, [eventId]);

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
  const readinessFields = [name.trim(), location.trim(), startsAt, description.trim()];
  const readinessCount = readinessFields.filter(Boolean).length;
  const readinessPct = Math.round((readinessCount / readinessFields.length) * 100);
  const armed = readinessPct === 100;
  const readinessStatus =
    readinessCount === 0
      ? "SYSTEMS OFFLINE — AWAITING INPUT"
      : armed
        ? "ARMED — READY FOR LAUNCH"
        : "PRE-RIDE CHECKS IN PROGRESS";

  async function pickEventToCopy(event: EventSummary) {
    setCopiedFrom(event);
    setUploadedFileName(null);
    setUploadedRestStops([]);
    setCopySheetOpen(false);
    setCopyLoading(true);

    // "Copy all elements except the date" — everything about the source event carries over
    // except startsAt, which stays whatever the organizer already set (or leaves blank to set
    // next). Only fills in fields still at their default, so it never clobbers something typed
    // in by hand before picking a track.
    if (!location.trim()) setLocation(event.location ?? "");
    const sourceExtras = extrasByEvent[event.id];
    if (level === null && sourceExtras?.level) setLevel(sourceExtras.level);
    if (!teamId && sourceExtras?.teamId) {
      setTeamId(sourceExtras.teamId);
    } else if (!teamId && !organizerGroup.trim() && sourceExtras?.organizerGroup) {
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

  function saveExtras(id: string) {
    if (level) setEventLevel(id, level);
    setEventActivityType(id, activityType);
    setRequiresApprovalExtra(id, requiresApproval);

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

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
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
        },
      });
      saveExtras(created.id);
      navigate(`/events/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // "add buton green to live to start event" — a direct shortcut to live from the edit
  // screen, separate from Save. Skips EventDetailPage's staged draft→…→live chain on purpose
  // (asked for as a one-tap action here); that page's own Command menu still has the
  // step-by-step version for anyone who wants it.
  async function goLive() {
    if (!eventId) return;
    setGoingLive(true);
    setError(null);
    try {
      await apiRequest<ExistingEvent>(`/events/${eventId}/status`, {
        method: "PATCH",
        body: { status: "live" },
      });
      navigate(`/events/${eventId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not go live. Try again.");
      setGoingLive(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.cockpit}>
        <span className={`${styles.corner} ${styles.cornerTl}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerTr}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBl}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />

        <header className={styles.header}>
          <div className={styles.headerIcon}>
            <Bike aria-hidden="true" />
          </div>
          <div>
            <p className={styles.eyebrow}>{isEditing ? "// EDIT MODE" : "// NEW MISSION"}</p>
            <h1 className={styles.title}>{isEditing ? "Manage Ride" : "Launch a Ride"}</h1>
            <p className={styles.subtitle}>
              {isEditing
                ? "Change anything, then save — or go live right now."
                : "Set the ride plan — riders join with your code."}
            </p>
          </div>
        </header>

        {isEditing && eventStatus && eventStatus !== "live" && eventStatus !== "finished" && (
          <button
            type="button"
            className={styles.goLiveBtn}
            onClick={goLive}
            disabled={goingLive || loadingEvent}
          >
            <Radio aria-hidden="true" />
            {goingLive ? "Going live…" : "Go live now — start event"}
          </button>
        )}

        <div className={styles.readiness}>
          <div className={styles.readinessHead}>
            <span>MISSION READINESS</span>
            <span className={styles.readinessPct}>{readinessPct}%</span>
          </div>
          <div className={styles.readinessTrack}>
            <div
              className={styles.readinessFill}
              data-armed={armed}
              style={{ width: `${readinessPct}%` }}
            />
          </div>
          <p className={styles.readinessStatus} data-armed={armed}>
            {readinessStatus}
          </p>
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
            <span className="spinner" aria-hidden="true" style={{ marginRight: 6 }} />
            Loading event…
          </p>
        )}

        <form onSubmit={submit}>
          <div className={styles.grid}>
            <div className={styles.colMain}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="name">
                  <Target aria-hidden="true" />
                  Event name
                </label>
                <input
                  id="name"
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <Users aria-hidden="true" />
                  Squad / team (optional)
                </span>
                <div className={`${styles.chipGroup} ${styles.chipGroupRow}`}>
                  <label className={styles.chip}>
                    <input
                      type="radio"
                      name="team"
                      className={styles.chipInput}
                      checked={teamId === ""}
                      onChange={() => setTeamId("")}
                    />
                    No team
                  </label>
                  {myTeams.map((t) => (
                    <label key={t.id} className={styles.chip}>
                      <input
                        type="radio"
                        name="team"
                        className={styles.chipInput}
                        checked={teamId === t.id}
                        onChange={() => setTeamId(t.id)}
                      />
                      <Users aria-hidden="true" size={12} />
                      {t.name}
                    </label>
                  ))}
                  <label className={styles.chip}>
                    <input
                      type="radio"
                      name="team"
                      className={styles.chipInput}
                      checked={teamId === NEW_TEAM_OPTION}
                      onChange={() => setTeamId(NEW_TEAM_OPTION)}
                    />
                    <Plus aria-hidden="true" size={12} />
                    New team
                  </label>
                </div>
                {teamId === NEW_TEAM_OPTION && (
                  <input
                    className={styles.input}
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="New team name"
                    required
                  />
                )}
                {!teamId && (
                  <input
                    className={styles.input}
                    value={organizerGroup}
                    onChange={(e) => setOrganizerGroupInput(e.target.value)}
                    placeholder="Or just a name, e.g. Galilee Cycling Club"
                  />
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="location">
                  <MapPin aria-hidden="true" />
                  Rally point / location
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
                  T-minus / start time
                </label>
                <input
                  id="startsAt"
                  type="datetime-local"
                  className={styles.input}
                  value={startsAt}
                  onChange={(e) => {
                    setStartsAt(e.target.value);
                    setStartsAtEdited(true);
                    setDateHint(null);
                  }}
                />
                <p className={styles.hint}>Shown to riders in their own local time.</p>
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
                  placeholder={'e.g. "2 groups: strong 50km, weak 20km, next Saturday"'}
                  value={description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                />
                {dateHint && (
                  <p className={`${styles.hint} ${styles["hint--active"]}`}>{dateHint}</p>
                )}
              </div>
            </div>

            <div className={styles.colSide}>
              <fieldset className={styles.panel} style={{ border: "none" }}>
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

              <fieldset className={styles.panel} style={{ border: "none" }}>
                <legend className={styles.fieldLabel} style={{ marginBottom: 4 }}>
                  <Gauge aria-hidden="true" />
                  Difficulty class
                </legend>
                <div className={styles.chipGroup}>
                  <label className={styles.chip}>
                    <input
                      type="radio"
                      name="level"
                      className={styles.chipInput}
                      checked={level === null}
                      onChange={() => setLevel(null)}
                    />
                    Not specified
                  </label>
                  {LEVELS.map((l) => (
                    <label key={l.value} className={styles.chip} data-level={l.value}>
                      <input
                        type="radio"
                        name="level"
                        className={styles.chipInput}
                        checked={level === l.value}
                        onChange={() => setLevel(l.value)}
                      />
                      <l.icon aria-hidden="true" size={12} />
                      {l.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className={styles.panel} style={{ border: "none" }}>
                <legend className={styles.fieldLabel} style={{ marginBottom: 4 }}>
                  <RouteIcon aria-hidden="true" />
                  Route
                </legend>
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
                    <Suspense fallback={<div className={styles.mapLoading}>Scanning route…</div>}>
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
                    <RouteIcon aria-hidden="true" size={14} />
                    Copy track from an existing event
                  </button>
                )}
              </fieldset>

              <fieldset className={styles.panel} style={{ border: "none" }}>
                <legend className={styles.fieldLabel} style={{ marginBottom: 4 }}>
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
                  <span className={styles.switchLabel}>
                    <ShieldCheck aria-hidden="true" />
                    {visibility === "public"
                      ? "Require my approval before a rider who joins is confirmed"
                      : "Require my approval, even for riders I invite — off means an invite is instant approval"}
                  </span>
                </label>
              </fieldset>
            </div>
          </div>

          <button
            className={styles.launchBtn}
            type="submit"
            disabled={busy || name.trim().length === 0}
          >
            <Bike aria-hidden="true" />
            {isEditing
              ? busy
                ? "Saving…"
                : "Save changes"
              : busy
                ? "Launching…"
                : "Launch mission"}
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

/**
 * Ride managers — /events/:eventId/managers
 *
 * The ride's creator types an email; that person then runs the ride exactly as the creator does
 * (edit, change the route, riders, groups, cancel). An email with no ElNino account yet waits
 * here as "waiting for sign-in" until that person first signs in with Google using it.
 *
 * Only the creator adds or removes (server: policy.ts "event:manage_members"); a manager sees
 * the list read-only. Nothing is emailed — the creator tells the person themselves.
 *
 * Loads: GET /events/:eventId/managers. See lib/ride-managers.ts.
 */
import { Trash2, UserPlus } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../lib/api-client";
import {
  addRideManager,
  fetchRideManagers,
  type RideManagersView,
  removeRideManager,
  removeRideManagerInvite,
} from "../lib/ride-managers";

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  return fallback;
}

export function EventManagersPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [view, setView] = useState<RideManagersView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!eventId) return;
    try {
      setView(await fetchRideManagers(eventId));
      setError(null);
    } catch (err) {
      setError(errorText(err, "Could not load this ride's managers."));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const typed = email.trim();
    if (!eventId || !typed) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await addRideManager(eventId, typed);
      setEmail("");
      setNotice(
        result.status === "added"
          ? `${result.manager.name ?? typed} can now manage this ride.`
          : `${typed} has no ElNino account yet. They become a manager the first time they sign in with Google using this email.`,
      );
      await reload();
    } catch (err) {
      setActionError(errorText(err, "Could not add that manager."));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveManager(userId: number) {
    if (!eventId) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await removeRideManager(eventId, userId);
      await reload();
    } catch (err) {
      setActionError(errorText(err, "Could not remove that manager."));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveInvite(invited: string) {
    if (!eventId) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await removeRideManagerInvite(eventId, invited);
      await reload();
    } catch (err) {
      setActionError(errorText(err, "Could not remove that invite."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="row">
        <span className="spinner" aria-hidden="true" />
        <span className="muted">Loading…</span>
      </div>
    );
  }

  if (error || !view) {
    return (
      <p className="banner banner--error" role="alert">
        {error ?? "Ride not found."}
      </p>
    );
  }

  const nobody = view.managers.length === 0 && view.pending.length === 0;

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Managers</h1>
          <p className="muted" style={{ margin: 0 }}>
            Managers can do everything you can on this ride: edit it, change the route, manage
            riders and groups, and cancel it.
          </p>
        </div>
        <Link className="button button--quiet" to={`/events/${eventId}`}>
          Back to ride
        </Link>
      </div>

      {notice && (
        <p className="banner" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="banner banner--error" role="alert">
          {actionError}
        </p>
      )}

      {view.canManage && (
        <form className="card stack" onSubmit={onAdd}>
          <label htmlFor="manager-email">Add a manager by email</label>
          <input
            id="manager-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="button" disabled={busy || email.trim() === ""}>
            <UserPlus width={15} height={15} aria-hidden="true" style={{ marginRight: 6 }} />
            Add manager
          </button>
        </form>
      )}

      <div className="card stack">
        {view.owner && (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>{view.owner.name ?? "Ride creator"}</span>
            <span className="badge">Creator</span>
          </div>
        )}

        {view.managers.map((manager) => (
          <div key={manager.userId} className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div>{manager.name ?? manager.email ?? `Rider #${manager.userId}`}</div>
              {manager.name && manager.email && (
                <div className="muted" style={{ fontSize: "0.85rem", overflowWrap: "anywhere" }}>
                  {manager.email}
                </div>
              )}
            </div>
            {view.canManage && (
              <button
                type="button"
                className="button button--quiet"
                disabled={busy}
                onClick={() => onRemoveManager(manager.userId)}
                aria-label={`Remove ${manager.name ?? manager.email ?? "manager"}`}
              >
                <Trash2 width={16} height={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}

        {view.pending.map((invite) => (
          <div key={invite.email} className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ overflowWrap: "anywhere" }}>{invite.email}</div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                Waiting for sign-in
              </div>
            </div>
            {view.canManage && (
              <button
                type="button"
                className="button button--quiet"
                disabled={busy}
                onClick={() => onRemoveInvite(invite.email)}
                aria-label={`Remove invite for ${invite.email}`}
              >
                <Trash2 width={16} height={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}

        {nobody && (
          <p className="muted" style={{ margin: 0 }}>
            No managers yet.
          </p>
        )}
      </div>
    </section>
  );
}

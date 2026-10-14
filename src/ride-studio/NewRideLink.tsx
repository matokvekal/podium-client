/**
 * The "New Ride" link, with one decision in it: where it goes.
 *
 * Ride Studio off (the default) -> exactly the link the app has always had, to /events/new.
 * On for this organizer       -> /events/start, which offers both ways to create.
 *
 * It renders a plain react-router <Link> either way, so styling, accessibility and behaviour
 * are what they were. Nothing here can make the original flow unreachable: the studio, the
 * choice page and the flag all fall back to /events/new.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isRideStudioEnabled } from "./flag";

export function NewRideLink({ className, children }: { className?: string; children: ReactNode }) {
  const { profile } = useAuth();
  const studio = isRideStudioEnabled({
    userId: profile?.id,
    canOrganize: profile?.canOrganize,
  });
  return (
    <Link className={className} to={studio ? "/events/start" : "/events/new"}>
      {children}
    </Link>
  );
}

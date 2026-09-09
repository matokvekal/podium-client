// Where a rider lands the moment sign-in finishes.
//
// Two screens send someone onward after they authenticate — LoginPage (an existing rider) and
// ProfileSetupPage (a first-time one) — and both had the same rule inline. It lives here so
// they cannot drift apart, and so the rule itself is testable.

/**
 * The screen to open after signing in, given where the visitor was headed when they were
 * asked to sign in (`from`, put in router state by App.tsx's RequireAuth and by the join /
 * event guards).
 *
 * Honouring `from` is what keeps a /join/:code link or an event page intact through the
 * sign-in detour — that destination is the whole reason they opened the app.
 *
 * The account screens are the exception. Signing in is not a request to look at your own
 * profile, so a session that expired on /account (or a stale bookmark of it, or the setup
 * page they were just sent through) must not put a rider back there afterwards: they came
 * to ride, and the app's main screen is the ride list. Those all fall through to "/", as do
 * "/" itself and "/login", which are not destinations at all.
 */
export function postLoginDestination(from: string | null | undefined): string {
  if (!from) return "/";
  if (from === "/" || from === "/login") return "/";
  if (from === "/account" || from.startsWith("/account/")) return "/";
  return from;
}

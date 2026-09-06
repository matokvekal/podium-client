/**
 * Brand strings.
 *
 * The slogan used to be typed out by hand in three places (splash, drawer, login) and had
 * already drifted — the splash and drawer said "Find friends. Ride together." while the login
 * screen said "Never ride alone.". One constant, imported everywhere, so the next change is a
 * one-line change and cannot leave a stale copy behind on a screen nobody thought to look at.
 *
 * The product NAME is deliberately separate from the slogan, so either can move without the
 * other. It has changed once already ("El Niño Move" → "El Niño Ride"), which is exactly why
 * screens should import APP_NAME rather than type the name out.
 */

/** The product name, as it is written everywhere the app names itself. */
export const APP_NAME = "El Niño Ride";

/** The slogan. Short by design — it sits under the wordmark on the splash and in the drawer. */
export const APP_SLOGAN = "Community Cycling";

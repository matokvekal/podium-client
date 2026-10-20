/**
 * Where every picture that ships WITH the app lives — the one place a folder is named.
 *
 * All of them sit under public/images/, one sub-folder per use:
 *
 *   public/images/
 *     ride-covers/    ride cover on the card and the ride page (1200×450, WebP)
 *     event-covers/   the generated default covers (SVG) when a ride has no picture
 *     profile/        avatars/ and covers/ a rider can pick on their account
 *     startup/        splash poster, login picture, welcome picture
 *     statistics/     year page, achievements, leaderboard
 *     ride-studio/    Ride Studio pictures (types/ = the Road / Gravel / MTB cards)
 *
 * To move or rename a folder, change it here. Code never writes a path of its own; the only
 * exceptions are CSS url()s, which cannot import this file — they name the same folders:
 * LoginPage.module.css, AboutElNino.module.css, StatisticsLeaderboardPage.module.css.
 *
 * NOT here: ride covers a System Admin uploads on /admin2026. The server keeps those on its own
 * disk and hands out their address (/api/v1/ride-image-files/…), so they are added or replaced
 * with no code change and no deploy. Also not here: favicon, app icons, logo.png and
 * og-invite.jpg — browsers, home screens and shared-link previews look for those at fixed
 * addresses in public/.
 */

export const IMAGES_ROOT = "/images";

export const IMAGE_DIRS = {
  rideCovers: `${IMAGES_ROOT}/ride-covers`,
  eventCovers: `${IMAGES_ROOT}/event-covers`,
  profileAvatars: `${IMAGES_ROOT}/profile/avatars`,
  profileCovers: `${IMAGES_ROOT}/profile/covers`,
  startup: `${IMAGES_ROOT}/startup`,
  statistics: `${IMAGES_ROOT}/statistics`,
  rideStudio: `${IMAGES_ROOT}/ride-studio`,
} as const;

export const STARTUP_IMAGES = {
  /** First frame of public/splash.mp4, shown until the video plays. */
  splashPoster: `${IMAGE_DIRS.startup}/splash-poster.jpg`,
} as const;

/**
 * Addresses written down before the images moved to public/images/. The database keeps one:
 * ride_images.url is "/ride-images/<key>.webp" for the built-in covers (sql/052). They are
 * translated here rather than rewritten in the database, so every ride keeps its picture
 * whether or not that table is ever updated.
 */
const MOVED: readonly (readonly [from: string, to: string])[] = [
  ["/ride-images/", `${IMAGE_DIRS.rideCovers}/`],
];

/** An image address as it is today: an old built-in address becomes its new one; anything
 *  else (an upload under /api/, a full URL, an already-current path) is returned unchanged. */
export function currentImageUrl(url: string): string {
  for (const [from, to] of MOVED) {
    if (url.startsWith(from)) return to + url.slice(from.length);
  }
  return url;
}

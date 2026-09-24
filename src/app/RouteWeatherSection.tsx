// "Route weather" — a compact, optional readout of the sky at a handful of points along a long
// ride, each at its own estimated arrival time. Isolated from WindStrip on purpose (separate
// cache, separate module, no shared state) — see lib/route-weather.ts for why.
//
// Renders nothing for a short ride (see useRouteWeather/planRouteWeather), and never anything
// louder than one small line ("Route forecast unavailable") on failure — a weather problem must
// never take the ride page with it.

import { RefreshCw } from "lucide-react";
import { routeWeatherLabels, routeWeatherLanguage } from "../lib/route-weather-labels";
import { formatAge, formatLocalClockParts } from "../lib/time";
import { weatherIcon } from "../lib/weather-codes";
import { useCountryStore } from "../store/countryStore";
import styles from "./RouteWeatherSection.module.css";
import { useRouteWeather } from "./useRouteWeather";

interface RouteWeatherSectionProps {
  event: { id: string; startsAt: string | null };
  userId: number | string | null | undefined;
  /** [lat, lng] pairs — the same route WindStrip and ElevationProfile draw. */
  points: readonly [number, number][] | null | undefined;
  /** The ride's duration as the page resolved it: the organizer's figure, else the estimate. */
  durationMin: number | null | undefined;
}

export function RouteWeatherSection({
  event,
  userId,
  points,
  durationMin,
}: RouteWeatherSectionProps) {
  const country = useCountryStore((s) => s.code);
  const language = routeWeatherLanguage(country);
  const labels = routeWeatherLabels(language);

  const forecast = useRouteWeather({
    eventId: event.id,
    userId,
    points,
    startsAt: event.startsAt,
    durationMin,
  });

  if (!forecast) return null;

  const { samples, generatedAt, status, refresh } = forecast;
  const hasSamples = samples != null && samples.length > 0;

  return (
    <section className={styles.wrap} dir="ltr" lang={language}>
      <div className={styles.header}>
        <span className={styles.title}>{labels.title}</span>
        <button
          type="button"
          className={styles.refresh}
          onClick={refresh}
          disabled={status === "loading"}
          aria-label={labels.refresh}
          title={labels.refresh}
        >
          <RefreshCw
            width={13}
            height={13}
            aria-hidden="true"
            className={status === "loading" ? styles.spinning : undefined}
          />
        </button>
      </div>

      {hasSamples ? (
        <ul className={styles.list}>
          {samples.map((sample) => {
            const clock = formatLocalClockParts(new Date(sample.etaMs));
            return (
              <li key={sample.label} className={styles.row}>
                <span className={styles.label}>{sample.label}</span>
                <span className={styles.time}>{clock?.time ?? "—"}</span>
                <span className={styles.icon} aria-hidden="true">
                  {sample.weatherCode != null ? weatherIcon(sample.weatherCode, sample.isDay) : ""}
                </span>
                <span className={styles.temp}>
                  {sample.temperatureC != null ? `${Math.round(sample.temperatureC)}°` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : status === "error" ? (
        <p className={styles.message}>{labels.unavailable}</p>
      ) : null}

      {generatedAt != null && (
        <span className={styles.updated}>{labels.updated(formatAge(new Date(generatedAt)))}</span>
      )}
    </section>
  );
}

export default RouteWeatherSection;

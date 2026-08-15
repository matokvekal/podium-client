// Event-day weather — real, not mocked, via Open-Meteo (open-meteo.com): free, no API key, no
// rate-limit signup, CORS-enabled for direct browser calls. Consistent with how this app
// already talks to OSM's tile servers directly from the client rather than proxying through a
// server it doesn't have yet.
//
// Two endpoints, picked by date: the forecast API for today through +16 days, and the
// **archive** API (historical actuals, same free/no-key deal) for anything in the past — asked
// for directly ("for past event and future"). A forecast for tomorrow and a historical actual
// for last month are different things; this always returns whichever is honest for the date,
// never guesses across the gap in between (>16 days out has neither).
//
// There is nowhere in the data model that stores an event's coordinates (Location is free
// text — "Galilee, Israel" — never geocoded). Callers use the mock route's first point as a
// stand-in "where this event roughly is"; see EventDetailPage.tsx's doc comment and
// plan/server-tasks.md for what real support needs (either geocoding Location, or capturing
// lat/lon directly when a route is attached).

export interface DayForecast {
  date: string; // YYYY-MM-DD
  tempMinC: number;
  tempMaxC: number;
  windSpeedKmh: number | null;
  cloudCoverPct: number | null;
  /** Only ever set for a forecast (future date) — a historical actual has no "chance of," it
   * either rained or it didn't (see precipitationMm for that). */
  precipitationChancePct: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  label: string;
  emoji: string;
  /** Which Open-Meteo endpoint this came from — lets a caller show "forecast" vs "recorded". */
  source: "forecast" | "historical";
}

// WMO weather codes — the small subset Open-Meteo actually returns for `daily.weathercode`.
const WEATHER_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: "Clear sky", emoji: "☀️" },
  1: { label: "Mostly clear", emoji: "🌤️" },
  2: { label: "Partly cloudy", emoji: "⛅" },
  3: { label: "Overcast", emoji: "☁️" },
  45: { label: "Fog", emoji: "🌫️" },
  48: { label: "Fog", emoji: "🌫️" },
  51: { label: "Light drizzle", emoji: "🌦️" },
  53: { label: "Drizzle", emoji: "🌦️" },
  55: { label: "Dense drizzle", emoji: "🌧️" },
  61: { label: "Light rain", emoji: "🌦️" },
  63: { label: "Rain", emoji: "🌧️" },
  65: { label: "Heavy rain", emoji: "🌧️" },
  71: { label: "Light snow", emoji: "🌨️" },
  73: { label: "Snow", emoji: "🌨️" },
  75: { label: "Heavy snow", emoji: "❄️" },
  80: { label: "Rain showers", emoji: "🌦️" },
  81: { label: "Rain showers", emoji: "🌧️" },
  82: { label: "Violent showers", emoji: "⛈️" },
  95: { label: "Thunderstorm", emoji: "⛈️" },
  96: { label: "Thunderstorm, hail", emoji: "⛈️" },
  99: { label: "Thunderstorm, hail", emoji: "⛈️" },
};

const FORECAST_HORIZON_DAYS = 16; // Open-Meteo's actual daily-forecast range.

async function fetchDaily(
  baseUrl: string,
  lat: number,
  lon: number,
  targetDate: string,
  includeChance: boolean,
): Promise<DayForecast | null> {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set(
      "daily",
      "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum," +
        "windspeed_10m_max,cloudcover_mean" +
        (includeChance ? ",precipitation_probability_max" : ""),
    );
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("start_date", targetDate);
    url.searchParams.set("end_date", targetDate);

    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();

    const code: number | undefined = data?.daily?.weathercode?.[0];
    const tempMax: number | undefined = data?.daily?.temperature_2m_max?.[0];
    const tempMin: number | undefined = data?.daily?.temperature_2m_min?.[0];
    const precipChance: number | undefined = data?.daily?.precipitation_probability_max?.[0];
    const precipSum: number | undefined = data?.daily?.precipitation_sum?.[0];
    const snowSum: number | undefined = data?.daily?.snowfall_sum?.[0];
    const windMax: number | undefined = data?.daily?.windspeed_10m_max?.[0];
    const cloudCover: number | undefined = data?.daily?.cloudcover_mean?.[0];
    if (code == null || tempMax == null || tempMin == null) return null;

    const known = WEATHER_CODES[code] ?? { label: "—", emoji: "🌡️" };
    return {
      date: targetDate,
      tempMinC: Math.round(tempMin),
      tempMaxC: Math.round(tempMax),
      windSpeedKmh: windMax != null ? Math.round(windMax) : null,
      cloudCoverPct: cloudCover != null ? Math.round(cloudCover) : null,
      precipitationChancePct: includeChance ? (precipChance ?? null) : null,
      precipitationMm: precipSum != null ? Math.round(precipSum * 10) / 10 : null,
      snowfallCm: snowSum != null ? Math.round(snowSum * 10) / 10 : null,
      label: known.label,
      emoji: known.emoji,
      source: includeChance ? "forecast" : "historical",
    };
  } catch {
    return null;
  }
}

/**
 * Weather for one day at one point — null for anything unusable rather than a guess: no date,
 * a date too far in the future for Open-Meteo's forecast range, or the request itself failing
 * (offline, blocked, whatever). Never fabricates a value for a date it doesn't actually have
 * data for. Past dates go to the archive (historical actuals) API; today through +16 days go
 * to the forecast API; anything further out returns null (neither endpoint covers it).
 */
export async function getForecastForDate(
  lat: number,
  lon: number,
  dateIso: string | null,
): Promise<DayForecast | null> {
  if (!dateIso) return null;
  const targetDate = dateIso.slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);
  const diffDays = Math.round(
    (new Date(`${targetDate}T00:00:00Z`).getTime() - new Date(`${todayStr}T00:00:00Z`).getTime()) /
      86_400_000,
  );

  if (diffDays < 0) {
    return fetchDaily("https://archive-api.open-meteo.com/v1/archive", lat, lon, targetDate, false);
  }
  if (diffDays > FORECAST_HORIZON_DAYS) return null;
  return fetchDaily("https://api.open-meteo.com/v1/forecast", lat, lon, targetDate, true);
}

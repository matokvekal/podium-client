// WMO weather codes — shared between the daily event-day forecast (lib/weather.ts) and the
// hourly wind strip / route weather (which both draw a sky icon per hour). One table, so the
// three call sites never drift out of sync on what code 61 looks like.
//
// nightEmoji is set only for the two codes where day/night actually looks different at a
// glance (clear / mostly clear → sun vs moon); an overcast or rainy sky reads the same at
// 3 a.m. as at 3 p.m., so every other code has one emoji for both.

export interface WeatherCodeInfo {
  label: string;
  emoji: string;
  nightEmoji?: string;
}

export const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { label: "Clear sky", emoji: "☀️", nightEmoji: "🌙" },
  1: { label: "Mostly clear", emoji: "🌤️", nightEmoji: "🌙" },
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

const UNKNOWN: WeatherCodeInfo = { label: "—", emoji: "🌡️" };

export function weatherCodeInfo(code: number | null | undefined): WeatherCodeInfo {
  if (code == null) return UNKNOWN;
  return WEATHER_CODES[code] ?? UNKNOWN;
}

/** The single emoji to draw for one hour: the night variant only where one exists and it is
 * actually dark, otherwise the day emoji (also the fallback when `isDay` is unknown). */
export function weatherIcon(
  code: number | null | undefined,
  isDay: boolean | null | undefined,
): string {
  const info = weatherCodeInfo(code);
  if (isDay === false && info.nightEmoji) return info.nightEmoji;
  return info.emoji;
}

/**
 * One rider's row in an event's rider list.
 *
 * Row 1: bib, country flag, name, avatar (or initials placeholder, same pattern as every
 * other card in this app — see app/event-visuals.ts).
 * Row 2: team, distance.
 *
 * Category, DNF/DNS/racing status, finishing time/gap/place, and split times are all
 * deliberately not shown — race-result concepts, and this app is rides-only for now — just
 * friends on a ride or a group ride, not a timed competition (see EventCreatePage.tsx's doc
 * comment). The underlying mock-results.ts fields still exist (server contract unchanged);
 * this row just doesn't render them.
 */

import { MapPin, Users } from "lucide-react";
import { countryFlagEmoji } from "../lib/country-flag";
import type { RiderResult } from "../lib/mock-results";
import { initialOf, placeholderColorVar } from "./event-visuals";
import styles from "./RiderResultRow.module.css";

export function RiderResultRow({ rider }: { rider: RiderResult }) {
  const flag = countryFlagEmoji(rider.countryCode);

  return (
    <div className={styles.card}>
      <div className={styles.rowsButton}>
        <div className={styles.topRow}>
          <div className={styles.identity}>
            {rider.bib && <span className={styles.bib}>#{rider.bib}</span>}
            {flag && (
              <span className={styles.flag} aria-hidden="true">
                {flag}
              </span>
            )}
            <span className={styles.name}>{rider.name}</span>
          </div>

          <div className={styles.topRowEnd}>
            <div className={styles.avatar} style={{ background: placeholderColorVar(rider.id) }}>
              {rider.avatarUrl ? (
                <img src={rider.avatarUrl} alt="" className={styles.avatarImg} />
              ) : (
                initialOf(rider.name)
              )}
            </div>
          </div>
        </div>

        <div className={styles.bottomRow}>
          {rider.team && (
            <span className={styles.metaItem}>
              <Users className={styles.metaIcon} aria-hidden="true" />
              {rider.team}
            </span>
          )}
          <span className={styles.metaItem}>
            <MapPin className={styles.metaIcon} aria-hidden="true" />
            {rider.distanceKm} km
          </span>
        </div>
      </div>
    </div>
  );
}

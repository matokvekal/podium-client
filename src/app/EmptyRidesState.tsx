/**
 * Empty state for "My Rides" when a signed-in rider has no events yet. Ported from
 * race-pwa's EmptyRaces, with the demo-race button dropped (no demo concept in Podium) and
 * "Browse server races" dropped (that's exactly what the Other Rides section already does,
 * live, right below this).
 */

import { Bike, Plus, QrCode } from "lucide-react";
import { Link } from "react-router-dom";
import styles from "./EmptyRidesState.module.css";

type EmptyRidesStateProps = {
  title?: string;
  subtitle?: string;
};

export function EmptyRidesState({
  title = "No rides yet",
  subtitle = "Create a ride or race, or join one with a code.",
}: EmptyRidesStateProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.iconCircle}>
        <Bike className={styles.icon} aria-hidden="true" />
      </div>

      <div className={styles.title}>{title}</div>
      <div className={styles.subtitle}>{subtitle}</div>

      <div className={styles.actions}>
        <Link className={styles.btnPrimary} to="/events/new">
          <Plus width={18} height={18} aria-hidden="true" />
          Create a ride or race
        </Link>

        <Link className={styles.btnSecondary} to="/join">
          <QrCode width={18} height={18} aria-hidden="true" />
          Join with a code
        </Link>
      </div>
    </div>
  );
}

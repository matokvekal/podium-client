/**
 * Small red flag for any Statistics section showing placeholder numbers because the real
 * backend has nothing for this rider/leaderboard yet (rider-statistics-backend-contract: merged
 * to main, not deployed to prod, sql/034+035 not run anywhere yet). Swap the data source, then
 * delete the badge/notice at that call site — never let it linger next to real numbers.
 */
import type { ReactNode } from "react";

export function MockDataBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        padding: "1px 6px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "#fff",
        background: "#dc2626",
      }}
    >
      Mock
    </span>
  );
}

export function MockDataNotice({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-muted)",
      }}
    >
      <MockDataBadge />
      <span>{children}</span>
    </div>
  );
}

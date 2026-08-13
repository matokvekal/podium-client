// Honest placeholder for a screen whose server endpoints do not exist yet.
//
// It names the milestone rather than saying "coming soon", so nobody has to guess whether a
// screen is broken or simply not built. Delete a usage as soon as its page is real.

export function NotBuiltYet({ milestone, needs }: { milestone: string; needs: string[] }) {
  return (
    <div className="card stack">
      <p className="muted">
        Not built yet — <strong>{milestone}</strong>.
      </p>
      <p className="muted">This screen is waiting on:</p>
      <ul className="muted">
        {needs.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

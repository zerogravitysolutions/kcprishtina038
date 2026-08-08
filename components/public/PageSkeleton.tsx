// Instant loading skeleton shown during client navigation between public pages
// (via each section's loading.tsx). Pure/static — renders immediately with no
// data fetch, so the transition feels instant while the real page streams in.
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Duke ngarkuar…">
      <div className="sk-navbar" />
      <div className="sk-hero">
        <div className="container">
          <div className="sk sk-ondark" style={{ width: 110, height: 12, marginBottom: 20 }} />
          <div className="sk sk-ondark" style={{ width: "min(70%, 560px)", height: 46 }} />
          <div className="sk sk-ondark" style={{ width: "min(90%, 680px)", height: 16, marginTop: 20 }} />
        </div>
      </div>
      <div className="container" style={{ padding: "48px 0" }}>
        <div className="sk-cards">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sk sk-card" />)}
        </div>
      </div>
    </div>
  );
}

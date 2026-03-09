import { bassRequired, isChorfrei, getStyle, isVorstellung } from "./utils.js";

function EvCard({ e, user, compact = false, changed = false }) {
  if (!e || !e.eventType) return null;
  if (isChorfrei(e)) {
    return <div className="chorfrei-card">☽ Chorfrei{e.eventType === "Halber Chorfrei" ? " (½)" : ""}</div>;
  }

  const st = getStyle(e);
  const req = bassRequired(e);
  const dimmed = (user?.voice === "Bass") && req === false;

  return (
    <div className={`ecard${dimmed ? " dimmed" : ""}${changed ? " changed" : ""}`}
      style={{ background: st.bg, borderColor: st.border, borderLeftColor: st.leftBorder }}>
      {changed && <div className="changed-dot" title="Geändert" />}

      <div className="ecard-head">
        <div className="ecard-left">
          <div className="ecard-title" style={{ color: st.text }}>{e.title}</div>
          {e.production && <div className="ecard-prod">{e.production}{e.conductor && ` · ${e.conductor}`}</div>}
        </div>
        <div className="ecard-right">
          {e.startTime && e.startTime !== "00:00" && (() => {
            const isUnusual = isVorstellung(e) && !e.startTime.startsWith("19");
            return (
              <div className={`ecard-time${isUnusual ? " unusual-time" : ""}`}>
                {isUnusual && "⚠ "}{e.startTime}{e.endTime && e.endTime !== "00:00" ? `–${e.endTime}` : ""}
              </div>
            );
          })()}
          <div style={{ textAlign: "right", marginTop: 4 }}>
            <span className="type-badge" style={{ background: st.badgeBg, color: st.badgeText }}>{st.badge}</span>
          </div>
        </div>
      </div>

      <div className="ecard-meta">
        {e.location && <span>📍 {e.location}</span>}
        <span className={`source-tag src-${e.sourceType || "dienstplan"}`}>
          {e.sourceType === "monatsplan" ? "Monatsplan" : e.sourceType === "vorplanung" ? "Vorplanung" : e.sourceType === "tagesplan" ? "Tagesplan" : e.sourceType === "anprobe" ? "Anprobe" : "Dienstplan"}
        </span>
        {user?.voice === "Bass" && (
          <span className={`req-pill ${req === true ? "req-yes" : req === false ? "req-no" : "req-unk"}`}>
            {req === true ? "Pflichttermin" : req === false ? "Nicht eingeteilt" : "Unklar"}
          </span>
        )}
      </div>

      {e.targetGroup && (
        <div className="ecard-target">👥 {e.targetGroup}</div>
      )}
      {e.note && <div className="ecard-note">⚠ {e.note}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  CALENDAR VIEW  — 4 modes: Tag / Woche / Monat / Saison
// ═══════════════════════════════════════════════════════════════════════

export { EvCard };

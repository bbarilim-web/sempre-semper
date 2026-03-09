import { useState } from "react";
import { PARTS, PART_VOICE, VOICES, normalizeProduction, splitProductions } from "./utils.js";
import { ProductionPicker, getCurrentSeason } from "./ProductionPicker.jsx";

function EinstellungenView({ user, settings, saveSettings, onLogout, scheds }) {
  const VIEW_OPTIONS = [
    { value:"tag",    label:"Tagesansicht" },
    { value:"woche",  label:"Wochenansicht" },
    { value:"monat",  label:"Monatsansicht" },
    { value:"saison", label:"Saisonübersicht" },
  ];

  const initials = user.name.split(" · ")[0].split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

  // 모든 작품 목록 추출 — 1차: 원본 이름 수집, 2차: 부분매칭으로 정규화
  const rawProductions = [...new Set(
    scheds.flatMap(e => splitProductions(e.production, []))
  )];
  // 긴 이름 우선 (Don Giovanni가 Giovanni보다 우선)
  const sortedByLength = [...rawProductions].sort((a, b) => b.length - a.length);
  const allProductions = [...new Set(
    rawProductions.map(p => normalizeProduction(p, sortedByLength))
  )].sort();

  const myProductions = settings.myProductions || [];

  return (
    <div className="page">
      {/* Profile hero */}
      <div className="profile-hero">
        <div className="profile-avatar">{initials}</div>
        <div>
          <div className="profile-name">{user.name.split(" · ")[0]}</div>
          <div className="profile-part">
            {user.part || user.voice}
            {user.role === "admin" && " · Chorleitung"}
            {" · Staatsopernchor"}
          </div>
          <div style={{ fontSize:"0.68rem", color:"var(--faint)", marginTop:4 }}>
            Sächsische Staatstheater Dresden Semperoper
          </div>
        </div>
      </div>

      {/* 내 작품 선택 — 시즌별 */}
      <ProductionPicker settings={settings} saveSettings={saveSettings} scheds={scheds} />

      {/* Darstellung */}
      <div className="settings-section">
        <div className="settings-title">Darstellung</div>

        {/* 테마 선택 */}
        <div className="settings-row" style={{ marginBottom:12 }}>
          <div>
            <div className="settings-row-label">Farbschema</div>
            <div className="settings-row-sub">Helles oder dunkles Design</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          {[
            { value:"dark",  label:"🌙 Dark",  desc:"Dunkler Hintergrund" },
            { value:"light", label:"☀️ Light", desc:"Heller Hintergrund" },
          ].map(t => {
            const isActive = (settings.theme || "dark") === t.value;
            return (
              <button key={t.value} onClick={() => saveSettings({ ...settings, theme: t.value })}
                style={{ flex:1, padding:"12px 10px", borderRadius:10, cursor:"pointer",
                  border:`2px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                  background: isActive ? "var(--accent-dim)" : "var(--s1)",
                  fontFamily:"var(--sans)", transition:"all 0.15s" }}>
                <div style={{ fontSize:"1.1rem", marginBottom:4 }}>{t.label}</div>
                <div style={{ fontSize:"0.72rem", color: isActive ? "var(--accent)" : "var(--muted)" }}>{t.desc}</div>
              </button>
            );
          })}
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Startansicht Spielplan</div>
            <div className="settings-row-sub">Welche Ansicht beim Öffnen erscheint</div>
          </div>
          <select className="settings-select" value={settings.defaultView}
            onChange={e => saveSettings({ ...settings, defaultView: e.target.value })}>
            {VIEW_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Info */}
      <div className="settings-section">
        <div className="settings-title">Über die App</div>
        <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:10,
          padding:"14px 16px", fontSize:"0.82rem", color:"var(--text2)", lineHeight:1.6 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <svg viewBox="0 0 56 40" fill="none" width="32" height="23">
              <path d="M2 38 L2 22 L8 22 L8 18 L14 18 L14 14 L20 14 L20 10 L28 8 L36 10 L36 14 L42 14 L42 18 L48 18 L48 22 L54 22 L54 38 Z" fill="#E8173A"/>
            </svg>
            <span style={{ fontFamily:"var(--serif)", fontSize:"1rem", fontWeight:600, color:"var(--text)" }}>
              Sempre Semper
            </span>
          </div>
          <div style={{ color:"var(--muted)", fontSize:"0.78rem" }}>
            Digitaler Spielplan des Staatsopernchors · Version 1.0 Prototype
          </div>
          <div style={{ color:"var(--faint)", fontSize:"0.72rem", marginTop:6 }}>
            Sächsische Staatstheater Dresden Semperoper · Opernchor
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="settings-section">
        <div className="settings-title">Konto</div>
        <button onClick={onLogout}
          style={{ width:"100%", padding:"12px 16px", background:"var(--s1)",
            border:"1px solid rgba(232,23,58,0.3)", borderRadius:10, cursor:"pointer",
            fontFamily:"var(--sans)", fontSize:"0.88rem", fontWeight:500,
            color:"var(--accent)", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            transition:"all 0.2s" }}
          onMouseEnter={e => e.target.style.background="var(--accent-dim)"}
          onMouseLeave={e => e.target.style.background="var(--s1)"}>
          Abmelden
        </button>

        {/* ── Datenschutz & Disclaimer ── */}
        <div style={{ marginTop:20, padding:"14px 16px",
          background:"var(--s2)", borderRadius:12,
          border:"1px solid var(--border)", fontSize:"0.74rem",
          color:"var(--muted)", lineHeight:1.6 }}>
          <div style={{ fontWeight:700, color:"var(--text)", fontSize:"0.78rem", marginBottom:8 }}>
            ⚖ Datenschutz & Haftungsausschluss
          </div>
          <p style={{ margin:"0 0 8px" }}>
            <strong>Haftungsausschluss:</strong> Diese App dient ausschließlich
            als persönliches Informationswerkzeug. Alle Angaben sind ohne Gewähr.
            Verbindlich sind ausschließlich die offiziellen Dienstpläne und
            Aushänge der Sächsischen Staatsoper Dresden.
          </p>
          <p style={{ margin:"0 0 8px" }}>
            <strong>Gespeicherte Daten:</strong> Name, E-Mail-Adresse,
            Stimmgruppe. Keine Geburtsdaten. Speicherort: Google Firebase,
            EU-Region.
          </p>
          <p style={{ margin:"0 0 8px" }}>
            <strong>PDF-Analyse:</strong> Beim Hochladen eines PDFs wird
            ausschließlich die Planstruktur (Datum, Zeit, Probentyp) an
            Anthropic API übertragen. Keine personenbezogenen Daten.
          </p>
          <p style={{ margin:0 }}>
            <strong>Datenlöschung:</strong> Bei Fragen oder Löschungsanfragen
            wenden Sie sich an den Administrator.
            Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO.
          </p>
        </div>

      </div>
    </div>
  );
}



export { EinstellungenView };

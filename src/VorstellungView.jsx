import { useState } from "react";
import { isVorstellung, fmtDate, MONTHS_DE, today, todayStr, timeAgo } from "./utils.js";
import { EvCard } from "./EvCard.jsx";

// ── 달력 셀용 약어 변환 ──────────────────────────────────────────────
function shortenTitle(title, production) {
  const src = production || title || "";
  const ABBR = {
    "carmen":                         "Carmen",
    "parsifal":                       "Parsifal",
    "aida":                           "Aida",
    "la traviata":                    "Traviata",
    "traviata":                       "Traviata",
    "die zauberflöte":                "Zauberflöte",
    "zauberflöte":                    "Zauberflöte",
    "don giovanni":                   "Don Giov.",
    "le nozze di figaro":             "Le Nozze",
    "elias":                          "Elias",
    "lohengrin":                      "Lohengrin",
    "tannhäuser":                     "Tannhäuser",
    "tristan und isolde":             "Tristan",
    "die meistersinger von nürnberg": "Meistersinger",
    "das rheingold":                  "Rheingold",
    "die walküre":                    "Walküre",
    "siegfried":                      "Siegfried",
    "götterdämmerung":                "Götterd.",
    "salome":                         "Salome",
    "elektra":                        "Elektra",
    "der rosenkavalier":              "Rosenkavalier",
    "rosenkavalier":                  "Rosenkavalier",
    "ariadne auf naxos":              "Ariadne",
    "der freischütz":                 "Freischütz",
    "freischütz":                     "Freischütz",
    "karmelitinnen":                  "Karmelitinnen",
    "ein florentiner hut":            "Flor. Hut",
    "florentiner hut":                "Flor. Hut",
    "la bohème":                      "La Bohème",
    "madama butterfly":               "Butterfly",
    "tosca":                          "Tosca",
    "fidelio":                        "Fidelio",
    "rigoletto":                      "Rigoletto",
    "romeo":                          "Roméo",
    "cavalleria rusticana / pagliacci": "Cav/Pag",
  };
  // 숫자 Sinfoniekonzert/Konzert 패턴: "9. Sinfoniekonzert" → "9. Sinf."
  const konzertMatch = src.match(/^(\d+)\.\s*(Sinfonie)?konzert/i);
  if (konzertMatch) return `${konzertMatch[1]}. Sinf.`;

  const key = src.toLowerCase().trim();
  if (ABBR[key]) return ABBR[key];
  if (src.length <= 14) return src;
  // 괄호/부제 제거
  const noSub = src.replace(/\s*[\(\/\-].*$/, "").trim();
  if (noSub.length <= 14) return noSub;
  return src.slice(0, 12) + "…";
}

// ── 날짜 → 시즌 레이블 ("2025-09-01" → "25/26") ────────────────────
function dateToSeason(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-indexed
  const startYear = m >= 7 ? y : y - 1; // 8월(7)부터 새 시즌
  return `${String(startYear).slice(2)}/${String(startYear + 1).slice(2)}`;
}

function VorstellungView({ scheds, user }) {
  const [selSeason, setSelSeason] = useState(null);
  const [selMonth,  setSelMonth]  = useState(null);
  const [selDate,   setSelDate]   = useState(null);

  // 중복 제거
  const SOURCE_PRIORITY = { tagesplan: 0, dienstplan: 1, monatsplan: 2, vorplanung: 3 };
  const vorstellungen = Object.values(
    scheds
      .filter(e => isVorstellung(e) || e.eventType === "Generalprobe")
      .reduce((acc, e) => {
        const key = `${e.date}_${e.startTime}_${e.production || e.title}`;
        const ex = acc[key];
        if (!ex || (SOURCE_PRIORITY[e.sourceType]??9) < (SOURCE_PRIORITY[ex.sourceType]??9)) acc[key] = e;
        return acc;
      }, {})
  ).sort((a,b) => (a.date+(a.startTime||"")).localeCompare(b.date+(b.startTime||"")));

  // 시즌 목록 추출
  const allSeasons = [...new Set(vorstellungen.map(e => dateToSeason(e.date)))].sort();
  const curSeason  = dateToSeason(todayStr);
  const activeSeason = selSeason || (allSeasons.includes(curSeason) ? curSeason : allSeasons[0]);

  // 해당 시즌의 공연만 필터
  const seasonVS = vorstellungen.filter(e => dateToSeason(e.date) === activeSeason);

  // 달별 그룹 (해당 시즌만)
  const months = {};
  seasonVS.forEach(e => {
    const k = e.date.slice(0,7);
    if (!months[k]) months[k] = [];
    months[k].push(e);
  });
  const monthKeys = Object.keys(months).sort();

  // 현재 달 또는 시즌 첫 달
  const curMk = todayStr.slice(0,7);
  const activeMk = selMonth && monthKeys.includes(selMonth)
    ? selMonth
    : (monthKeys.includes(curMk) ? curMk : monthKeys[0]);

  // 다음 공연 (전체에서)
  const next = vorstellungen.find(e => e.date >= todayStr);
  const daysUntil = next ? Math.ceil((new Date(next.date+"T12:00:00") - today) / 86400000) : null;

  // 달력 데이터
  const calEvs = activeMk ? (months[activeMk] || []) : [];
  const [cy, cm] = activeMk ? activeMk.split("-").map(Number) : [0,0];
  const daysInMonth = activeMk ? new Date(cy, cm, 0).getDate() : 0;
  const firstDow    = activeMk ? (new Date(cy, cm-1, 1).getDay()+6)%7 : 0;
  const evsByDay = {};
  calEvs.forEach(e => {
    const d = parseInt(e.date.slice(8));
    if (!evsByDay[d]) evsByDay[d] = [];
    evsByDay[d].push(e);
  });

  const selEvs = selDate ? (evsByDay[parseInt(selDate.slice(8))] || []) : [];

  // 시즌 변경 시 월/날짜 초기화
  const handleSeasonChange = (s) => {
    setSelSeason(s);
    setSelMonth(null);
    setSelDate(null);
  };

  return (
    <div className="page">
      <div className="sh">
        <div>
          <h2>Vorstellungen & GP</h2>
          <div className="sh-sub">{vorstellungen.length} Termine gesamt</div>
        </div>
      </div>

      {/* 다음 공연 배너 */}
      {next && (
        <div className="vs-banner" style={{ marginBottom: 16 }}>
          <div className="priority-label">🎭 Nächste{daysUntil <= 0 ? " — HEUTE" : daysUntil === 1 ? " — morgen" : daysUntil <= 7 ? ` — in ${daysUntil} Tagen` : ""}</div>
          <div className="vs-title">{next.title}</div>
          <div className="vs-meta">📅 {fmtDate(next.date, false)} · ⏰ {next.startTime} Uhr · 📍 {next.location || "Hauptbühne"}</div>
        </div>
      )}

      {/* 시즌 탭 */}
      {allSeasons.length > 1 && (
        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
          {allSeasons.map(s => {
            const isAct = s === activeSeason;
            const isCur = s === curSeason;
            const cnt = vorstellungen.filter(e => dateToSeason(e.date) === s).length;
            return (
              <button key={s} onClick={() => handleSeasonChange(s)}
                style={{ padding:"6px 14px", borderRadius:20, cursor:"pointer",
                  fontFamily:"var(--sans)", fontSize:"0.78rem", transition:"all 0.15s",
                  border:`1px solid ${isAct ? "var(--accent)" : "var(--border)"}`,
                  background: isAct ? "var(--accent)" : "var(--s1)",
                  color: isAct ? "#fff" : isCur ? "var(--accent)" : "var(--text2)",
                  fontWeight: isAct ? 700 : isCur ? 600 : 400 }}>
                {isCur && !isAct && <span style={{ marginRight:4 }}>●</span>}
                Saison {s}
                <span style={{ marginLeft:5, fontSize:"0.7em", opacity:0.8 }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 월 탭 */}
      {monthKeys.length > 0 && (
        <div className="vs-month-tabs">
          {monthKeys.map(mk => {
            const [y, m] = mk.split("-").map(Number);
            const hasToday = mk === curMk;
            const isAct = mk === activeMk;
            const cnt = months[mk].length;
            return (
              <button key={mk} className={`vs-month-tab${isAct ? " active" : ""}`}
                onClick={() => { setSelMonth(mk); setSelDate(null); }}>
                {hasToday && <span className="tab-dot" />}
                {MONTHS_DE[m-1].slice(0,3)} {String(y).slice(2)}
                <span style={{ marginLeft:5, opacity:0.7, fontSize:"0.7em" }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 달력 그리드 */}
      {activeMk && (
        <div>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:10 }}>
            <span style={{ fontFamily:"var(--serif)", fontSize:"1rem", fontWeight:600, color:"var(--text)" }}>
              {MONTHS_DE[cm-1]} {cy}
            </span>
            <span style={{ fontSize:"0.74rem", color:"var(--muted)" }}>
              {calEvs.length} Termin{calEvs.length!==1?"e":""}
            </span>
          </div>

          <div className="vs-cal-grid">
            {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d => (
              <div key={d} className="vs-cal-dow">{d}</div>
            ))}
            {Array(firstDow).fill(null).map((_,i) => (
              <div key={"e"+i} className="vs-cal-cell empty" />
            ))}
            {Array.from({length: daysInMonth}, (_,i) => i+1).map(day => {
              const ds = `${cy}-${String(cm).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const evs = evsByDay[day] || [];
              const hasVS = evs.some(e => isVorstellung(e));
              const hasGP = evs.some(e => e.eventType === "Generalprobe");
              const isT   = ds === todayStr;
              const isSel = ds === selDate;
              let cls = "vs-cal-cell";
              if (hasVS) cls += " has-ev";
              else if (hasGP) cls += " has-gp";
              if (isT)   cls += " today";
              if (isSel) cls += " sel";
              return (
                <div key={day} className={cls}
                  onClick={() => evs.length ? setSelDate(isSel ? null : ds) : null}
                  style={{ height:64, overflow:"hidden", boxSizing:"border-box" }}>
                  <div className="vs-cal-dn">{day}</div>
                  {evs.length > 0 && (
                    <div className="vs-cal-prods">
                      {evs.slice(0,2).map((e,i) => (
                        <div key={i} className={`vs-cal-prod${e.eventType==="Generalprobe"&&!isVorstellung(e)?" gp":""}`}>
                          {shortenTitle(e.title, e.production)}
                        </div>
                      ))}
                      {evs.length > 2 && (
                        <div style={{ fontSize:"0.52rem", color:"var(--muted)", lineHeight:1 }}>+{evs.length-2}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 선택된 날짜 상세 */}
          {selDate && selEvs.length > 0 && (
            <div className="vs-detail">
              <div className="vs-detail-hdr">
                <span>
                  {["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(selDate+"T12:00:00").getDay()]}, {parseInt(selDate.slice(8))}. {MONTHS_DE[cm-1]} {cy}
                </span>
                <button onClick={() => setSelDate(null)}
                  style={{ background:"none", border:"none", color:"var(--faint)", cursor:"pointer", fontSize:"0.9rem", padding:"0 2px" }}>✕</button>
              </div>
              {selEvs.map((e,i) => (
                <div key={i} className="vs-row">
                  <div className="vs-row-date">
                    <div style={{ fontSize:"0.68rem", color:"var(--muted)" }}>
                      {e.eventType==="Generalprobe" ? "GP" : "VS"}
                    </div>
                    <div style={{ fontSize:"1.1rem", fontWeight:700, color: e.eventType==="Generalprobe" ? "var(--orange)" : "var(--accent)", letterSpacing:"-0.02em" }}>
                      {e.startTime?.slice(0,5)}
                    </div>
                  </div>
                  <div className="vs-row-title">
                    {e.title}
                    {e.eventType==="Generalprobe" && (
                      <span style={{ marginLeft:6, fontSize:"0.65rem", color:"var(--orange)", background:"var(--orange-bg)",
                        border:"1px solid rgba(255,159,10,0.3)", padding:"1px 6px", borderRadius:4, fontWeight:600 }}>GP</span>
                    )}
                    {e.note && <div style={{ fontSize:"0.72rem", color:"var(--orange)", marginTop:2 }}>⚠ {e.note}</div>}
                    {e.conductor && <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginTop:2 }}>🎵 {e.conductor}</div>}
                    <div style={{ fontSize:"0.72rem", color:"var(--faint)", marginTop:2 }}>
                      📍 {e.location||"Hauptbühne"}{e.endTime&&e.endTime!=="00:00"?` · bis ${e.endTime} Uhr`:""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {vorstellungen.length === 0 && <div className="empty">Keine Vorstellungen geplant.</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  CHANGES VIEW
// ═══════════════════════════════════════════════════════════════════════
function ChangesView({ scheds, notifs, user }) {
  const changed = scheds
    .filter(e => e._edited && Date.now() - e.updatedAt < 48 * 3600000)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="page">
      <div className="sh">
        <h2>Kurzfristige Änderungen</h2>
        <div className="sh-sub">Letzte 48 Stunden</div>
      </div>

      {changed.length > 0 && (
        <div style={{ background: "rgba(211,84,0,0.08)", border: "1px solid #5A2A10", borderLeft: "3px solid var(--orange)", padding: "10px 14px", marginBottom: 14, fontSize: "0.82rem", color: "var(--orange)" }}>
          ⚡ {changed.length} Termin{changed.length > 1 ? "e wurden" : " wurde"} in den letzten 48 Stunden geändert
        </div>
      )}

      {changed.map(e => (
        <div key={e.id}>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{fmtDate(e.date)}</span>
            <span style={{ color: "var(--faint)" }}>·</span>
            <span>{timeAgo(e.updatedAt)}</span>
          </div>
          <EvCard e={e} user={user} />
        </div>
      ))}

      {notifs.map((n, i) => (
        <div key={i} className={`nc ${n.unread ? "unread" : ""}`}>
          <div className="nc-head">
            <div className="nc-title">{n.title}</div>
            <div className="nc-ts">{timeAgo(n.ts)}</div>
          </div>
          <div className="nc-body">{n.body}</div>
        </div>
      ))}

      {changed.length === 0 && notifs.length === 0 && (
        <div className="empty">Keine aktuellen Änderungen.</div>
      )}
    </div>
  );
}

export { VorstellungView, ChangesView };

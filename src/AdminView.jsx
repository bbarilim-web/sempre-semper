import { useState, useEffect, useRef, useMemo } from "react";
import { PdfView } from "./PdfView.jsx";
import {
  normalizeProduction, splitProductions, isVorstellung, isChorfrei, isProbe,
  fmtDate, timeAgo, fmtD, addD, today, todayStr,
  MONTHS_DE, WEEKDAYS_DE, WEEKDAYS_FULL,
  TYPE_MAP, getStyle, PROBE_RANK, VOICES, PARTS,
} from "./utils.js";

function AdminSpielplan({ scheds, deleteEvent, setScheds, setEditModal, toast }) {
  const [filterMonth, setFilterMonth] = useState(todayStr.slice(0,7));
  const [filterType,  setFilterType]  = useState("all");
  const [cleaning,    setCleaning]    = useState(false);

  // 중복 감지: 같은 날짜+시간+제목/작품 조합
  const SOURCE_PRIORITY = { tagesplan:0, dienstplan:1, monatsplan:2, vorplanung:3 };
  const dupGroups = (() => {
    const groups = {};
    scheds.forEach(e => {
      const key = `${e.date}_${e.startTime}_${(e.production||e.title||"").toLowerCase().trim()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.values(groups).filter(g => g.length > 1);
  })();
  const dupIds = new Set(dupGroups.flatMap(g => {
    // 우선순위 낮은 것(숫자 큰 것) = 삭제 대상
    const sorted = [...g].sort((a,b) =>
      (SOURCE_PRIORITY[a.sourceType]??9) - (SOURCE_PRIORITY[b.sourceType]??9)
    );
    return sorted.slice(1).map(e => e.id); // 첫 번째(우선순위 높은 것) 빼고 나머지
  }));

  // 월 목록
  const months = [...new Set(scheds.map(e => e.date.slice(0,7)))].sort();

  // 필터링
  const filtered = scheds
    .filter(e => e.date.slice(0,7) === filterMonth)
    .filter(e => filterType === "all" ? true :
      filterType === "vs" ? isVorstellung(e) :
      filterType === "probe" ? isProbe(e) : isChorfrei(e))
    .sort((a,b) => (a.date+a.startTime).localeCompare(b.date+b.startTime));

  // 날짜별 그룹
  const byDate = {};
  filtered.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  const dateKeys = Object.keys(byDate).sort();

  // 중복 자동 정리
  const cleanDups = async () => {
    if (dupIds.size === 0) { toast("Keine Duplikate gefunden."); return; }
    if (!confirm(`${dupIds.size}doppelte Einträge löschen?\n(Nur Einträge mit niedrigerer Priorität werden gelöscht)`)) return;
    setCleaning(true);
    for (const id of dupIds) await deleteEvent(id);
    toast(`✓ ${dupIds.size}doppelte Einträge gelöscht`);
    setCleaning(false);
  };

  const deleteOldProben = async () => {
    const toDelete = scheds.filter(e => e.date < todayStr && !isVorstellung(e));
    if (!toDelete.length) { toast("Keine alten Proben."); return; }
    if (!confirm(`${toDelete.length}alte Proben löschen?`)) return;
    for (const e of toDelete) await deleteEvent(e.id);
    toast(`✓ ${toDelete.length}Einträge gelöscht`);
  };

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <div>
          <span style={{ fontFamily:"var(--serif)", fontSize:"1rem", fontWeight:600, color:"var(--text)" }}>
            Spielplan
          </span>
          <span style={{ marginLeft:8, fontSize:"0.74rem", color:"var(--muted)" }}>
            {scheds.length} Einträge
          </span>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap" }}>
          {dupIds.size > 0 && (
            <button onClick={cleanDups} disabled={cleaning}
              style={{ padding:"5px 12px", borderRadius:8, border:"1px solid rgba(255,159,10,0.5)",
                background:"rgba(255,159,10,0.12)", color:"var(--orange)",
                fontFamily:"var(--sans)", fontSize:"0.76rem", fontWeight:600, cursor:"pointer" }}>
              {cleaning ? "…" : `⚠ ${dupIds.size} Duplikate bereinigen`}
            </button>
          )}
          <button onClick={deleteOldProben}
            style={{ padding:"5px 12px", borderRadius:8, border:"1px solid var(--border)",
              background:"var(--s2)", color:"var(--muted)",
              fontFamily:"var(--sans)", fontSize:"0.76rem", cursor:"pointer" }}>
            🗑 Alte Proben
          </button>
          <button onClick={() => setEditModal("new")}
            style={{ padding:"5px 12px", borderRadius:8, border:"1px solid var(--accent)",
              background:"var(--accent)", color:"#fff",
              fontFamily:"var(--sans)", fontSize:"0.76rem", fontWeight:600, cursor:"pointer" }}>
            + Neu
          </button>
        </div>
      </div>

      {/* 중복 경고 배너 */}
      {dupIds.size > 0 && (
        <div style={{ padding:"10px 14px", background:"rgba(255,159,10,0.08)",
          border:"1px solid rgba(255,159,10,0.3)", borderRadius:10, marginBottom:12,
          fontSize:"0.78rem", color:"var(--orange)" }}>
          ⚠ {dupGroups.length}doppelte Einträge gefunden — niedrigste Priorität: {dupIds.size}können automatisch gelöscht werden.
        </div>
      )}

      {/* 월 탭 */}
      <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:10 }}>
        {months.map(m => {
          const [y, mo] = m.split("-").map(Number);
          const isAct = m === filterMonth;
          const cnt = scheds.filter(e => e.date.slice(0,7) === m).length;
          return (
            <button key={m} onClick={() => setFilterMonth(m)}
              style={{ padding:"4px 10px", borderRadius:16, border:`1px solid ${isAct?"var(--accent)":"var(--border)"}`,
                background: isAct ? "var(--accent)" : "var(--s1)",
                color: isAct ? "#fff" : "var(--text2)",
                fontFamily:"var(--sans)", fontSize:"0.72rem",
                fontWeight: isAct ? 700 : 400, cursor:"pointer", transition:"all 0.12s" }}>
              {MONTHS_DE[mo-1].slice(0,3)} {String(y).slice(2)}
              <span style={{ marginLeft:4, opacity:0.7, fontSize:"0.68em" }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* 타입 필터 */}
      <div style={{ display:"flex", gap:4, marginBottom:14 }}>
        {[["all","Alle"],["vs","VS"],["probe","Proben"],["frei","Chorfrei"]].map(([v,l]) => (
          <button key={v} onClick={() => setFilterType(v)}
            style={{ padding:"4px 10px", borderRadius:8,
              border:`1px solid ${filterType===v?"var(--accent)":"var(--border)"}`,
              background: filterType===v ? "var(--accent-dim)" : "transparent",
              color: filterType===v ? "var(--accent)" : "var(--text2)",
              fontFamily:"var(--sans)", fontSize:"0.74rem",
              fontWeight: filterType===v ? 600 : 400, cursor:"pointer" }}>
            {l}
          </button>
        ))}
        <span style={{ marginLeft:"auto", fontSize:"0.72rem", color:"var(--muted)", alignSelf:"center" }}>
          {filtered.length} Termine
        </span>
      </div>

      {/* 날짜별 카드 리스트 */}
      {dateKeys.length === 0 && (
        <div style={{ textAlign:"center", color:"var(--faint)", padding:40, fontSize:"0.88rem" }}>
          Keine Termine für diesen Monat.
        </div>
      )}
      {dateKeys.map(ds => {
        const evs = byDate[ds];
        const d = new Date(ds+"T12:00:00");
        const dow = ["So","Mo","Di","Mi","Do","Fr","Sa"][d.getDay()];
        const isT = ds === todayStr;
        const isPast = ds < todayStr;
        return (
          <div key={ds} style={{ marginBottom:10 }}>
            {/* 날짜 헤더 */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ width:36, height:36, borderRadius:9, flexShrink:0,
                background: isT ? "var(--accent)" : isPast ? "var(--s2)" : "var(--s1)",
                border:`1px solid ${isT?"var(--accent)":"var(--border)"}`,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:"0.56rem", fontWeight:700, lineHeight:1,
                  color: isT ? "rgba(255,255,255,0.8)" : "var(--faint)", textTransform:"uppercase" }}>{dow}</span>
                <span style={{ fontSize:"0.9rem", fontWeight:700, lineHeight:1,
                  color: isT ? "#fff" : isPast ? "var(--faint)" : "var(--text)" }}>{d.getDate()}</span>
              </div>
              <div style={{ fontSize:"0.72rem", color: isT ? "var(--accent)" : "var(--muted)", fontWeight: isT ? 700 : 400 }}>
                {MONTHS_DE[d.getMonth()]} {d.getFullYear()}
                {isT && <span style={{ marginLeft:6, fontSize:"0.66rem", background:"var(--accent)", color:"#fff", padding:"1px 5px", borderRadius:4 }}>Heute</span>}
              </div>
            </div>

            {/* 해당 날짜 이벤트들 */}
            <div style={{ marginLeft:44, display:"flex", flexDirection:"column", gap:4 }}>
              {evs.map(e => {
                const st = getStyle(e);
                const isDup = dupIds.has(e.id);
                return (
                  <div key={e.id} style={{ display:"flex", alignItems:"center", gap:0,
                    background: isDup ? "rgba(255,159,10,0.06)" : isVorstellung(e) ? "rgba(232,23,58,0.06)" : "var(--s1)",
                    border:`1px solid ${isDup?"rgba(255,159,10,0.4)":isVorstellung(e)?"rgba(232,23,58,0.25)":"var(--border)"}`,
                    borderLeft:`3px solid ${isDup?"var(--orange)":st.badgeBg}`,
                    borderRadius:9, opacity: isPast && !isVorstellung(e) ? 0.55 : 1,
                    overflow:"hidden" }}>
                    {/* 시간 */}
                    <div style={{ padding:"10px 12px", textAlign:"center", minWidth:46, flexShrink:0,
                      borderRight:"1px solid var(--border)" }}>
                      <div style={{ fontSize:"0.84rem", fontWeight:700, color: isVorstellung(e) ? "var(--accent)" : "var(--text)",
                        letterSpacing:"-0.02em", lineHeight:1 }}>
                        {e.startTime && e.startTime !== "00:00" ? e.startTime.slice(0,5) : "–"}
                      </div>
                    </div>
                    {/* 내용 */}
                    <div style={{ flex:1, padding:"8px 12px", minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                        <span style={{ fontSize:"0.85rem", fontWeight:600, color:"var(--text)",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {e.title}
                        </span>
                        <span style={{ fontSize:"0.62rem", fontWeight:700, flexShrink:0,
                          background:st.badgeBg+"22", color:st.text,
                          border:`1px solid ${st.badgeBg}44`, padding:"1px 5px", borderRadius:4 }}>
                          {st.badge}
                        </span>
                        {isDup && <span style={{ fontSize:"0.6rem", background:"var(--orange)", color:"#fff",
                          padding:"1px 4px", borderRadius:4, flexShrink:0 }}>DUP</span>}
                        {e._edited && <span style={{ fontSize:"0.6rem", background:"var(--orange)", color:"#fff",
                          padding:"1px 4px", borderRadius:4, flexShrink:0 }}>★</span>}
                      </div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        {e.targetGroup && (
                          <span style={{ fontSize:"0.68rem", color:"var(--muted)" }}>👥 {e.targetGroup}</span>
                        )}
                        {e.location && (
                          <span style={{ fontSize:"0.68rem", color:"var(--muted)" }}>📍 {e.location}</span>
                        )}
                        {e.conductor && (
                          <span style={{ fontSize:"0.68rem", color:"var(--muted)" }}>🎵 {e.conductor}</span>
                        )}
                        <span style={{ fontSize:"0.62rem", color:"var(--faint)", marginLeft:"auto" }}>
                          {e.sourceType?.slice(0,4)||"dien"}
                        </span>
                      </div>
                    </div>
                    {/* 수정 버튼 */}
                    <button onClick={() => setEditModal(e)}
                      style={{ padding:"10px 12px", background:"transparent", border:"none",
                        borderLeft:"1px solid var(--border)", cursor:"pointer",
                        color:"var(--muted)", fontSize:"0.82rem", flexShrink:0 }}>✎</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  BESETZUNGSSTATISTIK
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  DIENSTPLAN EDITOR  — für Chorbüro
// ═══════════════════════════════════════════════════════════════════════
function DienstplanEditor({ scheds, setScheds, deleteEvent, toast }) {
  const today = new Date();
  const getMonday = (d) => {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    dt.setDate(dt.getDate() + diff);
    return dt;
  };
  const fmtDate = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  };
  const addDays = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate()+n); return dt; };
  const DE_DAYS = ["So","Mo","Di","Mi","Do","Fr","Sa"];
  const DE_DAYS_FULL = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
  const DE_MONTHS = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

  const [weekStart, setWeekStart] = useState(() => getMonday(today));
  const [editEvt, setEditEvt] = useState(null); // null | "new:{date}" | event object
  const [printMode, setPrintMode] = useState(false);
  const [standDate, setStandDate] = useState(() => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
  });

  const weekDays = Array.from({length:7}, (_,i) => addDays(weekStart, i));
  const weekDayStrs = weekDays.map(d => fmtDate(d));

  const weekEvts = scheds
    .filter(e => weekDayStrs.includes(e.date))
    .sort((a,b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const evtsForDay = (dateStr) => weekEvts.filter(e => e.date === dateStr);

  const EVENT_TYPES = [
    { key:"Musikalische Probe",    short:"MP",  color:"#2E7BDB", bg:"rgba(46,123,219,0.12)" },
    { key:"Bühnenprobe",           short:"BP",  color:"#E8920A", bg:"rgba(232,146,10,0.12)" },
    { key:"Bühnenorchesterprobe",  short:"BO",  color:"#E8920A", bg:"rgba(232,146,10,0.12)" },
    { key:"Generalprobe",          short:"GP",  color:"#C0392B", bg:"rgba(192,57,43,0.12)"  },
    { key:"Orchesterhauptprobe",   short:"OHP", color:"#C0392B", bg:"rgba(192,57,43,0.12)"  },
    { key:"Kleines Hauptprobe",    short:"KHP", color:"#8E44AD", bg:"rgba(142,68,173,0.12)" },
    { key:"Konzertprobe",          short:"KP",  color:"#2DB34A", bg:"rgba(45,179,74,0.12)"  },
    { key:"Toneinspielung",        short:"TE",  color:"#16A085", bg:"rgba(22,160,133,0.12)" },
    { key:"Beleuchtungsprobe",     short:"Bel", color:"#7F8C8D", bg:"rgba(127,140,141,0.12)"},
    { key:"Vorstellung",           short:"VS",  color:"#E8173A", bg:"rgba(232,23,58,0.12)"  },
    { key:"Chorfrei",              short:"cf",  color:"#95A5A6", bg:"rgba(149,165,166,0.12)" },
    { key:"Sonstiges",             short:"So",  color:"#636E72", bg:"rgba(99,110,114,0.12)" },
  ];
  const typeInfo = (key) => EVENT_TYPES.find(t => t.key === key) || EVENT_TYPES[EVENT_TYPES.length-1];
  const isChFrei = (e) => e.eventType === "Chorfrei";

  // ── 이벤트 저장/삭제 ──────────────────────────────────────
  const saveEvent = (data) => {
    if (data.id) {
      setScheds(scheds.map(e => e.id === data.id ? {...data, updatedAt:Date.now(), _edited:true} : e));
      toast("✓ Termin aktualisiert");
    } else {
      const newEvt = {...data, id:"dp"+Date.now()+Math.random().toString(36).slice(2,5), updatedAt:Date.now(), _edited:false, sourceType:"dienstplan"};
      setScheds([...scheds, newEvt]);
      toast("✓ Termin hinzugefügt");
    }
    setEditEvt(null);
  };

  const removeEvent = (id) => {
    deleteEvent(id);
    toast("Termin gelöscht");
    setEditEvt(null);
  };

  // ── PDF 출력 ──────────────────────────────────────────────
  const printPlan = () => {
    const startStr = `${weekDays[0].getDate().toString().padStart(2,'0')}.${(weekDays[0].getMonth()+1).toString().padStart(2,'0')}.${weekDays[0].getFullYear()}`;
    const endStr   = `${weekDays[6].getDate().toString().padStart(2,'0')}.${(weekDays[6].getMonth()+1).toString().padStart(2,'0')}.${weekDays[6].getFullYear()}`;
    const dayRows = weekDayStrs.flatMap(dateStr => {
      const evs = evtsForDay(dateStr);
      const dt = new Date(dateStr+"T12:00:00");
      const dayLabel = `${DE_DAYS_FULL[dt.getDay()]}, ${dt.getDate().toString().padStart(2,'0')}.${(dt.getMonth()+1).toString().padStart(2,'0')}.${dt.getFullYear()}`;
      const result = [`<tr class="day-row"><td colspan="6">${dayLabel}</td></tr>`];
      if (evs.length === 0) {
        result.push(`<tr class="cf-row"><td></td><td></td><td>chorfrei</td><td></td><td></td><td></td></tr>`);
      } else {
        evs.forEach(e => {
          const ti = typeInfo(e.eventType);
          const timeStr = e.startTime && e.startTime !== "00:00"
            ? e.endTime && e.endTime !== "00:00" ? `${e.startTime} – ${e.endTime} Uhr` : `${e.startTime} Uhr`
            : "";
          const note = [e.note, e.conductor ? `Ltg: ${e.conductor}` : ""].filter(Boolean).join(" · ");
          result.push(`<tr>
            <td><span class="badge" style="background:${ti.bg};color:${ti.color}">${ti.short}</span></td>
            <td style="font-weight:600">${e.title||e.production||""}</td>
            <td>${timeStr}</td>
            <td>${e.location||""}</td>
            <td>${e.targetGroup||""}</td>
            <td style="color:#888;font-size:10px">${note}</td>
          </tr>`);
        });
      }
      return result;
    });
    const rows = dayRows;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Dienstplan ${startStr} – ${endStr}</title>
    <style>
      @page{size:A4;margin:15mm 12mm}
      body{font-family:'Arial',sans-serif;font-size:11px;margin:0;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1a1a2e;padding-bottom:8px;margin-bottom:14px}
      .header-left h1{font-size:14px;font-weight:700;margin:0 0 2px;color:#1a1a2e}
      .header-left .sub{font-size:10px;color:#555}
      .header-right{font-size:10px;color:#888;text-align:right}
      table{width:100%;border-collapse:collapse;margin-top:0}
      thead tr{background:#1a1a2e}
      th{color:#fff;padding:5px 7px;text-align:left;font-size:10px;font-weight:600;letter-spacing:0.03em}
      td{padding:5px 7px;border-bottom:1px solid #e8e8e8;vertical-align:middle;font-size:10.5px}
      .day-row td{background:#f5f5f7;font-weight:700;color:#1a1a2e;font-size:11px;border-top:2px solid #ccc;padding:5px 7px}
      .cf-row td{color:#aaa;font-style:italic}
      .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9.5px;font-weight:800;letter-spacing:0.03em}
      .footer{margin-top:16px;font-size:9px;color:#bbb;border-top:1px solid #eee;padding-top:6px;display:flex;justify-content:space-between}
      @media print{body{margin:0}}
    </style></head><body>
    <div class="header">
      <div class="header-left">
        <h1>Sächsische Staatstheater Dresden Semperoper — Staatsopernchor</h1>
        <div class="sub">Dienstplan &nbsp;${startStr} – ${endStr}</div>
      </div>
      <div class="header-right">Stand: ${standDate}</div>
    </div>
    <table>
      <thead><tr><th>Typ</th><th>Titel / Produktion</th><th>Zeit</th><th>Ort</th><th>Gruppe</th><th>Hinweis</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <div class="footer"><span>Änderungen sind jederzeit möglich und ausdrücklich vorbehalten.</span><span>© Staatsopernchor Dresden</span></div>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
    </body></html>`;
    const w = window.open("","_blank","width=900,height=700");
    w.document.write(html);
    w.document.close();
  };

  // ── 이메일 본문 생성 (공통 — mailto & 직접발송 모두 사용) ───────────
  const buildEmailContent = () => {
    const startStr = `${weekDays[0].getDate().toString().padStart(2,'0')}.${(weekDays[0].getMonth()+1).toString().padStart(2,'0')}.${weekDays[0].getFullYear()}`;
    const endStr   = `${weekDays[6].getDate().toString().padStart(2,'0')}.${(weekDays[6].getMonth()+1).toString().padStart(2,'0')}.${weekDays[6].getFullYear()}`;
    const subject  = `Dienstplan ${startStr}–${endStr}`;
    const lines = [
      "Liebe Kolleginnen und Kollegen,",
      "",
      `anbei der Dienstplan für die Woche ${startStr} – ${endStr} (Stand: ${standDate}).`,
      "",
    ];
    weekDayStrs.forEach(dateStr => {
      const dt  = new Date(dateStr+"T12:00:00");
      const evs = evtsForDay(dateStr);
      lines.push(`${DE_DAYS_FULL[dt.getDay()]}, ${dt.getDate().toString().padStart(2,'0')}.${(dt.getMonth()+1).toString().padStart(2,'0')}.:`);
      if (evs.length === 0) {
        lines.push("  — chorfrei");
      } else {
        evs.forEach(e => {
          const ti   = typeInfo(e.eventType);
          const time = e.startTime && e.startTime !== "00:00" ? e.startTime : "";
          const end  = e.endTime   && e.endTime   !== "00:00" ? `–${e.endTime} Uhr` : (time ? " Uhr" : "");
          const note = e.note ? ` (${e.note})` : "";
          lines.push(`  ${ti.short.padEnd(4)}${time}${end}  ${e.title||e.production||""}${e.location ? "  "+e.location : ""}${e.targetGroup ? "  ["+e.targetGroup+"]" : ""}${note}`);
        });
      }
      lines.push("");
    });
    lines.push("Mit freundlichen Grüßen");
    lines.push("Chorbüro der Sächsischen Staatsoper Dresden");
    lines.push("");
    lines.push("──────────────────────────────────────────────");
    lines.push("Änderungen sind jederzeit möglich und ausdrücklich vorbehalten.");
    return { subject, body: lines.join("\n") };
  };

  // ── 방법 1 (현재): mailto — 기본 메일 앱 열기 ─────────────────────
  // TODO: 방법 2 (추후): Firebase/SendGrid로 앱 내 직접 발송
  //   const sendEmailDirect = async (recipients, subject, body) => {
  //     await fetch("/api/send-email", { method:"POST",
  //       headers:{"Content-Type":"application/json"},
  //       body: JSON.stringify({ to: recipients, subject, body })
  //     });
  //   };
  const sendEmail = () => {
    const { subject, body } = buildEmailContent();
    // mailto: 링크 — Gmail / Outlook / Thunderbird 등 기본 메일 앱이 열림
    // body가 너무 길면 일부 메일 클라이언트에서 잘릴 수 있음 (브라우저 URL 길이 제한)
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_self");
  };

  // ── 이벤트 편집 모달 ──────────────────────────────────────
  const EventEditModal = ({ initial, onSave, onClose, onDelete }) => {
    const isNew = !initial?.id;
    const [form, setForm] = useState({
      date:        initial?.date || (editEvt?.toString?.().startsWith?.("new:") ? editEvt.slice(4) : ""),
      startTime:   initial?.startTime || "",
      endTime:     initial?.endTime || "",
      eventType:   initial?.eventType || "Musikalische Probe",
      title:       initial?.title || "",
      production:  initial?.production || "",
      location:    initial?.location || "",
      targetGroup: initial?.targetGroup || "",
      conductor:   initial?.conductor || "",
      note:        initial?.note || "",
      ...( initial?.id ? {id: initial.id} : {} )
    });
    const set = (k,v) => setForm(f => ({...f,[k]:v}));
    const ti = typeInfo(form.eventType);
    const uniqueProds = [...new Set(scheds.map(e=>e.production).filter(Boolean))].sort();
    const commonLocations = ["Bühne","Chorsaal","Probebühne 1","Probebühne 2","Orchesterprobesaal","Semperoper"];
    const commonGroups = ["Alle Eingeteilten","Alle Herren","Alle Damen","Sopran","Alt","Tenor","Bass","Alle","nach Ansage"];

    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:2000, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background:"var(--bg)", borderRadius:"18px 18px 0 0", width:"100%", maxWidth:600, maxHeight:"92vh",
          overflowY:"auto", padding:"20px 20px 40px" }}>
          {/* 헤더 */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontFamily:"var(--serif)", fontSize:"1rem", fontWeight:600 }}>
              {isNew ? "Termin hinzufügen" : "Termin bearbeiten"}
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", fontSize:"1.2rem", cursor:"pointer", color:"var(--muted)" }}>✕</button>
          </div>

          {/* 이벤트 타입 선택 */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:"0.7rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Typ</div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {EVENT_TYPES.filter(t=>t.key!=="Sonstiges").map(t => (
                <button key={t.key} onClick={()=>set("eventType",t.key)}
                  style={{ padding:"5px 10px", borderRadius:7, border:`1px solid ${form.eventType===t.key?t.color:"var(--border)"}`,
                    background: form.eventType===t.key ? t.bg : "var(--s2)",
                    color: form.eventType===t.key ? t.color : "var(--text2)",
                    fontSize:"0.76rem", fontWeight:form.eventType===t.key?700:400,
                    fontFamily:"var(--sans)", cursor:"pointer" }}>
                  {t.short}
                </button>
              ))}
            </div>
          </div>

          {/* 날짜 / 시간 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
            {[["date","Datum","date"],["startTime","Beginn","time"],["endTime","Ende","time"]].map(([k,l,type])=>(
              <div key={k}>
                <div style={{ fontSize:"0.7rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{l}</div>
                <input type={type} value={form[k]} onChange={e=>set(k,e.target.value)}
                  style={{ width:"100%", padding:"7px 8px", background:"var(--s2)", border:"1px solid var(--border)",
                    borderRadius:8, color:"var(--text)", fontFamily:"var(--sans)", fontSize:"0.84rem", boxSizing:"border-box" }}/>
              </div>
            ))}
          </div>

          {/* 제목 */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:"0.7rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Titel</div>
            <input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="z.B. Parsifal Bühnenprobe"
              style={{ width:"100%", padding:"8px 10px", background:"var(--s2)", border:"1px solid var(--border)",
                borderRadius:8, color:"var(--text)", fontFamily:"var(--sans)", fontSize:"0.84rem", boxSizing:"border-box" }}/>
          </div>

          {/* 작품 */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:"0.7rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Produktion</div>
            <input value={form.production} onChange={e=>set("production",e.target.value)}
              list="prod-list" placeholder="Produktion wählen…"
              style={{ width:"100%", padding:"8px 10px", background:"var(--s2)", border:"1px solid var(--border)",
                borderRadius:8, color:"var(--text)", fontFamily:"var(--sans)", fontSize:"0.84rem", boxSizing:"border-box" }}/>
            <datalist id="prod-list">{uniqueProds.map(p=><option key={p} value={p}/>)}</datalist>
          </div>

          {/* 장소 / 대상 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:"0.7rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Ort</div>
              <input value={form.location} onChange={e=>set("location",e.target.value)}
                list="loc-list" placeholder="Ort…"
                style={{ width:"100%", padding:"7px 8px", background:"var(--s2)", border:"1px solid var(--border)",
                  borderRadius:8, color:"var(--text)", fontFamily:"var(--sans)", fontSize:"0.84rem", boxSizing:"border-box" }}/>
              <datalist id="loc-list">{commonLocations.map(l=><option key={l} value={l}/>)}</datalist>
            </div>
            <div>
              <div style={{ fontSize:"0.7rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Gruppe</div>
              <input value={form.targetGroup} onChange={e=>set("targetGroup",e.target.value)}
                list="grp-list" placeholder="Gruppe…"
                style={{ width:"100%", padding:"7px 8px", background:"var(--s2)", border:"1px solid var(--border)",
                  borderRadius:8, color:"var(--text)", fontFamily:"var(--sans)", fontSize:"0.84rem", boxSizing:"border-box" }}/>
              <datalist id="grp-list">{commonGroups.map(g=><option key={g} value={g}/>)}</datalist>
            </div>
          </div>

          {/* 지휘자 / 비고 */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:18 }}>
            {[["conductor","Dirigent"],["note","Hinweis"]].map(([k,l])=>(
              <div key={k}>
                <div style={{ fontSize:"0.7rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{l}</div>
                <input value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={l+"…"}
                  style={{ width:"100%", padding:"7px 8px", background:"var(--s2)", border:"1px solid var(--border)",
                    borderRadius:8, color:"var(--text)", fontFamily:"var(--sans)", fontSize:"0.84rem", boxSizing:"border-box" }}/>
              </div>
            ))}
          </div>

          {/* 저장 / 삭제 */}
          <div style={{ display:"flex", gap:8 }}>
            {!isNew && <button onClick={()=>onDelete(initial.id)}
              style={{ padding:"10px 16px", borderRadius:10, border:"1px solid var(--border)",
                background:"none", color:"#E8173A", fontFamily:"var(--sans)", fontSize:"0.84rem", cursor:"pointer" }}>
              Löschen
            </button>}
            <button onClick={onClose}
              style={{ padding:"10px 16px", borderRadius:10, border:"1px solid var(--border)",
                background:"var(--s2)", color:"var(--text2)", fontFamily:"var(--sans)", fontSize:"0.84rem", cursor:"pointer" }}>
              Abbrechen
            </button>
            <button onClick={()=>onSave(form)} disabled={!form.date || !form.eventType}
              style={{ flex:1, padding:"10px", borderRadius:10, border:"none",
                background:ti.color, color:"#fff", fontFamily:"var(--sans)",
                fontSize:"0.9rem", fontWeight:700, cursor:"pointer", letterSpacing:"-0.01em" }}>
              {isNew ? "Hinzufügen" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── 주간 달력 뷰 ──────────────────────────────────────────
  return (
    <div style={{ paddingBottom:60 }}>
      {/* 헤더 */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ fontFamily:"var(--serif)", fontSize:"1.05rem", fontWeight:600, color:"var(--text)", flex:1 }}>
          Dienstplan erstellen
        </div>
        <button onClick={()=>setWeekStart(getMonday(today))}
          style={{ padding:"5px 12px", borderRadius:8, border:"1px solid var(--border)",
            background:"var(--s2)", color:"var(--text2)", fontFamily:"var(--sans)", fontSize:"0.78rem", cursor:"pointer" }}>
          Heute
        </button>
        <button onClick={() => {
          const prevWeekStrs = Array.from({length:7}, (_,i) => fmtDate(addDays(weekStart,-7+i)));
          const prevEvts = scheds.filter(e => prevWeekStrs.includes(e.date));
          if (prevEvts.length === 0) { toast("Letzte Woche hat keine Termine."); return; }
          const copied = prevEvts.map(e => ({
            ...e,
            id: "dp"+Date.now()+Math.random().toString(36).slice(2,6),
            date: fmtDate(addDays(new Date(e.date+"T12:00:00"), 7)),
            updatedAt: Date.now(), _edited: false, sourceType:"dienstplan"
          }));
          setScheds([...scheds, ...copied]);
          toast(`✓ ${copied.length} Termine aus Vorwoche kopiert`);
        }}
          style={{ padding:"5px 12px", borderRadius:8, border:"1px solid var(--border)",
            background:"var(--s2)", color:"var(--text2)", fontFamily:"var(--sans)", fontSize:"0.78rem", cursor:"pointer" }}>
          ↻ Vorwoche
        </button>
        <button onClick={()=>setWeekStart(addDays(weekStart,-7))}
          style={{ padding:"5px 10px", borderRadius:8, border:"1px solid var(--border)",
            background:"var(--s2)", color:"var(--text2)", fontFamily:"var(--sans)", fontSize:"0.9rem", cursor:"pointer" }}>‹</button>
        <div style={{ fontSize:"0.84rem", fontWeight:600, color:"var(--text)", minWidth:140, textAlign:"center" }}>
          {`${weekDays[0].getDate()}. ${DE_MONTHS[weekDays[0].getMonth()]} – ${weekDays[6].getDate()}. ${DE_MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`}
        </div>
        <button onClick={()=>setWeekStart(addDays(weekStart,7))}
          style={{ padding:"5px 10px", borderRadius:8, border:"1px solid var(--border)",
            background:"var(--s2)", color:"var(--text2)", fontFamily:"var(--sans)", fontSize:"0.9rem", cursor:"pointer" }}>›</button>
      </div>

      {/* Stand-Datum + 액션 버튼 */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, flex:1 }}>
          <span style={{ fontSize:"0.75rem", color:"var(--muted)", whiteSpace:"nowrap" }}>Stand:</span>
          <input value={standDate} onChange={e=>setStandDate(e.target.value)}
            style={{ width:100, padding:"5px 8px", background:"var(--s2)", border:"1px solid var(--border)",
              borderRadius:7, color:"var(--text)", fontFamily:"var(--sans)", fontSize:"0.8rem" }}/>
        </div>
        <button onClick={printPlan}
          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:9,
            border:"1px solid var(--border)", background:"var(--s2)", color:"var(--text)",
            fontFamily:"var(--sans)", fontSize:"0.8rem", cursor:"pointer", fontWeight:500 }}>
          🖨 PDF
        </button>
        {/* ✉ 이메일 버튼
            현재: mailto: 로 기본 메일 앱 열기
            추후: 앱 내 직접 발송 (Firebase/SendGrid) 으로 교체 예정 */}
        <button onClick={sendEmail}
          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:9,
            border:"1px solid #2E7BDB", background:"rgba(46,123,219,0.1)", color:"#2E7BDB",
            fontFamily:"var(--sans)", fontSize:"0.8rem", cursor:"pointer", fontWeight:600 }}>
          ✉ E-Mail senden
        </button>
      </div>

      {/* 주간 일정 */}
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {weekDayStrs.map(dateStr => {
          const dt = new Date(dateStr+"T12:00:00");
          const isToday = dateStr === fmtDate(today);
          const isSunday = dt.getDay() === 0;
          const evs = evtsForDay(dateStr);

          return (
            <div key={dateStr}
              style={{ background:"var(--s1)", border:`1px solid ${isToday?"var(--accent)":"var(--border)"}`,
                borderRadius:12, overflow:"hidden",
                opacity: isSunday ? 0.65 : 1 }}>
              {/* 날짜 헤더 */}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px",
                background: isToday ? "var(--accent-dim)" : "var(--s2)",
                borderBottom: evs.length > 0 ? "1px solid var(--border)" : "none" }}>
                <div style={{ fontWeight:700, fontSize:"0.88rem",
                  color: isToday ? "var(--accent)" : "var(--text)" }}>
                  {DE_DAYS[dt.getDay()]}
                </div>
                <div style={{ fontSize:"0.84rem", color:"var(--text2)" }}>
                  {dt.getDate().toString().padStart(2,'0')}.{(dt.getMonth()+1).toString().padStart(2,'0')}.
                </div>
                {evs.length === 0 && (
                  <div style={{ fontSize:"0.74rem", color:"var(--faint)", fontStyle:"italic" }}>chorfrei</div>
                )}
                <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
                  <button onClick={()=>setEditEvt(`new:${dateStr}`)}
                    style={{ padding:"3px 10px", borderRadius:7, border:"1px solid var(--border)",
                      background:"var(--s1)", color:"var(--accent)", fontFamily:"var(--sans)",
                      fontSize:"0.76rem", fontWeight:700, cursor:"pointer" }}>
                    + Termin
                  </button>
                </div>
              </div>

              {/* 이벤트 목록 */}
              {evs.map(e => {
                const ti = typeInfo(e.eventType);
                const timeStr = e.startTime && e.startTime !== "00:00"
                  ? e.endTime && e.endTime !== "00:00" ? `${e.startTime}–${e.endTime}` : e.startTime
                  : "";
                return (
                  <div key={e.id} onClick={()=>setEditEvt(e)}
                    style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"9px 12px",
                      borderBottom:"1px solid var(--border)", cursor:"pointer",
                      transition:"background 0.1s" }}
                    onMouseEnter={el=>el.currentTarget.style.background="var(--s2)"}
                    onMouseLeave={el=>el.currentTarget.style.background="transparent"}>
                    <span style={{ background:ti.bg, color:ti.color, padding:"2px 7px",
                      borderRadius:5, fontSize:"0.7rem", fontWeight:800,
                      flexShrink:0, marginTop:1 }}>{ti.short}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:"0.85rem", fontWeight:600, color:"var(--text)",
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {e.title || e.production || e.eventType}
                      </div>
                      <div style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:1 }}>
                        {[timeStr, e.location, e.targetGroup].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span style={{ fontSize:"0.7rem", color:"var(--faint)", flexShrink:0 }}>✎</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 이벤트 편집 모달 */}
      {editEvt && (
        <EventEditModal
          initial={typeof editEvt === "string" ? { date: editEvt.startsWith("new:") ? editEvt.slice(4) : "" } : editEvt}
          onSave={saveEvent}
          onClose={()=>setEditEvt(null)}
          onDelete={removeEvent}
        />
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════
//  ANPROBE EDITOR  — 단원별 개별 의상 피팅 일정 관리
// ═══════════════════════════════════════════════════════════════════════
function BesetzungsStatistik({ scheds, users, allSettings }) {
  const [view, setView]           = useState("summary");
  const [selSeason, setSelSeason] = useState("all");
  const [selProd, setSelProd]     = useState(null);
  const [selMember, setSelMember] = useState(null);
  const [search, setSearch]       = useState("");

  const VOICE_COL = { Sopran:"#E8920A", Alt:"#2DB34A", Tenor:"#2E7BDB", Bass:"#E8173A" };

  const getSeasonLabel = (date) => {
    if (!date) return "Unbekannt";
    const d = new Date(date + "T12:00:00");
    const y = d.getFullYear(); const m = d.getMonth();
    const s = m >= 7 ? y : y - 1;
    return `${s}/${String(s+1).slice(2)}`;
  };

  const vorstellungen = scheds.filter(e => e.eventType === "Vorstellung" && e.production);
  const seasons = ["all", ...[...new Set(vorstellungen.map(e => getSeasonLabel(e.date)))].sort().reverse()];
  const filteredVS = selSeason === "all" ? vorstellungen
    : vorstellungen.filter(e => getSeasonLabel(e.date) === selSeason);
  const allProds = [...new Set(filteredVS.map(e => e.production).filter(Boolean))].sort();

  const memberStats = users.map(u => {
    const uSet = allSettings[u.id] || {};
    const myProds = uSet.myProductions || [];
    const prodSeasons = uSet.productionSeasons || {};
    const prodsInSeason = myProds.filter(prod => {
      const inVS = allProds.some(p =>
        p.toLowerCase() === prod.toLowerCase() ||
        p.toLowerCase().includes(prod.toLowerCase()) ||
        prod.toLowerCase().includes(p.toLowerCase())
      );
      if (!inVS) return false;
      if (selSeason === "all") return true;
      const ps = prodSeasons[prod];
      return !ps || ps === selSeason;
    });
    return {
      id: u.id,
      name: (u.name || u.email || u.id).split(" · ")[0],
      part: u.part || "",
      voice: u.voice || "",
      productions: prodsInSeason,
      prodCount: prodsInSeason.length,
    };
  });

  const prodStats = allProds.map(prod => {
    const members = memberStats.filter(m =>
      m.productions.some(p => p.toLowerCase() === prod.toLowerCase() ||
        p.toLowerCase().includes(prod.toLowerCase()) ||
        prod.toLowerCase().includes(p.toLowerCase()))
    );
    const byVoice = {};
    members.forEach(m => { byVoice[m.voice] = (byVoice[m.voice]||0)+1; });
    return { prod, members, byVoice, total: members.length };
  });

  const exportCSV = () => {
    const rows = [["Name","Stimmgruppe","Stimme",...allProds,"Gesamt"]];
    [...memberStats].sort((a,b) => {
      const vo=["Sopran","Alt","Tenor","Bass"];
      const vi=vo.indexOf(a.voice)-vo.indexOf(b.voice);
      return vi!==0?vi:a.name.localeCompare(b.name);
    }).forEach(m => {
      const row=[m.name,m.part,m.voice];
      allProds.forEach(prod => row.push(
        m.productions.some(p=>p.toLowerCase()===prod.toLowerCase()||
          p.toLowerCase().includes(prod.toLowerCase())||
          prod.toLowerCase().includes(p.toLowerCase()))?"✓":""
      ));
      row.push(m.prodCount); rows.push(row);
    });
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`Besetzung_${selSeason}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ paddingBottom:40 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ fontFamily:"var(--serif)", fontSize:"1.05rem", fontWeight:600, color:"var(--text)" }}>Besetzungsstatistik</div>
        <select value={selSeason} onChange={e=>{setSelSeason(e.target.value);setSelProd(null);setSelMember(null);}}
          style={{ marginLeft:"auto", background:"var(--s2)", border:"1px solid var(--border)", borderRadius:8,
            color:"var(--text)", padding:"5px 10px", fontSize:"0.82rem", fontFamily:"var(--sans)", cursor:"pointer" }}>
          {seasons.map(s=><option key={s} value={s}>{s==="all"?"Alle Spielzeiten":`Spielzeit ${s}`}</option>)}
        </select>
        <button onClick={exportCSV} style={{ background:"var(--s2)", border:"1px solid var(--border)", borderRadius:8,
          color:"var(--text)", padding:"5px 12px", fontSize:"0.82rem", fontFamily:"var(--sans)", cursor:"pointer" }}>↓ CSV</button>
      </div>

      <div style={{ display:"flex", gap:4, marginBottom:16, background:"var(--s2)", borderRadius:10, padding:4 }}>
        {[["summary","📊 Übersicht"],["byProduction","🎭 Produktion"],["byMember","👤 Mitglied"]].map(([v,l])=>(
          <button key={v} onClick={()=>{setView(v);setSelProd(null);setSelMember(null);setSearch("");}}
            style={{ flex:1, padding:"7px 6px", borderRadius:8, border:"none", cursor:"pointer",
              background:view===v?"var(--accent)":"transparent",
              color:view===v?"#fff":"var(--text2)", fontFamily:"var(--sans)",
              fontSize:"0.78rem", fontWeight:view===v?600:400, transition:"all 0.15s" }}>{l}</button>
        ))}
      </div>

      {view==="summary" && (
        <div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:"0.78rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>
              Produktionen ({allProds.length})
            </div>
            {allProds.length===0 && <div style={{ fontSize:"0.82rem", color:"var(--faint)", fontStyle:"italic" }}>Keine Vorstellungen.</div>}
            {prodStats.map(({prod,total,byVoice})=>(
              <div key={prod} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6,
                padding:"8px 12px", background:"var(--s1)", border:"1px solid var(--border)", borderRadius:8 }}>
                <div style={{ flex:1, fontSize:"0.84rem", fontWeight:500, color:"var(--text)" }}>{prod}</div>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  {["Sopran","Alt","Tenor","Bass"].map(v=>byVoice[v]?(
                    <span key={v} style={{ fontSize:"0.72rem", fontWeight:700, color:VOICE_COL[v],
                      background:VOICE_COL[v]+"18", borderRadius:5, padding:"2px 6px" }}>
                      {v.slice(0,1)}{byVoice[v]}
                    </span>
                  ):null)}
                  <span style={{ fontSize:"0.82rem", fontWeight:700, color:"var(--text2)", minWidth:20, textAlign:"right" }}>{total}</span>
                </div>
              </div>
            ))}
          </div>
          {["Sopran","Alt","Tenor","Bass"].map(voice=>{
            const vm=memberStats.filter(m=>m.voice===voice).sort((a,b)=>b.prodCount-a.prodCount);
            if(!vm.length) return null;
            const max=Math.max(...vm.map(m=>m.prodCount),1);
            const avg=vm.reduce((s,m)=>s+m.prodCount,0)/vm.length;
            return (
              <div key={voice} style={{ marginBottom:22 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontSize:"0.88rem", fontWeight:700, color:VOICE_COL[voice] }}>{voice}</div>
                  <div style={{ fontSize:"0.74rem", color:"var(--muted)" }}>Ø {avg.toFixed(1)} · {vm.length} Mitgl.</div>
                </div>
                {vm.map(m=>(
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <div style={{ width:120, fontSize:"0.74rem", color:"var(--text2)", flexShrink:0,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</div>
                    <div style={{ flex:1, height:14, background:"var(--s2)", borderRadius:3, overflow:"hidden" }}>
                      {m.prodCount>0&&<div style={{ height:"100%", borderRadius:3, transition:"width 0.4s",
                        width:`${(m.prodCount/max)*100}%`,
                        background:m.prodCount===max?VOICE_COL[voice]:VOICE_COL[voice]+"99" }}/>}
                    </div>
                    <div style={{ width:20, textAlign:"right", fontSize:"0.76rem", flexShrink:0,
                      fontWeight:m.prodCount===max?700:400,
                      color:m.prodCount===max?VOICE_COL[voice]:"var(--text2)" }}>{m.prodCount}</div>
                  </div>
                ))}
                <div style={{ fontSize:"0.68rem", color:"var(--faint)", marginTop:4, paddingLeft:128 }}>Ø {avg.toFixed(1)} Produktionen</div>
              </div>
            );
          })}
        </div>
      )}

      {view==="byProduction" && (
        <div>
          {selProd ? (
            <>
              <button onClick={()=>setSelProd(null)} style={{ background:"none", border:"none", color:"var(--accent)",
                cursor:"pointer", fontFamily:"var(--sans)", fontSize:"0.82rem", marginBottom:12, padding:0 }}>← Zurück</button>
              <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
                <div style={{ fontFamily:"var(--serif)", fontSize:"1rem", fontWeight:600, color:"var(--text)", marginBottom:4 }}>{selProd}</div>
                <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginBottom:16 }}>
                  {prodStats.find(p=>p.prod===selProd)?.total||0} Mitglieder eingesetzt
                </div>
                {["Sopran","Alt","Tenor","Bass"].map(voice=>{
                  const ms=(prodStats.find(p=>p.prod===selProd)?.members||[])
                    .filter(m=>m.voice===voice).sort((a,b)=>a.name.localeCompare(b.name));
                  if(!ms.length) return null;
                  return (
                    <div key={voice} style={{ marginBottom:12 }}>
                      <div style={{ fontSize:"0.72rem", fontWeight:700, color:VOICE_COL[voice],
                        textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>
                        {voice} ({ms.length})
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {ms.map(m=>(
                          <span key={m.id} style={{ background:"var(--s2)", border:"1px solid var(--border)",
                            borderRadius:6, padding:"3px 8px", fontSize:"0.78rem", color:"var(--text2)" }}>
                            {m.name}{m.part&&<span style={{ fontSize:"0.68rem", color:"var(--faint)", marginLeft:4 }}>{m.part}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {prodStats.map(({prod,total,byVoice})=>(
                <button key={prod} onClick={()=>setSelProd(prod)}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
                    background:"var(--s1)", border:"1px solid var(--border)",
                    borderLeft:"3px solid var(--accent)", borderRadius:10,
                    cursor:"pointer", textAlign:"left", fontFamily:"var(--sans)" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"0.9rem", fontWeight:600, color:"var(--text)" }}>{prod}</div>
                    <div style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:2 }}>
                      {total} Mitglieder
                      {["Sopran","Alt","Tenor","Bass"].map(v=>byVoice[v]?(
                        <span key={v} style={{ marginLeft:6, color:VOICE_COL[v] }}>{v.slice(0,1)}{byVoice[v]}</span>
                      ):null)}
                    </div>
                  </div>
                  <span style={{ color:"var(--faint)" }}>›</span>
                </button>
              ))}
              {allProds.length===0&&<div style={{ textAlign:"center", color:"var(--faint)", padding:40, fontSize:"0.88rem" }}>Keine Vorstellungen.</div>}
            </div>
          )}
        </div>
      )}

      {view==="byMember" && (
        <div>
          <input placeholder="Name suchen…" value={search} onChange={e=>{setSearch(e.target.value);setSelMember(null);}}
            style={{ width:"100%", padding:"8px 12px", background:"var(--s2)", border:"1px solid var(--border)",
              borderRadius:8, color:"var(--text)", fontFamily:"var(--sans)", fontSize:"0.84rem",
              marginBottom:12, boxSizing:"border-box" }}/>
          {selMember ? (
            <>
              <button onClick={()=>setSelMember(null)} style={{ background:"none", border:"none", color:"var(--accent)",
                cursor:"pointer", fontFamily:"var(--sans)", fontSize:"0.82rem", marginBottom:12, padding:0 }}>← Zurück</button>
              <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
                <div style={{ fontFamily:"var(--serif)", fontSize:"1rem", fontWeight:600, color:"var(--text)", marginBottom:2 }}>{selMember.name}</div>
                <div style={{ fontSize:"0.78rem", marginBottom:14, color:VOICE_COL[selMember.voice]||"var(--muted)" }}>
                  {selMember.part} · {selMember.prodCount} Produktion{selMember.prodCount!==1?"en":""}
                </div>
                {selMember.productions.length===0
                  ? <div style={{ fontSize:"0.82rem", color:"var(--faint)", fontStyle:"italic" }}>Keine Produktionen eingetragen.</div>
                  : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {[...selMember.productions].sort().map(prod=>(
                        <div key={prod} style={{ padding:"8px 12px", background:"var(--s2)",
                          border:"1px solid var(--border)", borderRadius:8, fontSize:"0.84rem", color:"var(--text)" }}>{prod}</div>
                      ))}
                    </div>
                }
              </div>
            </>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {["Sopran","Alt","Tenor","Bass"].map(voice=>{
                const vm=memberStats
                  .filter(m=>m.voice===voice&&(!search||
                    m.name.toLowerCase().includes(search.toLowerCase())||
                    m.part.toLowerCase().includes(search.toLowerCase())))
                  .sort((a,b)=>b.prodCount-a.prodCount||a.name.localeCompare(b.name));
                if(!vm.length) return null;
                return (
                  <div key={voice}>
                    <div style={{ fontSize:"0.72rem", fontWeight:700, color:VOICE_COL[voice],
                      textTransform:"uppercase", letterSpacing:"0.08em", padding:"8px 0 4px", marginTop:4 }}>{voice}</div>
                    {vm.map(m=>(
                      <button key={m.id} onClick={()=>setSelMember(m)}
                        style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", width:"100%", marginBottom:4,
                          background:"var(--s1)", border:"1px solid var(--border)",
                          borderLeft:`3px solid ${VOICE_COL[m.voice]||"var(--border2)"}`,
                          borderRadius:10, cursor:"pointer", textAlign:"left", fontFamily:"var(--sans)" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:"0.88rem", fontWeight:600, color:"var(--text)" }}>{m.name}</div>
                          <div style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:1 }}>{m.part}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:"0.9rem", fontWeight:700, color:m.prodCount>0?VOICE_COL[m.voice]:"var(--faint)" }}>{m.prodCount}</div>
                          <div style={{ fontSize:"0.68rem", color:"var(--faint)" }}>Prod.</div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminView({ scheds, setScheds, deleteEvent, notifs, setNotifs, toast, settings, saveSettings, users, allSettings }) {
  const [atab, setAtab] = useState("scheds");
  const [editModal, setEditModal] = useState(null);
  const [notifModal, setNotifModal] = useState(false);

  const sortedScheds = [...scheds].sort((a, b) => a.date.localeCompare(b.date));

  // 매주 월요일 00:00 이후 지난 Probe 자동 삭제
  const lastProbeClean = settings?.lastProbeClean || "";
  useEffect(() => {
    if (scheds.length === 0) return;
    const now = new Date();
    const day = now.getDay();
    const lastMonday = new Date(now);
    const daysToMonday = day === 0 ? 6 : day - 1;
    lastMonday.setDate(now.getDate() - daysToMonday);
    lastMonday.setHours(0, 0, 0, 0);
    const mondayStr = fmtD(lastMonday);
    if (lastProbeClean >= mondayStr) return;
    const toDelete = scheds.filter(e => e.date < todayStr && e.eventType !== "Vorstellung");
    Promise.all(toDelete.map(e => deleteEvent(e.id))).then(() => {
      saveSettings({ ...settings, lastProbeClean: mondayStr });
      if (toDelete.length > 0) console.log(`[AutoClean] ${toDelete.length} alte Proben gelöscht`);
    });
  }, [scheds.length, lastProbeClean]);

  return (
    <div className="page">
      <div className="atabs">
        {[["scheds","Spielplan"], ["planer","✏️ Dienstplan"], ["import","PDF Import"], ["notifs","Mitteilungen"], ["statistik","📊 Besetzung"]].map(([v, l]) => (
          <button key={v} className={`atab${atab === v ? " on" : ""}`} onClick={() => setAtab(v)}>{l}</button>
        ))}
      </div>

      {atab === "scheds" && (
        <AdminSpielplan
          scheds={scheds}
          deleteEvent={deleteEvent}
          setScheds={setScheds}
          setEditModal={setEditModal}
          toast={toast}
        />
      )}

      {atab === "planer" && (
        <DienstplanEditor scheds={scheds} setScheds={setScheds} deleteEvent={deleteEvent} toast={toast} />
      )}



      {atab === "import" && (
        <PdfView scheds={scheds} setScheds={setScheds} deleteEvent={deleteEvent} user={{ role: "admin" }} toast={toast} />
      )}

      {atab === "notifs" && (
        <>
          <div className="sh"><h2>Mitteilungen</h2><button className="btn btn-gold btn-sm" onClick={() => setNotifModal(true)}>+ Senden</button></div>
          {notifs.length === 0 && <div className="empty">Keine Mitteilungen.</div>}
          {notifs.map((n, i) => (
            <div key={i} className="nc unread" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="nc-title">{n.title}</div>
                <div className="nc-body">{n.body}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--faint)", marginTop: 4 }}>{timeAgo(n.ts)}</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => setNotifs(notifs.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </>
      )}

      {atab === "statistik" && (
        <BesetzungsStatistik scheds={scheds} users={users || []} allSettings={allSettings || {}} />
      )}

      {editModal && (
        <EventModal
          event={editModal === "new" ? null : editModal}
          onSave={d => {
            if (editModal === "new") {
              setScheds([...scheds, { ...d, id: "m" + Date.now(), updatedAt: Date.now(), _edited: false }]);
              toast("✓ Termin hinzugefügt");
            } else {
              setScheds(scheds.map(e => e.id === d.id ? { ...d, updatedAt: Date.now(), _edited: true } : e));
              toast("✓ Geändert — Mitglieder sehen die Änderung sofort");
            }
            setEditModal(null);
          }}
          onDelete={editModal !== "new" ? async () => { await deleteEvent(editModal.id); setEditModal(null); toast("Termin gelöscht"); } : null}
          onClose={() => setEditModal(null)}
        />
      )}

      {notifModal && (
        <NotifModal
          onSave={d => { setNotifs([{ ...d, ts: Date.now(), unread: true }, ...notifs]); setNotifModal(false); toast("✓ Mitteilung gesendet"); }}
          onClose={() => setNotifModal(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════════════════════
function EventModal({ event, onSave, onDelete, onClose }) {
  const [f, setF] = useState(event || {
    date: todayStr, startTime: "10:00", endTime: "13:00",
    eventType: "Musikalische Probe", title: "", production: "",
    location: "Chorsaal", targetGroup: "", conductor: "", note: "", sourceType: "dienstplan"
  });
  const s = (k, v) => setF(x => ({ ...x, [k]: v }));

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{event ? "Termin bearbeiten" : "Neuer Termin"}</h3>
        <div className="fg"><label>Typ</label>
          <select value={f.eventType} onChange={e => s("eventType", e.target.value)}>
            {["Vorstellung","Generalprobe","Orchesterhauptprobe","Kleines Hauptprobe","Bühnenorchesterprobe","Bühnenprobe","Szenische Probe","Musikalische Probe","Chorfrei","Halber Chorfrei"].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="fg"><label>Titel</label><input value={f.title} onChange={e => s("title", e.target.value)} /></div>
        <div className="fg"><label>Stück / Produktion</label><input value={f.production} onChange={e => s("production", e.target.value)} /></div>
        <div className="fg"><label>Datum</label><input type="date" value={f.date} onChange={e => s("date", e.target.value)} /></div>
        <div className="row2">
          <div className="fg"><label>Von</label><input type="time" value={f.startTime} onChange={e => s("startTime", e.target.value)} /></div>
          <div className="fg"><label>Bis</label><input type="time" value={f.endTime} onChange={e => s("endTime", e.target.value)} /></div>
        </div>
        <div className="fg"><label>Ort</label><input value={f.location} onChange={e => s("location", e.target.value)} /></div>
        <div className="fg"><label>Zielgruppe</label>
          <input value={f.targetGroup} onChange={e => s("targetGroup", e.target.value)} placeholder="z.B. Alle Herren, Alle eingeteilten Damen…" />
        </div>
        <div className="fg"><label>Einstudierung / Dirigent</label><input value={f.conductor} onChange={e => s("conductor", e.target.value)} /></div>
        <div className="fg"><label>Anmerkung</label><textarea rows={2} value={f.note} onChange={e => s("note", e.target.value)} /></div>
        <div className="fg"><label>Quelle</label>
          <select value={f.sourceType} onChange={e => s("sourceType", e.target.value)}>
            <option value="dienstplan">Dienstplan (wöchentlich)</option>
            <option value="monatsplan">Monatsplan</option>
            <option value="vorplanung">Vorplanung (saisonal)</option>
            <option value="tagesplan">Tagesplan</option>
          </select>
        </div>
        <div className="mfooter">
          {onDelete && <button className="btn btn-danger btn-sm" onClick={onDelete}>Löschen</button>}
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-gold" onClick={() => onSave(f)}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

function NotifModal({ onSave, onClose }) {
  const [f, setF] = useState({ title: "", body: "" });
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>Mitteilung an alle Mitglieder</h3>
        <div className="fg"><label>Betreff</label><input value={f.title} onChange={e => setF(x => ({ ...x, title: e.target.value }))} /></div>
        <div className="fg"><label>Nachricht</label><textarea rows={4} value={f.body} onChange={e => setF(x => ({ ...x, body: e.target.value }))} /></div>
        <div className="mfooter">
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-gold" onClick={() => onSave(f)}>Senden</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  PINNWAND VIEW
// ═══════════════════════════════════════════════════════════════════════

export { AdminSpielplan, DienstplanEditor, BesetzungsStatistik, AdminView, EventModal, NotifModal };

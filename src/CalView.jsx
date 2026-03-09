import { useState, useEffect, useMemo, useRef } from "react";
import {
  normalizeProduction, splitProductions,
  matchesMyProductions, isRelevantForUser,
  isVorstellung, isChorfrei, isProbe,
  fmtD, addD, today, todayStr,
  MONTHS_DE, WEEKDAYS_DE, WEEKDAYS_FULL,
  fmtDate, bassRequired,
  getStyle, PROBE_RANK, DVB_STOPS,
} from "./utils.js";
import { EvCard } from "./EvCard.jsx";

function CalView({ scheds, user, defaultView = "woche", settings }) {
  const now = new Date();
  const [viewMode, setViewMode] = useState(defaultView);
  const [selDate, setSelDate]   = useState(todayStr);
  const [showAll, setShowAll]   = useState(false);

  const myProductions = settings?.myProductions;
  const hasProductionFilter = myProductions && myProductions.length > 0;

  // helpers
  const SOURCE_PRIORITY = { tagesplan: 0, dienstplan: 1, monatsplan: 2, vorplanung: 3 };

  const evsByDate = d => {
    const dayEvs = [...scheds.filter(e => e.date === d)];
    const knownProds = [...new Set(scheds.map(e => e.production).filter(Boolean))];
    const sortedKnown = [...knownProds].sort((a,b) => b.length - a.length);
    // 중복 제거: production 정규화 후 같은 시간+작품은 더 상세한 소스 우선
    // 단, Parsifal(및 분리 편성 작품)은 targetGroup이 달라도 각각 표시
    const SPLIT_PRODUCTIONS = ["parsifal", "elias"];
    const isSplitProd = (e) => {
      const p = (e.production || e.title || "").toLowerCase();
      return SPLIT_PRODUCTIONS.some(s => p.includes(s));
    };
    const deduped = Object.values(
      dayEvs.reduce((acc, e) => {
        const normProd = e.production ? normalizeProduction(e.production, sortedKnown) : e.title;
        // 분리 편성 작품은 targetGroup도 키에 포함 → 그룹별로 독립 표시
        const tgKey = isSplitProd(e) ? `_${(e.targetGroup||"").toLowerCase().replace(/\s+/g,"")}` : "";
        const key = `${e.startTime}_${normProd}${tgKey}`;
        const existing = acc[key];
        if (!existing || (SOURCE_PRIORITY[e.sourceType] ?? 9) < (SOURCE_PRIORITY[existing.sourceType] ?? 9)) {
          acc[key] = { ...e, production: e.production ? normalizeProduction(e.production, sortedKnown) : e.production };
        }
        return acc;
      }, {})
    );
    return deduped.sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));
  };
  const myFilter  = evs => {
    // Alle 모드: targetGroup 필터와 production 필터 모두 해제
    if (showAll) return evs;

    // Meine 모드: 1) targetGroup 필터
    let filtered = evs.filter(e => {
      if (isChorfrei(e)) return true;
      if (isVorstellung(e)) return true;
      return isRelevantForUser(e, user);
    });

    // 2) production 필터
    if (hasProductionFilter) {
      filtered = filtered.filter(e =>
        isChorfrei(e) || matchesMyProductions(e, myProductions, scheds.flatMap(e2 => splitProductions(e2.production, [])).filter(Boolean), settings?.neuDazuProductions || [])
      );
    }
    return filtered;
  };
  const isChanged = e => e._edited && Date.now() - e.updatedAt < 48*3600000;

  const VIEW_MODES = [
    { id:"tag",    label:"Tag" },
    { id:"woche",  label:"Woche" },
    { id:"monat",  label:"Monat" },
    { id:"saison", label:"Saison" },
  ];

  // ── navigate by mode ──
  const navigate = dir => {
    const d = new Date(selDate + "T12:00:00");
    if (viewMode === "tag")    d.setDate(d.getDate() + dir);
    if (viewMode === "woche")  d.setDate(d.getDate() + dir*7);
    if (viewMode === "monat")  d.setMonth(d.getMonth() + dir);
    if (viewMode === "saison") d.setMonth(d.getMonth() + dir*6);
    setSelDate(fmtD(d));
  };

  // ── nav label ──
  const navLabel = () => {
    const d = new Date(selDate + "T12:00:00");
    if (viewMode === "tag")   return d.toLocaleDateString("de-DE", { weekday:"long", day:"numeric", month:"long" });
    if (viewMode === "woche") {
      const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay()+6)%7));
      const sun = new Date(mon); sun.setDate(mon.getDate()+6);
      return `${mon.toLocaleDateString("de-DE",{day:"numeric",month:"short"})} – ${sun.toLocaleDateString("de-DE",{day:"numeric",month:"short",year:"numeric"})}`;
    }
    if (viewMode === "monat")  return `${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;
    if (viewMode === "saison") return `Saison ${d.getFullYear()}/${d.getFullYear()+1}`;
    return "";
  };

  return (
    <div className="page">
      {/* View mode switcher */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, gap:8 }}>
        <div style={{ display:"flex", background:"var(--s2)", borderRadius:10, padding:3, gap:2 }}>
          {VIEW_MODES.map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)}
              style={{ padding:"5px 13px", border:"none", borderRadius:8, cursor:"pointer", fontFamily:"Inter,sans-serif",
                fontSize:"0.76rem", fontWeight:600, transition:"all 0.15s",
                background: viewMode===m.id ? "var(--s1)" : "transparent",
                color: viewMode===m.id ? "var(--text)" : "var(--muted)",
                boxShadow: viewMode===m.id ? "var(--shadow)" : "none" }}>
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <button className="fc" onClick={() => navigate(-1)} style={{ padding:"5px 11px", borderRadius:8 }}>‹</button>
          <button className="fc on" onClick={() => setSelDate(todayStr)} style={{ borderRadius:8, fontSize:"0.76rem" }}>Heute</button>
          <button className="fc" onClick={() => navigate(1)} style={{ padding:"5px 11px", borderRadius:8 }}>›</button>
        </div>
      </div>

      <div style={{ fontSize:"0.88rem", fontWeight:600, color:"var(--text)", marginBottom:14, letterSpacing:"-0.01em" }}>
        {navLabel()}
      </div>

      {/* My/All toggle */}
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        <button className={`fc${!showAll?" on":""}`} onClick={() => setShowAll(false)}>Meine</button>
        <button className={`fc${showAll?" on":""}`}  onClick={() => setShowAll(true)}>Alle</button>
      </div>

      {viewMode === "tag"    && <DayView    selDate={selDate} evsByDate={evsByDate} myFilter={myFilter} user={user} isChanged={isChanged} setSelDate={setSelDate} />}
      {viewMode === "woche"  && <WeekView   selDate={selDate} evsByDate={evsByDate} myFilter={myFilter} user={user} isChanged={isChanged} setSelDate={setSelDate} />}
      {viewMode === "monat"  && <MonthView  selDate={selDate} evsByDate={evsByDate} myFilter={myFilter} user={user} isChanged={isChanged} setSelDate={setSelDate} setViewMode={setViewMode} />}
      {viewMode === "saison" && <SaisonView selDate={selDate} scheds={scheds}       myFilter={myFilter} user={user} isChanged={isChanged} setSelDate={setSelDate} setViewMode={setViewMode} />}
    </div>
  );
}

// ── Tag (Day) ──
// ═══════════════════════════════════════════════════════════════════════
//  WEATHER BAR — Dresden Altstadt (open-meteo, kein API-Key nötig)
// ═══════════════════════════════════════════════════════════════════════
// WMO 날씨 코드 → 아이콘 + 독일어 텍스트
function wmoInfo(code) {
  if (code === 0)              return { icon:"☀️", label:"Sonnig" };
  if (code === 1)              return { icon:"🌤", label:"Überwiegend klar" };
  if (code === 2)              return { icon:"⛅️", label:"Teilweise bewölkt" };
  if (code === 3)              return { icon:"☁️", label:"Bedeckt" };
  if (code <= 49)              return { icon:"🌫", label:"Nebel" };
  if (code <= 55)              return { icon:"🌦", label:"Nieselregen" };
  if (code <= 67)              return { icon:"🌧", label:"Regen" };
  if (code <= 77)              return { icon:"❄️", label:"Schnee" };
  if (code <= 82)              return { icon:"🌧", label:"Starkregen" };
  if (code <= 86)              return { icon:"🌨", label:"Schneeschauer" };
  if (code <= 99)              return { icon:"⛈", label:"Gewitter" };
  return { icon:"🌡", label:"–" };
}

// 자전거 추천 여부
function bikeAdvice(weather) {
  if (!weather) return null;
  const { temp, rain, windspeed, wmo } = weather;
  const isRain = rain > 0.3 || (wmo >= 51 && wmo <= 82);
  const isSnow = wmo >= 71 && wmo <= 77;
  const isCold = temp < 2;
  const isWind = windspeed > 40;
  if (isSnow || isCold) return { ok: false, reason: "Schnee / Glatteis — Fahrrad nicht empfohlen" };
  if (isRain)           return { ok: false, reason: "Regen — Regenschutz empfohlen" };
  if (isWind)           return { ok: false, reason: "Starker Wind — Vorsicht beim Radfahren" };
  return { ok: true, reason: "Gutes Radwetter 🚲" };
}

function useWeather(dates) {
  const [data, setData] = useState({});
  useEffect(() => {
    if (!dates || dates.length === 0) return;
    const sorted = [...dates].sort();
    const start = sorted[0]; const end = sorted[sorted.length - 1];
    // Dresden Altstadt: 51.0504, 13.7373
    const url = `https://api.open-meteo.com/v1/forecast?latitude=51.0504&longitude=13.7373` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max` +
      `&hourly=temperature_2m,weathercode,precipitation,windspeed_10m` +
      `&timezone=Europe%2FBerlin&start_date=${start}&end_date=${end}`;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        const result = {};
        (json.daily?.time || []).forEach((d, i) => {
          result[d] = {
            wmo:       json.daily.weathercode[i],
            tempMax:   Math.round(json.daily.temperature_2m_max[i]),
            tempMin:   Math.round(json.daily.temperature_2m_min[i]),
            rain:      json.daily.precipitation_sum[i] || 0,
            windspeed: Math.round(json.daily.windspeed_10m_max[i] || 0),
            // 저녁 시간대 (17~21시) 대표값
            temp:      (() => {
              const idx17 = (json.hourly?.time || []).findIndex(t => t === `${d}T19:00`);
              return idx17 >= 0 ? Math.round(json.hourly.temperature_2m[idx17]) : Math.round(json.daily.temperature_2m_max[i]);
            })(),
          };
        });
        setData(result);
      })
      .catch(() => {});
  }, [dates.join(",")]);
  return data;
}

// 단일 날짜용 날씨 카드
function WeatherBar({ date }) {
  const weatherMap = useWeather([date]);
  const w = weatherMap[date];
  if (!w) return (
    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px",
      background:"var(--s1)", border:"1px solid var(--border)", borderRadius:10,
      marginBottom:12, fontSize:"0.74rem", color:"var(--faint)" }}>
      🌡 Wetter wird geladen…
    </div>
  );
  const { icon, label } = wmoInfo(w.wmo);
  const bike = bikeAdvice(w);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px",
      background:"var(--s1)", border:"1px solid var(--border)", borderRadius:10,
      marginBottom:12, flexWrap:"wrap" }}>
      <span style={{ fontSize:"1.3rem", lineHeight:1 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:"0.88rem", fontWeight:700, color:"var(--text)" }}>
            {w.tempMax}° <span style={{ fontSize:"0.72rem", fontWeight:400, color:"var(--muted)" }}>/ {w.tempMin}°</span>
          </span>
          <span style={{ fontSize:"0.76rem", color:"var(--text2)" }}>{label}</span>
          {w.rain > 0 && <span style={{ fontSize:"0.72rem", color:"var(--blue)" }}>💧 {w.rain.toFixed(1)} mm</span>}
          {w.windspeed > 20 && <span style={{ fontSize:"0.72rem", color:"var(--muted)" }}>💨 {w.windspeed} km/h</span>}
        </div>
        <div style={{ fontSize:"0.7rem", marginTop:2,
          color: bike?.ok ? "var(--green,#34C759)" : "var(--orange)" }}>
          {bike?.reason}
        </div>
      </div>
      <div style={{ fontSize:"0.62rem", color:"var(--faint)", alignSelf:"flex-end" }}>
        Dresden Altstadt
      </div>
    </div>
  );
}

// 주간 날씨 (WeekView용) — 날짜 배열 받아서 각 날짜 옆에 간단 날씨 표시
function WeatherInline({ date, weatherMap }) {
  const w = weatherMap[date];
  if (!w) return <span style={{ fontSize:"0.68rem", color:"var(--faint)" }}>…</span>;
  const { icon } = wmoInfo(w.wmo);
  const bike = bikeAdvice(w);
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4,
      fontSize:"0.72rem", color:"var(--text2)", marginLeft:"auto" }}>
      <span>{icon}</span>
      <span style={{ fontWeight:600, color:"var(--text)" }}>{w.tempMax}°</span>
      <span style={{ color:"var(--muted)" }}>{w.tempMin}°</span>
      {!bike?.ok && <span style={{ fontSize:"0.66rem", color:"var(--orange)" }}>🚲✗</span>}
    </span>
  );
}

function DayView({ selDate, evsByDate, myFilter, user, isChanged }) {
  const evs = myFilter(evsByDate(selDate));
  return (
    <div>
      <WeatherBar date={selDate} />
      {evs.length === 0
        ? <div className="empty">Kein Termin an diesem Tag.</div>
        : evs.map(e => <EvCard key={e.id} e={e} user={user} changed={isChanged(e)} />)
      }
    </div>
  );
}

// ── Woche (Week) ──
function WeekView({ selDate, evsByDate, myFilter, user, isChanged, setSelDate }) {
  const d = new Date(selDate + "T12:00:00");
  const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay()+6)%7));
  const days = Array.from({length:7}, (_,i) => { const x = new Date(mon); x.setDate(mon.getDate()+i); return fmtD(x); });

  const weatherMap = useWeather(days);
  return (
    <div>
      {days.map(ds => {
        const evs = myFilter(evsByDate(ds));
        const dd = new Date(ds + "T12:00:00");
        const isT = ds === todayStr;
        return (
          <div key={ds} style={{ marginBottom:16 }}>
            <div onClick={() => setSelDate(ds)} style={{ display:"flex", alignItems:"center", gap:8, paddingBottom:6,
              borderBottom:`2px solid ${isT ? "var(--accent)" : "var(--border)"}`, marginBottom:8, cursor:"pointer" }}>
              <span style={{ fontSize:"0.72rem", fontWeight:600, color: isT ? "var(--accent)" : "var(--muted)", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                {WEEKDAYS_FULL[dd.getDay()].slice(0,2)}
              </span>
              <span style={{ fontSize:"1.1rem", fontWeight:700, color: isT ? "var(--accent)" : "var(--text)", letterSpacing:"-0.02em" }}>
                {dd.getDate()}
              </span>
              <span style={{ fontSize:"0.78rem", color:"var(--muted)" }}>{MONTHS_DE[dd.getMonth()].slice(0,3)}</span>
              {evs.some(isChanged) && <span style={{ fontSize:"0.78rem", color:"var(--orange)" }}>★</span>}
              <WeatherInline date={ds} weatherMap={weatherMap} />
            </div>
            {evs.length === 0
              ? <div style={{ fontSize:"0.8rem", color:"var(--faint)", padding:"6px 0 4px", fontStyle:"italic" }}>Kein Termin</div>
              : evs.map(e => <EvCard key={e.id} e={e} user={user} changed={isChanged(e)} compact />)
            }
          </div>
        );
      })}
    </div>
  );
}

// ── Monat (Month) ──
function MonthView({ selDate, evsByDate, myFilter, user, isChanged, setSelDate, setViewMode }) {
  const d    = new Date(selDate + "T12:00:00");
  const yr   = d.getFullYear();
  const mo   = d.getMonth();
  const daysInMo  = new Date(yr, mo+1, 0).getDate();
  const firstDow  = (new Date(yr, mo, 1).getDay()+6) % 7;
  const cells = Array(firstDow).fill(null);
  for (let i=1; i<=daysInMo; i++) cells.push(i);

  return (
    <div>
      <div className="calgrid">
        {["Mo","Di","Mi","Do","Fr","Sa","So"].map(wd => <div key={wd} className="dow">{wd}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="cell other" />;
          const ds  = `${yr}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const evs = evsByDate(ds);
          const myEvs = myFilter(evs);
          const hasVS = evs.some(isVorstellung);
          const hasChange = evs.some(isChanged);
          const isT  = ds === todayStr;
          const isSel = ds === selDate;
          const isFrei = !hasVS && evs.length > 0 && evs.every(isChorfrei);
          // Probe 약어: MP = Musikalische Probe, SP = Szenische/Bühnprobe
          const probeEvs = myEvs.filter(e => !isVorstellung(e) && !isChorfrei(e));
          const hasMp = probeEvs.some(e =>
            e.eventType === "Musikalische Probe" || e.eventType === "Konzertprobe"
          );
          const hasSp = probeEvs.some(e =>
            e.eventType !== "Musikalische Probe" && e.eventType !== "Konzertprobe"
          );
          // VS 시간 이상 여부 (19:00 외의 시간)
          const vsEvsList = evs.filter(isVorstellung);
          const unusualVS = vsEvsList.filter(e => e.startTime && e.startTime !== "00:00" && !e.startTime.startsWith("19"));
          return (
            <div key={i} className={`cell${isT?" today":""}${isSel?" sel":""}`}
              onClick={() => { setSelDate(ds); setViewMode("tag"); }}>
              <div className="dn">{day}</div>
              {/* Vorstellung 배지 */}
              {hasVS && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:"2px", marginBottom:2 }}>
                  {vsEvsList.map((e,i) => (
                    <span key={i} style={{
                      display:"inline-block", fontSize:"0.54rem", fontWeight:700,
                      background:"transparent", color:"var(--accent)",
                      border:"1px solid var(--accent)", borderRadius:3,
                      padding:"0px 3px", lineHeight:"14px", maxWidth:"100%",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                    }}>
                      {(e.production||e.title||"VS").slice(0,8)}
                    </span>
                  ))}
                </div>
              )}
              {/* Probe 약어 */}
              {(hasMp || hasSp) && (
                <div style={{ display:"flex", gap:2, marginBottom:1 }}>
                  {hasMp && <span style={{ fontSize:"0.54rem", fontWeight:700, color:"var(--blue)",
                    background:"rgba(46,123,219,0.12)", borderRadius:3, padding:"0px 3px", lineHeight:"14px" }}>MP</span>}
                  {hasSp && <span style={{ fontSize:"0.54rem", fontWeight:700, color:"var(--orange)",
                    background:"rgba(255,159,10,0.12)", borderRadius:3, padding:"0px 3px", lineHeight:"14px" }}>SP</span>}
                </div>
              )}
              {/* 비정상 VS 시간 경고 */}
              {unusualVS.length > 0 && (
                <div className="unusual-time-badge">
                  ⏰{unusualVS[0].startTime.slice(0,5)}
                </div>
              )}
              {isFrei && <div style={{ fontSize:"0.56rem", color:"var(--faint)", fontStyle:"italic" }}>frei</div>}
              {hasChange && <div style={{ position:"absolute", top:3, right:3, width:5, height:5, borderRadius:"50%", background:"var(--orange)" }} />}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop:10, fontSize:"0.74rem", color:"var(--faint)", textAlign:"center" }}>
        Auf Tag tippen für Details
      </div>
    </div>
  );
}

// ── Saison (Season overview) ──
function SaisonView({ selDate, scheds, myFilter, user, isChanged, setSelDate, setViewMode }) {
  const d = new Date(selDate + "T12:00:00");
  // Saison starts in September (month index 8).
  // If we're Jan–Aug, the season started last year.
  const baseYear = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;

  // build 12 months Sep(baseYear) → Aug(baseYear+1)
  const months = [];
  for (let i = 0; i < 12; i++) {
    const mo = (8 + i) % 12;  // Sep=8, Oct=9 … Aug=7
    const yr = mo >= 8 ? baseYear : baseYear + 1;
    months.push({ yr, mo });
  }

  // Group scheds by YYYY-MM
  const byMonth = {};
  scheds.forEach(e => {
    const k = e.date.slice(0, 7);
    if (!byMonth[k]) byMonth[k] = [];
    byMonth[k].push(e);
  });

  return (
    <div>
      <div style={{ fontSize:"0.72rem", color:"var(--muted)", marginBottom:12 }}>
        Saison {baseYear}/{baseYear+1} · Auf Monat tippen für Monatsansicht
      </div>
      {months.map(({ yr, mo }) => {
        const key   = `${yr}-${String(mo+1).padStart(2,"0")}`;
        const mEvs  = (byMonth[key] || []);
        const vsEvs = mEvs.filter(isVorstellung);
        const gp    = mEvs.filter(e => e.eventType === "Generalprobe");
        const changed = mEvs.filter(isChanged);
        const hasMy = myFilter(mEvs).length > 0;

        return (
          <div key={key} onClick={() => { setSelDate(`${key}-01`); setViewMode("monat"); }}
            style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", marginBottom:5,
              background:"var(--s1)", border:"1px solid var(--border)", borderRadius:10,
              cursor:"pointer", opacity: hasMy ? 1 : 0.45, transition:"all 0.15s",
              borderLeft:`3px solid ${vsEvs.length > 0 ? "var(--red)" : gp.length > 0 ? "var(--orange)" : "var(--border2)"}` }}>
            {/* Month name */}
            <div style={{ minWidth:90 }}>
              <div style={{ fontSize:"0.92rem", fontWeight:700, color:"var(--text)", letterSpacing:"-0.01em" }}>
                {MONTHS_DE[mo].slice(0,3)}
              </div>
              <div style={{ fontSize:"0.68rem", color:"var(--muted)" }}>{yr}</div>
            </div>
            {/* VS dots */}
            <div style={{ flex:1, display:"flex", flexWrap:"wrap", gap:4, alignItems:"center" }}>
              {vsEvs.map(e => (
                <span key={e.id} style={{ fontSize:"0.68rem", background:"var(--red-bg)", color:"var(--red)",
                  border:"1px solid var(--red-border)", borderRadius:5, padding:"1px 6px", fontWeight:600 }}>
                  {e.date.slice(8)} {e.title.split(" ")[0]}
                </span>
              ))}
              {gp.map(e => (
                <span key={e.id} style={{ fontSize:"0.68rem", background:"var(--orange-bg)", color:"var(--orange)",
                  border:"1px solid rgba(255,159,10,0.3)", borderRadius:5, padding:"1px 6px", fontWeight:600 }}>
                  GP {e.date.slice(8)}
                </span>
              ))}
              {mEvs.length === 0 && <span style={{ fontSize:"0.76rem", color:"var(--faint)", fontStyle:"italic" }}>Keine Termine</span>}
            </div>
            {/* Stats */}
            <div style={{ textAlign:"right", flexShrink:0 }}>
              {mEvs.length > 0 && <div style={{ fontSize:"0.72rem", color:"var(--muted)" }}>{mEvs.filter(e=>!isChorfrei(e)).length} Termine</div>}
              {changed.length > 0 && <div style={{ fontSize:"0.68rem", color:"var(--orange)", fontWeight:600 }}>⚡ {changed.length} geänd.</div>}
            </div>
            <div style={{ color:"var(--faint)", fontSize:"0.8rem" }}>›</div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  LIST VIEW

// ═══════════════════════════════════════════════════════════════════════
function ListView({ scheds, user }) {
  const [mode, setMode] = useState("mine");   // mine | all
  const [typeF, setTypeF] = useState("all");  // all | probe | vorst

  const upcoming = scheds
    .filter(e => e.date >= todayStr && !isChorfrei(e))
    .filter(e => {
      if (typeF === "probe") return isProbe(e);
      if (typeF === "vorst") return isVorstellung(e);
      return true;
    })
    .filter(e => {
      if (mode === "mine") {
        if (isVorstellung(e)) return true;
        const req = bassRequired(e);
        return req === true || req === null;
      }
      return true;
    })
    .sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || "")));

  // Group by week
  const weeks = {};
  upcoming.forEach(e => {
    const d = new Date(e.date + "T12:00:00");
    const ws = new Date(d); ws.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = fmtD(ws);
    if (!weeks[k]) weeks[k] = [];
    weeks[k].push(e);
  });

  return (
    <div className="page">
      <div className="fbar">
        <button className={`fc${mode === "mine" ? " on" : ""}`} onClick={() => setMode("mine")}>Meine Termine</button>
        <button className={`fc${mode === "all" ? " on" : ""}`} onClick={() => setMode("all")}>Alle</button>
      </div>
      <div className="fbar" style={{ paddingTop: 0 }}>
        <button className={`fc${typeF === "all" ? " on" : ""}`} onClick={() => setTypeF("all")}>Alle Typen</button>
        <button className={`fc${typeF === "probe" ? " on" : ""}`} onClick={() => setTypeF("probe")}>Proben</button>
        <button className={`fc${typeF === "vorst" ? " on" : ""}`} onClick={() => setTypeF("vorst")}>Vorstellungen</button>
      </div>

      {Object.keys(weeks).sort().map(wk => {
        const wd = new Date(wk + "T12:00:00");
        const we = addD(wd, 6);
        return (
          <div key={wk} className="wk-group">
            <div className="wk-label">
              {wd.toLocaleDateString("de-DE", { day: "numeric", month: "short" })} – {we.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}
            </div>
            {weeks[wk].map(e => <EvCard key={e.id} e={e} user={user} />)}
          </div>
        );
      })}
      {upcoming.length === 0 && <div className="empty">Keine Termine in diesem Zeitraum.</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  VORSTELLUNG VIEW  ←  핵심 기능: 공연 일정만 보기
// ═══════════════════════════════════════════════════════════════════════

export { CalView };

import { useState, useEffect, useRef } from "react";
import { timeAgo, DVB_STOPS } from "./utils.js";

function PinnwandView({ pinnwand, savePost, deletePost, updatePost, user, toast }) {
  const [mode, setMode]         = useState("board");    // board | dvb | feedback
  const [showPost, setShowPost] = useState(false);
  const [postText, setPostText] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [fbText, setFbText]     = useState("");
  const [fbSent, setFbSent]     = useState(false);
  const [dvbStop, setDvbStop]   = useState(DVB_STOPS[0].id);
  const [dvbDeps, setDvbDeps]   = useState({});
  const [dvbRefresh, setDvbRefresh] = useState(0);

  const isAdmin = user.role === "admin";

  const pinned      = pinnwand.filter(p => p.pinned).sort((a,b) => b.ts-a.ts);
  const posts       = pinnwand.filter(p => !p.pinned && p.type !== "feedback").sort((a,b) => b.ts-a.ts);

  const markRead = async id => {
    const p = pinnwand.find(x => x.id===id);
    if (p && !(p.readBy||[]).includes(user.id)) {
      await updatePost(id, { readBy: [...(p.readBy||[]), user.id] });
    }
  };

  const toggleLike = async id => {
    const p = pinnwand.find(x => x.id===id);
    if (!p) return;
    const liked = (p.likes||[]).includes(user.id);
    const likes = liked ? (p.likes||[]).filter(x=>x!==user.id) : [...(p.likes||[]), user.id];
    await updatePost(id, { likes });
  };

  const addPost = async () => {
    if (!postText.trim()) return;
    const np = {
      id: "p"+Date.now(), type:"post", pinned:false,
      author: { id:user.id, name:user.name.split(" · ")[0], role:user.role, part:user.part||user.voice },
      title: postTitle.trim(), body: postText.trim(),
      ts: Date.now(), readBy:[user.id], likes:[],
    };
    await savePost(np);
    setPostText(""); setPostTitle(""); setShowPost(false);
    toast("Beitrag veröffentlicht ✓");
  };

  const pinPost = async id => {
    const p = pinnwand.find(x => x.id===id);
    if (p) await updatePost(id, { pinned: !p.pinned });
  };

  const handleDelete = async id => {
    await deletePost(id);
    toast("Beitrag gelöscht");
  };

  const sendFeedback = async () => {
    if (!fbText.trim()) return;
    const fb = {
      id: "fb"+Date.now(), type:"feedback", pinned:false,
      author: { id:user.id, name:user.name.split(" · ")[0], role:user.role },
      title: "Feedback", body: fbText.trim(),
      ts: Date.now(), readBy:[user.id], likes:[],
    };
    await savePost(fb);
    setFbText(""); setFbSent(true);
    toast("Feedback gesendet ✓");
  };

  const activeStop = DVB_STOPS.find(s => s.id === dvbStop);

  // DVB 실시간 출발 정보
  useEffect(() => {
    if (mode !== "dvb" || !activeStop) return;
    const sid = activeStop.stopId;
    setDvbDeps(d => ({ ...d, [sid]: { ...(d[sid]||{}), loading: true, error: null } }));
    const parseDate = str => {
      if (!str) return null;
      const m = str.match(/\/Date\((\d+)/);
      return m ? new Date(parseInt(m[1])) : null;
    };
    fetch(`https://webapi.vvo-online.de/dm?stopid=${sid}&limit=12&mot=Tram,CityBus`)
      .then(r => r.json())
      .then(data => {
        const now = Date.now();
        const deps = (data.Departures || []).map(d => {
          const rt = parseDate(d.RealTime);
          const st = parseDate(d.ScheduledTime);
          const arrTime = rt || st;
          const minutes = arrTime ? Math.round((arrTime.getTime() - now) / 60000) : null;
          return {
            line: d.LineName,
            direction: d.Direction,
            minutes,
            isRealtime: !!rt,
            delayed: d.State === "Delayed",
          };
        }).filter(d => d.minutes !== null && d.minutes >= 0).slice(0, 10);
        setDvbDeps(prev => ({ ...prev, [sid]: { departures: deps, loading: false, error: null, ts: Date.now() } }));
      })
      .catch(() => {
        setDvbDeps(prev => ({ ...prev, [sid]: { departures: [], loading: false, error: "Verbindungsfehler", ts: Date.now() } }));
      });
  }, [dvbStop, mode, dvbRefresh]);

  const timeAgoShort = ts => {
    const m = Math.floor((Date.now()-ts)/60000);
    if (m < 1) return "jetzt";
    if (m < 60) return `${m} Min`;
    const h = Math.floor(m/60);
    if (h < 24) return `${h} Std`;
    return `${Math.floor(h/24)} T`;
  };

  return (
    <div className="page">
      {/* Tab bar */}
      <div style={{ display:"flex", background:"var(--s2)", borderRadius:10, padding:3, gap:2, marginBottom:16 }}>
        {[{id:"board",label:"📌 Pinnwand"},{id:"dvb",label:"🚋 DVB"},{id:"feedback",label:"💬 Feedback"}].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            style={{ flex:1, padding:"6px 4px", border:"none", borderRadius:8, cursor:"pointer",
              fontFamily:"Inter,sans-serif", fontSize:"0.76rem", fontWeight:600, transition:"all 0.15s",
              background: mode===m.id ? "var(--s1)" : "transparent",
              color: mode===m.id ? "var(--text)" : "var(--muted)",
              boxShadow: mode===m.id ? "var(--shadow)" : "none" }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── PINNWAND ── */}
      {mode === "board" && <>
        {/* New post button */}
        <button onClick={() => setShowPost(v => !v)}
          style={{ width:"100%", padding:"10px 14px", marginBottom:12, border:"1px dashed var(--border2)",
            borderRadius:10, background:"var(--s1)", color:"var(--muted)", fontFamily:"Inter,sans-serif",
            fontSize:"0.84rem", cursor:"pointer", textAlign:"left", transition:"all 0.15s" }}>
          ✏️ Etwas teilen...
        </button>

        {showPost && (
          <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:12,
            padding:16, marginBottom:14 }}>
            <div className="fg">
              <label>Betreff (optional)</label>
              <input value={postTitle} onChange={e=>setPostTitle(e.target.value)} placeholder="Titel..." />
            </div>
            <div className="fg">
              <label>Nachricht</label>
              <textarea rows={3} value={postText} onChange={e=>setPostText(e.target.value)}
                placeholder="Was möchtest du mitteilen?" style={{ resize:"vertical" }} />
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPost(false)}>Abbrechen</button>
              <button className="btn btn-gold btn-sm" onClick={addPost}>Veröffentlichen</button>
            </div>
          </div>
        )}

        {/* Pinned announcements */}
        {pinned.length > 0 && (
          <div style={{ marginBottom:6 }}>
            <div style={{ fontSize:"0.68rem", fontWeight:700, color:"var(--accent)", textTransform:"uppercase",
              letterSpacing:"0.07em", marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
              📌 Angepinnte Ankündigungen
            </div>
            {pinned.map(p => (
              <PinnCard key={p.id} p={p} user={user} isAdmin={isAdmin}
                onRead={markRead} onLike={toggleLike} onPin={pinPost} onDelete={handleDelete} timeAgo={timeAgoShort} />
            ))}
          </div>
        )}

        {/* Regular posts */}
        {posts.length > 0 && (
          <div>
            <div style={{ fontSize:"0.68rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase",
              letterSpacing:"0.07em", marginBottom:8 }}>
              💬 Chorgemeinschaft
            </div>
            {posts.map(p => (
              <PinnCard key={p.id} p={p} user={user} isAdmin={isAdmin}
                onRead={markRead} onLike={toggleLike} onPin={pinPost} onDelete={handleDelete} timeAgo={timeAgoShort} />
            ))}
          </div>
        )}

        {pinnwand.length === 0 && <div className="empty">Noch keine Beiträge.</div>}
      </>}

      {/* ── DVB FAHRPLAN ── */}
      {mode === "dvb" && <>
        {/* 정류장 선택 */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:14 }}>
          {DVB_STOPS.map(s => (
            <button key={s.id} onClick={() => setDvbStop(s.id)}
              style={{ padding:"10px 12px", border:"1px solid",
                borderColor: dvbStop===s.id ? "var(--accent)" : "var(--border)",
                borderRadius:10, cursor:"pointer", fontFamily:"var(--sans)",
                background: dvbStop===s.id ? "rgba(232,23,58,0.08)" : "var(--s1)",
                textAlign:"left", transition:"all 0.15s" }}>
              <div style={{ fontSize:"1rem", marginBottom:2 }}>{s.icon}</div>
              <div style={{ fontSize:"0.82rem", fontWeight:700, color: dvbStop===s.id ? "var(--accent)" : "var(--text)" }}>{s.name}</div>
              <div style={{ fontSize:"0.64rem", color:"var(--muted)", marginTop:1 }}>Linie {s.lines}</div>
            </button>
          ))}
        </div>

        {/* 실시간 출발 시간표 */}
        {activeStop && (() => {
          const sid = activeStop.stopId;
          const state = dvbDeps[sid] || { loading: true };
          return (
            <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
              {/* 헤더 */}
              <div style={{ padding:"12px 14px", borderBottom:"1px solid var(--border)",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:700, color:"var(--text)", fontSize:"0.92rem" }}>
                    {activeStop.icon} {activeStop.name}
                  </div>
                  <div style={{ fontSize:"0.7rem", color:"var(--muted)", marginTop:2 }}>
                    {activeStop.note}
                    {state.ts && <span style={{ marginLeft:8, color:"var(--faint)" }}>
                      · Stand: {new Date(state.ts).toLocaleTimeString("de-DE", {hour:"2-digit", minute:"2-digit"})}
                    </span>}
                  </div>
                </div>
                <button onClick={() => setDvbRefresh(r => r+1)}
                  style={{ background:"var(--s2)", border:"1px solid var(--border)", borderRadius:8,
                    color:"var(--muted)", padding:"6px 12px", cursor:"pointer", fontFamily:"var(--sans)",
                    fontSize:"0.78rem", fontWeight:600, transition:"all 0.15s" }}>
                  ↻ Aktualisieren
                </button>
              </div>

              {/* 출발 목록 */}
              <div style={{ padding:"8px 0" }}>
                {state.loading && (
                  <div style={{ padding:"24px", textAlign:"center", color:"var(--muted)", fontSize:"0.82rem" }}>
                    <div className="pulse">🚋</div>
                    <div style={{ marginTop:8 }}>Lade Abfahrten…</div>
                  </div>
                )}
                {state.error && (
                  <div style={{ padding:"20px 14px", textAlign:"center", color:"var(--muted)", fontSize:"0.82rem" }}>
                    ⚠ {state.error} — bitte aktualisieren
                  </div>
                )}
                {!state.loading && !state.error && state.departures?.length === 0 && (
                  <div style={{ padding:"20px 14px", textAlign:"center", color:"var(--faint)", fontSize:"0.82rem" }}>
                    Keine Abfahrten gefunden
                  </div>
                )}
                {(state.departures || []).map((dep, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"10px 14px", borderBottom: i < state.departures.length-1 ? "1px solid var(--border)" : "none" }}>
                    {/* 노선 번호 */}
                    <div style={{ width:36, height:36, borderRadius:8, flexShrink:0,
                      background: dep.line === "2" ? "#E8173A" : dep.line === "4" ? "#FF9500" :
                        dep.line === "8" ? "#32D74B" : dep.line === "9" ? "#5856D6" :
                        dep.line === "1" ? "#0066CC" : "#48484E",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontWeight:800, fontSize:"0.9rem", color:"white", fontFamily:"var(--sans)" }}>
                      {dep.line}
                    </div>
                    {/* 방향 */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:"0.86rem", fontWeight:500, color:"var(--text)",
                        overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                        {dep.direction}
                      </div>
                      <div style={{ fontSize:"0.68rem", color:"var(--muted)", marginTop:1 }}>
                        {dep.isRealtime ? "🔴 Echtzeit" : "🕐 Fahrplan"}
                        {dep.delayed && <span style={{ marginLeft:6, color:"#FF9500" }}>· Verspätung</span>}
                      </div>
                    </div>
                    {/* 분 */}
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize: dep.minutes <= 2 ? "1.1rem" : "1rem",
                        fontWeight:800, fontFamily:"var(--sans)",
                        color: dep.minutes <= 1 ? "var(--accent)" : dep.minutes <= 4 ? "#FF9500" : "var(--text)" }}>
                        {dep.minutes <= 0 ? "jetzt" : `${dep.minutes} Min`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div style={{ marginTop:10, fontSize:"0.7rem", color:"var(--faint)", textAlign:"center" }}>
          Echtzeitdaten: VVO · Automatisch bei Haltestellen-Wechsel aktualisiert
        </div>
      </>}

      {/* ── FEEDBACK ── */}
      {mode === "feedback" && <>
        <div style={{ background:"rgba(59,158,255,0.08)", border:"1px solid rgba(59,158,255,0.2)",
          borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:"0.82rem", color:"var(--text2)" }}>
          💡 Dein Feedback hilft uns, Sempre Semper zu verbessern. Alle Rückmeldungen werden anonym an die Chorleitung weitergeleitet.
        </div>

        {fbSent ? (
          <div style={{ textAlign:"center", padding:"40px 20px" }}>
            <div style={{ fontSize:"2rem", marginBottom:12 }}>🎉</div>
            <div style={{ fontWeight:700, color:"var(--text)", marginBottom:6 }}>Danke für dein Feedback!</div>
            <div style={{ fontSize:"0.82rem", color:"var(--muted)", marginBottom:20 }}>
              Wir lesen jede Rückmeldung sorgfältig.
            </div>
            <button className="btn btn-ghost" onClick={() => setFbSent(false)}>
              Weiteres Feedback senden
            </button>
          </div>
        ) : (
          <>
            <div className="fg">
              <label>Dein Feedback</label>
              <textarea rows={5} value={fbText} onChange={e=>setFbText(e.target.value)}
                placeholder="Was funktioniert gut? Was sollten wir verbessern? Welche Funktionen fehlen?"
                style={{ resize:"vertical" }} />
            </div>
            <button className="btn btn-gold" style={{ width:"100%", padding:"11px" }} onClick={sendFeedback}>
              Feedback senden ✓
            </button>

            {/* Admin: show all feedback */}
            {isAdmin && (() => {
              const fbs = pinnwand.filter(p => p.type==="feedback").sort((a,b)=>b.ts-a.ts);
              if (!fbs.length) return null;
              return (
                <div style={{ marginTop:24 }}>
                  <div style={{ fontSize:"0.72rem", fontWeight:700, color:"var(--muted)",
                    textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>
                    ⚙ Eingegangene Feedbacks ({fbs.length})
                  </div>
                  {fbs.map(f => (
                    <div key={f.id} style={{ background:"var(--s1)", border:"1px solid var(--border)",
                      borderRadius:10, padding:"10px 14px", marginBottom:8 }}>
                      <div style={{ fontSize:"0.7rem", color:"var(--faint)", marginBottom:4 }}>
                        {f.author.name} · {timeAgoShort(f.ts)}
                      </div>
                      <div style={{ fontSize:"0.84rem", color:"var(--text2)" }}>{f.body}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </>}
    </div>
  );
}

// ── Single Pinnwand Card ──
function PinnCard({ p, user, isAdmin, onRead, onLike, onPin, onDelete, timeAgo }) {
  const isUnread = !(p.readBy||[]).includes(user.id);
  const liked    = (p.likes||[]).includes(user.id);
  const canEdit  = isAdmin || p.author.id === user.id;

  useEffect(() => { if (isUnread) onRead(p.id); }, []);

  return (
    <div style={{ background: p.pinned ? "rgba(59,158,255,0.06)" : "var(--s1)",
      border:`1px solid ${p.pinned ? "rgba(59,158,255,0.25)" : "var(--border)"}`,
      borderLeft:`3px solid ${p.pinned ? "var(--accent)" : "var(--border2)"}`,
      borderRadius:10, padding:"12px 14px", marginBottom:10, position:"relative" }}>

      {isUnread && <div style={{ position:"absolute", top:10, right:10, width:7, height:7,
        borderRadius:"50%", background:"var(--accent)" }} />}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {/* Author + time */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap" }}>
            <span style={{ fontSize:"0.72rem", fontWeight:700,
              color: p.author.role==="admin" ? "var(--accent)" : "var(--text2)" }}>
              {p.author.role==="admin" ? "📋 " : ""}{p.author.name}
            </span>
            {p.author.part && (
              <span style={{ fontSize:"0.64rem", color:"var(--faint)", background:"var(--s2)",
                padding:"1px 6px", borderRadius:5 }}>{p.author.part}</span>
            )}
            <span style={{ fontSize:"0.66rem", color:"var(--faint)", marginLeft:"auto" }}>
              {timeAgo(p.ts)}
            </span>
          </div>

          {/* Title */}
          {p.title && (
            <div style={{ fontWeight:700, color:"var(--text)", fontSize:"0.9rem", marginBottom:4 }}>
              {p.title}
            </div>
          )}

          {/* Body */}
          <div style={{ fontSize:"0.84rem", color:"var(--text2)", lineHeight:1.55 }}>{p.body}</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10 }}>
        <button onClick={() => onLike(p.id)}
          style={{ border:"none", background:"transparent", cursor:"pointer", padding:"2px 6px",
            borderRadius:6, fontSize:"0.78rem", color: liked ? "var(--red)" : "var(--faint)",
            fontFamily:"Inter,sans-serif", transition:"all 0.15s" }}>
          {liked ? "❤️" : "🤍"} {(p.likes||[]).length > 0 && (p.likes||[]).length}
        </button>

        {canEdit && (
          <>
            {isAdmin && (
              <button onClick={() => onPin(p.id)}
                style={{ border:"none", background:"transparent", cursor:"pointer", padding:"2px 6px",
                  borderRadius:6, fontSize:"0.72rem", color: p.pinned ? "var(--accent)" : "var(--faint)",
                  fontFamily:"Inter,sans-serif" }}>
                {p.pinned ? "📌 loslösen" : "📌 anpinnen"}
              </button>
            )}
            <button onClick={() => onDelete(p.id)}
              style={{ border:"none", background:"transparent", cursor:"pointer", padding:"2px 6px",
                borderRadius:6, fontSize:"0.72rem", color:"var(--faint)", fontFamily:"Inter,sans-serif",
                marginLeft:"auto" }}>
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// helper used in PinnwandView feedback admin panel
function timeAgoShort(ts) {
  const m = Math.floor((Date.now()-ts)/60000);
  if (m < 1) return "jetzt";
  if (m < 60) return `${m} Min`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h} Std`;
  return `${Math.floor(h/24)} T`;
}

// ═══════════════════════════════════════════════════════════════════════
//  EINSTELLUNGEN (Settings)
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
//  PRODUCTION PICKER — 시즌별 작품 선택
// ═══════════════════════════════════════════════════════════════════════

export { PinnwandView, PinnCard };

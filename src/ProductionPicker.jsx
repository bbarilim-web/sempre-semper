import { useState, useMemo } from "react";
import { normalizeProduction, splitProductions, MONTHS_DE } from "./utils.js";

function getSeasonLabel(date) {
  if (!date) return null;
  const d = new Date(date + "T12:00:00");
  const y = d.getFullYear(); const m = d.getMonth();
  const s = m >= 7 ? y : y - 1;
  return `${s}/${String(s+1).slice(2)}`;
}

function getCurrentSeason() {
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  const s = m >= 7 ? y : y - 1;
  return `${s}/${String(s+1).slice(2)}`;
}

function ProductionPicker({ settings, saveSettings, scheds }) {
  const curSeason = getCurrentSeason();
  const [selSeason, setSelSeason] = useState(curSeason);

  // Vorplanung에서 시즌별 작품 추출
  // Vorstellung/GP 이벤트의 날짜로 시즌 판단
  const seasonProds = {};
  scheds.forEach(e => {
    if (!e.production || !e.date) return;
    const sl = getSeasonLabel(e.date);
    if (!sl) return;
    if (!seasonProds[sl]) seasonProds[sl] = new Set();
    splitProductions(e.production, []).forEach(p => {
      const norm = normalizeProduction(p, []);
      if (norm) seasonProds[sl].add(norm);
    });
  });

  // 전체 시즌 목록 (정렬)
  const allSeasons = Object.keys(seasonProds).sort();

  // myProductions는 { "시즌": ["작품1", "작품2"] } 형태로 저장
  // 하위호환: 기존 배열 형태면 currentSeason에 할당
  const raw = settings.myProductionsBySeason;
  const myProdsBySeason = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? raw
    : {};

  // 현재 시즌의 선택된 작품
  const selProds = myProdsBySeason[selSeason] || [];
  const prodsInSeason = [...(seasonProds[selSeason] || new Set())].sort();

  const toggle = (prod) => {
    const cur = myProdsBySeason[selSeason] || [];
    const next = cur.includes(prod) ? cur.filter(p => p !== prod) : [...cur, prod];
    const updated = { ...myProdsBySeason, [selSeason]: next };
    // 하위호환: myProductions = 현재시즌 + 다른시즌 통합 배열 (Spielplan 필터용)
    const allSelected = [...new Set(Object.values(updated).flat())];
    saveSettings({ ...settings, myProductionsBySeason: updated, myProductions: allSelected });
  };

  const toggleAll = () => {
    const cur = myProdsBySeason[selSeason] || [];
    const next = cur.length === prodsInSeason.length ? [] : [...prodsInSeason];
    const updated = { ...myProdsBySeason, [selSeason]: next };
    const allSelected = [...new Set(Object.values(updated).flat())];
    saveSettings({ ...settings, myProductionsBySeason: updated, myProductions: allSelected });
  };

  // Neu dazu 토글 (기존 호환)
  const toggleNeuDazu = (prod) => {
    const cur = settings.neuDazuProductions || [];
    const next = cur.includes(prod) ? cur.filter(p => p !== prod) : [...cur, prod];
    saveSettings({ ...settings, neuDazuProductions: next });
  };

  return (
    <div className="settings-section">
      <div className="settings-title">Meine Produktionen</div>
      <div style={{ fontSize:"0.78rem", color:"var(--muted)", marginBottom:12 }}>
        Pro Spielzeit auswählen, an welchen Produktionen du beteiligt bist.
      </div>

      {allSeasons.length === 0 && (
        <div style={{ fontSize:"0.8rem", color:"var(--faint)", fontStyle:"italic", padding:"10px 0" }}>
          Noch keine Produktionen im Spielplan. Bitte Admin-Import durchführen.
        </div>
      )}

      {/* 시즌 탭 */}
      {allSeasons.length > 0 && (
        <>
          <div style={{ display:"flex", gap:4, marginBottom:14, flexWrap:"wrap" }}>
            {allSeasons.map(s => {
              const cnt = (myProdsBySeason[s] || []).length;
              const total = (seasonProds[s]?.size || 0);
              const isCur = s === curSeason;
              const isAct = s === selSeason;
              return (
                <button key={s} onClick={() => setSelSeason(s)}
                  style={{ padding:"6px 14px", borderRadius:20,
                    border:`1px solid ${isAct ? "var(--accent)" : "var(--border)"}`,
                    background: isAct ? "var(--accent)" : "var(--s1)",
                    color: isAct ? "#fff" : isCur ? "var(--accent)" : "var(--text2)",
                    fontFamily:"var(--sans)", fontSize:"0.78rem",
                    fontWeight: isAct ? 700 : isCur ? 600 : 400, cursor:"pointer", transition:"all 0.15s" }}>
                  {isCur && !isAct && <span style={{ marginRight:4 }}>●</span>}
                  Spielzeit {s}
                  {cnt > 0 && (
                    <span style={{ marginLeft:6, fontSize:"0.7em", opacity:0.8 }}>
                      {cnt}/{total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 선택/해제 버튼 */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
            <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
              {selProds.length === prodsInSeason.length ? "Alle abwählen" : "Alle wählen"}
            </button>
            <span style={{ marginLeft:"auto", fontSize:"0.74rem", color:"var(--muted)" }}>
              {selProds.length} / {prodsInSeason.length} ausgewählt
            </span>
          </div>

          {/* 작품 목록 */}
          {prodsInSeason.length === 0 && (
            <div style={{ fontSize:"0.8rem", color:"var(--faint)", fontStyle:"italic", padding:"8px 0" }}>
              Keine Produktionen für Spielzeit {selSeason} gefunden.
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {prodsInSeason.map(prod => {
              const isSelected = selProds.includes(prod);
              const isNeuDazu = (settings.neuDazuProductions || []).includes(prod);
              return (
                <div key={prod} style={{ display:"flex", alignItems:"center",
                  background: isSelected ? "rgba(232,23,58,0.07)" : "var(--s1)",
                  border:`1px solid ${isSelected ? "rgba(232,23,58,0.3)" : "var(--border)"}`,
                  borderLeft:`3px solid ${isSelected ? "var(--accent)" : "var(--border2)"}`,
                  borderRadius:10, overflow:"hidden" }}>
                  {/* 참여 체크 */}
                  <button onClick={() => toggle(prod)}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px",
                      flex:1, background:"transparent", border:"none",
                      cursor:"pointer", textAlign:"left", fontFamily:"var(--sans)" }}>
                    <div style={{ width:18, height:18, borderRadius:5, flexShrink:0,
                      background: isSelected ? "var(--accent)" : "var(--s2)",
                      border:`1px solid ${isSelected ? "var(--accent)" : "var(--border2)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {isSelected && <span style={{ color:"white", fontSize:"0.7rem", fontWeight:700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:"0.88rem", fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? "var(--text)" : "var(--text2)" }}>
                      {prod}
                    </span>
                  </button>
                  {/* Neu dazu 토글 */}
                  {isSelected && (
                    <button onClick={() => toggleNeuDazu(prod)}
                      style={{ padding:"11px 14px", background:"transparent",
                        borderLeft:"1px solid var(--border)", border:"none",
                        cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center" }}>
                      <div style={{ width:16, height:16, borderRadius:4, flexShrink:0,
                        background: isNeuDazu ? "var(--blue)" : "var(--s3)",
                        border:`1px solid ${isNeuDazu ? "var(--blue)" : "var(--border2)"}`,
                        display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {isNeuDazu && <span style={{ color:"white", fontSize:"0.6rem", fontWeight:700 }}>✓</span>}
                      </div>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 다른 시즌에도 있는 작품 안내 */}
          {selProds.length > 0 && (() => {
            const otherSeasons = allSeasons.filter(s => s !== selSeason);
            const overlap = selProds.filter(prod =>
              otherSeasons.some(s => (myProdsBySeason[s]||[]).includes(prod))
            );
            if (!overlap.length) return null;
            return (
              <div style={{ marginTop:10, padding:"8px 12px", background:"rgba(46,123,219,0.07)",
                border:"1px solid rgba(46,123,219,0.2)", borderRadius:8, fontSize:"0.74rem", color:"var(--blue)" }}>
                💡 {overlap.join(", ")} — auch in einer anderen Spielzeit ausgewählt
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}


export { getSeasonLabel, getCurrentSeason, ProductionPicker };

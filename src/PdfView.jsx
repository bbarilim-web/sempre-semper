import { useState, useRef } from "react";
import { normalizeProduction, splitProductions, TYPE_MAP, PRODUCTION_ALIASES, isVorstellung, isChorfrei, fmtDate, bassRequired } from "./utils.js";

function PdfView({ scheds, setScheds, deleteEvent, user, toast, isDemo }) {
  const [drag, setDrag]         = useState(false);
  const [parsing, setParsing]   = useState(false);
  const [parsed, setParsed]     = useState(null);
  const [error, setError]       = useState("");
  const [pdfFile, setPdfFile]   = useState(null);
  const [pdfMeta, setPdfMeta]   = useState(null);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo]     = useState(1);
  const [extractType, setExtractType] = useState("all"); // "all" | "vs" | "proben"
  const [sourceTypeOverride, setSourceTypeOverride] = useState("auto"); // "auto"|"vorplanung"|"dienstplan"|"monatsplan"
  const fileRef = useRef();

  const callApi = async (base64, pageHint, vsOnly, sourceType) => {
    const vsFilter = vsOnly === "vs"
      ? "NUR Vorstellungen (VS) extrahieren! Alle anderen Typen (GP, OHP, KHP, BP, BO, TE, Bel, KP) IGNORIEREN."
      : vsOnly === "proben"
      ? "NUR Proben extrahieren (BP, BO, GP, OHP, KHP, KP, TE, Bel). Vorstellungen (VS) IGNORIEREN."
      : "Alle Termine extrahieren (VS, BP, BO, GP, OHP, KHP, KP, TE, Bel, chorfrei).";

    // Vorplanung 페이지별 달 매핑 (2026/27 시즌 기준)
    const vorplanungPageMap = {
      1: { left: [8,2026],  mid: [9,2026],  right: [10,2026] },
      2: { left: [11,2026], mid: [12,2026], right: [1,2027]  },
      3: { left: [2,2027],  mid: [3,2027],  right: [4,2027]  },
      4: { left: [5,2027],  mid: [6,2027],  right: [7,2027]  },
    };
    const DE_MONTHS = ["","Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    const pad = n => String(n).padStart(2,'0');

    let vorplanungHint = "";
    if (sourceType === "vorplanung") {
      const singlePage = (pageFrom === pageTo) ? pageFrom : null;
      if (singlePage && vorplanungPageMap[singlePage]) {
        const m = vorplanungPageMap[singlePage];
        const [lM,lY] = m.left; const [mM,mY] = m.mid; const [rM,rY] = m.right;
        vorplanungHint = `

╔══════════════════════════════════════════════════════════════╗
║  LAYOUT DIESER SEITE — 3-SPALTEN-FORMAT (STRIKT EINHALTEN!) ║
╚══════════════════════════════════════════════════════════════╝

Diese Seite hat DREI Spalten nebeneinander. Jede Spalte enthält NUR einen Monat.

  LINKE Spalte   = ${DE_MONTHS[lM]} ${lY}  → date: ${lY}-${pad(lM)}-TT
  MITTLERE Spalte = ${DE_MONTHS[mM]} ${mY} → date: ${mY}-${pad(mM)}-TT
  RECHTE Spalte  = ${DE_MONTHS[rM]} ${rY}  → date: ${rY}-${pad(rM)}-TT

REGELN:
1. Die Zahl am Zeilenanfang (1., 2., 3. …) ist der TAG des Monats dieser Spalte.
2. Ein Eintrag gehört IMMER NUR zum Monat seiner Spalte — KEINE Ausnahmen!
3. Beispiel: "4." in der LINKEN Spalte → ${lY}-${pad(lM)}-04 (NICHT ${mY}-${pad(mM)}-04!)
4. Jede Zeile kann 2 Termine haben (z.B. "10 BP Tosca" + "19 VS Carmen") = 2 JSON-Einträge mit gleichem Datum.
5. Halbe cf-Tage (½ cf) = chorfrei bis 13 Uhr oder ab 13 Uhr, als note "½ cf" vermerken.`;
      } else {
        vorplanungHint = `

LAYOUT DER VORPLANUNG (3-SPALTEN-FORMAT):
Seite 1: Aug 2026 | Sep 2026 | Okt 2026
Seite 2: Nov 2026 | Dez 2026 | Jan 2027
Seite 3: Feb 2027 | Mär 2027 | Apr 2027
Seite 4: Mai 2027 | Jun 2027 | Jul 2027
Jede Spalte = nur 1 Monat. Tageszahlen gelten NUR für den Spalten-Monat!`;
      }
    }

    // ── DSGVO-Hinweis: PDF-Inhalt wird zur Analyse an Anthropic (USA) übertragen.
    // Es werden keine personenbezogenen Daten übermittelt — nur Planstruktur.
    // Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung bei Registrierung).
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: `Du bist ein Assistent des Staatsopernchors der Sächsischen Staatsoper Dresden.
Du analysierst Proben- und Spielpläne und extrahierst Termine.

Abkürzungen: VS=Vorstellung, BP=Bühnenprobe, BO=Bühnenorchesterprobe, GP=Generalprobe,
KHP=Kleines Hauptprobe, OHP=Orchesterhauptprobe, TE=Toneinspielung,
Bel=Beleuchtungsprobe, KP=Konzertprobe, cf=chorfrei, TP=Tonprobe, Ab=Abnahme, Auf=Aufführung, Bel=Beleuchtungsprobe
${vorplanungHint}

${vsFilter}

Antworte NUR mit einem JSON-Array. Kein Markdown, keine Backticks.
Beginne direkt mit [ und ende mit ]

Format:
{"date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"00:00","eventType":"Vorstellung","title":"Stückname","production":"Stückname","location":"Bühne","targetGroup":"Alle Eingeteilten","conductor":"","note":"","sourceType":"${sourceType}"}

eventType-Mapping: VS→"Vorstellung", BP→"Bühnenprobe", BO→"Bühnenorchesterprobe",
GP→"Generalprobe", OHP→"Orchesterhauptprobe", KHP→"Kleines Hauptprobe",
KP→"Konzertprobe", TE→"Toneinspielung", Bel→"Beleuchtungsprobe", cf→"Chorfrei"

- startTime: zweistellig HH:MM (z.B. "08:00", "19:00", "10:00")
- Wenn Uhrzeit fehlt: "00:00"
- sourceType immer "${sourceType}"
- Antworte AUSSCHLIESSLICH mit dem JSON-Array`,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: `Analysiere ${pageHint} und extrahiere die Termine als JSON-Array. Achte UNBEDINGT auf die korrekte Spaltenzuordnung — jede Spalte gehört zu genau einem Monat!` }
          ]
        }]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "API-Fehler");
    const raw = data.content.map(c => c.text || "").join("");
    const clean = raw.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  };

  const onFile = async (f) => {
    if (!f || f.type !== "application/pdf") { setError("Bitte eine PDF-Datei hochladen."); return; }
    setError(""); setParsed(null);
    try {
      const url = URL.createObjectURL(f);
      const pdfjsLib = window.pdfjsLib;
      if (pdfjsLib) {
        const pdf = await pdfjsLib.getDocument(url).promise;
        const numPages = pdf.numPages;
        URL.revokeObjectURL(url);
        setPdfFile(f); setPdfMeta({ numPages, fileName: f.name });
        setPageFrom(1); setPageTo(numPages);
        const lname = f.name.toLowerCase();
        if (lname.includes("vorplanung") || lname.includes("vorp")) {
          setExtractType("vs"); setSourceTypeOverride("vorplanung");
        } else if (lname.includes("monat")) {
          setExtractType("all"); setSourceTypeOverride("monatsplan");
        } else {
          setExtractType("all"); setSourceTypeOverride("dienstplan");
        }
      } else {
        setPdfFile(f); setPdfMeta({ numPages: null, fileName: f.name });
        setPageFrom(1); setPageTo(1);
        const lname = f.name.toLowerCase();
        if (lname.includes("vorplanung") || lname.includes("vorp")) {
          setExtractType("vs"); setSourceTypeOverride("vorplanung");
        } else { setExtractType("all"); setSourceTypeOverride("dienstplan"); }
      }
    } catch(e) {
      setPdfFile(f); setPdfMeta({ numPages: null, fileName: f.name });
    }
  };

  const parsePdf = async () => {
    if (!pdfFile) return;
    setParsing(true); setError(""); setParsed(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result.split(",")[1]);
        r.onerror = () => rej(new Error("Lesefehler"));
        r.readAsDataURL(pdfFile);
      });
      const totalPages = pdfMeta?.numPages;
      const pageHint = totalPages
        ? (pageFrom === 1 && pageTo === totalPages
            ? `alle ${totalPages} Seiten`
            : pageFrom === pageTo ? `Seite ${pageFrom}` : `Seiten ${pageFrom} bis ${pageTo}`)
        : "diesen Plan";
      const srcType = sourceTypeOverride === "auto"
        ? (pdfFile.name.toLowerCase().includes("vorp") ? "vorplanung"
          : pdfFile.name.toLowerCase().includes("monat") ? "monatsplan" : "dienstplan")
        : sourceTypeOverride;
      const allEvents = await callApi(base64, pageHint, extractType, srcType);
      if (allEvents.length === 0) throw new Error("Keine Termine gefunden — bitte Seitenbereich oder Typ prüfen");
      setParsed(allEvents.map(e => ({ ...e, sourceType: srcType, _import: !isChorfrei(e) })));
    } catch (e) {
      setError("Fehler: " + e.message);
    } finally {
      setParsing(false);
    }
  };

  const importSelected = async () => {
    const toImport = parsed.filter(e => e._import);
    const newScheds = toImport.map(e => ({
      ...e,
      id: "imp" + Date.now() + Math.random().toString(36).slice(2, 5),
      updatedAt: Date.now(),
      _edited: false,
    }));

    // 새 파일에 포함된 날짜 범위 파악
    const newDates = [...new Set(newScheds.map(e => e.date))];
    const newSourceType = newScheds[0]?.sourceType || "dienstplan";

    // 같은 날짜 + 같거나 낮은 우선순위 소스의 기존 일정 삭제
    // 우선순위: tagesplan(0) > dienstplan(1) > monatsplan(2) > vorplanung(3)
    const SOURCE_PRIORITY = { tagesplan: 0, dienstplan: 1, monatsplan: 2, vorplanung: 3 };
    const newPriority = SOURCE_PRIORITY[newSourceType] ?? 9;

    const toDelete = scheds.filter(e =>
      newDates.includes(e.date) &&
      (SOURCE_PRIORITY[e.sourceType] ?? 9) >= newPriority
    );

    // 기존 일정 삭제
    for (const e of toDelete) await deleteEvent(e.id);

    // 새 일정 저장 (Vorstellung은 덮어쓰지 않고 중복 체크)
    const remainingScheds = scheds.filter(e => !toDelete.map(d => d.id).includes(e.id));
    const existingVS = remainingScheds.map(e => `${e.date}_${e.startTime}_${e.title}`);
    const toAdd = newScheds.filter(e =>
      isVorstellung(e)
        ? !existingVS.includes(`${e.date}_${e.startTime}_${e.title}`)
        : true
    );
    const merged = [...remainingScheds, ...toAdd];
    await setScheds(merged);
    setParsed(null);
    toast(`✓ ${toAdd.length}개 추가, ${toDelete.length}개 기존 일정 교체`);
  };

  const groupedParsed = parsed ? (() => {
    const vs = parsed.filter(e => isVorstellung(e));
    const proben = parsed.filter(e => !isVorstellung(e) && !isChorfrei(e));
    const frei = parsed.filter(isChorfrei);
    return { vs, proben, frei };
  })() : null;

  return (
    <div className="page">
      <div className="sh"><h2>PDF Import</h2><div className="sh-sub">Dienstplan · Monatsplan · Vorplanung</div></div>

      {/* 파일 드롭존 (파일 미선택 시만) */}
      {!pdfMeta && (
        <div
          className={`pdf-drop${drag ? " drag" : ""}`}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current.click()}>
          <div className="pdf-icon">📄</div>
          <h3>PDF-Probenplan hochladen</h3>
          <p>Dienstplan · Monatsplan · Vorplanung · Tagesplan</p>
          <p style={{ marginTop: 4 }}>Klicken oder per Drag & Drop</p>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => onFile(e.target.files[0])} />
        </div>
      )}

      {/* 파일 선택됨 → 분석 설정 패널 */}
      {pdfMeta && !parsed && !parsing && (
        <div style={{ background:"var(--s1)", border:"1px solid var(--border)", borderRadius:14, padding:18, marginBottom:16 }}>
          {/* 파일명 + 다시 선택 */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <span style={{ fontSize:"1.4rem" }}>📄</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"0.88rem", fontWeight:600, color:"var(--text)", wordBreak:"break-all" }}>{pdfMeta.fileName}</div>
              <div style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:2 }}>
                {pdfMeta.numPages ? `${pdfMeta.numPages} Seiten` : "Seiten unbekannt"}
              </div>
            </div>
            <button onClick={() => { setPdfMeta(null); setPdfFile(null); setError(""); }}
              style={{ background:"var(--s2)", border:"1px solid var(--border)", borderRadius:8,
                color:"var(--muted)", padding:"4px 10px", fontSize:"0.78rem",
                fontFamily:"var(--sans)", cursor:"pointer" }}>
              ✕ Andere Datei
            </button>
          </div>

          {/* 페이지 범위 선택 */}
          {pdfMeta.numPages && pdfMeta.numPages > 1 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:"0.72rem", fontWeight:700, color:"var(--muted)",
                textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>
                Seitenbereich
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <button onClick={() => { setPageFrom(1); setPageTo(pdfMeta.numPages); }}
                  style={{ padding:"5px 12px", borderRadius:8, border:"1px solid var(--border)",
                    background: pageFrom===1 && pageTo===pdfMeta.numPages ? "var(--accent)" : "var(--s2)",
                    color: pageFrom===1 && pageTo===pdfMeta.numPages ? "#fff" : "var(--text2)",
                    fontSize:"0.78rem", fontFamily:"var(--sans)", cursor:"pointer" }}>
                  Alle ({pdfMeta.numPages})
                </button>
                {Array.from({length: pdfMeta.numPages}, (_, i) => i+1).map(p => (
                  <button key={p} onClick={() => { setPageFrom(p); setPageTo(p); }}
                    style={{ width:36, height:36, borderRadius:8, border:"1px solid var(--border)",
                      background: pageFrom===p && pageTo===p ? "var(--accent)" : "var(--s2)",
                      color: pageFrom===p && pageTo===p ? "#fff" : "var(--text2)",
                      fontSize:"0.82rem", fontWeight:600, fontFamily:"var(--sans)", cursor:"pointer" }}>
                    {p}
                  </button>
                ))}
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:"0.74rem", color:"var(--muted)" }}>S.</span>
                  <input type="number" min={1} max={pdfMeta.numPages} value={pageFrom}
                    onChange={e => setPageFrom(Math.max(1, Math.min(+e.target.value, pageTo)))}
                    style={{ width:44, padding:"4px 6px", background:"var(--s2)", border:"1px solid var(--border)",
                      borderRadius:6, color:"var(--text)", fontSize:"0.82rem", textAlign:"center", fontFamily:"var(--sans)" }} />
                  <span style={{ fontSize:"0.74rem", color:"var(--muted)" }}>–</span>
                  <input type="number" min={pageFrom} max={pdfMeta.numPages} value={pageTo}
                    onChange={e => setPageTo(Math.max(pageFrom, Math.min(+e.target.value, pdfMeta.numPages)))}
                    style={{ width:44, padding:"4px 6px", background:"var(--s2)", border:"1px solid var(--border)",
                      borderRadius:6, color:"var(--text)", fontSize:"0.82rem", textAlign:"center", fontFamily:"var(--sans)" }} />
                </div>
              </div>
            </div>
          )}

          {/* 추출 타입 */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:"0.72rem", fontWeight:700, color:"var(--muted)",
              textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Extrahieren</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {[
                ["all",    "🗓 Alle Termine"],
                ["vs",     "🎭 Nur Vorstellungen"],
                ["proben", "🎵 Nur Proben"],
              ].map(([v,l]) => (
                <button key={v} onClick={() => setExtractType(v)}
                  style={{ padding:"6px 14px", borderRadius:8,
                    border:`1px solid ${extractType===v ? "var(--accent)" : "var(--border)"}`,
                    background: extractType===v ? "var(--accent-dim)" : "var(--s2)",
                    color: extractType===v ? "var(--accent)" : "var(--text2)",
                    fontSize:"0.78rem", fontFamily:"var(--sans)", cursor:"pointer",
                    fontWeight: extractType===v ? 600 : 400 }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Plantyp */}
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:"0.72rem", fontWeight:700, color:"var(--muted)",
              textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Plantyp</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {[
                ["dienstplan",  "Dienstplan"],
                ["monatsplan",  "Monatsplan"],
                ["vorplanung",  "Vorplanung"],
                ["tagesplan",   "Tagesplan"],
              ].map(([v,l]) => (
                <button key={v} onClick={() => setSourceTypeOverride(v)}
                  style={{ padding:"6px 14px", borderRadius:8,
                    border:`1px solid ${sourceTypeOverride===v ? "#2E7BDB" : "var(--border)"}`,
                    background: sourceTypeOverride===v ? "rgba(46,123,219,0.12)" : "var(--s2)",
                    color: sourceTypeOverride===v ? "#2E7BDB" : "var(--text2)",
                    fontSize:"0.78rem", fontFamily:"var(--sans)", cursor:"pointer",
                    fontWeight: sourceTypeOverride===v ? 600 : 400 }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* 분석 버튼 */}
          {isDemo ? (
            <div style={{ background:"var(--s2)", border:"1px solid var(--border2)",
              borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
              <div style={{ fontSize:"1.2rem", marginBottom:8 }}>🔒</div>
              <div style={{ fontSize:"0.84rem", color:"var(--muted)", fontWeight:500 }}>
                Diese Funktion ist in der Demo-Version nicht verfügbar.
              </div>
            </div>
          ) : (
          <button onClick={parsePdf}
            style={{ width:"100%", padding:"12px", borderRadius:10,
              background:"var(--accent)", border:"none", color:"#fff",
              fontSize:"0.92rem", fontWeight:700, fontFamily:"var(--sans)",
              cursor:"pointer", letterSpacing:"-0.01em" }}>
            🎼 Analysieren
            {pdfMeta.numPages && pageFrom === pageTo
              ? ` (Seite ${pageFrom})`
              : pdfMeta.numPages && !(pageFrom===1 && pageTo===pdfMeta.numPages)
              ? ` (S. ${pageFrom}–${pageTo})`
              : ""}
          </button>
          )}
        </div>
      )}

      {parsing && (
        <div className="parsing">
          <div className="pulse" style={{ fontSize: "1.5rem", marginBottom: 8 }}>🎼</div>
          <p>Claude analysiert den Plan…</p>
          <p style={{ marginTop: 4, fontSize: "0.72rem" }}>
            {pdfMeta?.numPages && pageFrom === pageTo
              ? `Seite ${pageFrom} von ${pdfMeta.numPages}`
              : pdfMeta?.numPages
              ? `Seiten ${pageFrom}–${pageTo}`
              : "Erkennt Stücke · Typen · Zielgruppen · Zeiten"}
          </p>
        </div>
      )}

      {error && <div style={{ color: "#F1948A", fontSize: "0.82rem", padding: "10px 0" }}>{error}</div>}

      {parsed && groupedParsed && (
        <div>
          <button onClick={() => { setParsed(null); }}
            style={{ background:"var(--s2)", border:"1px solid var(--border)", borderRadius:8,
              color:"var(--muted)", padding:"5px 12px", fontSize:"0.78rem",
              fontFamily:"var(--sans)", cursor:"pointer", marginBottom:12 }}>
            ← Einstellungen ändern
          </button>
          {/* Summary */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#2A0808", border: "1px solid #5A1515", padding: "8px 14px", fontSize: "0.8rem" }}>
              <span style={{ color: "var(--red)" }}>🎭</span> <strong style={{ color: "#FF9999" }}>{groupedParsed.vs.length}</strong> <span style={{ color: "var(--muted)" }}>Vorstellungen</span>
            </div>
            <div style={{ background: "var(--s2)", border: "1px solid var(--border)", padding: "8px 14px", fontSize: "0.8rem" }}>
              <span>🎵</span> <strong style={{ color: "var(--text)" }}>{groupedParsed.proben.length}</strong> <span style={{ color: "var(--muted)" }}>Proben</span>
            </div>
            <div style={{ background: "var(--s1)", border: "1px solid var(--border)", padding: "8px 14px", fontSize: "0.8rem" }}>
              <span style={{ color: "var(--faint)" }}>☽</span> <strong style={{ color: "var(--faint)" }}>{groupedParsed.frei.length}</strong> <span style={{ color: "var(--faint)" }}>Chorfrei</span>
            </div>
          </div>

          {/* Vorstellungen */}
          {groupedParsed.vs.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.65rem", color: "var(--red)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Vorstellungen</div>
              {groupedParsed.vs.map((e, i) => (
                <div key={i} className="parse-item" style={{ background: "#1A0505", borderColor: "#3A1010" }}>
                  <input type="checkbox" checked={e._import} onChange={() => setParsed(p => p.map((x, j) => p.indexOf(e) === j ? { ...x, _import: !x._import } : x))} />
                  <div className="parse-item-body">
                    <div className="parse-item-title" style={{ color: "#FF9999" }}>{e.title}</div>
                    <div className="parse-item-meta">📅 {fmtDate(e.date)} · ⏰ {e.startTime} Uhr</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Proben */}
          {groupedParsed.proben.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.65rem", color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                Proben
                <span style={{ marginLeft: 8, color: "var(--faint)", fontSize: "0.62rem", textTransform: "none", letterSpacing: 0 }}>
                  (Bass-Pflichttermine sind vorausgewählt)
                </span>
              </div>
              {groupedParsed.proben.map((e, i) => {
                const req = bassRequired(e);
                return (
                  <div key={i} className="parse-item" style={{ opacity: req === false ? 0.45 : 1 }}>
                    <input type="checkbox" checked={e._import} onChange={() => setParsed(p => p.map((x, j) => p.indexOf(e) === j ? { ...x, _import: !x._import } : x))} />
                    <div className="parse-item-body">
                      <div className="parse-item-title">
                        {e.title}
                        {e.production && <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: "0.78rem", fontStyle: "italic" }}>{e.production}</span>}
                        <span style={{ marginLeft: 6 }} className={`req-pill ${req === true ? "req-yes" : req === false ? "req-no" : "req-unk"}`}>
                          {req === true ? "Pflicht" : req === false ? "Nicht Bass" : "unklar"}
                        </span>
                      </div>
                      <div className="parse-item-meta">
                        📅 {fmtDate(e.date)} · {e.startTime !== "00:00" ? `⏰ ${e.startTime}` : ""} · 📍 {e.location}
                        {e.targetGroup && <span style={{ marginLeft: 8 }}>👥 {e.targetGroup}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="parse-actions">
            <button className="btn btn-gold" onClick={importSelected} disabled={!parsed.some(e => e._import)}>
              ✓ {parsed.filter(e => e._import).length} Termine importieren
            </button>
            <button className="btn btn-ghost" onClick={() => { setParsed(null); setError(""); }}>Verwerfen</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, padding: "12px 14px", background: "var(--s2)", border: "1px solid var(--border)", fontSize: "0.76rem", color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--text)", display: "block", marginBottom: 4 }}>Unterstützte Formate</strong>
        <span style={{ marginRight: 10 }} className="source-tag src-dienstplan">Dienstplan</span> wöchentlicher Detailplan<br />
        <span style={{ marginRight: 10, marginTop: 4, display: "inline-block" }} className="source-tag src-monatsplan">Monatsplan</span> monatliche Übersicht (April-Format)<br />
        <span style={{ marginRight: 10, marginTop: 4, display: "inline-block" }} className="source-tag src-vorplanung">Vorplanung</span> saisonale Gesamtübersicht<br />
        <span style={{ marginRight: 10, marginTop: 4, display: "inline-block" }} className="source-tag src-tagesplan">Tagesplan</span> täglicher Detailplan
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN VIEW
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
//  ADMIN SPIELPLAN
// ═══════════════════════════════════════════════════════════════════════

export { PdfView };

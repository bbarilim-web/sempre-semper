// utils.js — Sempre Semper
// 공유 상수 및 순수 헬퍼 함수

import { useFirebase } from "./useFirebase.js";

// ═══════════════════════════════════════════════════════════════════════
//  CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════════════
const VOICES = ["Sopran", "Alt", "Tenor", "Bariton", "Bass"];
const PARTS = ["Sop. 1.", "Sop. 2.", "Alt. 1.", "Alt. 2.", "Ten. 1.", "Ten. 2.", "Bass 1.", "Bass 2."];
const PART_VOICE = { "Sop. 1.":"Sopran","Sop. 2.":"Sopran","Alt. 1.":"Alt","Alt. 2.":"Alt","Ten. 1.":"Tenor","Ten. 2.":"Tenor","Bass 1.":"Bass","Bass 2.":"Bass" };
const VOICE_COLOR = { Sopran:"#FF3B30", Alt:"#FF9500", Tenor:"#34C759", Bariton:"#5856D6", Bass:"#0066CC" };

// Semperoper abbreviation decoder
const TYPE_MAP = {
  VS:"Vorstellung", BP:"Bühnenprobe", BO:"Bühnenorchesterprobe", GP:"Generalprobe",
  KHP:"Kleines Hauptprobe", OHP:"Orchesterhauptprobe", TE:"Toneinspielung",
  Bel:"Beleuchtungsprobe", KP:"Konzertprobe", szen:"Szenische Probe",
  mus:"Musikalische Probe", "1/2 cf":"Halber Chorfrei", cf:"Chorfrei",
};

const isVorstellung = (e) => e && e.eventType === "Vorstellung";
const isChorfrei = (e) => e && (e.eventType === "Chorfrei" || e.eventType === "Halber Chorfrei");
const isProbe = (e) => e && !isVorstellung(e) && !isChorfrei(e);

// "Elias, Parsifal" 또는"(Elias, Parsifal)" 또는 "Elias/Parsifal" → ["Elias", "Parsifal"]
// 작품명 정규화 — 부분 이름을 정식 이름으로 통합
// 예: "Giovanni" → "Don Giovanni", "Traviata" → "La Traviata"
const PRODUCTION_ALIASES = {
  "giovanni":      "Don Giovanni",
  "don giovanni":  "Don Giovanni",
  "traviata":      "La Traviata",
  "la traviata":   "La Traviata",
  "figaro":        "Le Nozze di Figaro",
  "nozze":         "Le Nozze di Figaro",
  "le nozze di figaro": "Le Nozze di Figaro",
  "boheme":        "La Bohème",
  "la boheme":     "La Bohème",
  "la bohème":     "La Bohème",
  "butterfly":     "Madama Butterfly",
  "madama butterfly": "Madama Butterfly",
  "tosca":         "Tosca",
  "aida":          "Aida",
  "carmen":        "Carmen",
  "parsifal":      "Parsifal",
  "elias":         "Elias",
  "fidelio":       "Fidelio",
  "lohengrin":     "Lohengrin",
  "tannhäuser":    "Tannhäuser",
  "tannhauser":    "Tannhäuser",
  "tristan":       "Tristan und Isolde",
  "tristan und isolde": "Tristan und Isolde",
  "meistersinger": "Die Meistersinger von Nürnberg",
  "die meistersinger": "Die Meistersinger von Nürnberg",
  "rheingold":     "Das Rheingold",
  "walküre":       "Die Walküre",
  "walkure":       "Die Walküre",
  "siegfried":     "Siegfried",
  "götterdämmerung": "Götterdämmerung",
  "gotterdammerung": "Götterdämmerung",
  "salome":        "Salome",
  "elektra":       "Elektra",
  "rosenkavalier": "Der Rosenkavalier",
  "der rosenkavalier": "Der Rosenkavalier",
  "ariadne":       "Ariadne auf Naxos",
  "fliegende holländer": "Der fliegende Holländer",
  "hollander":     "Der fliegende Holländer",
  "holländer":     "Der fliegende Holländer",
  "zauberflöte":   "Die Zauberflöte",
  "zauberflote":   "Die Zauberflöte",
  "die zauberflöte": "Die Zauberflöte",
  "freischütz":    "Der Freischütz",
  "freischutz":    "Der Freischütz",
  "karmelitinnen": "Karmelitinnen",
  "florentiner hut": "Ein Florentiner Hut",
  "ein florentiner hut": "Ein Florentiner Hut",
  // Cavalleria rusticana / Pagliacci — 항상 함께 공연되므로 하나로 통합
  "cav":                        "Cavalleria rusticana / Pagliacci",
  "pag":                        "Cavalleria rusticana / Pagliacci",
  "cav/pag":                    "Cavalleria rusticana / Pagliacci",
  "cavalleria":                 "Cavalleria rusticana / Pagliacci",
  "cavalleria rusticana":       "Cavalleria rusticana / Pagliacci",
  "pagliacci":                  "Cavalleria rusticana / Pagliacci",
  "cav / pag":                  "Cavalleria rusticana / Pagliacci",
  "cavalleria / pagliacci":     "Cavalleria rusticana / Pagliacci",
  "cavalleria rusticana / pagliacci": "Cavalleria rusticana / Pagliacci",
};

const normalizeProduction = (name, knownProductions = []) => {
  if (!name) return name;
  const trimmed = name.trim();
  const key = trimmed.toLowerCase();
  // 1. 고정 alias 먼저 확인
  if (PRODUCTION_ALIASES[key]) return PRODUCTION_ALIASES[key];
  // 2. 이미 알려진 작품명 중 부분 문자열 매칭
  // 예: "giovanni" → "Don Giovanni" (Giovanni가 Don Giovanni에 포함됨)
  const lowerTrimmed = key;
  const match = knownProductions
    .filter(p => p.toLowerCase() !== lowerTrimmed) // 자기 자신 제외
    .find(p => 
      p.toLowerCase().includes(lowerTrimmed) || // "Don Giovanni".includes("giovanni")
      lowerTrimmed.includes(p.toLowerCase())    // 반대 방향도 체크
    );
  return match || trimmed;
};

const splitProductions = (production, knownProductions = []) => {
  if (!production) return [];
  return production
    .replace(/[()]/g, "")
    .split(/[,/]+/)
    .map(p => normalizeProduction(p.trim(), knownProductions))
    .filter(p => p.length > 0);
};

// 이벤트의 작품이 내 작품 목록과 하나라도 겹치는지 확인
const isNeueinsteiger = (event) => {
  const tg = (event.targetGroup || "").toLowerCase();
  return tg.includes("neueinsteiger") || tg.includes("neueinsteigerinnen") || tg.includes("neueinsteiger*innen");
};

const matchesMyProductions = (event, myProductions, knownProductions = [], neuDazuProductions = []) => {
  if (!event.production) return true;

  // 이벤트의 production을 정규화
  const sortedKnown = [...knownProductions].sort((a, b) => b.length - a.length);
  const rawProds = splitProductions(event.production, knownProductions);
  const prods = rawProds.map(p => normalizeProduction(p, sortedKnown));

  // myProductions도 정규화해서 비교
  const normMyProds = myProductions.map(p => normalizeProduction(p, sortedKnown));
  const normNeuDazu = neuDazuProductions.map(p => normalizeProduction(p, sortedKnown));

  const matchesProd = prods.some(p => normMyProds.includes(p));
  if (!matchesProd) return false;

  // Neueinsteiger 일정은 neuDazu에 체크된 경우만 표시
  if (isNeueinsteiger(event)) {
    return prods.some(p => normNeuDazu.includes(p));
  }
  return true;
};

const fmtD = d => d.toISOString().split("T")[0];
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = new Date();
const todayStr = fmtD(today);

const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const WEEKDAYS_DE = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const WEEKDAYS_FULL = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

function fmtDate(ds, long = false) {
  const d = new Date(ds + "T12:00:00");
  if (long) return d.toLocaleDateString("de-DE", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  return d.toLocaleDateString("de-DE", { weekday:"short", day:"numeric", month:"short" });
}
function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 2) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

// Determines if a Bass singer is required based on Semperoper terminology
function bassRequired(event) {
  if (!event || !event.targetGroup) return null;
  const g = event.targetGroup.toLowerCase();
  if (g.includes("alle herren")) return true;
  if (g.includes("alle eingeteilten") && !g.includes("damen")) return true;
  if (g.includes("alle") && !g.includes("damen") && !g.includes("sopran") && !g.includes("alt")) return true;
  if (g.includes("bass")) return true;
  if (g.includes("herren")) return true;
  if (g.includes("damen") && !g.includes("herren")) return false;
  if (g.includes("blumenmädchen")) return false;
  if (g.includes("sopran") && !g.includes("bass")) return false;
  if (g.includes("alt") && !g.includes("bass")) return false;
  return null;
}

// 사용자 voice/part에 따라 해당 일정인지 판단
function isRelevantForUser(event, user) {
  if (!event || !event.targetGroup) return true;
  const g = event.targetGroup.trim().toLowerCase();
  const voice = (user?.voice || "").toLowerCase();
  const part  = (user?.part  || "").toLowerCase();

  // "Alle Eingeteilten" 단독이거나 "Alle" / "Alle Stimmgruppen"만 → 전체 공개
  if (g === "alle eingeteilten" || g === "alle" || g === "alle stimmgruppen") return true;

  const isFemale = voice === "sopran" || voice === "alt" ||
                   part.includes("sopran") || part.includes("alt");
  const isMale   = voice === "tenor" || voice === "bass" ||
                   part.includes("tenor") || part.includes("bass");

  // Damen / Frauen 키워드 → 여성 전용 (Herren도 포함된 경우 제외)
  const hasDamen  = g.includes("damen") || g.includes("frauen");
  const hasHerren = g.includes("herren") || g.includes("männer");

  if (hasDamen && hasHerren) return true;   // 양쪽 모두 명시 → 전체
  if (hasDamen)  return isFemale;
  if (hasHerren) return isMale;

  // 특정 Stimmgruppe 명시 (콤마 분리 지원: "Tenor, Alt")
  const parts = g.split(/[,;]+/).map(s => s.trim());
  const voiceMatch = (tok) =>
    (tok.includes("sopran")  && (voice === "sopran" || part.includes("sopran"))) ||
    (tok.includes("alt")     && (voice === "alt"    || part.includes("alt"))) ||
    (tok.includes("tenor")   && (voice === "tenor"  || part.includes("tenor"))) ||
    (tok.includes("bass")    && (voice === "bass"   || part.includes("bass")));

  const hasVoiceKeyword = parts.some(tok =>
    tok.includes("sopran") || tok.includes("alt") ||
    tok.includes("tenor")  || tok.includes("bass")
  );
  if (hasVoiceKeyword) return parts.some(voiceMatch);

  // 그 외 (알 수 없는 targetGroup) → 보여줌
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
//  DEMO SEED DATA (real format from uploaded PDFs)
// ═══════════════════════════════════════════════════════════════════════


// DVB Haltestellen — Theaterplatz-Bereich
const DVB_STOPS = [
  { id: "theaterplatz", stopId: "33000020", name: "Theaterplatz",    lines: "2, 4, 8, 9",                    note: "Direkt vor der Semperoper",  icon: "🏛️" },
  { id: "altmarkt",     stopId: "33000004", name: "Altmarkt",        lines: "1, 2, 4, 6, 10, 12",            note: "Einkaufen & Stadtmitte",     icon: "🛒" },
  { id: "postplatz",    stopId: "33000037", name: "Postplatz",       lines: "1, 2, 4, 6, 7, 8, 10, 11, 12", note: "Zentraler Knotenpunkt",       icon: "🚉" },
  { id: "zwingerteich", stopId: "33000035", name: "Am Zwingerteich", lines: "4, 8, 9",                       note: "Zwinger & Altstadt West",    icon: "🦢" },
];

// ═══════════════════════════════════════════════════════════════════════
//  SEED PINNWAND
// ═══════════════════════════════════════════════════════════════════════
const SEED_PINNWAND = [
  {
    id: "pin1",
    type: "announcement",   // announcement | post | feedback
    pinned: true,
    author: { id:"admin", name:"Chorleitung", role:"admin" },
    title: "Willkommen bei Sempre Semper! 🎶",
    body: "Dies ist die neue digitale Pinnwand des Staatsopernchors. Hier findet ihr offizielle Ankündigungen, Neuigkeiten und könnt euch untereinander austauschen. Bei Fragen oder Feedback einfach unten posten!",
    ts: Date.now() - 2 * 3600000,
    readBy: [],
    likes: [],
  },
  {
    id: "pin2",
    type: "announcement",
    pinned: true,
    author: { id:"admin", name:"Chorleitung", role:"admin" },
    title: "Probenbeginn Carmen — wichtige Info",
    body: "Die Bühnenproben für Carmen beginnen am 9. April. Bitte alle eingeteilten Damen und Herren pünktlich um 10:00 Uhr auf der Bühne. Kostümprobe folgt nach Ansage.",
    ts: Date.now() - 1 * 3600000,
    readBy: [],
    likes: [],
  },
  {
    id: "pin3",
    type: "post",
    pinned: false,
    author: { id:"u1", name:"임봉수", role:"member", part:"Bass 1." },
    title: "",
    body: "Hat jemand eine gute Empfehlung für ein Café in der Nähe des Theaterplatzes? ☕",
    ts: Date.now() - 30 * 60000,
    readBy: [],
    likes: [],
  },
];

const SEED = [

  // ═══════════════════════════════════
  //  TAGESPLAN: Fr 20.02.2026
  // ═══════════════════════════════════
  { id:"t1",  date:"2026-02-20", startTime:"09:00", endTime:"10:00", eventType:"Musikalische Probe",  title:"Nachstudium Traviata",        location:"Chorsaal",     targetGroup:"Staatsopernchor (Patsalidou, Voima, Lindner)", production:"Traviata",         conductor:"Becker",         note:"",                    sourceType:"tagesplan",   updatedAt:Date.now(), _edited:false },
  { id:"t2",  date:"2026-02-20", startTime:"10:00", endTime:"12:00", eventType:"Musikalische Probe",  title:"Florentiner Hut",             location:"Chorsaal",     targetGroup:"Staatsopernchor (Damen)",                     production:"Florentiner Hut",  conductor:"Becker/Kim",     note:"",                    sourceType:"tagesplan",   updatedAt:Date.now(), _edited:false },
  { id:"t3",  date:"2026-02-20", startTime:"10:00", endTime:"14:00", eventType:"Bühnenprobe",         title:"Parsifal Akt I",              location:"Probebühne 1", targetGroup:"Alle Herren (ab 10:45)",                      production:"Parsifal",         conductor:"Visser/Hoffmann", note:"Herren ab 10:45 dazu", sourceType:"tagesplan",   updatedAt:Date.now(), _edited:false },
  { id:"t4",  date:"2026-02-20", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Dialogues des Carmélites",    location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Karmelitinnen",    conductor:"Marie Jacquot",  note:"",                    sourceType:"tagesplan",   updatedAt:Date.now(), _edited:false },

  // ═══════════════════════════════════
  //  DIENSTPLAN: Plan_8 (Mo 23.02 – So 08.03.2026)
  // ═══════════════════════════════════
  // Mo 23.02
  { id:"d1",  date:"2026-02-23", startTime:"09:00", endTime:"10:00", eventType:"Musikalische Probe",  title:"Nachstudium Traviata",        location:"Chorsaal",     targetGroup:"Alle Neueinsteigerinnen",                     production:"Traviata",         conductor:"Becker",         note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d2",  date:"2026-02-23", startTime:"10:00", endTime:"13:00", eventType:"Bühnenprobe",         title:"Parsifal Bühnenprobe",        location:"Bühne",        targetGroup:"Alle Herren",                                 production:"Parsifal",         conductor:"Hoffmann",       note:"Ablauf laut Tagesplan", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  { id:"d3",  date:"2026-02-23", startTime:"10:00", endTime:"11:10", eventType:"Musikalische Probe",  title:"Florentiner Hut CDN2",        location:"Chorsaal",     targetGroup:"Alle eingeteilten Damen CDN2",                production:"Florentiner Hut",  conductor:"Becker/Kim",     note:"dazu Invitati ab 11:10 bis 13:00", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  { id:"d4",  date:"2026-02-23", startTime:"13:15", endTime:"14:00", eventType:"Musikalische Probe",  title:"Vorsingen",                  location:"Chorsaal",     targetGroup:"Tenor, Alt",                                  production:"",                 conductor:"Hoffmann/Becker/Dove", note:"",             sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d5",  date:"2026-02-23", startTime:"14:00", endTime:"16:00", eventType:"Vorstellung",         title:"Karmelitinnen Stimmzeit",    location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Karmelitinnen",    conductor:"Hoffmann",       note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d6",  date:"2026-02-23", startTime:"18:00", endTime:"21:00", eventType:"Bühnenprobe",         title:"Parsifal Bühnenprobe",        location:"Bühne",        targetGroup:"Alle Herren",                                 production:"Parsifal",         conductor:"Becker",         note:"Ablauf laut Tagesplan", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  { id:"d7",  date:"2026-02-23", startTime:"18:30", endTime:"21:00", eventType:"Musikalische Probe",  title:"Elias / Parsifal",           location:"Chorsaal",     targetGroup:"Alle Damen",                                  production:"Elias/Parsifal",   conductor:"Hoffmann/Kim",   note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Di 24.02
  { id:"d8",  date:"2026-02-24", startTime:"00:00", endTime:"00:00", eventType:"Chorfrei",            title:"Chorfrei",                   location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Mi 25.02
  { id:"d9",  date:"2026-02-25", startTime:"10:00", endTime:"13:20", eventType:"Bühnenprobe",         title:"Parsifal Blumenmädchen",     location:"Probebühne 1", targetGroup:"Alle Blumenmädchen",                          production:"Parsifal",         conductor:"Hoffmann",       note:"Ablauf laut Tagesplan, bis 13:20", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  { id:"d10", date:"2026-02-25", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Florentiner Hut Herren Invitati", location:"Chorsaal", targetGroup:"Alle eingeteilten Herren Invitati",            production:"Florentiner Hut",  conductor:"Becker/Kim",     note:"dazu CDN2 ab 11:00 bis 13:00",  sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  { id:"d11", date:"2026-02-25", startTime:"19:00", endTime:"22:00", eventType:"Vorstellung",         title:"Don Giovanni",               location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Don Giovanni",     conductor:"Kim",            note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Do 26.02
  { id:"d12", date:"2026-02-26", startTime:"09:00", endTime:"10:00", eventType:"Musikalische Probe",  title:"Nachstudium Carmen",         location:"Chorsaal",     targetGroup:"Alle Neueinsteiger*innen",                     production:"Carmen",           conductor:"Becker",         note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d13", date:"2026-02-26", startTime:"10:00", endTime:"13:00", eventType:"Bühnenprobe",         title:"Parsifal Bühnenprobe",        location:"Bühne",        targetGroup:"Alle Herren",                                 production:"Parsifal",         conductor:"Hoffmann",       note:"Ablauf laut Tagesplan", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  { id:"d14", date:"2026-02-26", startTime:"10:00", endTime:"11:30", eventType:"Musikalische Probe",  title:"Carmen",                     location:"Chorsaal",     targetGroup:"Alle eingeteilten Damen",                     production:"Carmen",           conductor:"Becker/Kim",     note:"dazu Florentiner Hut Damen ab 11:30", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  { id:"d15", date:"2026-02-26", startTime:"18:30", endTime:"21:00", eventType:"Musikalische Probe",  title:"Elias",                      location:"Chorsaal",     targetGroup:"Alle",                                        production:"Elias",            conductor:"Hoffmann/Kim",   note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Fr 27.02
  { id:"d16", date:"2026-02-27", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Carmen",                     location:"Chorsaal",     targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"Becker/Kim",     note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d17", date:"2026-02-27", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Dialogues des Carmélites",   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Karmelitinnen",    conductor:"",               note:"½ chorfrei",          sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Sa 28.02
  { id:"d18", date:"2026-02-28", startTime:"00:00", endTime:"00:00", eventType:"Chorfrei",            title:"Chorfrei",                   location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // So 01.03
  { id:"d19", date:"2026-03-01", startTime:"00:00", endTime:"00:00", eventType:"Chorfrei",            title:"Chorfrei",                   location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Mo 02.03
  { id:"d20", date:"2026-03-02", startTime:"09:00", endTime:"10:00", eventType:"Musikalische Probe",  title:"Nachstudium",                location:"Chorsaal",     targetGroup:"nach Ansage",                                 production:"",                 conductor:"Becker",         note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d21", date:"2026-03-02", startTime:"10:00", endTime:"12:30", eventType:"Musikalische Probe",  title:"Carmen (Damen)",             location:"Chorsaal",     targetGroup:"Alle eingeteilten Damen",                     production:"Carmen",           conductor:"Becker/Dove",    note:"dazu Herren ab 10:30, bis 12:30", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  { id:"d22", date:"2026-03-02", startTime:"18:30", endTime:"21:00", eventType:"Musikalische Probe",  title:"Elias / Parsifal Damen",     location:"Chorsaal",     targetGroup:"Alle eingeteilten Damen",                     production:"Elias/Parsifal",   conductor:"Hoffmann/Kim",   note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d23", date:"2026-03-02", startTime:"19:00", endTime:"22:00", eventType:"Bühnenprobe",         title:"Parsifal Bühnenprobe",        location:"Bühne",        targetGroup:"Alle Herren",                                 production:"Parsifal",         conductor:"Becker",         note:"Ablauf laut Tagesplan", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  // Di 03.03
  { id:"d24", date:"2026-03-03", startTime:"09:00", endTime:"10:00", eventType:"Musikalische Probe",  title:"Nachstudium",                location:"Chorsaal",     targetGroup:"nach Ansage",                                 production:"",                 conductor:"Becker",         note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d25", date:"2026-03-03", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Florentiner Hut",            location:"Chorsaal",     targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"Becker/Kim",     note:"geteilte Probe bis 13:00",        sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d26", date:"2026-03-03", startTime:"18:30", endTime:"21:00", eventType:"Musikalische Probe",  title:"Florentiner Hut Herren",     location:"Chorsaal",     targetGroup:"Alle eingeteilten Herren",                    production:"Florentiner Hut",  conductor:"Becker/Kim",     note:"geteilte Probe bis 21:00",        sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d27", date:"2026-03-03", startTime:"19:00", endTime:"22:00", eventType:"Bühnenprobe",         title:"Parsifal Blumenmädchen",     location:"Bühne",        targetGroup:"Alle eingeteilten Blumenmädchen",             production:"Parsifal",         conductor:"Hoffmann",       note:"Ablauf laut Tagesplan", sourceType:"dienstplan", updatedAt:Date.now(), _edited:false },
  // Mi 04.03
  { id:"d28", date:"2026-03-04", startTime:"09:00", endTime:"10:00", eventType:"Musikalische Probe",  title:"Nachstudium",                location:"Chorsaal",     targetGroup:"nach Ansage",                                 production:"",                 conductor:"Becker",         note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d29", date:"2026-03-04", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Elias",                      location:"Chorsaal",     targetGroup:"Alle",                                        production:"Elias",            conductor:"Hoffmann/Kim",   note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d30", date:"2026-03-04", startTime:"19:00", endTime:"22:00", eventType:"Vorstellung",         title:"Don Giovanni",               location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Don Giovanni",     conductor:"Kim",            note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Do 05.03
  { id:"d31", date:"2026-03-05", startTime:"09:00", endTime:"10:00", eventType:"Musikalische Probe",  title:"Nachstudium",                location:"Chorsaal",     targetGroup:"nach Ansage",                                 production:"",                 conductor:"Becker",         note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d32", date:"2026-03-05", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Florentiner Hut",            location:"Chorsaal",     targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"Becker/Kim",     note:"geteilte Probe bis 13:00",        sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d33", date:"2026-03-05", startTime:"18:30", endTime:"21:00", eventType:"Musikalische Probe",  title:"Elias",                      location:"Chorsaal",     targetGroup:"Alle",                                        production:"Elias",            conductor:"Hoffmann/Kim",   note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Fr 06.03
  { id:"d34", date:"2026-03-06", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Elias",                      location:"Chorsaal",     targetGroup:"Alle",                                        production:"Elias",            conductor:"Hoffmann/Kim",   note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  { id:"d35", date:"2026-03-06", startTime:"18:00", endTime:"21:30", eventType:"Vorstellung",         title:"Don Giovanni",               location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Don Giovanni",     conductor:"Kim",            note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },
  // Sa 07.03
  { id:"d36", date:"2026-03-07", startTime:"00:00", endTime:"00:00", eventType:"Halber Chorfrei",     title:"½ Chorfrei",                 location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"dienstplan",  updatedAt:Date.now(), _edited:false },

  // ═══════════════════════════════════
  //  MONATSPLAN: April 2026
  // ═══════════════════════════════════
  { id:"a1",  date:"2026-04-01", startTime:"00:00", endTime:"00:00", eventType:"Chorfrei",            title:"Chorfrei",                   location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a2",  date:"2026-04-02", startTime:"10:00", endTime:"13:20", eventType:"Szenische Probe",     title:"Carmen Szenische Probe",     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"bis 13:20 Uhr",       sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a3",  date:"2026-04-02", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Traviata",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Traviata",         conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a4",  date:"2026-04-03", startTime:"16:00", endTime:"21:30", eventType:"Vorstellung",         title:"Parsifal",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Parsifal",         conductor:"",               note:"Karfreitag",          sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a5",  date:"2026-04-04", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a6",  date:"2026-04-04", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Traviata",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Traviata",         conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a7",  date:"2026-04-06", startTime:"16:00", endTime:"21:30", eventType:"Vorstellung",         title:"Parsifal",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Parsifal",         conductor:"",               note:"Ostermontag",         sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a8",  date:"2026-04-07", startTime:"00:00", endTime:"00:00", eventType:"Halber Chorfrei",     title:"½ Chorfrei",                 location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a9",  date:"2026-04-07", startTime:"10:00", endTime:"13:00", eventType:"Szenische Probe",     title:"Carmen Szenische Probe",     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a10", date:"2026-04-08", startTime:"00:00", endTime:"00:00", eventType:"Chorfrei",            title:"Chorfrei",                   location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a11", date:"2026-04-09", startTime:"10:00", endTime:"13:00", eventType:"Bühnenprobe",         title:"BP Carmen",                  location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a12", date:"2026-04-09", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Traviata",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Traviata",         conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a13", date:"2026-04-10", startTime:"10:00", endTime:"13:00", eventType:"Bühnenprobe",         title:"BP Carmen",                  location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a14", date:"2026-04-10", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a15", date:"2026-04-11", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a16", date:"2026-04-11", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Traviata",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Traviata",         conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a17", date:"2026-04-12", startTime:"19:00", endTime:"22:00", eventType:"Vorstellung",         title:"Zauberflöte",                location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Zauberflöte",      conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a18", date:"2026-04-13", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a19", date:"2026-04-14", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a20", date:"2026-04-14", startTime:"19:00", endTime:"22:00", eventType:"Bühnenprobe",         title:"BP Carmen (Abend)",          location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a21", date:"2026-04-15", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a22", date:"2026-04-15", startTime:"19:00", endTime:"22:00", eventType:"Bühnenprobe",         title:"BP Carmen (Abend)",          location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a23", date:"2026-04-16", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a24", date:"2026-04-17", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a25", date:"2026-04-17", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Traviata",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Traviata",         conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a26", date:"2026-04-18", startTime:"00:00", endTime:"00:00", eventType:"Chorfrei",            title:"Chorfrei",                   location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a27", date:"2026-04-19", startTime:"00:00", endTime:"00:00", eventType:"Halber Chorfrei",     title:"½ Chorfrei",                 location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a28", date:"2026-04-20", startTime:"10:00", endTime:"13:00", eventType:"Musikalische Probe",  title:"Musikalische Proben",        location:"Probensaal",   targetGroup:"nach Ansage",                                 production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a29", date:"2026-04-20", startTime:"19:00", endTime:"22:00", eventType:"Bühnenprobe",         title:"BP Carmen (Abend)",          location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a30", date:"2026-04-21", startTime:"17:00", endTime:"21:00", eventType:"Kleines Hauptprobe",  title:"KHP Carmen",                 location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a31", date:"2026-04-22", startTime:"00:00", endTime:"00:00", eventType:"Chorfrei",            title:"Chorfrei",                   location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a32", date:"2026-04-23", startTime:"10:00", endTime:"13:00", eventType:"Bühnenorchesterprobe",title:"BO Carmen",                  location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a33", date:"2026-04-23", startTime:"10:00", endTime:"13:00", eventType:"Szenische Probe",     title:"Florentiner Hut Szenische Probe", location:"Bühne",   targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a34", date:"2026-04-24", startTime:"10:00", endTime:"13:00", eventType:"Bühnenorchesterprobe",title:"BO Carmen",                  location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a35", date:"2026-04-24", startTime:"19:00", endTime:"22:00", eventType:"Vorstellung",         title:"Zauberflöte",                location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Zauberflöte",      conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a36", date:"2026-04-25", startTime:"10:00", endTime:"13:00", eventType:"Bühnenorchesterprobe",title:"BO Carmen",                  location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a37", date:"2026-04-25", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Traviata",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Traviata",         conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a38", date:"2026-04-26", startTime:"00:00", endTime:"00:00", eventType:"Halber Chorfrei",     title:"½ Chorfrei",                 location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a39", date:"2026-04-27", startTime:"17:00", endTime:"21:00", eventType:"Orchesterhauptprobe", title:"OHP Carmen",                 location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a40", date:"2026-04-28", startTime:"10:00", endTime:"13:00", eventType:"Szenische Probe",     title:"Florentiner Hut Szenische Probe", location:"Bühne",   targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a41", date:"2026-04-28", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Traviata",                   location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Traviata",         conductor:"",               note:"ohne Banda",          sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a42", date:"2026-04-29", startTime:"00:00", endTime:"00:00", eventType:"Halber Chorfrei",     title:"½ Chorfrei",                 location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a43", date:"2026-04-29", startTime:"19:00", endTime:"23:00", eventType:"Generalprobe",        title:"GP Carmen",                  location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },
  { id:"a44", date:"2026-04-30", startTime:"00:00", endTime:"00:00", eventType:"Chorfrei",            title:"Chorfrei",                   location:"",             targetGroup:"",                                            production:"",                 conductor:"",               note:"",                    sourceType:"monatsplan",  updatedAt:Date.now(), _edited:false },

  // ═══════════════════════════════════
  //  VORPLANUNG 2025/2026 — Vorstellungen (Chor beteiligt)
  //  Mai 2026
  // ═══════════════════════════════════
  { id:"v1",  date:"2026-05-01", startTime:"18:00", endTime:"23:00", eventType:"Vorstellung",         title:"Carmen (Premiere)",          location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"PREMIERE",            sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v2",  date:"2026-05-03", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v3",  date:"2026-05-06", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v4",  date:"2026-05-09", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v5",  date:"2026-05-17", startTime:"18:00", endTime:"22:00", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v6",  date:"2026-05-23", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v7",  date:"2026-05-25", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v8",  date:"2026-05-29", startTime:"19:00", endTime:"23:30", eventType:"Vorstellung",         title:"9. Konzert",                 location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"9. Konzert",       conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v9",  date:"2026-05-31", startTime:"17:00", endTime:"22:30", eventType:"Vorstellung",         title:"Florentiner Hut (Premiere)", location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"",               note:"PREMIERE",            sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  // Juni 2026
  { id:"v10", date:"2026-06-01", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v11", date:"2026-06-06", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Florentiner Hut",            location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v12", date:"2026-06-09", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v13", date:"2026-06-12", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v14", date:"2026-06-14", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Florentiner Hut",            location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v15", date:"2026-06-19", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Florentiner Hut",            location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v16", date:"2026-06-20", startTime:"19:00", endTime:"22:30", eventType:"Bühnenprobe",         title:"BP Carmen",                  location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v17", date:"2026-06-23", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Carmen",                     location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Carmen",           conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v18", date:"2026-06-26", startTime:"19:00", endTime:"22:30", eventType:"Bühnenorchesterprobe",title:"BO Florentiner Hut",         location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Florentiner Hut",  conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
  { id:"v19", date:"2026-06-30", startTime:"19:00", endTime:"22:30", eventType:"Vorstellung",         title:"Rigoletto",                  location:"Bühne",        targetGroup:"Alle Eingeteilten",                           production:"Rigoletto",        conductor:"",               note:"",                    sourceType:"vorplanung",  updatedAt:Date.now(), _edited:false },
];


// Event type styling — dark theme with strong contrast
const EVENT_STYLE = {
  "Vorstellung":           { bg:"rgba(255,69,58,0.12)",   border:"rgba(255,69,58,0.35)",   text:"#FF6B61",  leftBorder:"#FF453A", badge:"VS",    badgeBg:"#FF453A", badgeText:"#fff" },
  "Generalprobe":          { bg:"rgba(255,159,10,0.12)",  border:"rgba(255,159,10,0.35)",  text:"#FFBA45",  leftBorder:"#FF9F0A", badge:"GP",    badgeBg:"#FF9F0A", badgeText:"#fff" },
  "Orchesterhauptprobe":   { bg:"rgba(59,158,255,0.12)",  border:"rgba(59,158,255,0.35)",  text:"#64B5FF",  leftBorder:"#3B9EFF", badge:"OHP",   badgeBg:"#3B9EFF", badgeText:"#fff" },
  "Kleines Hauptprobe":    { bg:"rgba(59,158,255,0.10)",  border:"rgba(59,158,255,0.28)",  text:"#5DAAFF",  leftBorder:"#2D8FEF", badge:"KHP",   badgeBg:"#2D8FEF", badgeText:"#fff" },
  "Bühnenorchesterprobe":  { bg:"rgba(50,215,75,0.10)",   border:"rgba(50,215,75,0.28)",   text:"#4DCF62",  leftBorder:"#32D74B", badge:"BO",    badgeBg:"#32D74B", badgeText:"#fff" },
  "Bühnenprobe":           { bg:"rgba(88,86,214,0.12)",   border:"rgba(88,86,214,0.32)",   text:"#8280D6",  leftBorder:"#5856D6", badge:"BP",    badgeBg:"#5856D6", badgeText:"#fff" },
  "Szenische Probe":       { bg:"rgba(255,45,85,0.10)",   border:"rgba(255,45,85,0.28)",   text:"#FF6B8A",  leftBorder:"#FF2D55", badge:"Szen",  badgeBg:"#FF2D55", badgeText:"#fff" },
  "Musikalische Probe":    { bg:"rgba(255,255,255,0.04)", border:"rgba(255,255,255,0.10)", text:"#C7C7CC",  leftBorder:"#48484E", badge:"Mus",   badgeBg:"#48484E", badgeText:"#C7C7CC" },
  "Toneinspielung":        { bg:"rgba(255,214,10,0.10)",  border:"rgba(255,214,10,0.28)",  text:"#FFD60A",  leftBorder:"#F5C400", badge:"TE",    badgeBg:"#F5C400", badgeText:"#000" },
  "Beleuchtungsprobe":     { bg:"rgba(142,142,147,0.10)", border:"rgba(142,142,147,0.25)", text:"#AEAEB2",  leftBorder:"#636366", badge:"Bel",   badgeBg:"#636366", badgeText:"#fff" },
  "Chorfrei":              { bg:"rgba(255,255,255,0.02)", border:"rgba(255,255,255,0.06)", text:"#545458",  leftBorder:"#2E2E36", badge:"frei",  badgeBg:"#2E2E36", badgeText:"#636366" },
  "Halber Chorfrei":       { bg:"rgba(255,255,255,0.02)", border:"rgba(255,255,255,0.06)", text:"#545458",  leftBorder:"#2E2E36", badge:"½frei", badgeBg:"#2E2E36", badgeText:"#636366" },
};
function getStyle(e) { return (e && EVENT_STYLE[e.eventType]) || EVENT_STYLE["Musikalische Probe"]; }

// Probe hierarchy for "importance" ordering (lower = more important)
const PROBE_RANK = { "Vorstellung":1, "Generalprobe":2, "Orchesterhauptprobe":3, "Kleines Hauptprobe":4, "Bühnenorchesterprobe":5, "Bühnenprobe":6, "Szenische Probe":7, "Musikalische Probe":8 };

const USERS = [
  { id:"u1", name:"임봉수 · Lim Bong-Su", role:"member", voice:"Bass", email:"lim.bongsu@semperoper.de",
    ensemble:"Opernchor", theater:"Sächsische Staatstheater Dresden Semperoper", part:"Bass 1." },
  { id:"u2", name:"Admin / Chorleitung", role:"admin", voice:"Alt", email:"admin@semperoper.de" },
];

// ═══════════════════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════════════════

export {
  VOICES, PARTS, PART_VOICE, VOICE_COLOR,
  TYPE_MAP, PRODUCTION_ALIASES,
  isVorstellung, isChorfrei, isProbe,
  normalizeProduction, splitProductions,
  isNeueinsteiger, matchesMyProductions,
  fmtD, addD, today, todayStr,
  MONTHS_DE, WEEKDAYS_DE, WEEKDAYS_FULL,
  fmtDate, timeAgo,
  bassRequired, isRelevantForUser,
  DVB_STOPS, SEED_PINNWAND, SEED,
  EVENT_STYLE, getStyle, PROBE_RANK,
};

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
    dob:"1984-05-12", ensemble:"Opernchor", theater:"Sächsische Staatsoper Dresden", part:"Bass 1." },
  { id:"u2", name:"Admin / Chorleitung", role:"admin", voice:"Alt", email:"admin@semperoper.de" },
];

// ═══════════════════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:         #0A0A0B;
  --s1:         #141416;
  --s2:         #1C1C1F;
  --s3:         #242428;
  --border:     #2A2A30;
  --border2:    #3A3A42;
  --text:       #F0EEE8;
  --text2:      #B8B4A8;
  --muted:      #7A7670;
  --faint:      #4A4845;
  --accent:     #E8173A;
  --accent2:    #FF3A5C;
  --accent-dim: rgba(232,23,58,0.15);
  --accent-border: rgba(232,23,58,0.35);
  --red:        #E8173A;
  --red-bg:     rgba(232,23,58,0.12);
  --red-border: rgba(232,23,58,0.35);
  --orange:     #E8920A;
  --orange-bg:  rgba(232,146,10,0.12);
  --green:      #2DB34A;
  --green-bg:   rgba(45,179,74,0.12);
  --blue:       #2E7BDB;
  --blue-bg:    rgba(46,123,219,0.12);
  --gold:       #C9A84C;
  --gold-bg:    rgba(201,168,76,0.10);
  --shadow:     0 1px 6px rgba(0,0,0,0.6);
  --shadow-md:  0 8px 32px rgba(0,0,0,0.7);
  --shadow-lg:  0 20px 60px rgba(0,0,0,0.8);
  --serif:      'Playfair Display', Georgia, serif;
  --sans:       'DM Sans', -apple-system, sans-serif;
}

/* ── 라이트 테마 ── */
[data-theme="light"] {
  --bg:         #F5F4F0;
  --s1:         #FFFFFF;
  --s2:         #EEECE8;
  --s3:         #E4E2DC;
  --border:     #D8D4CC;
  --border2:    #C8C4BC;
  --text:       #0A0A0B;
  --text2:      #1A1814;
  --muted:      #2A2824;
  --faint:      #5A5650;
  --accent:     #C8102E;
  --accent2:    #E8173A;
  --accent-dim: rgba(200,16,46,0.1);
  --accent-border: rgba(200,16,46,0.3);
  --red:        #C8102E;
  --red-bg:     rgba(200,16,46,0.08);
  --red-border: rgba(200,16,46,0.25);
  --orange:     #C47A0A;
  --orange-bg:  rgba(196,122,10,0.1);
  --green:      #1A8A36;
  --green-bg:   rgba(26,138,54,0.1);
  --blue:       #1A5FB4;
  --blue-bg:    rgba(26,95,180,0.1);
  --gold:       #A07830;
  --gold-bg:    rgba(160,120,48,0.1);
  --shadow:     0 1px 6px rgba(0,0,0,0.12);
  --shadow-md:  0 8px 32px rgba(0,0,0,0.15);
  --shadow-lg:  0 20px 60px rgba(0,0,0,0.2);
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

/* ── Shell ── */
.shell { display: flex; flex-direction: column; min-height: 100vh; }

/* ── Top Bar ── */
.topbar {
  background: rgba(10,10,11,0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(232,23,58,0.18);
  padding: 0 16px;
  height: 56px;
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 200;
  box-shadow: 0 1px 0 rgba(232,23,58,0.08), 0 4px 20px rgba(0,0,0,0.5);
}
.logo { display: flex; align-items: center; gap: 10px; cursor: default; }
.logo-semper-icon {
  width: 28px; height: 20px; flex-shrink: 0;
}
.logo-text-wrap { display: flex; flex-direction: column; line-height: 1; }
.logo-sempre { font-family: var(--serif); font-size: 0.62rem; font-weight: 400; color: var(--muted); letter-spacing: 0.12em; text-transform: uppercase; }
.logo-semper { font-family: var(--serif); font-size: 1.02rem; font-weight: 600; color: var(--text); letter-spacing: 0.01em; }
.logo-dot { display:none; }
.topbar-right { display: flex; align-items: center; gap: 8px; }
.user-chip { display: flex; align-items: center; gap: 6px; }
.user-voice { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 20px; letter-spacing: 0.02em; }
.user-name-sm { font-size: 0.8rem; color: var(--muted); font-family: var(--sans); }
.btn-logout { background: none; border: 1px solid var(--border2); color: var(--muted); padding: 4px 12px; border-radius: 7px; font-size: 0.74rem; font-weight: 500; cursor: pointer; font-family: var(--sans); transition: all 0.15s; }
.btn-logout:hover { background: var(--s2); color: var(--text); }

/* ── Bottom Nav ── */
.bottomnav {
  position: sticky; bottom: 0; z-index: 200;
  background: rgba(10,10,11,0.97);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(232,23,58,0.14);
  display: flex;
  box-shadow: 0 -1px 0 rgba(232,23,58,0.06), 0 -8px 24px rgba(0,0,0,0.4);
}
.navbtn {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 9px 4px 11px;
  background: none; border: none; cursor: pointer;
  font-family: var(--sans); font-size: 0.58rem; font-weight: 500;
  color: var(--faint); letter-spacing: 0.03em; text-transform: uppercase;
  transition: color 0.2s;
  position: relative;
}
.navbtn::after {
  content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 0; height: 2px; background: var(--accent); border-radius: 0 0 2px 2px;
  transition: width 0.2s;
}
.navbtn.on { color: var(--accent); }
.navbtn.on::after { width: 24px; }
.navbtn:hover { color: var(--muted); }
.navicon { display:flex; align-items:center; justify-content:center; width:22px; height:22px; }
.badge { display: inline-flex; align-items: center; justify-content: center; background: var(--accent); color: white; font-size: 0.58rem; font-weight: 700; min-width: 14px; height: 14px; border-radius: 7px; padding: 0 3px; margin-left: 2px; vertical-align: middle; }

/* ── Page ── */
.page { flex: 1; padding: 14px 14px 16px; max-width: 780px; margin: 0 auto; width: 100%; }

/* ── Login ── */
.login-wrap {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: var(--bg);
  background-image:
    radial-gradient(ellipse 60% 50% at 50% -10%, rgba(232,23,58,0.18) 0%, transparent 70%),
    radial-gradient(ellipse 40% 30% at 80% 80%, rgba(201,168,76,0.06) 0%, transparent 60%);
}
.login-card {
  width: 340px; background: rgba(20,20,22,0.95); border-radius: 20px;
  padding: 44px 32px 36px; box-shadow: var(--shadow-lg);
  border: 1px solid var(--border2);
  backdrop-filter: blur(12px);
}
.login-logo { text-align: center; margin-bottom: 6px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.login-building { opacity: 0.9; }
.login-logo .sempre { font-family: var(--serif); font-size: 0.72rem; font-weight: 400; color: var(--muted); display: block; letter-spacing: 0.2em; text-transform: uppercase; }
.login-logo .semper { font-family: var(--serif); font-size: 1.8rem; font-weight: 600; color: var(--text); display: block; letter-spacing: -0.01em; line-height: 1; }
.login-subtitle { text-align: center; font-size: 0.72rem; color: var(--faint); margin-bottom: 28px; margin-top: 6px; letter-spacing: 0.04em; }
.google-btn {
  width: 100%; padding: 12px 16px; display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--s2); border: 1px solid var(--border2); border-radius: 10px; color: var(--text2);
  font-family: var(--sans); font-size: 0.88rem; font-weight: 500; cursor: pointer; transition: all 0.2s;
}
.google-btn:hover { background: var(--s3); border-color: var(--border2); }

.sh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sh h2 { font-family: var(--serif); font-size: 1.05rem; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
.sh-sub { font-size: 0.74rem; color: var(--muted); margin-top: 1px; }

/* ── Calendar ── */
.month-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.month-title { font-size: 1.1rem; font-weight: 600; color: var(--text); letter-spacing: -0.02em; }
.month-nav { display: flex; gap: 4px; align-items: center; }
.month-nav button { background: var(--s1); border: 1px solid var(--border); color: var(--text2); padding: 5px 11px; border-radius: 8px; cursor: pointer; font-size: 0.88rem; font-family: 'Inter', sans-serif; font-weight: 500; transition: all 0.15s; box-shadow: var(--shadow); }
.month-nav button:hover { background: var(--s2); }

.calgrid { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; }
.dow { text-align: center; padding: 5px 2px 6px; font-size: 0.66rem; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: 0.04em; }
.cell { background: var(--s1); min-height: 52px; padding: 4px; cursor: pointer; border-radius: 7px; transition: background 0.1s; border: 1px solid transparent; position: relative; }
.cell:hover { background: var(--s2); }
.cell.other { opacity: 0.3; pointer-events: none; background: transparent; }
.cell.today { border-color: var(--accent); background: rgba(232,23,58,0.06); }
.cell.today .dn { color: var(--accent); font-weight: 700; }
.cell.sel { background: rgba(232,23,58,0.12); border-color: var(--accent); }
.dn { font-size: 0.7rem; font-weight: 500; color: var(--muted); margin-bottom: 2px; }
.pip { width: 100%; padding: 1px 4px; font-size: 0.58rem; font-weight: 500; margin-bottom: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; border-radius: 3px; }
.pip.dimmed { opacity: 0.3; }
.vs-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--red); display: inline-block; margin-right: 3px; flex-shrink: 0; }
/* 비정상 연주 시간 경고 — 다크: 노랑, 라이트: 빨강 */
/* 비정상 연주시간 경고 — 텍스트 색 유지, 배경+테두리로만 강조 */
.unusual-time { background: rgba(255,214,10,0.15); border: 1px solid rgba(255,214,10,0.5); border-radius: 5px; padding: 1px 6px; }
.unusual-time-badge { font-size: 0.58rem; font-weight: 800; color: var(--text); background: rgba(255,214,10,0.18); border: 1px solid rgba(255,214,10,0.45); border-radius: 3px; padding: 0px 3px; line-height: 14px; display: inline-block; }
[data-theme="light"] .unusual-time { background: rgba(192,57,43,0.10); border: 1px solid rgba(192,57,43,0.45); }
[data-theme="light"] .unusual-time-badge { color: var(--text); background: rgba(192,57,43,0.10); border: 1px solid rgba(192,57,43,0.4); }

/* ── Day detail ── */
.dd-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 10px; margin-bottom: 10px; }
.dd-title { font-size: 0.95rem; font-weight: 600; color: var(--text); }

/* ── Event card ── */
.ecard {
  background: var(--s1);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px; margin-bottom: 8px; position: relative;
  box-shadow: var(--shadow);
  transition: box-shadow 0.2s, opacity 0.15s, transform 0.15s;
  border-left: 3px solid var(--border2);
}
.ecard:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.ecard.dimmed { opacity: 0.35; }
[data-theme="light"] .ecard.dimmed { opacity: 0.7; }
[data-theme="light"] .ecard .ecard-title { color: var(--text) !important; }
[data-theme="light"] .ecard .ecard-prod,
[data-theme="light"] .ecard .ecard-meta,
[data-theme="light"] .ecard .ecard-target { color: var(--text2) !important; }
.ecard.changed { border-color: rgba(255,159,10,0.5) !important; background: rgba(255,159,10,0.08) !important; }
.ecard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.ecard-left { flex: 1; min-width: 0; }
.ecard-title { font-size: 0.9rem; font-weight: 600; color: var(--text); line-height: 1.35; }
.ecard-prod { font-size: 0.76rem; color: var(--muted); margin-top: 1px; }
.ecard-right { text-align: right; flex-shrink: 0; }
.ecard-time { font-size: 0.82rem; font-weight: 600; color: var(--text2); white-space: nowrap; }
.type-badge { display: inline-block; padding: 2px 7px; font-size: 0.65rem; font-weight: 600; border-radius: 5px; margin-top: 4px; }
.ecard-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.74rem; color: var(--muted); align-items: center; }
.ecard-target { margin-top: 5px; font-size: 0.74rem; color: var(--muted); }
.ecard-note { margin-top: 8px; padding: 6px 10px; border-radius: 6px; font-size: 0.76rem; color: #FF9F0A; background: var(--orange-bg); border: 1px solid rgba(255,159,10,0.25); }
.req-pill { font-size: 0.68rem; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
.req-yes { background: var(--green-bg);  color: #32D74B; border: 1px solid rgba(50,215,75,0.3); }
.req-no  { background: var(--s2);        color: var(--faint); border: 1px solid var(--border); }
.req-unk { background: var(--orange-bg); color: #FF9F0A; border: 1px solid rgba(255,159,10,0.3); }
.changed-dot { position: absolute; top: 7px; left: 7px; width: 8px; height: 8px; border-radius: 50%; background: var(--orange); box-shadow: 0 0 0 2px rgba(232,146,10,0.25); }
.chorfrei-card { background: var(--s2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; text-align: center; font-size: 0.78rem; color: var(--faint); font-weight: 500; }

/* ── Vorstellung banner ── */
.vs-banner {
  background: var(--red-bg);
  border: 1px solid var(--red-border);
  border-left: 3px solid var(--accent);
  border-radius: 12px;
  padding: 14px 16px; margin-bottom: 12px;
}
.vs-banner .priority-label { font-size: 0.68rem; font-weight: 700; color: var(--red); letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 5px; display: flex; align-items: center; gap: 5px; }
.vs-banner .vs-title { font-size: 1rem; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.vs-banner .vs-meta { font-size: 0.78rem; color: var(--muted); }

/* ── Filter bar ── */
.fbar { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 12px; }
.fc { padding: 5px 13px; background: var(--s1); border: 1px solid var(--border); border-radius: 20px; color: var(--muted); font-family: 'Inter', sans-serif; font-size: 0.76rem; font-weight: 500; cursor: pointer; transition: all 0.15s; box-shadow: var(--shadow); }
.fc.on { background: var(--accent); border-color: var(--accent); color: white; box-shadow: 0 2px 8px rgba(232,23,58,0.3); }
.fc:hover:not(.on) { border-color: var(--border2); color: var(--text); }

/* ── Week group ── */
.wk-group { margin-bottom: 18px; }
.wk-label { font-size: 0.68rem; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: 0.05em; padding: 5px 0; border-bottom: 1px solid var(--border); margin-bottom: 8px; }

/* ── Vorstellung only view ── */
.vs-month-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 16px; }
.vs-month-tab { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border); background: var(--s1);
  color: var(--text2); font-size: 0.76rem; font-family: var(--sans); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.vs-month-tab:hover { border-color: var(--accent); color: var(--text); }
.vs-month-tab.active { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.vs-month-tab .tab-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; margin-right: 5px; opacity: 0.8; }
.vs-cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; }
.vs-cal-dow { font-size: 0.6rem; font-weight: 700; color: var(--muted); text-align: center; padding: 4px 0 6px; text-transform: uppercase; letter-spacing: 0.06em; }
.vs-cal-cell { min-height: 52px; padding: 4px 5px; border-radius: 7px; background: var(--s1); border: 1px solid var(--border); }
.vs-cal-cell.empty { background: transparent; border-color: transparent; }
.vs-cal-cell.today { border-color: var(--accent) !important; }
.vs-cal-cell.today .vs-cal-dn { color: var(--accent); font-weight: 700; }
.vs-cal-cell.has-ev { background: rgba(232,23,58,0.07); border-color: rgba(232,23,58,0.3); cursor: pointer; }
.vs-cal-cell.has-ev:hover { background: rgba(232,23,58,0.13); }
.vs-cal-cell.has-gp { background: rgba(255,159,10,0.08); border-color: rgba(255,159,10,0.35); cursor: pointer; }
.vs-cal-cell.has-gp:hover { background: rgba(255,159,10,0.15); }
.vs-cal-cell.sel { outline: 2px solid var(--accent); outline-offset: 1px; }
.vs-cal-dn { font-size: 0.68rem; font-weight: 500; color: var(--muted); margin-bottom: 2px; }
.vs-cal-cell.has-ev .vs-cal-dn, .vs-cal-cell.has-gp .vs-cal-dn { color: var(--text); font-weight: 700; }
.vs-cal-prods { display: flex; flex-direction: column; gap: 1px; }
.vs-cal-prod { font-size: 0.58rem; font-weight: 600; line-height: 1.25; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--red); }
.vs-cal-prod.gp { color: var(--orange); }
.vs-cal-time { font-size: 0.56rem; color: var(--muted); }
.vs-detail { margin-top: 14px; background: var(--s1); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.vs-detail-hdr { padding: 10px 14px; background: var(--s2); font-weight: 700; font-size: 0.84rem; color: var(--text); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.vs-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.vs-row:last-child { border-bottom: none; }
.vs-row-date { font-size: 0.8rem; color: var(--muted); white-space: nowrap; min-width: 52px; font-weight: 500; }
.vs-row-title { flex: 1; font-size: 0.88rem; font-weight: 600; color: var(--text); }
.vs-row-time { font-size: 0.8rem; font-weight: 600; color: var(--text2); white-space: nowrap; }

/* ── PDF Upload ── */
.pdf-drop {
  border: 2px dashed var(--border2); padding: 28px; text-align: center; cursor: pointer;
  border-radius: 12px; transition: all 0.2s; margin-bottom: 16px; background: var(--s1);
}
.pdf-drop:hover, .pdf-drop.drag { border-color: var(--accent); background: var(--blue-bg); }
.pdf-icon { font-size: 2.2rem; opacity: 0.5; margin-bottom: 8px; }
.pdf-drop h3 { font-size: 0.95rem; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.pdf-drop p { font-size: 0.78rem; color: var(--muted); }
.parsing { background: var(--blue-bg); border: 1px solid #C0D8F0; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 14px; }
.parsing p { font-size: 0.84rem; color: var(--accent); font-weight: 500; }
@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
.pulse { animation: pulse 1.8s ease-in-out infinite; }
.parse-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--s1); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; box-shadow: var(--shadow); }
.parse-item input[type=checkbox] { margin-top: 2px; accent-color: var(--accent); width: 16px; height: 16px; flex-shrink: 0; }
.parse-item-body { flex: 1; min-width: 0; }
.parse-item-title { font-size: 0.86rem; font-weight: 500; color: var(--text); }
.parse-item-meta { font-size: 0.74rem; color: var(--muted); margin-top: 2px; }
.parse-actions { display: flex; gap: 8px; margin-top: 14px; }

/* ── Source tags ── */
.source-tag { font-size: 0.64rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
.src-dienstplan { background: rgba(50,215,75,0.15); color: #32D74B; }
.src-monatsplan { background: rgba(59,158,255,0.15); color: #3B9EFF; }
.src-vorplanung { background: rgba(255,159,10,0.15); color: #FF9F0A; }
.src-tagesplan  { background: rgba(255,69,58,0.15);  color: #FF453A; }

/* ── Admin ── */
.atabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 16px; gap: 0; }
.atab { padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--muted); font-family: 'Inter', sans-serif; font-size: 0.82rem; font-weight: 500; cursor: pointer; transition: all 0.15s; margin-bottom: -1px; }
.atab.on { color: var(--accent); border-bottom-color: var(--accent); }
.atab:hover { color: var(--text); }

/* ── Table ── */
.twrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border); }
table { width: 100%; border-collapse: collapse; font-size: 0.8rem; background: var(--s1); }
th { background: var(--s2); color: var(--muted); font-weight: 600; padding: 8px 10px; text-align: left; font-family: 'Inter', sans-serif; border-bottom: 1px solid var(--border); white-space: nowrap; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; }
td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--s2); }

/* ── Modal ── */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); }
.modal { background: var(--s1); border-radius: 16px; border: 1px solid var(--border); width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.modal h3 { font-size: 1rem; font-weight: 600; color: var(--text); margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.mfooter { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }

/* ── Form ── */
.fg { margin-bottom: 12px; }
.fg label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--muted); margin-bottom: 5px; }
.fg input, .fg select, .fg textarea { width: 100%; background: var(--s2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); padding: 8px 11px; font-family: var(--sans); font-size: 0.88rem; outline: none; transition: border-color 0.15s; }
.fg input:focus, .fg select:focus, .fg textarea:focus { border-color: var(--accent); background: var(--s1); box-shadow: 0 0 0 3px rgba(232,23,58,0.12); }
.fg select option { background: var(--s1); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* ── Buttons ── */
.btn { padding: 8px 16px; border: none; border-radius: 9px; cursor: pointer; font-family: var(--sans); font-size: 0.84rem; font-weight: 500; transition: all 0.15s; }
.btn-gold { background: var(--accent); color: white; box-shadow: 0 2px 10px rgba(232,23,58,0.35); }
.btn-gold:hover { background: #c4102e; box-shadow: 0 4px 16px rgba(232,23,58,0.45); }
.btn-ghost { background: var(--s2); border: 1px solid var(--border); color: var(--text2); }
.btn-ghost:hover { background: var(--s3); }
.btn-danger { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); }
.btn-danger:hover { background: #FFE0DE; }
.btn-sm { padding: 5px 11px; font-size: 0.76rem; }

/* ── Toast ── */
.toasts { position: fixed; bottom: 72px; right: 14px; z-index: 500; display: flex; flex-direction: column; gap: 6px; }
.toast { background: var(--text); color: white; padding: 10px 16px; border-radius: 10px; font-size: 0.84rem; font-weight: 500; box-shadow: 0 4px 16px rgba(0,0,0,0.2); animation: tin 0.25s ease; }
@keyframes tin { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* ── Empty ── */
.empty { text-align: center; padding: 40px 20px; color: var(--faint); font-size: 0.88rem; }

/* ── Notification card ── */
.nc { background: var(--s1); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; box-shadow: var(--shadow); }
.nc.unread { border-left: 3px solid var(--accent); }
.nc-head { display: flex; justify-content: space-between; align-items: flex-start; }
.nc-title { font-size: 0.88rem; font-weight: 600; color: var(--text); }
.nc-ts { font-size: 0.7rem; color: var(--faint); }
.nc-body { font-size: 0.8rem; color: var(--muted); margin-top: 3px; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }


/* ── Settings page ── */
.settings-section { margin-bottom: 28px; }
.settings-title { font-family: var(--serif); font-size: 0.72rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.settings-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--s1); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 6px; }
.settings-row-label { font-size: 0.88rem; color: var(--text2); font-weight: 500; }
.settings-row-sub { font-size: 0.72rem; color: var(--faint); margin-top: 2px; }
.settings-select { background: var(--s2); border: 1px solid var(--border2); border-radius: 8px; color: var(--text2); padding: 6px 10px; font-family: var(--sans); font-size: 0.82rem; cursor: pointer; outline: none; }
.settings-select:focus { border-color: var(--accent); }

/* ── Profile hero ── */
.profile-hero {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 16px; margin-bottom: 20px;
  background: linear-gradient(135deg, rgba(232,23,58,0.08) 0%, rgba(201,168,76,0.05) 100%);
  border: 1px solid rgba(232,23,58,0.2); border-radius: 14px;
}
.profile-avatar {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, rgba(201,168,76,0.8) 100%);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--serif); font-size: 1.3rem; font-weight: 700; color: white;
  flex-shrink: 0; box-shadow: 0 4px 12px rgba(232,23,58,0.3);
}
.profile-name { font-family: var(--serif); font-size: 1.05rem; font-weight: 600; color: var(--text); }
.profile-part { font-size: 0.74rem; color: var(--muted); margin-top: 3px; }

/* ── View mode switcher ── */
.view-seg { display:flex; background:var(--s2); border-radius:10px; padding:3px; gap:2px; }
.view-seg-btn { padding:5px 13px; border:none; border-radius:8px; cursor:pointer; font-family:'Inter',sans-serif; font-size:0.76rem; font-weight:600; transition:all 0.15s; }
.view-seg-btn.on  { background:var(--s1); color:var(--text);  box-shadow:var(--shadow); }
.view-seg-btn.off { background:transparent; color:var(--muted); }

/* ── Season view row ── */
.saison-row { display:flex; align-items:center; gap:10px; padding:10px 14px; margin-bottom:5px; background:var(--s1); border:1px solid var(--border); border-radius:10px; cursor:pointer; transition:all 0.15s; }
.saison-row:hover { background:var(--s2); }

/* ── Week day header ── */
.week-day-head { display:flex; align-items:baseline; gap:8px; padding-bottom:6px; margin-bottom:8px; cursor:pointer; }
`;

// ═══════════════════════════════════════════════════════════════════════
//  TOAST HOOK
// ═══════════════════════════════════════════════════════════════════════
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  return { toasts, add };
}

// ═══════════════════════════════════════════════════════════════════════
//  APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("calendar");
  const { toasts, add: toast } = useToast();

  const {
    user: authUser, profile,
    loading: authLoading,
    loginWithGoogle,
    saveProfile,
    logout: fbLogout,
    scheds, saveScheds, deleteEvent,
    pinnwand, savePinnwand, deletePost: fbDeletePost,
    settings, saveSettings,
  } = useFirebase();

  const user = profile;
  const [notifs, setNotifs] = useState([]);
  const saveNotifs = (d) => setNotifs(d);

  const savePost = (p) => { const next = [p, ...pinnwand.filter(x => x.id !== p.id)]; savePinnwand(next); };
  const deletePost = fbDeletePost;
  const updatePost = (id, changes) => { savePinnwand(pinnwand.map(p => p.id === id ? { ...p, ...changes } : p)); };
  const saveAllScheds = (events) => { saveScheds(events); };
  const logout = () => { fbLogout(); setTab("calendar"); };

  // 테마 적용 — 조건부 return 앞에 있어야 React 훅 규칙 준수
  const currentTheme = settings?.theme || "dark";
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", currentTheme);
  }, [currentTheme]);

  if (authLoading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      minHeight:"100vh", background:"#0A0A0B", gap:16 }}>
      <svg viewBox="0 0 56 40" fill="none" width="52" height="37">
        <path d="M2 38 L2 22 L8 22 L8 18 L14 18 L14 14 L20 14 L20 10 L28 8 L36 10 L36 14 L42 14 L42 18 L48 18 L48 22 L54 22 L54 38 Z" fill="#E8173A" opacity="0.8"/>
      </svg>
      <div style={{ color:"#4A4845", fontFamily:"var(--sans)", fontSize:"0.82rem" }}>Lade Spielplan…</div>
    </div>
  );

  if (!authUser) return (
    <>
      <style>{CSS}</style>
      <LoginScreen onLogin={loginWithGoogle} />
    </>
  );

  if (!profile) return (
    <>
      <style>{CSS}</style>
      <RegistrationScreen
        googleUser={authUser}
        onSave={async (name, part) => {
          const voice = PART_VOICE[part];
          await saveProfile(authUser.uid, {
            name, part, voice,
            role: "member",
            email: authUser.email,
            createdAt: Date.now(),
          });
        }}
        onLogout={logout}
      />
    </>
  );

  const isAdmin = user.role === "admin";
  const changedCount = scheds.filter(e => e._edited && Date.now() - e.updatedAt < 48 * 3600000).length;



  const unreadPinn = pinnwand.filter(p => !p.readBy?.includes(user.id)).length;
  // ── SVG Nav Icons ──────────────────────────────────────────────────
  const NavIcons = {
    calendar: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8173A" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Calendar grid with musical note detail */}
        <rect x="3" y="4" width="18" height="17" rx="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="7" y1="14" x2="10" y2="14"/>
        <line x1="7" y1="17" x2="13" y2="17"/>
      </svg>
    ),
    vorst: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8173A" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Stage curtains / theater arch */}
        <path d="M3 20 L3 6 Q3 4 5 4 L5 16 Q7 18 12 18 Q17 18 19 16 L19 4 Q21 4 21 6 L21 20 Z"/>
        <path d="M5 4 Q5 10 8 13"/>
        <path d="M19 4 Q19 10 16 13"/>
        <path d="M8 13 Q12 16 16 13"/>
      </svg>
    ),
    pinnwand: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8173A" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Notice board with pin */}
        <rect x="3" y="5" width="18" height="13" rx="1.5"/>
        <line x1="7" y1="9" x2="13" y2="9"/>
        <line x1="7" y1="12" x2="17" y2="12"/>
        <line x1="7" y1="15" x2="11" y2="15"/>
        <circle cx="17" cy="9" r="1.5" fill={active ? "#E8173A" : "currentColor"} stroke="none"/>
        <line x1="12" y1="2" x2="12" y2="5"/>
      </svg>
    ),
    einstellungen: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8173A" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Elegant settings — person silhouette */}
        <circle cx="12" cy="7" r="3.5"/>
        <path d="M4 20 Q4 14 12 14 Q20 14 20 20"/>
      </svg>
    ),
    admin: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#E8173A" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    ),
  };

  const navItems = [
    { id:"calendar",      iconKey:"calendar",      label:"Spielplan" },
    { id:"vorst",         iconKey:"vorst",          label:"Vorstellungen" },
    { id:"pinnwand",      iconKey:"pinnwand",       label:"Pinnwand", badge: unreadPinn },
    { id:"einstellungen", iconKey:"einstellungen",  label:"Einstellungen" },
    ...(isAdmin ? [{ id:"admin-panel", iconKey:"admin", label:"Admin" }] : []),
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">
        <header className="topbar">
          <div className="logo">
            {/* Semperoper building silhouette — simplified from official logo */}
            <svg className="logo-semper-icon" viewBox="0 0 56 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 38 L2 22 L8 22 L8 18 L14 18 L14 14 L20 14 L20 10 L28 8 L36 10 L36 14 L42 14 L42 18 L48 18 L48 22 L54 22 L54 38 Z" fill="#E8173A"/>
              <rect x="10" y="22" width="6" height="8" fill="rgba(0,0,0,0.25)"/>
              <rect x="25" y="22" width="6" height="8" fill="rgba(0,0,0,0.25)"/>
              <rect x="40" y="22" width="6" height="8" fill="rgba(0,0,0,0.25)"/>
              <rect x="23" y="30" width="10" height="8" fill="rgba(0,0,0,0.2)"/>
            </svg>
            <div className="logo-text-wrap">
              <span className="logo-sempre">Sempre</span>
              <span className="logo-semper">Semper</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="user-chip">
              <span className="user-voice" style={{ background: VOICE_COLOR[user.voice] + "22", color: VOICE_COLOR[user.voice], border: `1px solid ${VOICE_COLOR[user.voice]}55` }}>{user.voice}</span>
              <span className="user-name-sm">{user.name.split(" · ")[0]}</span>
            </div>
            {changedCount > 0 && (
              <div title={`${changedCount} geänderte Termine`} style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(255,159,10,0.15)", border:"1px solid rgba(255,159,10,0.35)", borderRadius:8, padding:"3px 9px", fontSize:"0.72rem", color:"var(--orange)", fontWeight:600 }}>
                ★ {changedCount} Änderung{changedCount > 1 ? "en" : ""}
              </div>
            )}
            <button className="btn-logout" onClick={logout}>Abmelden</button>
          </div>
        </header>

        <main style={{ flex: 1 }}>
          {tab === "calendar"  && <CalView scheds={scheds} user={user} defaultView={settings.defaultView} settings={settings} />}
          {tab === "vorst"    && <VorstellungView scheds={scheds} user={user} />}
          {tab === "pinnwand" && <PinnwandView pinnwand={pinnwand} savePost={savePost} deletePost={deletePost} updatePost={updatePost} user={user} toast={toast} />}
          {tab === "einstellungen" && <EinstellungenView user={user} settings={settings} saveSettings={saveSettings} onLogout={logout} scheds={scheds} />}
          {tab === "admin-panel" && isAdmin && <AdminView scheds={scheds} setScheds={saveScheds} deleteEvent={deleteEvent} notifs={notifs} setNotifs={saveNotifs} toast={toast} settings={settings} saveSettings={saveSettings} />}
        </main>

        <nav className="bottomnav">
          {navItems.map(n => (
            <button key={n.id} className={`navbtn ${tab === n.id ? "on" : ""}`} onClick={() => setTab(n.id)}>
              <span className="navicon">{NavIcons[n.iconKey]?.(tab === n.id)}</span>
              <span>{n.label}{n.badge > 0 && <span className="badge">{n.badge}</span>}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="toasts">{toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}</div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  LOGIN — with part selection
// ═══════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [step, setStep]     = useState("main");   // main | register
  const [name, setName]     = useState("");
  const [part, setPart]     = useState("");
  const [err,  setErr]      = useState("");

  const handleRegister = () => {
    if (!name.trim()) { setErr("Bitte Namen eingeben."); return; }
    if (!part)        { setErr("Bitte Stimmgruppe auswählen."); return; }
    const voice = PART_VOICE[part];
    const id = "u_" + Date.now();
    onLogin({ id, name: name.trim(), role: "member", voice, part });
  };

  const PART_GROUPS = [
    { label:"Sopran",  parts:["Sop. 1.", "Sop. 2."] },
    { label:"Alt",     parts:["Alt. 1.", "Alt. 2."] },
    { label:"Tenor",   parts:["Ten. 1.", "Ten. 2."] },
    { label:"Bass",    parts:["Bass 1.", "Bass 2."] },
  ];

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <svg className="login-building" viewBox="0 0 120 70" fill="none" xmlns="http://www.w3.org/2000/svg" width="90" height="52">
            <path d="M4 66 L4 38 L16 38 L16 30 L28 30 L28 22 L40 22 L40 14 L60 10 L80 14 L80 22 L92 22 L92 30 L104 30 L104 38 L116 38 L116 66 Z" fill="#E8173A"/>
            <path d="M4 38 L16 38 L16 30 L28 30 L28 22 L40 22 L40 14 L60 10" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" fill="none"/>
            <rect x="20" y="42" width="12" height="14" rx="1" fill="rgba(0,0,0,0.22)"/>
            <rect x="54" y="42" width="12" height="14" rx="1" fill="rgba(0,0,0,0.22)"/>
            <rect x="88" y="42" width="12" height="14" rx="1" fill="rgba(0,0,0,0.22)"/>
            <rect x="50" y="52" width="20" height="14" rx="1" fill="rgba(0,0,0,0.18)"/>
          </svg>
          <div>
            <span className="sempre">Sempre</span>
            <span className="semper">Semper</span>
          </div>
        </div>
        <div className="login-subtitle">Sächsische Staatsoper · Opernchor</div>

        {step === "main" && <>
          <button className="google-btn" onClick={onLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Mit Google anmelden
          </button>

          <button className="google-btn" style={{ background:"var(--accent)", color:"#fff", border:"none", marginTop:8 }}
            onClick={() => setStep("register")}>
            ✦ Neu registrieren
          </button>


        </>}

        {step === "register" && <>
          <div style={{ fontSize:"0.8rem", color:"var(--muted)", marginBottom:16, marginTop:4 }}>
            Erstelle deinen persönlichen Zugang
          </div>

          <div className="fg">
            <label>Name</label>
            <input placeholder="Vor- und Nachname" value={name}
              onChange={e => { setName(e.target.value); setErr(""); }} />
          </div>

          <div className="fg">
            <label>Stimmgruppe</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:4 }}>
              {PART_GROUPS.map(grp => (
                <div key={grp.label}>
                  <div style={{ fontSize:"0.68rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase",
                    letterSpacing:"0.06em", marginBottom:4 }}>{grp.label}</div>
                  {grp.parts.map(p => (
                    <button key={p} onClick={() => { setPart(p); setErr(""); }}
                      style={{ width:"100%", marginBottom:4, padding:"7px 10px", border:"1px solid",
                        borderColor: part===p ? "var(--accent)" : "var(--border)",
                        borderRadius:8, cursor:"pointer", fontFamily:"Inter,sans-serif",
                        fontSize:"0.82rem", fontWeight: part===p ? 700 : 400,
                        background: part===p ? "rgba(59,158,255,0.15)" : "var(--s2)",
                        color: part===p ? "var(--accent)" : "var(--text2)",
                        transition:"all 0.15s", textAlign:"left" }}>
                      {part===p ? "✓ " : ""}{p}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {err && <div style={{ fontSize:"0.78rem", color:"var(--red)", marginBottom:8, textAlign:"center" }}>{err}</div>}

          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => { setStep("main"); setErr(""); }}>
              Zurück
            </button>
            <button className="btn btn-gold" style={{ flex:2 }} onClick={handleRegister}>
              Anmelden
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════
//  REGISTRATION SCREEN — shown after first Google login
// ═══════════════════════════════════════════════════════════════════════
function RegistrationScreen({ googleUser, onSave, onLogout }) {
  const [name, setName] = useState(googleUser.displayName || "");
  const [part, setPart] = useState("");
  const [err,  setErr]  = useState("");
  const [saving, setSaving] = useState(false);

  const PART_GROUPS = [
    { label:"Sopran", parts:["Sop. 1.", "Sop. 2."] },
    { label:"Alt",    parts:["Alt. 1.", "Alt. 2."] },
    { label:"Tenor",  parts:["Ten. 1.", "Ten. 2."] },
    { label:"Bass",   parts:["Bass 1.", "Bass 2."] },
  ];

  const handleSave = async () => {
    if (!name.trim()) { setErr("Bitte Namen eingeben."); return; }
    if (!part)        { setErr("Bitte Stimmgruppe auswählen."); return; }
    setSaving(true);
    try { await onSave(name.trim(), part); }
    catch(e) { console.error("Save error:", e); setErr("Fehler: " + e.message); setSaving(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <svg className="login-building" viewBox="0 0 120 70" fill="none" width="70" height="41">
            <path d="M4 66 L4 38 L16 38 L16 30 L28 30 L28 22 L40 22 L40 14 L60 10 L80 14 L80 22 L92 22 L92 30 L104 30 L104 38 L116 38 L116 66 Z" fill="#E8173A"/>
            <rect x="20" y="42" width="12" height="14" rx="1" fill="rgba(0,0,0,0.22)"/>
            <rect x="54" y="42" width="12" height="14" rx="1" fill="rgba(0,0,0,0.22)"/>
            <rect x="88" y="42" width="12" height="14" rx="1" fill="rgba(0,0,0,0.22)"/>
            <rect x="50" y="52" width="20" height="14" rx="1" fill="rgba(0,0,0,0.18)"/>
          </svg>
          <div>
            <span className="sempre">Willkommen</span>
            <span className="semper">Profil anlegen</span>
          </div>
        </div>
        <div className="login-subtitle">Angemeldet als {googleUser.email}</div>

        <div className="fg">
          <label>Name</label>
          <input value={name} onChange={e => { setName(e.target.value); setErr(""); }}
            placeholder="Vor- und Nachname" />
        </div>

        <div className="fg">
          <label>Stimmgruppe</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:4 }}>
            {PART_GROUPS.map(grp => (
              <div key={grp.label}>
                <div style={{ fontSize:"0.68rem", fontWeight:700, color:"var(--muted)",
                  textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>{grp.label}</div>
                {grp.parts.map(p => (
                  <button key={p} onClick={() => { setPart(p); setErr(""); }}
                    style={{ width:"100%", marginBottom:4, padding:"7px 10px", border:"1px solid",
                      borderColor: part===p ? "var(--accent)" : "var(--border)",
                      borderRadius:8, cursor:"pointer", fontFamily:"var(--sans)",
                      fontSize:"0.82rem", fontWeight: part===p ? 700 : 400,
                      background: part===p ? "var(--accent-dim)" : "var(--s2)",
                      color: part===p ? "var(--accent)" : "var(--text2)",
                      transition:"all 0.15s", textAlign:"left" }}>
                    {part===p ? "✓ " : ""}{p}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {err && <div style={{ fontSize:"0.78rem", color:"var(--accent)", marginBottom:8, textAlign:"center" }}>{err}</div>}

        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onLogout}>Abbrechen</button>
          <button className="btn btn-gold" style={{ flex:2 }} onClick={handleSave} disabled={saving}>
            {saving ? "Wird gespeichert…" : "Weiter →"}
          </button>
        </div>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════
//  EVENT CARD
// ═══════════════════════════════════════════════════════════════════════
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
          {e.sourceType === "monatsplan" ? "Monatsplan" : e.sourceType === "vorplanung" ? "Vorplanung" : e.sourceType === "tagesplan" ? "Tagesplan" : "Dienstplan"}
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
    const dayEvs = scheds.filter(e => e.date === d);
    const knownProds = [...new Set(scheds.map(e => e.production).filter(Boolean))];
    const sortedKnown = [...knownProds].sort((a,b) => b.length - a.length);
    // 중복 제거: production 정규화 후 같은 시간+작품은 더 상세한 소스 우선
    const deduped = Object.values(
      dayEvs.reduce((acc, e) => {
        const normProd = e.production ? normalizeProduction(e.production, sortedKnown) : e.title;
        const key = `${e.startTime}_${normProd}`;
        const existing = acc[key];
        if (!existing || (SOURCE_PRIORITY[e.sourceType] ?? 9) < (SOURCE_PRIORITY[existing.sourceType] ?? 9)) {
          // production 필드도 정규화된 이름으로 교체
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
function DayView({ selDate, evsByDate, myFilter, user, isChanged }) {
  const evs = myFilter(evsByDate(selDate));
  return (
    <div>
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

  return (
    <div>
      {days.map(ds => {
        const evs = myFilter(evsByDate(ds));
        const dd = new Date(ds + "T12:00:00");
        const isT = ds === todayStr;
        return (
          <div key={ds} style={{ marginBottom:16 }}>
            <div onClick={() => setSelDate(ds)} style={{ display:"flex", alignItems:"baseline", gap:8, paddingBottom:6,
              borderBottom:`2px solid ${isT ? "var(--accent)" : "var(--border)"}`, marginBottom:8, cursor:"pointer" }}>
              <span style={{ fontSize:"0.72rem", fontWeight:600, color: isT ? "var(--accent)" : "var(--muted)", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                {WEEKDAYS_FULL[dd.getDay()].slice(0,2)}
              </span>
              <span style={{ fontSize:"1.1rem", fontWeight:700, color: isT ? "var(--accent)" : "var(--text)", letterSpacing:"-0.02em" }}>
                {dd.getDate()}
              </span>
              <span style={{ fontSize:"0.78rem", color:"var(--muted)" }}>{MONTHS_DE[dd.getMonth()].slice(0,3)}</span>
              {evs.some(isChanged) && <span style={{ marginLeft:"auto", fontSize:"0.78rem", color:"var(--orange)" }}>★</span>}
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
function VorstellungView({ scheds, user }) {
  const [selMonth, setSelMonth] = useState(null); // "YYYY-MM"
  const [selDate, setSelDate]   = useState(null); // "YYYY-MM-DD"

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

  // 달별 그룹
  const months = {};
  vorstellungen.forEach(e => {
    const k = e.date.slice(0,7);
    if (!months[k]) months[k] = [];
    months[k].push(e);
  });
  const allMonthKeys = Object.keys(months).sort();

  // 초기 selMonth = 현재 달 또는 첫 달
  const curMk = todayStr.slice(0,7);
  const activeMk = selMonth || (allMonthKeys.includes(curMk) ? curMk : allMonthKeys[0]);

  // 다음 공연
  const next = vorstellungen.find(e => e.date >= todayStr);
  const daysUntil = next ? Math.ceil((new Date(next.date+"T12:00:00") - today) / 86400000) : null;

  // 선택된 달 달력 데이터
  const calEvs = activeMk ? (months[activeMk] || []) : [];
  const [cy, cm] = activeMk ? activeMk.split("-").map(Number) : [0,0];
  const daysInMonth = activeMk ? new Date(cy, cm, 0).getDate() : 0;
  const firstDow = activeMk ? (new Date(cy, cm-1, 1).getDay()+6)%7 : 0;
  const evsByDay = {};
  calEvs.forEach(e => {
    const d = parseInt(e.date.slice(8));
    if (!evsByDay[d]) evsByDay[d] = [];
    evsByDay[d].push(e);
  });

  // 선택된 날짜의 이벤트
  const selEvs = selDate ? (evsByDay[parseInt(selDate.slice(8))] || []) : [];

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

      {/* 월 탭 */}
      {allMonthKeys.length > 0 && (
        <div className="vs-month-tabs">
          {allMonthKeys.map(mk => {
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
              const isT = ds === todayStr;
              const isSel = ds === selDate;
              let cls = "vs-cal-cell";
              if (hasVS) cls += " has-ev";
              else if (hasGP) cls += " has-gp";
              if (isT) cls += " today";
              if (isSel) cls += " sel";
              return (
                <div key={day} className={cls}
                  onClick={() => evs.length ? setSelDate(isSel ? null : ds) : null}>
                  <div className="vs-cal-dn">{day}</div>
                  {evs.length > 0 && (
                    <div className="vs-cal-prods">
                      {evs.map((e,i) => (
                        <div key={i} className={`vs-cal-prod${e.eventType==="Generalprobe"&&!isVorstellung(e)?" gp":""}`}>
                          {e.production || e.title}
                        </div>
                      ))}
                    </div>
                  )}
                  {evs.length > 0 && (
                    <div className="vs-cal-time">{evs[0].startTime} Uhr</div>
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

// ═══════════════════════════════════════════════════════════════════════
//  PDF VIEW  — Claude API parses Semperoper schedule formats
// ═══════════════════════════════════════════════════════════════════════
function PdfView({ scheds, setScheds, deleteEvent, user, toast }) {
  const [drag, setDrag] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef();

  const callApi = async (base64, pageHint, vsOnly) => {
    const vsFilter = vsOnly
      ? "NUR Vorstellungen (VS) extrahieren! Alle anderen Typen (GP, OHP, KHP, BP, BO, TE, Bel, KP) IGNORIEREN."
      : "Alle Termine extrahieren.";
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
Bel=Beleuchtungsprobe, KP=Konzertprobe, cf=chorfrei

${vsFilter}

Antworte NUR mit einem JSON-Array. Kein Markdown, keine Backticks.
Beginne direkt mit [ und ende mit ]

Format:
{"date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"00:00","eventType":"Vorstellung","title":"Stückname","production":"Stückname","location":"Bühne","targetGroup":"Alle Eingeteilten","conductor":"","note":"","sourceType":"vorplanung"}

- Wenn Uhrzeit unbekannt: "00:00"
- Antworte AUSSCHLIESSLICH mit dem JSON-Array`,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: `Analysiere ${pageHint} und extrahiere die Termine als JSON-Array.` }
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

  const parsePdf = async (file) => {
    setParsing(true); setError(""); setParsed(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result.split(",")[1]);
        r.onerror = () => rej(new Error("Lesefehler"));
        r.readAsDataURL(file);
      });

      const isVorplanung = file.name.toLowerCase().includes("vorplanung") ||
                           file.name.toLowerCase().includes("vorp");

      let allEvents = [];
      if (isVorplanung) {
        // Vorplanung: VS만 추출, 전체 PDF 한번에 처리
        allEvents = await callApi(base64, "alle Seiten dieser Vorplanung (4 Seiten)", true);
      } else {
        allEvents = await callApi(base64, "diesen Probenplan", false);
      }

      if (allEvents.length === 0) throw new Error("Keine Termine gefunden");
      setParsed(allEvents.map(e => ({ ...e, _import: !isChorfrei(e) })));
    } catch (e) {
      setError("Fehler beim Analysieren: " + e.message);
    } finally {
      setParsing(false);
    }
  };

  const onFile = f => {
    if (!f || f.type !== "application/pdf") { setError("Bitte eine PDF-Datei hochladen."); return; }
    parsePdf(f);
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

      {parsing && (
        <div className="parsing">
          <div className="pulse" style={{ fontSize: "1.5rem", marginBottom: 8 }}>🎼</div>
          <p>Claude analysiert den Probenplan…</p>
          <p style={{ marginTop: 4, fontSize: "0.72rem" }}>Erkennt Stücke · Typen · Zielgruppen · Zeiten</p>
        </div>
      )}

      {error && <div style={{ color: "#F1948A", fontSize: "0.82rem", padding: "10px 0" }}>{error}</div>}

      {parsed && groupedParsed && (
        <div>
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
    if (!confirm(`${dupIds.size}개의 중복 일정을 삭제할까요?\n(우선순위 낮은 항목만 삭제됩니다)`)) return;
    setCleaning(true);
    for (const id of dupIds) await deleteEvent(id);
    toast(`✓ ${dupIds.size}개 중복 삭제 완료`);
    setCleaning(false);
  };

  const deleteOldProben = async () => {
    const toDelete = scheds.filter(e => e.date < todayStr && !isVorstellung(e));
    if (!toDelete.length) { toast("Keine alten Proben."); return; }
    if (!confirm(`${toDelete.length}개의 지난 Proben을 삭제할까요?`)) return;
    for (const e of toDelete) await deleteEvent(e.id);
    toast(`✓ ${toDelete.length}개 삭제`);
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
          ⚠ {dupGroups.length}개 일정에 중복이 발견됐어요 — 우선순위 낮은 {dupIds.size}개를 자동 삭제할 수 있어요.
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

function AdminView({ scheds, setScheds, deleteEvent, notifs, setNotifs, toast, settings, saveSettings }) {
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
      if (toDelete.length > 0) console.log(`[AutoClean] ${toDelete.length}개 지난 Probe 삭제`);
    });
  }, [scheds.length, lastProbeClean]);

  return (
    <div className="page">
      <div className="atabs">
        {[["scheds","Spielplan"], ["import","PDF Import"], ["notifs","Mitteilungen"]].map(([v, l]) => (
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
                        borderLeft:"1px solid var(--border)",
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
            Sächsische Staatsoper Dresden
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
            Sächsische Staatsoper Dresden · Opernchor
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
      </div>
    </div>
  );
}


import { useState, useEffect, useCallback } from "react";
import { useFirebase } from "./useFirebase.js";
import { CalView } from "./CalView.jsx";
import { VorstellungView, ChangesView } from "./VorstellungView.jsx";
import { PdfView } from "./PdfView.jsx";
import { AdminView } from "./AdminView.jsx";
import { PinnwandView } from "./PinnwandView.jsx";
import { EinstellungenView } from "./EinstellungenView.jsx";
import { ProductionPicker, getCurrentSeason } from "./ProductionPicker.jsx";
import {
  VOICES, PARTS, PART_VOICE, VOICE_COLOR,
  matchesMyProductions, isRelevantForUser,
  fmtD, today, todayStr,
  MONTHS_DE, WEEKDAYS_DE,
  fmtDate, getStyle, SEED_PINNWAND,
} from "./utils.js";

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
.demo-btn {
  width: 100%; padding: 11px 16px; display: flex; align-items: center; justify-content: center; gap: 7px;
  background: transparent; border: 1px solid var(--border2); border-radius: 10px;
  color: var(--muted); font-family: var(--sans); font-size: 0.82rem; font-weight: 500;
  cursor: pointer; transition: all 0.2s; margin-top: 8px;
}
.demo-btn:hover { border-color: var(--accent); color: var(--text); background: var(--accent-dim); }

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
/* 비정상 연주시간 경고 — 다크: 노란 텍스트, 라이트: 빨간 텍스트 */
.unusual-time { color: #FFD60A; font-weight: 800; background: rgba(255,214,10,0.12); border: 1px solid rgba(255,214,10,0.45); border-radius: 5px; padding: 1px 6px; }
.unusual-time-badge { font-size: 0.58rem; font-weight: 800; color: #FFD60A; background: rgba(255,214,10,0.15); border: 1px solid rgba(255,214,10,0.4); border-radius: 3px; padding: 0px 3px; line-height: 14px; display: inline-block; }
[data-theme="light"] .unusual-time { color: #C0392B; background: rgba(192,57,43,0.08); border: 1px solid rgba(192,57,43,0.4); }
[data-theme="light"] .unusual-time-badge { color: #C0392B; background: rgba(192,57,43,0.08); border: 1px solid rgba(192,57,43,0.35); }

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
.atabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 16px; gap: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; } .atabs::-webkit-scrollbar { display: none; }
.atab { padding: 8px 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--muted); font-family: 'Inter', sans-serif; font-size: 0.82rem; font-weight: 500; cursor: pointer; transition: all 0.15s; margin-bottom: -1px; }
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

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  return { toasts, add };
}

function LoginScreen({ onLogin, onDemoLogin }) {
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

          <button className="demo-btn" onClick={onDemoLogin}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
            </svg>
            Demo ansehen
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
//  DEMO SETUP SCREEN — Stimmgruppe für Demo-Session wählen
// ═══════════════════════════════════════════════════════════════════════
function DemoSetupScreen({ onStart, onCancel }) {
  const [part, setPart] = useState("");
  const [err,  setErr]  = useState("");

  const PART_GROUPS = [
    { label:"Sopran", parts:["Sop. 1.", "Sop. 2."] },
    { label:"Alt",    parts:["Alt. 1.", "Alt. 2."] },
    { label:"Tenor",  parts:["Ten. 1.", "Ten. 2."] },
    { label:"Bass",   parts:["Bass 1.", "Bass 2."] },
  ];

  const DEMO_NAMES = {
    "Sop. 1.": "Sophie Müller",
    "Sop. 2.": "Anna Weber",
    "Alt. 1.": "Maria Braun",
    "Alt. 2.": "Laura Schmidt",
    "Ten. 1.": "Thomas Fischer",
    "Ten. 2.": "Jonas Wagner",
    "Bass 1.": "Max Bauer",
    "Bass 2.": "Felix Hoffmann",
  };

  const handleStart = () => {
    if (!part) { setErr("Bitte Stimmgruppe auswählen."); return; }
    onStart(DEMO_NAMES[part], part);
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
            <span className="sempre">Demo</span>
            <span className="semper">Stimmgruppe</span>
          </div>
        </div>
        <div className="login-subtitle" style={{ marginBottom:20 }}>
          Als welche Stimmgruppe möchtest du die App testen?
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:16 }}>
          {PART_GROUPS.map(grp => (
            <div key={grp.label}>
              <div style={{ fontSize:"0.68rem", fontWeight:700, color:"var(--muted)",
                textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>
                {grp.label}
              </div>
              {grp.parts.map(p => (
                <button key={p} onClick={() => { setPart(p); setErr(""); }}
                  style={{ width:"100%", marginBottom:4, padding:"9px 10px", border:"1px solid",
                    borderColor: part===p ? "var(--accent)" : "var(--border)",
                    borderRadius:8, cursor:"pointer", fontFamily:"var(--sans)",
                    fontSize:"0.84rem", fontWeight: part===p ? 700 : 400,
                    background: part===p ? "var(--accent-dim)" : "var(--s2)",
                    color: part===p ? "var(--accent)" : "var(--text2)",
                    transition:"all 0.15s", textAlign:"left" }}>
                  {part===p ? "✓ " : ""}{p}
                </button>
              ))}
            </div>
          ))}
        </div>

        {part && (
          <div style={{ marginBottom:14, padding:"10px 14px", background:"var(--s2)",
            border:"1px solid var(--border)", borderRadius:8, fontSize:"0.8rem", color:"var(--muted)" }}>
            Demo als <strong style={{ color:"var(--text)" }}>{DEMO_NAMES[part]}</strong> · {part}
          </div>
        )}

        {err && <div style={{ fontSize:"0.78rem", color:"var(--accent)", marginBottom:8, textAlign:"center" }}>{err}</div>}

        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onCancel}>Abbrechen</button>
          <button className="btn btn-gold" style={{ flex:2 }} onClick={handleStart}
            disabled={!part}>
            Demo starten →
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  REGISTRATION SCREEN — shown after first Google login
// ═══════════════════════════════════════════════════════════════════════

function RegistrationScreen({ googleUser, onSave, onLogout }) {
  const [name, setName]       = useState(googleUser.displayName || "");
  const [part, setPart]       = useState("");
  const [err,  setErr]        = useState("");
  const [saving, setSaving]   = useState(false);
  const [consent, setConsent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const PART_GROUPS = [
    { label:"Sopran", parts:["Sop. 1.", "Sop. 2."] },
    { label:"Alt",    parts:["Alt. 1.", "Alt. 2."] },
    { label:"Tenor",  parts:["Ten. 1.", "Ten. 2."] },
    { label:"Bass",   parts:["Bass 1.", "Bass 2."] },
  ];

  const handleSave = async () => {
    if (!name.trim()) { setErr("Bitte Namen eingeben."); return; }
    if (!part)        { setErr("Bitte Stimmgruppe auswählen."); return; }
    if (!consent)     { setErr("Bitte Datenschutzhinweis bestätigen."); return; }
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

        {/* ── Datenschutz Einwilligung ── */}
        <div style={{ margin:"16px 0 4px", padding:"12px 14px",
          background:"var(--s2)", borderRadius:10,
          border:"1px solid var(--border)" }}>
          <label style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }}>
            <input type="checkbox" checked={consent} onChange={e=>{ setConsent(e.target.checked); setErr(""); }}
              style={{ marginTop:2, flexShrink:0, width:16, height:16, accentColor:"var(--accent)", cursor:"pointer" }}/>
            <span style={{ fontSize:"0.78rem", color:"var(--text2)", lineHeight:1.5 }}>
              Ich habe den{" "}
              <span onClick={e=>{ e.preventDefault(); setShowPrivacy(v=>!v); }}
                style={{ color:"var(--accent)", textDecoration:"underline", cursor:"pointer" }}>
                Datenschutzhinweis
              </span>
              {" "}gelesen und stimme der Verarbeitung meiner Daten (Name, E-Mail, Stimmgruppe)
              zur Nutzung dieser App zu. Die Nutzung ist freiwillig.
            </span>
          </label>

          {/* 펼치기/접기 개인정보 안내 */}
          {showPrivacy && (
            <div style={{ marginTop:10, padding:"10px 12px", background:"var(--s1)",
              borderRadius:8, fontSize:"0.74rem", color:"var(--muted)", lineHeight:1.6,
              border:"1px solid var(--border)" }}>
              <strong style={{ color:"var(--text)", fontSize:"0.78rem" }}>Datenschutzhinweis</strong>
              <br/><br/>
              <strong>Welche Daten werden gespeichert?</strong><br/>
              Name, E-Mail-Adresse und Stimmgruppe (z.B. Bass 1.)
              — keine Geburtsdaten, keine Adressdaten.
              <br/><br/>
              <strong>Wo werden die Daten gespeichert?</strong><br/>
              In Google Firebase (Firestore), EU-Region. Betreiber:
              Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland.
              <br/><br/>
              <strong>Wer hat Zugriff?</strong><br/>
              Nur eingeloggte Mitglieder des Staatsopernchors.
              Admin-Nutzer haben erweiterten Lesezugriff zur Dienstplanerstellung.
              <br/><br/>
              <strong>PDF-Analyse (optional):</strong><br/>
              Beim Hochladen eines PDFs wird der Inhalt zur Analyse an die
              Anthropic API (USA) übertragen. Es werden keine personenbezogenen
              Daten übermittelt — nur die Planstruktur (Datum, Zeit, Probentyp).
              <br/><br/>
              <strong>Rechte:</strong><br/>
              Sie können jederzeit die Löschung Ihrer Daten verlangen.
              Wenden Sie sich dazu an den App-Administrator.
              <br/><br/>
              <strong>Rechtsgrundlage:</strong><br/>
              Art. 6 Abs. 1 lit. a DSGVO (Einwilligung). Die Nutzung dieser
              App ist freiwillig und hat keinen Einfluss auf das Arbeitsverhältnis.
            </div>
          )}
        </div>

        {err && <div style={{ fontSize:"0.78rem", color:"var(--accent)", marginBottom:8, textAlign:"center" }}>{err}</div>}

        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onLogout}>Abbrechen</button>
          <button className="btn btn-gold" style={{ flex:2 }} onClick={handleSave} disabled={saving || !consent}
            style={{ flex:2, opacity: consent ? 1 : 0.5 }}>
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

export default function App() {
  const [tab, setTab] = useState("calendar");
  const { toasts, add: toast } = useToast();

  // PDF.js 동적 로드 (페이지 수 파악용)
  useEffect(() => {
    if (window.pdfjsLib) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    };
    document.head.appendChild(script);
  }, []);

  const {
    user: authUser, profile,
    loading: authLoading,
    loginWithGoogle,
    loginWithDemo,
    saveProfile,
    logout: fbLogout,
    scheds, saveScheds, deleteEvent,
    pinnwand, savePinnwand, deletePost: fbDeletePost,
    settings, saveSettings,
    allUsers, allSettings,

  } = useFirebase();

  const user = profile;
  const [notifs, setNotifs] = useState([]);
  const [demoSetup, setDemoSetup] = useState(false); // Demo 설정 화면 표시 여부
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
      {demoSetup
        ? <DemoSetupScreen
            onStart={async (name, part) => {
              const voice = PART_VOICE[part];
              await loginWithDemo();
              await saveProfile("v8nkjZBjGbYHcLLh9YKUwxwfrgy2", {
                name, part, voice,
                role: "member",
                email: "demo@semperoper-chor.app",
                createdAt: Date.now(),
              });
              setDemoSetup(false);
            }}
            onCancel={() => setDemoSetup(false)}
          />
        : <LoginScreen
            onLogin={loginWithGoogle}
            onDemoLogin={() => setDemoSetup(true)}
          />
      }
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
  const isDemo  = authUser?.uid === "v8nkjZBjGbYHcLLh9YKUwxwfrgy2";
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
          {tab === "einstellungen" && <EinstellungenView user={user} settings={settings} saveSettings={saveSettings} onLogout={logout} scheds={scheds} isDemo={isDemo} />}
          {tab === "admin-panel" && isAdmin && <AdminView scheds={scheds} setScheds={saveScheds} deleteEvent={deleteEvent} notifs={notifs} setNotifs={saveNotifs} toast={toast} settings={settings} saveSettings={saveSettings} users={allUsers} allSettings={allSettings} isDemo={isDemo} />}
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

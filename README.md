# Sempre Semper 🎭
**Digitaler Spielplan — Staatsopernchor der Sächsischen Staatsoper Dresden**

---

## Setup (einmalig, ~10 Minuten)

### Voraussetzungen
- [Node.js](https://nodejs.org) — Version 18 oder neuer
- Ein Terminal (Mac: Terminal.app, Windows: PowerShell)

### 1. Abhängigkeiten installieren
```bash
cd sempre-semper
npm install
```

### 2. Lokal testen
```bash
npm run dev
```
→ Öffnet http://localhost:5173 im Browser

### 3. Für Produktion bauen
```bash
npm run build
```
→ Erstellt den `dist/` Ordner

---

## Firebase einrichten (bereits konfiguriert)

Die Firebase-Konfiguration ist bereits in `src/firebase.js` hinterlegt.

**Firestore Security Rules einrichten:**
1. Firebase Console → Firestore Database → Regeln
2. Inhalt von `firestore.rules` einfügen
3. "Veröffentlichen" klicken

**Ersten Admin anlegen:**
1. App öffnen, mit Google anmelden
2. In Firebase Console → Firestore → `users` Collection
3. Den eigenen Eintrag öffnen → `role` Feld auf `"admin"` setzen

---

## Vercel Deployment

### Methode A: GitHub (empfohlen)
1. Diesen Ordner als GitHub Repository hochladen
2. [vercel.com](https://vercel.com) → "Import Project" → GitHub Repo wählen
3. Framework: **Vite** — automatisch erkannt
4. Deploy klicken → `sempre-semper.vercel.app` sofort verfügbar

### Methode B: Vercel CLI
```bash
npm install -g vercel
vercel deploy
```

---

## PWA Installation (Handy)

**iPhone/iPad:**
Safari → Teilen-Symbol → "Zum Home-Bildschirm hinzufügen"

**Android:**
Chrome → Menü (⋮) → "App installieren"

---

## Projektstruktur
```
sempre-semper/
├── src/
│   ├── App.jsx          ← Haupt-App (alle Komponenten)
│   ├── firebase.js      ← Firebase-Konfiguration
│   ├── useFirebase.js   ← Firestore & Auth Hooks
│   └── main.jsx         ← React Entry Point
├── public/
│   ├── manifest.json    ← PWA Manifest
│   ├── favicon.svg      ← App-Icon
│   └── icon-*.png       ← PWA Icons (noch hinzufügen)
├── firestore.rules      ← Sicherheitsregeln
├── index.html
├── package.json
└── vite.config.js
```

---

## Technologien
- **React 18** + **Vite** — Frontend
- **Firebase 11** — Datenbank (Firestore) + Authentifizierung
- **Vercel** — Hosting & Deployment
- **PWA** — Installierbar als App

---

*Sempre Semper v1.0 · Sächsische Staatsoper Dresden · Opernchor*

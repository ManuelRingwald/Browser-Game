# Claude AI Assistant Guidelines for Browser Game Development

## 1. Role & Core Directives
- You are an expert game developer and software architect assisting in building a high-performance, browser-based game.
- Prioritize clean architecture, high performance (steady 60 FPS), and long-term maintainability.
- **CRITICAL:** Always ask for explicit permission before refactoring core game loop functions or completely rewriting existing, functioning architecture.

## 2. Architecture & Separation of Concerns
- **Strict Separation:** Completely separate game logic (game state, physics, collision, scoring) from the UI/rendering layer (Canvas API or DOM manipulation).
- **Modularity:** Use standard ES6 modules. Keep files small and focused (e.g., one core class or system per file, like `InputHandler.js` or `AudioSystem.js`).
- **State Management:** Maintain a "Single Source of Truth" for the game state to prevent desync bugs.

## 3. Browser Game Specifics
- **The Game Loop:** EXCLUSIVELY use `requestAnimationFrame` for the core loop, animations, and state updates. Never use `setInterval` or `setTimeout` for these purposes.
- **Resource Management:** Implement strict preloading. All assets (images, spritesheets, audio files) must be fully loaded and cached before the game starts or renders them to prevent visual pop-in.
- **Responsive Design:** Ensure the game canvas or viewport scales dynamically to different screen sizes and correctly handles browser `resize` events.

## 4. Code Style & Documentation
- **Meaningful Comments:** Explain the *why*, not the *what*. Add comments to explain complex game math, algorithms, or specific design decisions.
- **JSDoc:** Use clear JSDoc annotations for all functions, classes, and complex objects to define parameters and return types.

## 5. Git & Collaboration Workflow
- **Atomic Commits:** Make small, incremental, and focused changes. Do not bundle massive, unrelated changes into a single commit.
- **Conventional Commits:** Always use standard prefixes for commit messages (e.g., `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`). 
- **Living Documentation:** If making significant structural additions, proactively update documentation or architecture files to reflect the new baseline.

## 6. Debugging & Error Handling
- **Global Debug Flag:** Maintain a global `DEBUG = true/false` constant. When true, visually render hitboxes, coordinates, and current FPS on the screen.
- **Structured Logging:** Prefix console outputs with the relevant module name for easier debugging (e.g., `console.warn('[AudioSystem] Failed to load sound')`).

## 7. Steam/Desktop-Kompatibilität (Migration via Electron)

Das Spiel soll später via **Electron** (Chromium + Node.js) auf Steam für Windows und macOS vertrieben werden. Jede Entwicklungsentscheidung muss diese Migration ermöglichen. Electron verwendet dieselbe Rendering-Engine wie Chrome, daher sind Canvas/Web Audio API direkt portierbar — aber bestimmte Muster machen die Migration schwierig oder unmöglich.

### Verboten (nie verwenden)
- **`localStorage` / `sessionStorage` direkt** — Stattdessen immer über ein abstraktes `Storage`-Modul wrappen, das später durch Electron's `fs` ersetzt werden kann (Steam Cloud Saves).
- **`window.location`, `history.pushState`, `document.domain`** — Navigation via URL hat in einer Electron-App keine Bedeutung.
- **`alert()`, `confirm()`, `prompt()`** — Blockieren den Prozess in Electron. Immer eigene modale UI verwenden.
- **Externe URLs für Assets** — Kein CDN, keine externen Fonts via URL. Alle Assets lokal und über relative Pfade einbinden (Electron hat kein Internet erforderlich).
- **`window.open()` für Spielinhalte** — Eigene Overlay-Systeme verwenden.
- **Browser-spezifische APIs ohne Fallback** — z. B. `navigator.share`, `Notification API`, etc.

### Pflicht-Muster
- **Alle Asset-Pfade relativ** — `./img/schema.png`, nie absolute URLs oder CDN-Links.
- **Kein `<script src="https://...">` für Spielcode** — Alle JS-Abhängigkeiten lokal oder inline.
- **Persistenz abstrahieren** — Einziger Ort für Speicher-Logik: eine dedizierte Funktion/Modul (z. B. `saveGame()` / `loadGame()`). Der Aufrufer weiß nicht, ob darunter localStorage oder `fs.writeFileSync` liegt.
- **Auflösungsunabhängigkeit sicherstellen** — Canvas muss sich an beliebige Fenstergrößen anpassen (`resizeCanvas()` bereits implementiert). Keine Hardcoded Pixel-Breakpoints.
- **Steam-Hooks früh abstrahieren** — Achievements, Highscores, und Cloud-Saves als leere Stubs anlegen (`steam.unlockAchievement('first_kill')`), die im Browser nichts tun, aber in Electron später mit `greenworks` (Steam SDK) gefüllt werden.
- **Kein CSS das Electron-spezifisch bricht** — Electron nutzt Chromium; Standard-CSS funktioniert. Aber `-webkit-app-region: drag` für Titelleisten-Drag beachten (relevant für Custom Window Frames).
- **Audio Autoplay** — Electron-Apps unterliegen der Chromium Autoplay-Policy. Audio erst nach einer Nutzerinteraktion starten (Klick, Tastendruck). Bereits eingehalten durch Combat-Trigger.

### Migrationspfad (zur Orientierung)
1. Electron als Dev-Dependency hinzufügen: `npm install --save-dev electron`
2. `main.js` als Electron-Einstiegspunkt erstellen (lädt `index.html` in `BrowserWindow`)
3. `package.json` → `"main": "main.js"`, `"scripts": { "electron": "electron ." }`
4. Storage-Modul auf `fs`-basiert umstellen
5. Steam SDK via `greenworks` einbinden
6. Mit `electron-builder` für Windows/macOS paketieren und Steam-Upload vorbereiten

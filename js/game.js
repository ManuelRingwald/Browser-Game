// =============================================================================
// game.js – Einstiegspunkt: Canvas-Resize, Kamera, Input-Setup, Game-Loop
// Ladeordnung: config.js → state.js → map.js → physics.js → animation.js
//              → combat.js → rendering.js → game.js → ui.js
//
// Verantwortlich für:
//   - resizeCanvas    (Viewport- und Weltgröße anpassen, buildMansion aufrufen)
//   - updateTarget    (Maus/Touch-Ziel in Weltkoordinaten umrechnen)
//   - updateCamera    (Kamera auf Spieler zentrieren, Weltgrenzen beachten)
//   - initGame        (Event-Listener registrieren, Game-Loop starten)
//   - gameLoop        (requestAnimationFrame-Schleife)
// =============================================================================

// ── Canvas-Verwaltung ─────────────────────────────────────────────────────────

function resizeCanvas() {
    const paper = document.getElementById('paper');
    canvas.width  = paper.clientWidth;
    canvas.height = paper.clientHeight;
    // Welt = 2× Viewport; wallCanvas/exploredCanvas in Weltgröße
    wallCanvas.width  = exploredCanvas.width  = canvas.width  * 2;
    wallCanvas.height = exploredCanvas.height = canvas.height * 2;
    buildMansion();
}

// ── Ziel- und Kamera-Update ───────────────────────────────────────────────────

function updateTarget(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const zoom = GameState.zoom;
    GameState.targetX = (clientX - rect.left) * (canvas.width  / rect.width)  / zoom + GameState.camera.x;
    GameState.targetY = (clientY - rect.top)  * (canvas.height / rect.height) / zoom + GameState.camera.y;
}

function updateCamera() {
    const p    = Entities.player;
    const zoom = GameState.zoom;
    const vw   = canvas.width  / zoom;   // sichtbare Weltbreite in Pixeln
    const vh   = canvas.height / zoom;
    GameState.camera.x = Math.max(0, Math.min(p.x - vw / 2, GameState.worldW - vw));
    GameState.camera.y = Math.max(0, Math.min(p.y - vh / 2, GameState.worldH - vh));
}

// ── Initialisierung ───────────────────────────────────────────────────────────

function initGame() {
    GameState.running = true;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ── Touch & Maus: Ziel setzen ──────────────────────────────────────────
    canvas.addEventListener('touchstart', (e) => {
        if (!GameState.paused) { GameState.isTouching = true; updateTarget(e.touches[0].clientX, e.touches[0].clientY); }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        if (!GameState.paused) { e.preventDefault(); updateTarget(e.touches[0].clientX, e.touches[0].clientY); }
    }, { passive: false });
    canvas.addEventListener('touchend', () => GameState.isTouching = false);
    canvas.addEventListener('mousedown', (e) => {
        if (!GameState.paused) { GameState.isTouching = true; updateTarget(e.clientX, e.clientY); }
    });
    canvas.addEventListener('mousemove', (e) => {
        if (!GameState.paused && GameState.isTouching) updateTarget(e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseup', () => GameState.isTouching = false);

    // ── Tastatur ───────────────────────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
        if (Input.hasOwnProperty(e.key)) Input[e.key] = true;
        if (Input.hasOwnProperty(e.key.toLowerCase())) Input[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', (e) => {
        if (Input.hasOwnProperty(e.key)) Input[e.key] = false;
        if (Input.hasOwnProperty(e.key.toLowerCase())) Input[e.key.toLowerCase()] = false;
    });

    // ── Richtungswahl nach Bewegung (Maus) ────────────────────────────────
    canvas.addEventListener('click', e => {
        if (!GameState.selectingDirection) return;
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        handleDirectionSelection(
            (e.clientX - rect.left) * (canvas.width / rect.width)  / z + GameState.camera.x,
            (e.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y
        );
    });

    // ── Richtungswahl nach Bewegung (Touch) ───────────────────────────────
    canvas.addEventListener('touchend', e => {
        if (!GameState.selectingDirection || Anim.running) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect  = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        handleDirectionSelection(
            (touch.clientX - rect.left) * (canvas.width / rect.width)  / z + GameState.camera.x,
            (touch.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y
        );
    }, { passive: false });

    // ── Hover-Tracking für Raster-Felder und Richtungspfeile ──────────────
    canvas.addEventListener('mousemove', e => {
        if (!GameState.combatMoving) {
            GameState.hoverGridCell = null; GameState.hoverDirIdx = null; return;
        }
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        const wx = (e.clientX - rect.left) * (canvas.width  / rect.width)  / z + GameState.camera.x;
        const wy = (e.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y;
        const p = Entities.player;
        const arrowR = FELD_PX * 0.82;
        let dirIdx = null;
        for (let i = 0; i < DIR_ANGLES.length; i++) {
            if (Math.hypot(wx - (p.x + Math.cos(DIR_ANGLES[i])*arrowR),
                           wy - (p.y + Math.sin(DIR_ANGLES[i])*arrowR)) < FELD_PX * 0.4) {
                dirIdx = i; break;
            }
        }
        GameState.hoverDirIdx  = dirIdx;
        GameState.hoverGridCell = dirIdx === null
            ? { col: Math.floor(wx / FELD_PX), row: Math.floor(wy / FELD_PX) }
            : null;
    });
    canvas.addEventListener('mouseleave', () => {
        GameState.hoverGridCell = null; GameState.hoverDirIdx = null;
    });

    // ── Raster-Klick im Kampf (Maus) ──────────────────────────────────────
    canvas.addEventListener('click', e => {
        if (!GameState.combatMoving) return;
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        handleGridClick(
            (e.clientX - rect.left) * (canvas.width  / rect.width)  / z + GameState.camera.x,
            (e.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y
        );
    });

    // ── Raster-Klick im Kampf (Touch) ─────────────────────────────────────
    canvas.addEventListener('touchend', e => {
        if (!GameState.combatMoving) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect  = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        handleGridClick(
            (touch.clientX - rect.left) * (canvas.width / rect.width)  / z + GameState.camera.x,
            (touch.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y
        );
    }, { passive: false });

    requestAnimationFrame(gameLoop);
}

// ── Game-Loop ─────────────────────────────────────────────────────────────────

function gameLoop() {
    if (!GameState.running) return;
    if (!GameState.paused) {
        updatePlayer();
        updateEnemy();
        checkCombatState();
        checkDoorProximity();
    }
    drawGame();
    requestAnimationFrame(gameLoop);
}

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
    // Weltgröße IMMER fest – unabhängig vom Viewport.
    // Mobile sieht weniger, scrollt mehr; Desktop sieht mehr.
    // Räume, Felder und Reichweiten sind auf allen Geräten identisch.
    wallCanvas.width  = exploredCanvas.width  = WORLD_W;
    wallCanvas.height = exploredCanvas.height = WORLD_H;
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

// ── D-Pad (Mobile) ────────────────────────────────────────────────────────────

function initDPad() {
    const base  = document.getElementById('dpad-base');
    const thumb = document.getElementById('dpad-thumb');
    if (!base || !thumb) return;

    // 8 Richtungs-Pips erzeugen (kleine Dreiecke)
    const R_PIP = 40; // Abstand vom Mittelpunkt
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2; // Start: oben
        const px = 56 + Math.cos(angle) * R_PIP;
        const py = 56 + Math.sin(angle) * R_PIP;
        const pip = document.createElement('div');
        pip.className = 'dpad-pip';
        // Positionierung + Rotation damit Dreieck nach außen zeigt
        pip.style.cssText =
            `left:${px}px; top:${py}px;` +
            `transform:translate(-50%,-50%) rotate(${angle + Math.PI / 2}rad);`;
        base.appendChild(pip);
    }

    const MAX_R = 34;   // maximale Auslenkung in px
    const DEAD  = 6;    // Totzone
    let activeId = null;

    function apply(clientX, clientY) {
        const rect = base.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > MAX_R) { dx = dx / dist * MAX_R; dy = dy / dist * MAX_R; }

        thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        if (dist > DEAD) {
            GameState.dpad = { active: true,  dx: dx / MAX_R, dy: dy / MAX_R };
        } else {
            GameState.dpad = { active: false, dx: 0, dy: 0 };
        }
    }

    function release() {
        activeId = null;
        thumb.style.transform = 'translate(-50%, -50%)';
        GameState.dpad = { active: false, dx: 0, dy: 0 };
    }

    base.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        if (activeId !== null) return;
        const t = e.changedTouches[0];
        activeId = t.identifier;
        apply(t.clientX, t.clientY);
    }, { passive: false });

    base.addEventListener('touchmove', e => {
        e.preventDefault(); e.stopPropagation();
        for (const t of e.changedTouches) {
            if (t.identifier === activeId) { apply(t.clientX, t.clientY); break; }
        }
    }, { passive: false });

    base.addEventListener('touchend', e => {
        e.preventDefault(); e.stopPropagation();
        for (const t of e.changedTouches) {
            if (t.identifier === activeId) { release(); break; }
        }
    }, { passive: false });

    base.addEventListener('touchcancel', () => release(), { passive: false });
}

// ── Initialisierung ───────────────────────────────────────────────────────────

function initGame() {
    GameState.running = true;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    initDPad();

    // Auf Touch-Geräten übernimmt das D-Pad die Bewegung → kein tap-to-move
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    // ── Touch & Maus: Ziel setzen ──────────────────────────────────────────
    canvas.addEventListener('touchstart', (e) => {
        if (GameState.paused) return;
        if (!isTouchDevice) {
            GameState.isTouching = true;
            updateTarget(e.touches[0].clientX, e.touches[0].clientY);
        }
        // Auf Touch-Geräten: kein isTouching (D-Pad bewegt), aber preventDefault
        // damit der Canvas nicht scrollt (wichtig für Touch-Interaktionen)
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        if (GameState.paused) return;
        e.preventDefault();
        if (!isTouchDevice) updateTarget(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    canvas.addEventListener('touchend', () => {
        if (!isTouchDevice) GameState.isTouching = false;
    });
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

    // ── Weltgegenstand-Hover + Klick ──────────────────────────────────────
    function worldCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        return {
            wx: (clientX - rect.left) * (canvas.width  / rect.width)  / z + GameState.camera.x,
            wy: (clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y,
        };
    }

    canvas.addEventListener('mousemove', e => {
        if (GameState.paused || GameState.combatTriggered) { GameState.hoveredWorldItem = null; return; }
        const { wx, wy } = worldCoords(e.clientX, e.clientY);
        const HIT = 20;
        GameState.hoveredWorldItem = GameState.worldItems.find(
            i => Math.hypot(wx - i.x, wy - i.y) <= HIT
        ) || null;
    });

    function handleWorldItemClick(clientX, clientY) {
        if (GameState.paused || GameState.combatTriggered) return false;
        if (GameState.selectingDirection || GameState.combatMoving) return false;
        const { wx, wy } = worldCoords(clientX, clientY);
        const HIT = 22;
        const item = GameState.worldItems.find(i => Math.hypot(wx - i.x, wy - i.y) <= HIT);
        if (!item) { GameState.worldItemTarget = null; return false; }
        const p = Entities.player;
        if (Math.hypot(p.x - item.x, p.y - item.y) <= FELD_PX * 1.5) {
            openPickupDialog(item);
        } else {
            GameState.worldItemTarget = item;
            GameState.doorTarget      = null; // cancel door walk
        }
        return true;
    }

    canvas.addEventListener('click',    e => { handleWorldItemClick(e.clientX, e.clientY); });
    canvas.addEventListener('touchend', e => {
        const t = e.changedTouches[0];
        if (handleWorldItemClick(t.clientX, t.clientY)) e.preventDefault();
    }, { passive: false });

    // Prüft ob eine Tür im erkundeten Bereich liegt (exploredCanvas)
    function isDoorExplored(door) {
        if (!exploredCtx || !exploredCanvas) return true;
        const r   = getDoorInteractRect(door);
        const cx  = Math.min(Math.max(0, Math.floor(r.x + r.w / 2)), exploredCanvas.width  - 1);
        const cy  = Math.min(Math.max(0, Math.floor(r.y + r.h / 2)), exploredCanvas.height - 1);
        try { return exploredCtx.getImageData(cx, cy, 1, 1).data[3] > 80; }
        catch (_) { return true; }
    }

    // ── Tür-Hover (Maus) ──────────────────────────────────────────────────
    canvas.addEventListener('mousemove', e => {
        if (GameState.paused || GameState.combatTriggered) { GameState.hoveredDoor = null; return; }
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        const wx = (e.clientX - rect.left) * (canvas.width  / rect.width)  / z + GameState.camera.x;
        const wy = (e.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y;
        const M = 14;
        GameState.hoveredDoor = GameState.doors.find(d => {
            if (!isDoorExplored(d)) return false;
            const r = getDoorInteractRect(d);
            return wx >= r.x - M && wx <= r.x + r.w + M &&
                   wy >= r.y - M && wy <= r.y + r.h + M;
        }) || null;
    });
    canvas.addEventListener('mouseleave', () => { GameState.hoveredDoor = null; });

    // ── Tür-Klick (Maus + Touch) ──────────────────────────────────────────
    function handleDoorClick(clientX, clientY) {
        if (GameState.paused || GameState.combatTriggered) return false;
        if (GameState.selectingDirection || GameState.combatMoving) return false;
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        const wx = (clientX - rect.left) * (canvas.width  / rect.width)  / z + GameState.camera.x;
        const wy = (clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y;
        const M = 18;
        const door = GameState.doors.find(d => {
            if (!isDoorExplored(d)) return false;
            const r = getDoorInteractRect(d);
            return wx >= r.x - M && wx <= r.x + r.w + M &&
                   wy >= r.y - M && wy <= r.y + r.h + M;
        });
        if (!door) { GameState.doorTarget = null; return false; }
        if (playerNearDoor(Entities.player, door)) {
            toggleDoor(door);
            GameState.doorTarget = null;
        } else {
            GameState.doorTarget = door;
        }
        return true;
    }

    canvas.addEventListener('click', e => { handleDoorClick(e.clientX, e.clientY); });

    canvas.addEventListener('touchend', e => {
        if (GameState.combatMoving || GameState.selectingDirection) return;
        const t = e.changedTouches[0];
        if (handleDoorClick(t.clientX, t.clientY)) e.preventDefault();
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
        checkDoorApproach();
        checkWorldItemApproach();
    }
    drawGame();
    requestAnimationFrame(gameLoop);
}

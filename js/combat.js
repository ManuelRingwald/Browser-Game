// =============================================================================
// combat.js – Kampfsystem, KI und Spiellogik
// Ladeordnung: config.js → state.js → map.js → physics.js → animation.js → combat.js
//
// Verantwortlich für:
//   - checkDoorProximity   (Tür-Nähe-Dialog auslösen)
//   - killEnemy            (Gegner töten + Blutlache zeichnen)
//   - updatePlayer         (Spieler-Bewegung pro Frame, Nicht-Kampf)
//   - updateEnemy          (Wegpunkt-Patrouille, Nicht-Kampf)
//   - snapAllToGrid        (Spieler + Gegner animiert ins Raster einrasten)
//   - endCombat            (Kampf-Zustand komplett zurücksetzen)
//   - retreatPlayer        (Spieler 3 Felder vom Gegner wegbewegen)
//   - checkCombatState     (Kampf-Trigger prüfen und auslösen)
//   - combatMovePlayer     (Richtungsbewegung im Kampf)
//   - combatNoiseCheck     (Lärm-Wurf: Feind hört bewegten Spieler)
//   - enemyTakeTurnAI      (einfache Legacy-KI, gibt Log-Array zurück)
//   - enemyComputeAction   (Feind-Aktion berechnen ohne Ausführung)
//   - enemyExecuteAttack   (Feind-Angriff ausführen)
//   - enemyExecuteMove     (Feind-Bewegung ausführen)
//   - startEnemyTurnReset  (Feind-Zug-Reset)
//   - startPlayerTurn      (Spieler-Zug initialisieren)
//
// Globale Abhängigkeiten: GameState, Entities, canvas, FELD_PX, AP_KOSTEN,
//   WEAPONS, rollDice, Anim, animatePlayerMove, renderBlueprint, wallCtx,
//   NPC_SCRAP_VERTS, NPC_CIRCLE_VERTS, drawEntityScrap (rendering.js),
//   gridPathClear, cellOccupied, checkCollision, canSee (physics.js),
//   openEncounterMenu, processEnemyTurnUI (ui.js)
// =============================================================================

// ── Tür-Interaktion ───────────────────────────────────────────────────────────

const DOOR_INTERACT_RANGE = FELD_PX * 1.6; // ~96 px

// Gibt das Rect zurück, das für Hover/Klick relevant ist:
// geschlossen → originales Rect; offen → Türblatt-Position.
function getDoorInteractRect(door) {
    if (!door.open) return { x: door.x, y: door.y, w: door.w, h: door.h };
    const len   = Math.max(door.w, door.h); // lange Seite = Türbreite
    const thick = Math.min(door.w, door.h); // kurze Seite = Rahmendicke
    if (door.w > door.h) {
        // Horizontale Tür → Blatt schwingt senkrecht nach oben an door.x
        const hy = door.y + door.h / 2;
        return { x: door.x - thick, y: hy - len, w: thick * 3, h: len };
    } else {
        // Vertikale Tür → Blatt schwingt waagerecht nach rechts an door.y
        const cx = door.x + door.w / 2;
        return { x: cx, y: door.y - thick, w: len, h: thick * 3 };
    }
}

function playerNearDoor(player, door) {
    const r = getDoorInteractRect(door);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    return Math.hypot(player.x - cx, player.y - cy) <= DOOR_INTERACT_RANGE;
}

// Tür öffnen/schließen und wallCanvas neu zeichnen.
function toggleDoor(door) {
    const opening = !door.open;
    door.open = opening;

    // Visuelles Tür-Geräusch – Texteffekt an Türposition (analog zu "tap... tap...")
    const cx = door.x + door.w / 2;
    const cy = door.y + door.h / 2;
    // Mehrere Varianten, damit es nicht immer gleich ist
    const openTexts  = ['Krrrrr...', 'Knaarrr...', 'Krr... krr...', 'Knarrrz...'];
    const closeTexts = ['Klonk.', 'Wumm.', 'Klack!', 'Bämm.'];
    const variants   = opening ? openTexts : closeTexts;
    const text       = variants[Math.floor(Math.random() * variants.length)];

    GameState.doorSounds.push({
        x: cx, y: cy,
        text,
        opening,
        startTime: performance.now(),
        duration:  opening ? 1600 : 1100,   // Knarzen länger als Klonk
    });

    renderBlueprint();
}

// Läuft der Spieler gerade auf einen Weltgegenstand zu? → bei Ankunft Pickup-Dialog.
function checkWorldItemApproach() {
    if (!GameState.worldItemTarget || GameState.combatTriggered) return;
    const p    = Entities.player;
    const item = GameState.worldItemTarget;
    if (Math.hypot(p.x - item.x, p.y - item.y) <= FELD_PX * 1.5) {
        GameState.worldItemTarget = null;
        openPickupDialog(item); // definiert in ui.js
    }
}

// Läuft der Spieler gerade auf eine Tür zu? → bei Ankunft togglen.
function checkDoorApproach() {
    if (!GameState.doorTarget || GameState.combatTriggered) return;
    const p = Entities.player;
    if (playerNearDoor(p, GameState.doorTarget)) {
        toggleDoor(GameState.doorTarget);
        GameState.doorTarget = null;
    }
}

// ── Gegner töten ──────────────────────────────────────────────────────────────

function killEnemy(enemy) {
    if (!enemy) enemy = GameState.combatTarget || Entities.enemies.find(e => !e.isDead);
    if (!enemy) return;
    enemy.isDead = true;
    GameState.combatWeapon = null;
    // Blut + Schnipsel auf wallCanvas
    drawEntityScrap(wallCtx, enemy, NPC_SCRAP_VERTS, NPC_CIRCLE_VERTS, 'rgba(140, 35, 35, 0.90)');
    wallCtx.fillStyle = 'rgba(180, 30, 30, 0.7)';
    wallCtx.beginPath();
    for (let i = 0; i < Math.PI * 2; i += 0.4) {
        const r = 10 + Math.random() * 8;
        wallCtx.lineTo(enemy.x + Math.cos(i) * r, enemy.y + Math.sin(i) * r);
    }
    wallCtx.fill();
    // Kampf beenden wenn alle tot
    if (Entities.enemies.every(e => e.isDead)) {
        GameState.enemySeen         = false;
        GameState.combatTriggered   = false;
        GameState.combatTarget      = null;
        GameState.combatTargets     = [];
        GameState.combatGridVisible = false;
        GameState.combatMoving      = false;
        canvas.classList.remove('combat-move');
    }
}

// ── Spieler- und Gegner-Update (Erkundungsphase) ──────────────────────────────

function updatePlayer() {
    const player = Entities.player;

    let moveX = 0; let moveY = 0;
    if (Input.w || Input.ArrowUp)    moveY -= 1;
    if (Input.s || Input.ArrowDown)  moveY += 1;
    if (Input.a || Input.ArrowLeft)  moveX -= 1;
    if (Input.d || Input.ArrowRight) moveX += 1;

    if (moveX !== 0 || moveY !== 0) {
        // Tastatur-Bewegung bricht laufende Tür- und Item-Aktionen ab
        GameState.doorTarget       = null;
        GameState.worldItemTarget  = null;
        player.angle = Math.atan2(moveY, moveX);
        const nextX = player.x + Math.cos(player.angle) * player.speed;
        const nextY = player.y + Math.sin(player.angle) * player.speed;

        if (!checkCollision(nextX, player.y, player)) player.x = nextX;
        if (!checkCollision(player.x, nextY, player)) player.y = nextY;

        GameState.targetX = player.x; GameState.targetY = player.y;
    }
    else if (GameState.worldItemTarget && !GameState.combatTriggered) {
        const wi = GameState.worldItemTarget;
        const wdx = wi.x - player.x, wdy = wi.y - player.y;
        const wd  = Math.sqrt(wdx*wdx + wdy*wdy);
        if (wd > 5) {
            player.angle = Math.atan2(wdy, wdx);
            const nx = player.x + Math.cos(player.angle) * player.speed;
            const ny = player.y + Math.sin(player.angle) * player.speed;
            if (!checkCollision(nx, player.y, player)) player.x = nx;
            if (!checkCollision(player.x, ny, player)) player.y = ny;
        }
    }
    else if (GameState.doorTarget && !GameState.combatTriggered) {
        // Zur Tür laufen — ignoriert isTouching/mouseup
        const door = GameState.doorTarget;
        const tcx = door.x + door.w / 2, tcy = door.y + door.h / 2;
        const ddx = tcx - player.x, ddy = tcy - player.y;
        const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (ddist > 5) {
            player.angle = Math.atan2(ddy, ddx);
            const nx = player.x + Math.cos(player.angle) * player.speed;
            const ny = player.y + Math.sin(player.angle) * player.speed;
            if (!checkCollision(nx, player.y, player)) player.x = nx;
            if (!checkCollision(player.x, ny, player)) player.y = ny;
        }
    }
    else if (GameState.dpad.active && !GameState.combatTriggered) {
        // D-Pad-Bewegung bricht laufende Tür- und Item-Aktionen ab
        GameState.doorTarget      = null;
        GameState.worldItemTarget = null;
        player.angle = Math.atan2(GameState.dpad.dy, GameState.dpad.dx);
        const nextX = player.x + Math.cos(player.angle) * player.speed;
        const nextY = player.y + Math.sin(player.angle) * player.speed;
        if (!checkCollision(nextX, player.y, player)) player.x = nextX;
        if (!checkCollision(player.x, nextY, player)) player.y = nextY;
        GameState.targetX = player.x; GameState.targetY = player.y;
    }
    else if (GameState.isTouching) {
        const dx = GameState.targetX - player.x;
        const dy = GameState.targetY - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
            player.angle = Math.atan2(dy, dx);
            const nextX = player.x + Math.cos(player.angle) * player.speed;
            const nextY = player.y + Math.sin(player.angle) * player.speed;
            if (!checkCollision(nextX, player.y, player)) player.x = nextX;
            if (!checkCollision(player.x, nextY, player)) player.y = nextY;
        }
    }
}

function updateEnemy() {
    Entities.enemies.forEach(enemy => {
        if (enemy.isDead) return;
        const wp = enemy.waypoints[enemy.currentWaypoint];
        if (!wp) return;
        const dx = wp.x - enemy.x, dy = wp.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 5) {
            enemy.currentWaypoint = (enemy.currentWaypoint + 1) % enemy.waypoints.length;
        } else {
            enemy.angle = Math.atan2(dy, dx);
            enemy.x += Math.cos(enemy.angle) * enemy.speed;
            enemy.y += Math.sin(enemy.angle) * enemy.speed;
        }
    });
}

// ── Kampf-Start-Hilfsfunktionen ───────────────────────────────────────────────

// Rastet Spieler + alle Kampf-Gegner gleichzeitig ins nächste Rasterfeld ein (animiert).
function snapAllToGrid(onDone) {
    const GS = FELD_PX;
    const snapData = [];
    const addSnap = entity => {
        snapData.push({
            entity,
            sx: entity.x, sy: entity.y,
            tx: (Math.floor(entity.x / GS) + 0.5) * GS,
            ty: (Math.floor(entity.y / GS) + 0.5) * GS,
        });
    };
    addSnap(Entities.player);
    (GameState.combatTargets || []).forEach(e => { if (!e.isDead) addSnap(e); });

    Anim.push({
        duration: 260,
        _sd: snapData,
        onUpdate(_, ease) {
            this._sd.forEach(d => {
                d.entity.x = d.sx + (d.tx - d.sx) * ease;
                d.entity.y = d.sy + (d.ty - d.sy) * ease;
            });
        },
        onComplete: onDone,
    });
}

// Beendet den Kampf sauber und setzt alle Zustände zurück.
function endCombat() {
    GameState.paused            = false;
    GameState.combatTriggered   = false;
    document.getElementById('dpad')?.classList.remove('dpad-combat');
    GameState.enemySeen         = false;
    GameState.combatGridVisible  = false;
    GameState.combatMoving       = false;
    GameState.combatWeapon       = null;
    GameState.combatTarget       = null;
    GameState.combatTargets      = [];
    GameState.selectingDirection = false;
    GameState.postMoveRotation   = false;
    GameState.pendingNoiseMsg    = null;
    GameState.dodgeAnim          = null;
    canvas.classList.remove('combat-move');
}

// Bewegt den Spieler 3 Felder vom Gegner weg (animiert), stoppt an Wänden.
function retreatPlayer(enemy, onDone) {
    const p = Entities.player;
    const dx = p.x - enemy.x, dy = p.y - enemy.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 1) { if (onDone) onDone(); return; }
    const nx = dx/len, ny = dy/len;

    // Versuche 3, 2, dann 1 Feld – stoppe an der ersten freien Position
    let tx = p.x, ty = p.y;
    for (let f = 3; f >= 1; f--) {
        const cx = p.x + nx * FELD_PX * f;
        const cy = p.y + ny * FELD_PX * f;
        if (!checkCollision(cx, cy, p)) { tx = cx; ty = cy; break; }
    }
    animatePlayerMove(tx, ty, onDone);
}

// ── Kampf-Trigger ─────────────────────────────────────────────────────────────

function checkCombatState() {
    const now = performance.now();
    // Ignorierte Gegner (nach Rückzug) werden nicht als Bedrohung gewertet
    const living = Entities.enemies.filter(e => !e.isDead && !(e.ignoreUntil && now < e.ignoreUntil));

    // enemySeen: irgendein Gegner sichtbar?
    GameState.enemySeen = living.some(e => canSee(Entities.player, e));

    if (GameState.combatTriggered) {
        // Kampf vorbei wenn kein Kontakt mehr (Kampf-LOS: kein FOV-Winkel, Engagement-Zone)
        const anyContact = living.some(e =>
            canSeeInCombat(Entities.player, e) || canSeeInCombat(e, Entities.player));
        if (!anyContact) GameState.combatTriggered = false;
        return;
    }

    for (const enemy of living) {
        const pSees = canSee(Entities.player, enemy);
        const eSees = canSee(enemy, Entities.player);
        const dist  = Math.hypot(Entities.player.x - enemy.x, Entities.player.y - enemy.y);

        // Kampf erst auslösen wenn nah genug
        if ((pSees || eSees) && dist <= combatTriggerDist()) {
            GameState.paused = true;
            GameState.isTouching = false;
            GameState.combatTriggered = true;
            document.getElementById('dpad')?.classList.add('dpad-combat');
            GameState.combatEnemyFirst = eSees;

            // Hinterhalt: Spieler sieht Gegner UND Gegner sieht Spieler nicht UND
            // Spieler kommt von hinten (>90° von Feind-Blickrichtung = hinterer Halbkreis)
            const isFromBehind = (() => {
                const p = Entities.player;
                let diff = Math.atan2(p.y - enemy.y, p.x - enemy.x) - enemy.angle;
                while (diff >  Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                return Math.abs(diff) > Math.PI / 2; // >90° von Blickrichtung = Rücken
            })();
            GameState.combatAmbush = pSees && !eSees && isFromBehind;
            GameState.combatPlayerHeard = false;
            GameState.combatTargets = living.filter(e =>
                canSee(Entities.player, e) || canSee(e, Entities.player));
            GameState.combatTarget = enemy;
            GameState.combatDodging = false;
            snapAllToGrid(() => {
                if (eSees && !pSees) {
                    GameState.combatPhase = 'enemy';
                    processEnemyTurnUI();
                } else {
                    startPlayerTurn();
                }
            });
            return;
        }
    }
}

// ── Kampf-Bewegung (Spieler) ──────────────────────────────────────────────────

// Bewegt den Spieler im Kampf (richtung: 1=annähern, -1=zurückweichen).
// Gibt zurück, ob Bewegung erfolgreich war.
function combatMovePlayer(richtung) {
    const p = Entities.player;
    const t = GameState.combatTarget;
    if (!t) return false;
    const dx = t.x - p.x, dy = t.y - p.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 1) return false;
    const stepX = (dx/len) * FELD_PX * richtung;
    const stepY = (dy/len) * FELD_PX * richtung;
    let moved = false;
    if (!checkCollision(p.x + stepX, p.y, p)) { p.x += stepX; moved = true; }
    if (!checkCollision(p.x, p.y + stepY, p)) { p.y += stepY; moved = true; }
    return moved;
}

// ── Lärm-Wurf ────────────────────────────────────────────────────────────────

// Lärm-Wurf: Ob Gegner den bewegten Spieler hören (ohne LOS).
// Gibt einen Beschreibungstext zurück wenn gehört, sonst null.
function combatNoiseCheck() {
    const p = Entities.player;
    const nearEnemies = (GameState.combatTargets||[]).filter(e => !e.isDead && !canSee(e, p));
    for (const enemy of nearEnemies) {
        const fields = Math.hypot(p.x - enemy.x, p.y - enemy.y) / FELD_PX;
        if (fields > 4) continue; // zu weit, kein Lärm hörbar
        const threshold = Math.max(10, Math.round(80 - fields * 15)); // 80% bei 0F → 20% bei 4F
        const roll = Math.floor(Math.random()*100)+1;
        if (roll <= threshold) {
            GameState.combatPlayerHeard = true;
            return `Geräusch! Feind könnte dich gehört haben (W${roll} ≤ ${threshold}%).`;
        }
    }
    return null;
}

// ── Feind-KI ─────────────────────────────────────────────────────────────────

// Einfache KI: Feind handelt mit seinen AP.
// Gibt Array von Aktionsbeschreibungen zurück (für UI-Anzeige).
function enemyTakeTurnAI(enemy) {
    const AP_MAX = 4;
    let ap = AP_MAX;
    const log = [];
    const p = Entities.player;

    while (ap > 0) {
        const dx = p.x - enemy.x, dy = p.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const w = WEAPONS[enemy.waffe];
        const ammoOk = !w.ammoKey || (enemy.ammo?.[w.ammoKey] ?? 0) > 0;

        const actionLabel = `${enemy.name} – ${w.name}`;
        if (dist <= w.range && ammoOk && ap >= AP_KOSTEN.angriff) {
            // Angriff
            if (w.ammoKey) enemy.ammo[w.ammoKey]--;
            const atkRoll = Math.floor(Math.random()*100)+1;
            if (atkRoll <= enemy.angriff) {
                let dmg = rollDice(w.n, w.s);
                const dodgeBonus = GameState.combatDodging ? 20 : 0;
                const dodgeRoll = Math.floor(Math.random()*100)+1;
                if (dodgeRoll <= p.ausweichen + dodgeBonus) {
                    log.push({ type:'miss', text:`${actionLabel} → Du weichst aus! Kein Schaden.` });
                } else {
                    p.hp = Math.max(0, p.hp - dmg);
                    log.push({ type:'hit', text:`${actionLabel} → Treffer! ${dmg} Schaden (Du: ${p.hp}/${p.maxHp} LP)` });
                }
            } else {
                log.push({ type:'miss', text:`${actionLabel} → Verfehlt! (Wurf ${atkRoll} > ${enemy.angriff}%)` });
            }
            GameState.combatDodging = false;
            ap -= AP_KOSTEN.angriff;
        } else if (dist > w.range && ap >= AP_KOSTEN.bewegen) {
            // Bewegen: ein Feld Richtung Spieler
            const len = Math.sqrt(dx*dx + dy*dy);
            const nx = (dx/len)*FELD_PX, ny = (dy/len)*FELD_PX;
            let moved = false;
            if (!checkCollision(enemy.x + nx, enemy.y, enemy)) { enemy.x += nx; moved = true; }
            if (!checkCollision(enemy.x, enemy.y + ny, enemy)) { enemy.y += ny; moved = true; }
            const feldDist = Math.floor(Math.sqrt(dx*dx+dy*dy) / FELD_PX);
            if (moved) log.push({ type:'move', text:`${enemy.name} bewegt sich näher. (${feldDist} Felder Abstand)` });
            ap -= AP_KOSTEN.bewegen;
        } else {
            break;
        }
    }
    return log;
}

// Berechnet, was ein Feind als nächstes tut (ohne Ausführung).
// Gibt { type, weapon, weaponKey } zurück.
function enemyComputeAction(enemy) {
    const p = Entities.player;
    const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
    // Im Kampf: kein FOV-Winkel, nur Wand-LOS + Engagement-Zone
    const hasLOS_val = canSeeInCombat(enemy, p);
    const canDetect  = hasLOS_val || GameState.combatPlayerHeard;

    if (!canDetect) return { type: 'chase' };

    // Primärwaffe prüfen
    const w      = WEAPONS[enemy.waffe];
    const ammoOk = !w.ammoKey || (enemy.ammo?.[w.ammoKey] ?? 0) > 0;
    // Fernkampf braucht mind. 1 freies Feld Abstand
    const minDist = w.ammoKey ? FELD_PX * 1.5 : 0;

    if (dist >= minDist && dist <= w.range && ammoOk) {
        return { type: 'attack', weapon: w, weaponKey: enemy.waffe };
    }

    // Fallback Faustkampf: wenn Primärwaffe nicht nutzbar (kein Ammo, zu nah, zu weit)
    // und Spieler in Nahkampf-Reichweite
    const fist = WEAPONS.faust;
    if (dist <= fist.range) {
        return { type: 'attack', weapon: fist, weaponKey: 'faust' };
    }

    // Zu weit für alles → näher bewegen
    return { type: 'move' };
}

// Spawnt Geschoss-Schnipsel.
// overshoot: Geschoss fliegt weiter als Zielposition.
// sideways: Seitwärts-Versatz in px (senkrecht zur Schussrichtung); 0 = gerade.
function spawnProjectiles(sx, sy, tx, ty, weaponKey, overshoot = false, sideways = 0) {
    const w = WEAPONS[weaponKey];
    if (!w?.ammoKey) return;

    // Seitwärts-Versatz auf den Zielpunkt anwenden
    const baseAngle = Math.atan2(ty - sy, tx - sx);
    const perpAngle = baseAngle + Math.PI / 2;
    const aimX = tx + Math.cos(perpAngle) * sideways;
    const aimY = ty + Math.sin(perpAngle) * sideways;

    const shootAngle = Math.atan2(aimY - sy, aimX - sx);
    const aimDist    = Math.hypot(aimX - sx, aimY - sy);
    const totalDist  = overshoot ? aimDist + 120 : aimDist;
    const duration   = 260 + totalDist * 0.16;

    const shots = weaponKey === 'schrotflinte' ? [-0.16, 0, 0.16] : [0];

    shots.forEach(offset => {
        const a = shootAngle + offset;
        GameState.projectiles.push({
            sx, sy,
            tx: sx + Math.cos(a) * totalDist,
            ty: sy + Math.sin(a) * totalDist,
            angle: a,
            startTime: performance.now(),
            duration,
            done: false,
        });
    });
}

// Führt einen Feind-Angriff aus. Berechnet Ergebnis VOR dem Geschoss-Spawn,
// damit Overshoot korrekt gesetzt werden kann.
// Gibt { type, text, dodged? } zurück.
function enemyExecuteAttack(enemy, tryDodge, weaponKey) {
    const p    = Entities.player;
    const wKey = weaponKey || enemy.waffe;
    const w    = WEAPONS[wKey];
    const verb = w.ammoKey ? 'schießt' : 'schlägt zu';
    const label = `${enemy.name} ${verb} (${w.name})`;

    // 1. Angriffswurf
    const atkRoll   = Math.floor(Math.random() * 100) + 1;
    const enemyHits = atkRoll <= enemy.angriff;

    // 2. Ausweich-Wurf (nur wenn Treffer + tryDodge)
    let dodgeRoll    = null;
    let dodgeSuccess = false;
    if (enemyHits && tryDodge) {
        dodgeRoll = Math.floor(Math.random() * 100) + 1;
        const effAus = Math.max(0, p.ausweichen + GameState.dodgeFacingMod);
        dodgeSuccess = dodgeRoll <= effAus;
    }

    // 3. Schuss-Animation: Overshoot + Seitwärts-Versatz je nach Ergebnis
    //    - Natürlicher Fehlschuss: schräg seitlich am Spieler vorbei (sideways ≠ 0)
    //    - Ausweichen: gerade durch Ursprungsposition (Spieler hat sich wegbewegt)
    //    - Treffer: gerade auf Spieler
    if (w.ammoKey) {
        enemy.ammo[w.ammoKey]--;
        const overshoot = !enemyHits || dodgeSuccess;
        const sideways  = !enemyHits ? (Math.random() < 0.5 ? 1 : -1) * 22 : 0;
        spawnProjectiles(enemy.x, enemy.y, p.x, p.y, wKey, overshoot, sideways);
    }

    // 4. Ergebnis berechnen
    if (!enemyHits) {
        return { type: 'miss', text: `${label} → Verfehlt! (${atkRoll} > ${enemy.angriff}%)` };
    }
    const dmg = rollDice(w.n, w.s);
    const effAus = Math.max(0, p.ausweichen + GameState.dodgeFacingMod);
    if (dodgeSuccess) {
        return { type: 'miss', dodged: true,
            text: `${label} → Ausgewichen! (${dodgeRoll} ≤ ${effAus}%) Kein Schaden.` };
    }
    if (tryDodge) {
        p.hp = Math.max(0, p.hp - dmg);
        return { type: 'hit',
            text: `${label} → Ausweichen fehlgeschlagen (${dodgeRoll} > ${effAus}%) – ${dmg} Schaden! Du: ${p.hp}/${p.maxHp} LP` };
    }
    p.hp = Math.max(0, p.hp - dmg);
    return { type: 'hit', text: `${label} → Treffer! ${dmg} Schaden (Du: ${p.hp}/${p.maxHp} LP)` };
}

// Führt Feind-Bewegung aus. Gibt Log-Objekt zurück.
function enemyExecuteMove(enemy) {
    const p = Entities.player;
    const dx = p.x - enemy.x, dy = p.y - enemy.y;
    const len = Math.sqrt(dx*dx+dy*dy);
    const nx = (dx/len)*FELD_PX, ny = (dy/len)*FELD_PX;
    const GS = FELD_PX;
    let moved = false;
    // X-Achse: Zielfeld prüfen (Wände + Charaktere)
    const txX = enemy.x + nx;
    const cX = Math.floor(txX / GS), rX = Math.floor(enemy.y / GS);
    if (!checkCollision(txX, enemy.y, enemy) && !cellOccupied(cX, rX, enemy)) {
        enemy.x = txX; moved = true;
    }
    // Y-Achse
    const txY = enemy.y + ny;
    const cY = Math.floor(enemy.x / GS), rY = Math.floor(txY / GS);
    if (!checkCollision(enemy.x, txY, enemy) && !cellOccupied(cY, rY, enemy)) {
        enemy.y = txY; moved = true;
    }
    // Auf Rasterfeld einrasten
    if (moved) {
        enemy.x = (Math.round((enemy.x - GS * 0.5) / GS) + 0.5) * GS;
        enemy.y = (Math.round((enemy.y - GS * 0.5) / GS) + 0.5) * GS;
    }
    // Distanz NACH dem Zug berechnen (eingerastete Position)
    const postDx = p.x - enemy.x, postDy = p.y - enemy.y;
    const feld = Math.round(Math.sqrt(postDx*postDx + postDy*postDy) / FELD_PX);
    return moved
        ? { type:'move', text:`${enemy.name} bewegt sich 1 Feld näher. (${feld} ${feld === 1 ? 'Feld' : 'Felder'} Abstand)` }
        : { type:'move', text:`${enemy.name} kann sich nicht bewegen.` };
}

// ── Zug-Verwaltung ────────────────────────────────────────────────────────────

// Zurücksetzen nach dem Feind-Zug (Lärm-Erinnerung vergessen).
function startEnemyTurnReset() {
    GameState.combatPlayerHeard = false; // Lärm wird nach Feind-Zug vergessen
}

// Startet den Spieler-Zug (AP auffüllen, Phase wechseln, Menü öffnen).
function startPlayerTurn() {
    GameState.combatPhase        = 'player';
    GameState.combatAP           = GameState.combatMaxAP;
    GameState.combatWeapon       = null;
    GameState.combatGridVisible  = true;
    GameState.combatMoving       = false;
    GameState.selectingDirection = false;
    GameState.postMoveRotation   = false;
    GameState.pendingNoiseMsg    = null;
    canvas.classList.remove('combat-move');
    openEncounterMenu();
}

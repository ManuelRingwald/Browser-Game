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

// Zeigt Tür-Dialog wenn Spieler eine geschlossene Tür berührt.
function checkDoorProximity() {
    const p = Entities.player;
    let nearAny = false;
    for (const door of GameState.doors) {
        if (door.open) continue;
        const cx = Math.max(door.x, Math.min(p.x, door.x + door.w));
        const cy = Math.max(door.y, Math.min(p.y, door.y + door.h));
        const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
        if (dist < p.radius + 4) {
            nearAny = true;
            if (!door.triggered) {
                door.triggered = true;
                GameState.paused = true;
                GameState.activeDoor = door;
                GameState.isTouching = false;
                document.getElementById('door-menu').style.display = 'flex';
                break;
            }
        }
    }
    if (!nearAny) {
        for (const door of GameState.doors) { if (!door.open) door.triggered = false; }
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
        player.angle = Math.atan2(moveY, moveX);
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
    GameState.enemySeen         = false;
    GameState.combatGridVisible  = false;
    GameState.combatMoving       = false;
    GameState.combatWeapon       = null;
    GameState.combatTarget       = null;
    GameState.combatTargets      = [];
    GameState.selectingDirection = false;
    GameState.postMoveRotation   = false;
    GameState.pendingNoiseMsg    = null;
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
        // Kampf vorbei wenn kein Kontakt mehr
        const anyContact = living.some(e =>
            canSee(Entities.player, e) || canSee(e, Entities.player));
        if (!anyContact) GameState.combatTriggered = false;
        return;
    }

    for (const enemy of living) {
        const pSees = canSee(Entities.player, enemy);
        const eSees = canSee(enemy, Entities.player);
        const dist  = Math.hypot(Entities.player.x - enemy.x, Entities.player.y - enemy.y);

        // Kampf erst auslösen wenn nah genug (Spieler sieht Gegner früher als Kampf beginnt)
        if ((pSees || eSees) && dist <= combatTriggerDist()) {
            GameState.paused = true;
            GameState.isTouching = false;
            GameState.combatTriggered = true;
            GameState.combatEnemyFirst = eSees;
            GameState.combatAmbush     = pSees && !eSees; // Hinterhalt: Spieler sieht, Gegner nicht
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
function enemyComputeAction(enemy) {
    const p = Entities.player;
    const w = WEAPONS[enemy.waffe];
    const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
    const ammoOk = !w.ammoKey || (enemy.ammo?.[w.ammoKey] ?? 0) > 0;
    const hasLOS = canSee(enemy, p);
    const canDetect = hasLOS || GameState.combatPlayerHeard; // LOS oder gehört
    // Fernkampf: mind. 1 freies Feld zwischen den Charakteren (> 1 Feld Abstand = ≥ 1.5×FELD_PX)
    const minDist = w.ammoKey ? FELD_PX * 1.5 : 0;
    if (dist <= w.range && dist >= minDist && ammoOk && canDetect) return { type:'attack', weapon:w };
    if (!hasLOS && !GameState.combatPlayerHeard) return { type:'chase' };
    return { type:'move' };
}

// Führt einen Feind-Angriff aus. tryDodge = Spieler versucht auszuweichen.
// Gibt ein Log-Objekt {type, text} zurück.
function enemyExecuteAttack(enemy, tryDodge) {
    const p = Entities.player;
    const w = WEAPONS[enemy.waffe];
    if (w.ammoKey) enemy.ammo[w.ammoKey]--;

    // Verb je nach Waffe
    const verb = w.ammoKey ? 'schießt' : 'schlägt zu';
    const label = `${enemy.name} ${verb} (${w.name})`;

    const atkRoll = Math.floor(Math.random()*100)+1;
    if (atkRoll <= enemy.angriff) {
        const dmg = rollDice(w.n, w.s);
        if (tryDodge) {
            const dr = Math.floor(Math.random()*100)+1;
            if (dr <= p.ausweichen) {
                return { type:'miss', text:`${label} → Ausgewichen! (${dr} ≤ ${p.ausweichen}%) Kein Schaden.` };
            }
            p.hp = Math.max(0, p.hp - dmg);
            return { type:'hit', text:`${label} → Ausweichen fehlgeschlagen (${dr} > ${p.ausweichen}%) – ${dmg} Schaden! Du: ${p.hp}/${p.maxHp} LP` };
        }
        p.hp = Math.max(0, p.hp - dmg);
        return { type:'hit', text:`${label} → Treffer! ${dmg} Schaden (Du: ${p.hp}/${p.maxHp} LP)` };
    }
    return { type:'miss', text:`${label} → Verfehlt! (${atkRoll} > ${enemy.angriff}%)` };
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
    const feld = Math.floor(len / FELD_PX);
    return moved
        ? { type:'move', text:`${enemy.name} bewegt sich 1 Feld näher. (${feld} Felder Abstand)` }
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

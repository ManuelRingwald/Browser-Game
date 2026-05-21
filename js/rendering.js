// =============================================================================
// rendering.js – Canvas-Zeichenfunktionen
// Ladeordnung: config.js → state.js → map.js → physics.js → animation.js
//              → combat.js → rendering.js
//
// Verantwortlich für:
//   - drawEntityScrap       (Spieler/NPC als Papierschnipsel + Bleistiftkreis)
//   - drawTargetLine        (wackelige Ziellinie + Fadenkreuz)
//   - drawCombatGrid        (Kampfraster + Bewegungshighlights, Screen-Space)
//   - drawDirectionArrows   (8 Richtungspfeile um den Spieler)
//   - handleDirectionSelection (Klick/Tap während Richtungswahl)
//   - handleGridClick       (Klick auf Kampfraster)
//   - getCardinalDir        (Himmelsrichtung als String)
//   - drawPlayerHUD         (HP-Ring + AP-Punkte am Spieler)
//   - drawEnemyHUD          (HP-Ring + Name über Gegner)
//   - drawGame              (Haupt-Render-Funktion, ruft alles zusammen)
//
// Globale Abhängigkeiten: ctx, canvas, GameState, Entities, FELD_PX, AP_KOSTEN,
//   SCRAP_VERTS, CIRCLE_VERTS, NPC_SCRAP_VERTS, NPC_CIRCLE_VERTS, DIR_ANGLES,
//   Anim, wallCanvas, exploredCanvas, exploredCtx,
//   getObstacles, computeVisibilityPolygon, canSee, hasLOS,
//   cellOccupied, gridPathClear, getMovePath (physics.js),
//   updateCamera (game.js), openEncounterMenu, enterMoveGridMode (ui.js)
// =============================================================================

// ── Entitäts-Rendering ────────────────────────────────────────────────────────

// Zeichnet eine Entität (Spieler oder NPC) als Papierschnipsel mit Bleistiftkreis.
function drawEntityScrap(ctx, entity, scrapVerts, circleVerts, circleColor) {
    ctx.save();
    ctx.translate(entity.x, entity.y);

    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur  = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = '#f3edd6';
    ctx.beginPath();
    ctx.moveTo(scrapVerts[0][0], scrapVerts[0][1]);
    for (let i = 1; i < scrapVerts.length; i++) ctx.lineTo(scrapVerts[i][0], scrapVerts[i][1]);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(90, 65, 40, 0.45)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.strokeStyle = circleColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(circleVerts[0][0], circleVerts[0][1]);
    for (let i = 1; i < circleVerts.length; i++) ctx.lineTo(circleVerts[i][0], circleVerts[i][1]);
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(entity.angle) * 9, Math.sin(entity.angle) * 9);
    ctx.stroke();

    ctx.restore();
}

// ── Kampf-UI-Zeichenfunktionen ────────────────────────────────────────────────

// Zeichnet eine wackelige Bleistift-Ziellinie vom Spieler zum angewählten Ziel.
function drawTargetLine(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 5) return;
    const nx = -dy/len, ny = dx/len;
    const steps = Math.max(4, Math.floor(len / 14));

    ctx.save();
    ctx.strokeStyle = 'rgba(175, 35, 35, 0.60)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const w = Math.sin(t * Math.PI * 5) * 2.2;   // Sinus-Wobble, kein Flackern
        ctx.lineTo(x1 + dx*t + nx*w, y1 + dy*t + ny*w);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Fadenkreuz am Ziel
    const cs = 9;
    ctx.strokeStyle = 'rgba(175, 35, 35, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x2 - cs, y2); ctx.lineTo(x2 + cs, y2);
    ctx.moveTo(x2, y2 - cs); ctx.lineTo(x2, y2 + cs);
    ctx.stroke();

    ctx.restore();
}

// Zeichnet das Kampfraster und Bewegungshighlights in Screen-Space
// (garantiert volle Canvas-Abdeckung, kein Kamera-Transform nötig).
// Weltkoord → Screen: sx = (wx - cam.x) * zoom
function drawCombatGrid() {
    if (!GameState.combatGridVisible) return;

    const GS   = FELD_PX;
    const zoom = GameState.zoom;
    const cam  = GameState.camera;
    const GSs  = GS * zoom;          // Zellgröße in Screen-Pixeln
    const W    = canvas.width;
    const H    = canvas.height;

    // Hilfsfunktion: Weltkoord → Screen
    const wx2s = wx => (wx - cam.x) * zoom;
    const wy2s = wy => (wy - cam.y) * zoom;

    ctx.save();

    // ── Gitterlinien (Screen-Space, deckt immer den ganzen Canvas ab) ──
    const offX = (GS - (cam.x % GS)) % GS * zoom;   // ≥ 0, < GSs
    const offY = (GS - (cam.y % GS)) % GS * zoom;

    ctx.strokeStyle = 'rgba(65, 45, 22, 0.40)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 5]);

    for (let sx = offX; sx <= W + GSs; sx += GSs) {
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    for (let sy = offY; sy <= H + GSs; sy += GSs) {
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── Bewegungshighlights (Screen-Space) ────────────────────────────
    if (GameState.combatMoving) {
        const p    = Entities.player;
        const pCol = Math.floor(p.x / GS);
        const pRow = Math.floor(p.y / GS);
        const maxD = Math.floor(GameState.combatAP / AP_KOSTEN.bewegen);

        // Sichtbarer Zell-Bereich
        const c0 = Math.floor(cam.x / GS) - 1;
        const r0 = Math.floor(cam.y / GS) - 1;
        const c1 = Math.ceil((cam.x + W / zoom) / GS) + 1;
        const r1 = Math.ceil((cam.y + H / zoom) / GS) + 1;

        for (let c = c0; c <= c1; c++) {
            for (let r = r0; r <= r1; r++) {
                const wx = (c + 0.5) * GS, wy = (r + 0.5) * GS;
                if (checkCollision(wx, wy, { radius: GS * 0.35 })) continue;

                const dist = Math.abs(c - pCol) + Math.abs(r - pRow);
                // 1. FOV-Winkelfilter
                if (dist > 0) {
                    let diff = Math.atan2(wy - p.y, wx - p.x) - p.angle;
                    while (diff >  Math.PI) diff -= 2*Math.PI;
                    while (diff < -Math.PI) diff += 2*Math.PI;
                    if (Math.abs(diff) > p.fov/2 + 0.08) continue;
                }
                // 2. Sichtlinien-Check: kein Feld hinter Wänden/Türen
                if (dist > 0 && !hasLOS(p.x, p.y, wx, wy)) continue;

                const sx = wx2s(c * GS), sy = wy2s(r * GS);
                const occupied = dist > 0 && cellOccupied(c, r, Entities.player);
                const reachable = dist > 0 && !occupied && dist <= maxD && gridPathClear(pCol, pRow, c, r);

                if (dist === 0)       ctx.fillStyle = 'rgba(50,100,220,0.50)';
                else if (occupied)    ctx.fillStyle = 'rgba(180,40,40,0.50)';
                else if (reachable)   ctx.fillStyle = 'rgba(40,180,60,0.45)';
                else                  ctx.fillStyle = 'rgba(180,40,40,0.25)';
                ctx.fillRect(sx, sy, GSs, GSs);

                // Pfad-Highlight
                if (reachable && GameState.hoverGridCell) {
                    const { col: hc, row: hr } = GameState.hoverGridCell;
                    const path = getMovePath(pCol, pRow, hc, hr);
                    if (path.some(([pc,pr]) => pc === c && pr === r)) {
                        ctx.fillStyle = 'rgba(240,190,30,0.60)'; ctx.fillRect(sx, sy, GSs, GSs);
                    }
                    if (c === hc && r === hr) {
                        ctx.fillStyle = 'rgba(240,190,30,0.80)'; ctx.fillRect(sx, sy, GSs, GSs);
                    }
                }

                // AP-Kosten
                if (reachable) {
                    ctx.save();
                    ctx.font = `bold ${Math.round(GSs * 0.28)}px 'Kalam'`;
                    ctx.fillStyle = 'rgba(12,60,12,0.90)';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(dist, sx + GSs/2, sy + GSs/2);
                    ctx.restore();
                }
            }
        }
    }

    // ── Gegner-Reichweiten-Highlight bei Waffenwahl ────────────────────
    if (GameState.combatWeapon) {
        const w = WEAPONS[GameState.combatWeapon];
        const p = Entities.player;
        (GameState.combatTargets || []).filter(e => !e.isDead).forEach(enemy => {
            const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
            const inRange = dist <= w.range;
            const ringR = (enemy.radius + 12) * zoom;
            const sex = wx2s(enemy.x), sey = wy2s(enemy.y);
            ctx.save();
            ctx.strokeStyle = inRange ? 'rgba(40,180,60,0.80)' : 'rgba(180,40,40,0.45)';
            ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(sex, sey, ringR, 0, Math.PI*2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = `bold ${Math.round(18*zoom)}px 'Kalam'`;
            ctx.textAlign = 'center';
            ctx.fillStyle = inRange ? 'rgba(40,180,60,0.90)' : 'rgba(180,40,40,0.70)';
            const fd = Math.floor(dist / FELD_PX);
            ctx.fillText(inRange ? `✓ ${enemy.name} (${fd} F)` : `✗ ${enemy.name} (${fd} F)`,
                sex, sey - ringR - 3);
            ctx.restore();
        });
    }

    ctx.restore();
}

// ── Richtungswahl nach Bewegung ───────────────────────────────────────────────

// Zeichnet 8 Richtungspfeile um den Spieler. hoverIdx = 0-7 für gehoverter Pfeil.
function drawDirectionArrows(player, hoverIdx = null) {
    const r = FELD_PX * 0.82;
    const defs = [
        { a: -Math.PI/2,   lbl:'↑' },  // ↑ Nord
        { a: -Math.PI/4,   lbl:'↗' },  // ↗ Nordost
        { a:  0,           lbl:'→' },  // → Ost
        { a:  Math.PI/4,   lbl:'↘' },  // ↘ Südost
        { a:  Math.PI/2,   lbl:'↓' },  // ↓ Süd
        { a:  3*Math.PI/4, lbl:'↙' },  // ↙ Südwest
        { a:  Math.PI,     lbl:'←' },  // ← West
        { a: -3*Math.PI/4, lbl:'↖' },  // ↖ Nordwest
    ];
    const sz = Math.max(7, Math.round(FELD_PX * 0.14));

    defs.forEach(({ a, lbl }, idx) => {
        const ax = player.x + Math.cos(a) * r;
        const ay = player.y + Math.sin(a) * r;

        const isHovered = idx === hoverIdx;
        let diff = ((a - player.angle) % (Math.PI*2) + Math.PI*3) % (Math.PI*2) - Math.PI;
        const isCurrent = Math.abs(diff) < Math.PI/8;

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a + Math.PI/2); // Pfeil zeigt nach außen

        const scale = isHovered ? 1.45 : 1.0;
        ctx.fillStyle   = isHovered ? 'rgba(220,170,20,0.95)'
                        : isCurrent ? 'rgba(35,120,35,0.88)' : 'rgba(48,36,20,0.70)';
        ctx.strokeStyle = isHovered ? 'rgba(255,240,160,0.95)' : 'rgba(235,225,200,0.82)';
        ctx.lineWidth   = isHovered ? 1.4 : 0.9; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -sz*scale);
        ctx.lineTo(-sz*0.55*scale,  sz*0.42*scale);
        ctx.lineTo(0,               sz*0.08*scale);
        ctx.lineTo( sz*0.55*scale,  sz*0.42*scale);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // Beschriftung
        ctx.save();
        ctx.font = `bold ${Math.max(16, Math.round(FELD_PX * 0.32))}px 'Kalam'`;
        ctx.fillStyle   = isHovered ? 'rgba(200,140,10,0.98)'
                        : isCurrent ? 'rgba(25,100,25,0.95)' : 'rgba(48,36,20,0.62)';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, ax, ay + sz + 5);
        ctx.restore();
    });

    // Hinweis
    ctx.save();
    const hintText = GameState.postMoveRotation
        ? 'Blickrichtung wählen — kein AP'
        : 'Bewegungsrichtung wählen';
    ctx.font = `bold 18px 'Kalam'`;
    ctx.fillStyle = 'rgba(40,30,15,0.68)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(hintText, player.x, player.y - r - 5);
    ctx.restore();
}

// Verarbeitet Klick/Tap während Richtungswahl (vor ODER nach Bewegung).
function handleDirectionSelection(worldX, worldY) {
    if (!GameState.selectingDirection || Anim.running) return;
    const p = Entities.player;
    const dx = worldX - p.x, dy = worldY - p.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    GameState.selectingDirection = false;

    let targetAngle = p.angle;
    if (dist >= FELD_PX * 0.25) {
        const raw = Math.atan2(dy, dx);
        targetAngle = Math.round(raw / (Math.PI/4)) * (Math.PI/4);
    }

    const startAngle = p.angle;
    let delta = targetAngle - startAngle;
    while (delta >  Math.PI) delta -= Math.PI*2;
    while (delta < -Math.PI) delta += Math.PI*2;

    const afterRotation = () => {
        if (GameState.postMoveRotation) {
            // Nachher-Drehung: zurück zum Kampfmenü
            GameState.postMoveRotation = false;
            openEncounterMenu();
            if (GameState.pendingNoiseMsg) {
                document.getElementById('enc-desc').textContent = GameState.pendingNoiseMsg;
                GameState.pendingNoiseMsg = null;
            }
        } else {
            // Vorher-Drehung: Bewegungsraster anzeigen
            enterMoveGridMode(); // in ui.js definiert
        }
    };

    if (Math.abs(delta) > 0.05) {
        Anim.push({
            duration: 180,
            onUpdate(_, e) { p.angle = startAngle + delta * e; },
            onComplete: afterRotation,
        });
    } else {
        p.angle = targetAngle;
        afterRotation();
    }
}

// Verarbeitet einen Klick auf das Kampfraster (Weltkoordinaten).
function handleGridClick(worldX, worldY) {
    if (!GameState.combatMoving || Anim.running) return;
    const p = Entities.player;

    // Richtungspfeil angeklickt? → drehen (kein AP)
    const arrowR = FELD_PX * 0.82;
    for (const a of DIR_ANGLES) {
        const ax = p.x + Math.cos(a) * arrowR;
        const ay = p.y + Math.sin(a) * arrowR;
        if (Math.hypot(worldX - ax, worldY - ay) < FELD_PX * 0.4) {
            const s = p.angle;
            let delta = a - s;
            while (delta >  Math.PI) delta -= Math.PI*2;
            while (delta < -Math.PI) delta += Math.PI*2;
            if (Math.abs(delta) > 0.05) {
                Anim.push({ duration:150, onUpdate(_, e){ p.angle = s + delta * e; } });
            } else { p.angle = a; }
            return;
        }
    }

    const GS   = FELD_PX;
    const pCol = Math.floor(p.x / GS);
    const pRow = Math.floor(p.y / GS);
    const col  = Math.floor(worldX / GS);
    const row  = Math.floor(worldY / GS);
    const dist = Math.abs(col - pCol) + Math.abs(row - pRow);

    if (dist === 0) { cancelMove(); return; }

    const apCost = dist * AP_KOSTEN.bewegen;
    if (apCost > GameState.combatAP) return;

    const cx = (col + 0.5) * GS, cy = (row + 0.5) * GS;

    // FOV + LOS: nur sichtbare Felder anklickbar
    {
        const dx2 = cx - p.x, dy2 = cy - p.y;
        let diff = Math.atan2(dy2, dx2) - p.angle;
        while (diff >  Math.PI) diff -= 2*Math.PI;
        while (diff < -Math.PI) diff += 2*Math.PI;
        if (Math.abs(diff) > p.fov/2 + 0.08) return;  // außerhalb Sichtkegel
        if (!hasLOS(p.x, p.y, cx, cy)) return;        // Wand blockiert Sicht
    }

    if (checkCollision(cx, cy, { radius: GS * 0.35 })) return;  // Zielzelle Wand
    if (!gridPathClear(pCol, pRow, col, row)) return;            // Weg durch Wand
    if (cellOccupied(col, row, Entities.player)) return;         // Feld durch Charakter belegt

    // AP sofort abziehen, Modus beenden
    GameState.combatAP -= apCost;
    GameState.combatMoving = false;
    canvas.classList.remove('combat-move');

    // Animiert bewegen → danach Nachher-Drehung (postMoveRotation, kein AP)
    animatePlayerMove(cx, cy, () => {
        GameState.pendingNoiseMsg  = combatNoiseCheck();
        GameState.postMoveRotation = true;
        GameState.selectingDirection = true;
    });
}

// Himmelsrichtung vom Ausgangspunkt zum Zielfeld (Deutsch, 8 Richtungen).
function getCardinalDir(fromCol, fromRow, toCol, toRow) {
    const dx = toCol - fromCol, dy = toRow - fromRow;
    if (dx === 0 && dy === 0) return '';
    const deg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    // Canvas: y↓=Süd, y↑=Nord
    return ['O','SO','S','SW','W','NW','N','NO'][Math.round(deg / 45) % 8];
}

// ── HUD-Elemente ──────────────────────────────────────────────────────────────

// HP-Ring + AP-Punkte direkt am Spieler-Charakter – nur während aktivem Kampf.
function drawPlayerHUD(p) {
    if (!GameState.combatTriggered) return;
    const frac  = Math.max(0, p.hp / p.maxHp);
    const ringR = p.radius + 7;
    const col   = frac > 0.5  ? 'rgba(45,160,45,0.90)'
                : frac > 0.25 ? 'rgba(200,145,25,0.90)'
                :                'rgba(180,35,35,0.90)';

    ctx.save();

    // Hintergrundring
    ctx.strokeStyle = 'rgba(30,20,10,0.32)';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, ringR, 0, Math.PI*2); ctx.stroke();

    // HP-Bogen
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(p.x, p.y, ringR, -Math.PI/2, -Math.PI/2 + frac*Math.PI*2);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // HP-Zahl  (Zielgröße ~16px effektiv → 16/0.70 ≈ 23px in Weltkoords)
    ctx.font = "bold 22px 'Kalam'";
    ctx.fillStyle = col;
    ctx.fillText(`${p.hp}/${p.maxHp}`, p.x, p.y - ringR - 5);

    // AP-Punkte (nur während Kampf)
    if (GameState.combatGridVisible) {
        const dots = '●'.repeat(GameState.combatAP) + '○'.repeat(GameState.combatMaxAP - GameState.combatAP);
        ctx.font = "bold 18px 'Kalam'";
        ctx.fillStyle = 'rgba(60, 120, 220, 0.90)';
        ctx.fillText(`AP ${dots}`, p.x, p.y - ringR - 28);
    }

    ctx.restore();
}

// Zeichnet HP-Ring + Name/HP-Text über einem Gegner (in Weltkoordinaten).
function drawEnemyHUD(enemy) {
    const { x, y, hp, maxHp, radius, name } = enemy;
    const frac    = Math.max(0, hp / maxHp);
    const ignored = enemy.ignoreUntil && performance.now() < enemy.ignoreUntil;
    const ringR   = radius + 7;
    const col = ignored
        ? 'rgba(160,160,160,0.55)'
        : frac > 0.5 ? 'rgba(45,160,45,0.88)'
        : frac > 0.2 ? 'rgba(200,145,25,0.88)'
        :               'rgba(180,35,35,0.88)';

    // Hintergrundring (grau)
    ctx.save();
    ctx.strokeStyle = 'rgba(30,20,10,0.35)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // HP-Bogen
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Name + HP (oder "ignoriert") über dem Ring  (~16px effektiv → 22px)
    ctx.save();
    ctx.font = "bold 20px 'Kalam'";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = col;
    const label = ignored ? `${name}  [flüchtet…]` : `${name}  ${hp}/${maxHp}`;
    ctx.fillText(label, x, y - ringR - 3);
    ctx.restore();
}

// ── Haupt-Render-Funktion ─────────────────────────────────────────────────────

function drawGame() {
    updateCamera();
    const cam    = GameState.camera;
    const player = Entities.player;

    // Sichtbereich aktualisieren: normal während Spiel, auch nach Kampf-Bewegung
    const shouldUpdateFOW = !GameState.paused || GameState.selectingDirection;
    if (shouldUpdateFOW) {
        const obstacles = getObstacles();
        const { pts } = computeVisibilityPolygon(
            player.x, player.y, player.angle, player.fov, player.viewDistance, obstacles
        );
        exploredCtx.fillStyle = 'black';
        if (pts.length >= 2) {
            exploredCtx.beginPath();
            exploredCtx.moveTo(player.x, player.y);
            for (const [, x, y] of pts) exploredCtx.lineTo(x, y);
            exploredCtx.closePath();
            exploredCtx.fill();
        }
    }

    // Welt-Canvas mit Zoom auf Viewport zeichnen
    const zoom = GameState.zoom;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoom, zoom);   // Zoom anwenden – kleinere Darstellung, mehr Karte sichtbar
    ctx.drawImage(exploredCanvas, -cam.x, -cam.y);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(wallCanvas, -cam.x, -cam.y);
    ctx.globalCompositeOperation = 'source-over';

    // Alle Weltobjekte mit Kamera-Offset zeichnen
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // Animations-Queue vorwärtsschieben
    Anim.update(performance.now());

    // Sichtkegel Spieler: zwei Linien + Halbkreisbogen (Bleistift-Stil)
    ctx.save();
    ctx.strokeStyle = 'rgba(65, 55, 40, 0.30)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    // Linke Kante
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.angle - player.fov/2) * player.viewDistance,
               player.y + Math.sin(player.angle - player.fov/2) * player.viewDistance);
    // Rechte Kante
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.angle + player.fov/2) * player.viewDistance,
               player.y + Math.sin(player.angle + player.fov/2) * player.viewDistance);
    ctx.stroke();
    // Halbkreisbogen am Ende des Kegels
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.viewDistance,
            player.angle - player.fov/2, player.angle + player.fov/2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Alle lebenden Gegner zeichnen
    Entities.enemies.forEach(enemy => {
        if (enemy.isDead) return;
        const pSees = canSee(player, enemy);
        const eSees = canSee(enemy, player);
        if (!pSees && !eSees) return;

        if (pSees) {
            // Im Spieler-FOV clipping zeichnen
            ctx.save();
            ctx.beginPath(); ctx.moveTo(player.x, player.y);
            ctx.arc(player.x, player.y, player.viewDistance, player.angle - player.fov/2, player.angle + player.fov/2);
            ctx.closePath(); ctx.clip();
            // Sichtkegel Feind: zwei Linien + Bogen (gleicher Bleistift-Stil, rot)
            ctx.strokeStyle = 'rgba(200,50,50,0.30)'; ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(enemy.x, enemy.y);
            ctx.lineTo(enemy.x + Math.cos(enemy.angle - enemy.fov/2)*enemy.viewDistance,
                       enemy.y + Math.sin(enemy.angle - enemy.fov/2)*enemy.viewDistance);
            ctx.moveTo(enemy.x, enemy.y);
            ctx.lineTo(enemy.x + Math.cos(enemy.angle + enemy.fov/2)*enemy.viewDistance,
                       enemy.y + Math.sin(enemy.angle + enemy.fov/2)*enemy.viewDistance);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.viewDistance,
                    enemy.angle - enemy.fov/2, enemy.angle + enemy.fov/2);
            ctx.stroke();
            ctx.setLineDash([]);
            drawEntityScrap(ctx, enemy, NPC_SCRAP_VERTS, NPC_CIRCLE_VERTS, 'rgba(140,35,35,0.90)');
            ctx.restore();
            // HP-Ring + Name (außerhalb clip)
            drawEnemyHUD(enemy);
        } else {
            // Nur "tap..." wenn Feind nahe aber unsichtbar
            const dx = enemy.x - player.x, dy = enemy.y - player.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist <= player.viewDistance * 2) {
                const aE = Math.atan2(dy, dx);
                const tr = Math.min(dist - 15, player.viewDistance * 0.85);
                const pulse = 0.3 + 0.7 * Math.abs(Math.sin(Date.now() / 400));
                ctx.save();
                ctx.font = "700 21px 'Kalam'";
                ctx.fillStyle = `rgba(180,50,50,${pulse})`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.translate(player.x + Math.cos(aE)*tr, player.y + Math.sin(aE)*tr);
                ctx.rotate(Math.sin(Date.now() / 200) * 0.05);
                ctx.fillText('tap... tap...', 0, 0);
                ctx.restore();
            }
        }
    });

    // Ziellinie anzeigen (Schritt 1 der 2-Schritt-Auswahl)
    if (GameState.combatWeapon && GameState.combatTarget && !GameState.combatTarget.isDead) {
        const t = GameState.combatTarget;
        drawTargetLine(player.x, player.y, t.x, t.y);
    }

    // Spieler als Papierschnipsel + HP/AP-Ring
    drawEntityScrap(ctx, player, SCRAP_VERTS, CIRCLE_VERTS, 'rgba(35, 30, 25, 0.88)');
    drawPlayerHUD(player);

    // Richtungspfeile: bei Richtungswahl UND bei Bewegungsraster (zum Drehen)
    if (GameState.selectingDirection || GameState.combatMoving) {
        drawDirectionArrows(player, GameState.hoverDirIdx);
    }

    ctx.restore(); // Kamera-Transform beenden
    ctx.restore(); // Zoom beenden

    // ── Kampfraster als UI-Overlay (Screen-Space, keine Transform-Abhängigkeit) ──
    if (GameState.combatGridVisible) {
        drawCombatGrid();
    }

    // ── HUD oben links (Bildschirmkoordinaten, kein Zoom) ─────────────────────
    const p = Entities.player;
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    const bx = 10, by = 56, bw = 100, bh = 9;  // tiefer: Platz für Icon-Button oben
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(30,20,10,0.25)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = hpFrac > 0.5  ? 'rgba(55,130,50,0.90)'
                  : hpFrac > 0.25 ? 'rgba(195,135,25,0.90)'
                  :                  'rgba(160,35,35,0.90)';
    ctx.fillRect(bx, by, bw * hpFrac, bh);
    ctx.strokeStyle = 'rgba(40,28,16,0.40)'; ctx.lineWidth = 0.8;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.font = "700 13px 'Kalam'"; ctx.fillStyle = 'rgba(40,28,16,0.80)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`LP  ${p.hp} / ${p.maxHp}`, bx, by - 2);
    ctx.textBaseline = 'top';
    ctx.fillText(`Pistole: ${p.ammo.pistole}  Schrot: ${p.ammo.schrotflinte}`, bx, by + bh + 3);
    ctx.restore();
}

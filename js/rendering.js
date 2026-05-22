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

                const dist = Math.max(Math.abs(c - pCol), Math.abs(r - pRow)); // Chebyshev
                // Nur Wand-LOS prüfen – kein FOV-Winkelfilter mehr (Chebyshev erlaubt alle 8 Richtungen)
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
    const dist = Math.max(Math.abs(col - pCol), Math.abs(row - pRow)); // Chebyshev

    if (dist === 0) { cancelMove(); return; }

    const apCost = dist * AP_KOSTEN.bewegen;
    if (apCost > GameState.combatAP) return;

    const cx = (col + 0.5) * GS, cy = (row + 0.5) * GS;

    // Nur Wand-LOS prüfen – kein FOV-Winkelfilter (Chebyshev: alle 8 Richtungen erlaubt)
    if (!hasLOS(p.x, p.y, cx, cy)) return;

    if (checkCollision(cx, cy, { radius: GS * 0.35 })) return;  // Zielzelle Wand
    if (!gridPathClear(pCol, pRow, col, row)) return;            // Weg durch Wand
    if (cellOccupied(col, row, Entities.player)) return;         // Feld durch Charakter belegt

    // AP sofort abziehen, Modus beenden, Menü sofort mit neuem AP-Stand aktualisieren
    GameState.combatAP -= apCost;
    GameState.combatMoving = false;
    canvas.classList.remove('combat-move');
    openEncounterMenu(); // Button-States sofort auf aktuellen AP-Stand bringen

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

    // AP-Punkte (nur während aktivem Kampf, Feind-Zug)
    if (GameState.combatTriggered && GameState.combatPhase === 'enemy') {
        const curAP = enemy.currentAP ?? 0;
        const mxAP  = enemy.maxAP    ?? 4;
        const dots  = '●'.repeat(Math.max(0, curAP)) + '○'.repeat(Math.max(0, mxAP - curAP));
        ctx.font = "bold 16px 'Kalam'";
        ctx.fillStyle = 'rgba(190,80,80,0.90)';
        ctx.fillText(`AP ${dots}`, x, y - ringR - 25);
    }

    ctx.restore();
}

// ── Weltgegenstände: Marker + Hover (World-Space) ────────────────────────────

const _imgCache = {};
function _loadImg(src) {
    if (!_imgCache[src]) { const i = new Image(); i.src = src; _imgCache[src] = i; }
    return _imgCache[src];
}

function drawWorldItems() {
    const now = performance.now();
    const p   = Entities.player;

    GameState.worldItems.forEach(item => {
        const isHovered = GameState.hoveredWorldItem === item;
        const near      = Math.hypot(p.x - item.x, p.y - item.y) <= FELD_PX * 1.5;
        const pulse     = 0.55 + 0.45 * Math.abs(Math.sin(now / 500));

        // ── Glüh-Ring ─────────────────────────────────────────────────────
        const ringR = 13 + (isHovered ? 3 : 0);
        ctx.save();
        ctx.beginPath();
        ctx.arc(item.x, item.y, ringR + 3, 0, Math.PI * 2);
        ctx.fillStyle = isHovered
            ? `rgba(255,220,80,${0.18 + pulse * 0.14})`
            : `rgba(220,180,60,${0.10 + pulse * 0.08})`;
        ctx.fill();

        // ── Papierkreis-Hintergrund ────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(item.x, item.y, ringR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(235,220,190,0.92)';
        ctx.fill();
        ctx.strokeStyle = isHovered
            ? `rgba(200,160,30,${0.80 + pulse * 0.18})`
            : `rgba(140,100,40,0.55)`;
        ctx.lineWidth = isHovered ? 2.0 : 1.2;
        ctx.stroke();
        ctx.restore();

        // ── Item-Bild ──────────────────────────────────────────────────────
        ctx.save();
        const img = _loadImg(item.img);
        if (img.complete) {
            const s = ringR * 1.3;
            ctx.drawImage(img, item.x - s / 2, item.y - s / 2, s, s);
        }
        ctx.restore();

        // ── Proximity-Badge (analog zu Türen) ─────────────────────────────
        if (near && !isHovered) {
            _drawItemBadge(item, 'Aufheben', 0.55 + pulse * 0.35);
        }
        if (isHovered) {
            const label = near ? 'Aufheben' : 'Zu weit';
            const alpha = near ? 0.85 + pulse * 0.12 : 0.45 + pulse * 0.15;
            ctx.save();
            ctx.setLineDash([5, 3]);
            ctx.strokeStyle = near
                ? `rgba(220,190,40,${alpha})`
                : `rgba(160,145,100,${alpha * 0.7})`;
            ctx.lineWidth = near ? 2.0 : 1.4;
            ctx.beginPath(); ctx.arc(item.x, item.y, ringR + 5, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            _drawItemBadge(item, label, alpha);
            if (!near && GameState.worldItemTarget === item) {
                _drawItemBadge(item, '↵ läuft hin…', 0.5, 16);
            }
        }
    });
}

function _drawItemBadge(item, label, alpha, extraY = 0) {
    ctx.save();
    ctx.font = "bold 13px 'Kalam'";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    const bx = item.x - tw / 2 - 6, by = item.y - 28 - extraY;
    const bw = tw + 12, bh = 18;
    ctx.fillStyle = `rgba(220,195,80,${alpha * 0.85})`;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill();
    ctx.fillStyle = `rgba(40,28,8,${alpha})`;
    ctx.fillText(label, item.x, by + bh / 2);
    ctx.fillStyle = `rgba(220,195,80,${alpha * 0.85})`;
    ctx.beginPath();
    ctx.moveTo(item.x - 5, by + bh); ctx.lineTo(item.x + 5, by + bh);
    ctx.lineTo(item.x, by + bh + 6); ctx.closePath(); ctx.fill();
    ctx.restore();
}

// ── Visuelle Tür-Geräusch-Texte (analog zu "tap... tap...") ─────────────────
function drawDoorSounds() {
    const now = performance.now();
    GameState.doorSounds = GameState.doorSounds.filter(s => now - s.startTime < s.duration);

    GameState.doorSounds.forEach(s => {
        const raw  = (now - s.startTime) / s.duration;  // 0→1
        // Einblenden schnell (0–15%), halten, dann ausblenden (80–100%)
        let alpha;
        if      (raw < 0.15) alpha = raw / 0.15;
        else if (raw < 0.80) alpha = 1;
        else                 alpha = 1 - (raw - 0.80) / 0.20;

        // Leichtes Schweben nach oben während des Fade-outs
        const yOff = -raw * 18;

        const wobble = Math.sin(now / 160 + s.x) * 0.06;

        ctx.save();
        ctx.translate(s.x, s.y + yOff);
        ctx.rotate(wobble);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Knarzen: dunkles Braun, schräge Schrift, größer
        // Klonk: etwas kleiner, mehr Nachdruck
        if (s.opening) {
            ctx.font = "italic 700 20px 'Kalam'";
            ctx.fillStyle = `rgba(90,58,22,${alpha * 0.88})`;
        } else {
            ctx.font = "700 18px 'Kalam'";
            ctx.fillStyle = `rgba(60,40,15,${alpha * 0.82})`;
        }

        // Leichter Schatten für Lesbarkeit
        ctx.shadowColor = `rgba(240,225,190,${alpha * 0.6})`;
        ctx.shadowBlur  = 4;
        ctx.fillText(s.text, 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
    });
}

// ── Tür-Hover-Highlight + Mobile-Proximity-Indikator (World-Space) ───────────
function drawDoorHighlight() {
    if (GameState.combatTriggered) return;
    const p     = Entities.player;
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 320));
    const EXP   = 5;

    GameState.doors.forEach(door => {
        const r    = getDoorInteractRect(door);
        const rcx  = r.x + r.w / 2;
        const rcy  = r.y + r.h / 2;
        const near = playerNearDoor(p, door);

        const isHovered = GameState.hoveredDoor === door;
        // Mobile: Indikator zeigen wenn nah (kein hover nötig) – auf Desktop ersetzt hover es
        const showIndicator = near && !isHovered;

        // ── Hover-Highlight (Desktop) ──────────────────────────────────────
        if (isHovered) {
            ctx.save();
            ctx.setLineDash([5, 3]);
            if (near) {
                ctx.fillStyle   = `rgba(220,190,60,${0.18 + pulse * 0.12})`;
                ctx.strokeStyle = `rgba(230,200,70,${0.65 + pulse * 0.25})`;
                ctx.lineWidth   = 2.2;
            } else {
                ctx.fillStyle   = `rgba(160,148,110,${0.10 + pulse * 0.07})`;
                ctx.strokeStyle = `rgba(170,158,118,${0.38 + pulse * 0.12})`;
                ctx.lineWidth   = 1.5;
            }
            ctx.beginPath();
            ctx.rect(r.x - EXP, r.y - EXP, r.w + EXP * 2, r.h + EXP * 2);
            ctx.fill(); ctx.stroke();
            ctx.setLineDash([]);

            const label  = near ? (door.open ? 'Schließen' : 'Öffnen') : 'Zu weit';
            const labelY = r.y - EXP - 10;
            ctx.font        = "bold 15px 'Kalam'";
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle   = near
                ? `rgba(50,38,8,${0.80 + pulse * 0.15})`
                : 'rgba(90,80,55,0.50)';
            ctx.fillText(label, rcx, labelY);
            if (!near && GameState.doorTarget === door) {
                ctx.fillStyle = 'rgba(90,140,90,0.75)';
                ctx.font      = "14px 'Kalam'";
                ctx.fillText('↵ läuft hin…', rcx, labelY - 16);
            }
            ctx.restore();
        }

        // ── Proximity-Indikator (Mobile + Desktop ohne Hover) ─────────────
        // Kleines pulsierendes Icon direkt am Türblatt / Türrahmen
        if (showIndicator || (!isHovered && GameState.doorTarget === door)) {
            const label = door.open ? 'Schließen' : 'Öffnen';
            const alpha = showIndicator ? 0.55 + pulse * 0.35 : 0.40 + pulse * 0.20;
            // Kleines Pill/Badge über der Türmitte
            ctx.save();
            ctx.font        = "bold 13px 'Kalam'";
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            const textW = ctx.measureText(label).width;
            const bx = rcx - textW / 2 - 6;
            const by = r.y - 22;
            const bw = textW + 12;
            const bh = 18;
            // Badge-Hintergrund
            ctx.fillStyle = near
                ? `rgba(200,170,40,${alpha * 0.85})`
                : `rgba(120,110,80,${alpha * 0.6})`;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 5);
            ctx.fill();
            // Badge-Text
            ctx.fillStyle = `rgba(40,28,8,${alpha})`;
            ctx.fillText(label, rcx, by + bh / 2);
            // Kleiner Pfeil nach unten (zeigt auf Tür)
            ctx.fillStyle = near
                ? `rgba(200,170,40,${alpha * 0.85})`
                : `rgba(120,110,80,${alpha * 0.6})`;
            ctx.beginPath();
            ctx.moveTo(rcx - 5, by + bh);
            ctx.lineTo(rcx + 5, by + bh);
            ctx.lineTo(rcx,     by + bh + 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    });
}

// ── Geschoss-Schnipsel (World-Space) ─────────────────────────────────────────
function drawProjectiles() {
    const now = performance.now();
    GameState.projectiles = GameState.projectiles.filter(p => !p.done);

    GameState.projectiles.forEach(proj => {
        const raw = (now - proj.startTime) / proj.duration;
        if (raw >= 1) { proj.done = true; return; }

        // Ease-out: schnell los, leicht abbremsen
        const t = 1 - Math.pow(1 - raw, 1.6);

        const x = proj.sx + (proj.tx - proj.sx) * t;
        const y = proj.sy + (proj.ty - proj.sy) * t;

        // Verblassen kurz vor Aufprall
        const alpha = raw > 0.78 ? 1 - (raw - 0.78) / 0.22 : 1;
        // Leichtes Taumeln (Papier dreht sich leicht im Flug)
        const wobble = Math.sin(raw * Math.PI * 4) * 0.25;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(proj.angle + wobble);

        // Papierschnipsel-Form
        ctx.fillStyle   = 'rgba(238, 224, 196, 0.96)';
        ctx.strokeStyle = 'rgba(55, 38, 14, 0.82)';
        ctx.lineWidth   = 0.9;
        ctx.beginPath();
        BULLET_SCRAP_VERTS.forEach(([vx, vy], i) =>
            i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Kugel: kleine dunkle Ellipse im Zentrum des Schnipsels
        ctx.fillStyle = 'rgba(45, 30, 10, 0.92)';
        ctx.beginPath();
        ctx.ellipse(0.5, 0.5, 2.2, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Kleiner Glanzpunkt auf der Kugel
        ctx.fillStyle = 'rgba(200, 190, 160, 0.60)';
        ctx.beginPath();
        ctx.ellipse(-0.6, -1.0, 0.7, 1.1, -0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
}

// ── Schleich-Effekte (World-Space) ────────────────────────────────────────────
function drawSneakEffects(player) {
    const sa = GameState.sneakAnim;
    if (!sa) return;
    const t = Date.now();

    // 1. Geister-Spur: halbtransparente Kopien des Spielers entlang des Weges
    sa.ghosts.forEach(g => {
        if (g.alpha <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = g.alpha * 0.45;
        ctx.translate(g.x, g.y);
        ctx.rotate(sa.angle);
        ctx.fillStyle = 'rgba(80,200,130,0.9)';
        ctx.beginPath();
        SCRAP_VERTS.forEach(([vx, vy], i) =>
            i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    });

    // 2. Fußspuren: kleine Ellipsen, abwechselnd links/rechts, erscheinen schrittweise
    const perp = sa.angle + Math.PI / 2;
    sa.footsteps.forEach(fs => {
        if (fs.alpha <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = fs.alpha * 0.75;
        ctx.translate(fs.x + Math.cos(perp) * fs.side * 5, fs.y + Math.sin(perp) * fs.side * 5);
        ctx.rotate(sa.angle);
        ctx.fillStyle = 'rgba(60,180,110,1)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 2.5, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 3. Pulsierender "schleich..." Text mit Wobble
    const pulse  = 0.65 + 0.35 * Math.abs(Math.sin(t / 280));
    const wobble = Math.sin(t / 170) * 2.5;
    const tilt   = Math.sin(t / 230) * 0.08;
    // Zusätzlich wechselnde Punkte: "schleich." / "schleich.." / "schleich..."
    const dots   = '.'.repeat(1 + (Math.floor(t / 400) % 3));
    ctx.save();
    ctx.translate(player.x + wobble, player.y - player.radius - 22);
    ctx.rotate(tilt);
    ctx.font = "italic bold 22px 'Kalam'";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // Schatten für Lesbarkeit
    ctx.fillStyle = `rgba(10,40,20,${pulse * 0.6})`;
    ctx.fillText(`schleich${dots}`, 1, 1);
    ctx.fillStyle = `rgba(80,210,130,${pulse})`;
    ctx.fillText(`schleich${dots}`, 0, 0);
    ctx.restore();
}

// ── Würfel-Animationen (Screen-Space) ─────────────────────────────────────────
function drawDiceAnimations() {
    const now = performance.now();
    GameState.diceAnims = GameState.diceAnims.filter(d => now - d.startTime < d.duration);
    if (!GameState.diceAnims.length) return;

    const W = canvas.width, H = canvas.height;
    const dieSize = Math.round(Math.min(W, H) * 0.09 + 22); // ~54px auf Desktop
    // Landeplatz: Mitte unten, über der Battle-Box
    const landX = W * 0.5;
    const landY = H - dieSize * 2.4;

    GameState.diceAnims.forEach(d => {
        const t   = Math.min(1, (now - d.startTime) / d.duration);
        const r   = dieSize * 0.5;

        // Phasen: 0–0.55 rollen, 0.55–0.75 landen, 0.75–0.92 halten, 0.92–1 faden
        const rolling = t < 0.55;
        const landing = t >= 0.55 && t < 0.75;
        const holding = t >= 0.75 && t < 0.92;
        const fading  = t >= 0.92;

        // Zufallswert während Rollen, Endwert beim Landen
        if (rolling) {
            if (Math.random() < 0.25) // nicht jeden Frame aktualisieren (unruhiger Look)
                d.curValue = Math.floor(Math.random() * d.sides) + 1;
        } else {
            d.curValue = d.finalValue;
        }

        // Position
        let x, y, rot, scl = 1;
        if (rolling) {
            const p = t / 0.55;
            const ease = 1 - Math.pow(1 - p, 2.5);
            x   = -r * 2 + ease * (landX + r * 2); // rollt von links
            y   = landY + Math.sin(p * Math.PI * 2) * dieSize * 0.35;
            rot = p * Math.PI * 5; // dreht sich ~2.5× beim Rollen
        } else if (landing) {
            const p   = (t - 0.55) / 0.20;
            const bob = Math.sin(p * Math.PI) * dieSize * 0.28 * (1 - p);
            x   = landX; y = landY - bob;
            rot = (Math.PI * 5) + p * 0.4;
            scl = 1 + Math.sin(p * Math.PI) * 0.08; // leichtes "Aufprall"-Skalieren
        } else {
            x = landX; y = landY;
            rot = Math.PI * 5 + 0.4;
        }

        const alpha = fading ? 1 - (t - 0.92) / 0.08 : 1;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(scl, scl);

        // Schatten
        ctx.save();
        ctx.translate(3, 4);
        ctx.globalAlpha = alpha * 0.28;
        _drawDieShape(d.shape, r + 2);
        ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fill();
        ctx.restore();

        // Würfel-Körper
        ctx.fillStyle   = 'rgba(232,218,182,0.96)';
        ctx.strokeStyle = 'rgba(58,40,18,0.88)';
        ctx.lineWidth   = Math.max(1.8, r * 0.09);
        ctx.lineJoin    = 'round';
        _drawDieShape(d.shape, r);
        ctx.fill(); ctx.stroke();

        // Innerer Glanz
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(255,245,220,0.22)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.55, r * 0.38, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Würfeltyp (klein oben)
        ctx.rotate(-rot); // Text immer aufrecht
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `700 ${Math.round(r * 0.44)}px 'Kalam'`;
        ctx.fillStyle    = 'rgba(95,68,32,0.72)';
        ctx.fillText(d.label, 0, -r * 0.52);

        // Würfelwert (groß mittig)
        const valStr = String(d.curValue).padStart(d.sides >= 10 ? 2 : 1, ' ');
        ctx.font      = `700 ${Math.round(r * (d.sides >= 100 ? 0.62 : 0.78))}px 'Kalam'`;
        ctx.fillStyle = 'rgba(35,22,8,0.94)';
        ctx.fillText(valStr.trim(), 0, r * 0.12);

        ctx.restore();
    });
}

// Zeichnet die Würfelform (ohne fill/stroke — wird vom Aufrufer gesetzt)
function _drawDieShape(shape, r) {
    ctx.beginPath();
    if (shape === 'circle') {
        ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else if (shape === 'triangle') {
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.87, r * 0.5);
        ctx.lineTo(-r * 0.87, r * 0.5);
        ctx.closePath();
    } else if (shape === 'diamond') {
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.72, -r * 0.35);
        ctx.lineTo(r * 0.72, r * 0.35);
        ctx.lineTo(0, r);
        ctx.lineTo(-r * 0.72, r * 0.35);
        ctx.lineTo(-r * 0.72, -r * 0.35);
        ctx.closePath();
    } else {
        // square mit abgerundeten Ecken
        const cr = r * 0.22;
        ctx.moveTo(-r + cr, -r);
        ctx.arcTo(r, -r, r, r, cr);
        ctx.arcTo(r, r, -r, r, cr);
        ctx.arcTo(-r, r, -r, -r, cr);
        ctx.arcTo(-r, -r, r, -r, cr);
        ctx.closePath();
    }
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
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(zoom, zoom);

    if (GameState.showFullMap) {
        ctx.drawImage(wallCanvas, -cam.x, -cam.y);
    } else {
        ctx.drawImage(exploredCanvas, -cam.x, -cam.y);
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(wallCanvas, -cam.x, -cam.y);
        // Unerkundete Bereiche mit Wandfarbe füllen (destination-over = hinter erkundet)
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = 'rgb(42, 32, 18)';
        ctx.fillRect(-cam.x, -cam.y, canvas.width / zoom, canvas.height / zoom);
        ctx.globalCompositeOperation = 'source-over';
    }

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

    // Weltgegenstände + Tür-Hover + Tür-Geräusch-Texte
    drawWorldItems();
    drawDoorHighlight();
    drawDoorSounds();

    // Alle lebenden Gegner zeichnen
    Entities.enemies.forEach(enemy => {
        if (enemy.isDead) return;
        // Im Kampf: kein FOV-Winkel, nur Wand-LOS + Engagement-Zone
        const pSees = GameState.combatTriggered
            ? canSeeInCombat(player, enemy)
            : canSee(player, enemy);

        // "tap... tap..." – nur außerhalb Kampf (im Kampf immer sichtbar wenn engaged)
        if (!pSees && !GameState.combatTriggered) {
            const dx = enemy.x - player.x, dy = enemy.y - player.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist <= player.viewDistance) {
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

        // Feind unsichtbar: im Kampf canSeeInCombat, außerhalb klassisches canSee
        const eSees = GameState.combatTriggered
            ? canSeeInCombat(enemy, player)
            : canSee(enemy, player);
        if (!pSees && !eSees) return;

        if (pSees) {
            ctx.save();

            if (!GameState.combatTriggered) {
                // Erkundung: Feind nur innerhalb des Spieler-FOV-Kegels sichtbar (Clip)
                ctx.beginPath(); ctx.moveTo(player.x, player.y);
                ctx.arc(player.x, player.y, player.viewDistance,
                        player.angle - player.fov/2, player.angle + player.fov/2);
                ctx.closePath(); ctx.clip();
            }
            // Im Kampf: kein Clip – Feind komplett sichtbar

            // Sichtkegel Feind (nur in Erkundung sinnvoll, im Kampf weggelassen)
            if (!GameState.combatTriggered) {
                ctx.strokeStyle = 'rgba(200,50,50,0.30)'; ctx.lineWidth = 1.8;
                ctx.lineCap = 'round'; ctx.setLineDash([5, 5]);
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
            }

            drawEntityScrap(ctx, enemy, NPC_SCRAP_VERTS, NPC_CIRCLE_VERTS, 'rgba(140,35,35,0.90)');
            ctx.restore();
            // HP-Ring + Name (außerhalb clip)
            drawEnemyHUD(enemy);
        }
    });

    // Ziellinie anzeigen (Schritt 1 der 2-Schritt-Auswahl)
    if (GameState.combatWeapon && GameState.combatTarget && !GameState.combatTarget.isDead) {
        const t = GameState.combatTarget;
        drawTargetLine(player.x, player.y, t.x, t.y);
    }

    // Fliegende Geschoss-Schnipsel (zwischen Gegnern und Spieler)
    drawProjectiles();

    // Spieler als Papierschnipsel + HP/AP-Ring (mit optionalem Ausweich-Offset)
    {
        let offX = 0, offY = 0;
        const da = GameState.dodgeAnim;
        if (da && !da.done) {
            const t = Math.min(1, (performance.now() - da.startTime) / da.duration);
            if (t >= 1) {
                da.done = true;
            } else {
                // Phase 1: raus (0–40%), Phase 2: halten (40–60%), Phase 3: zurück (60–100%)
                let factor;
                if      (t < 0.40) { const x = t / 0.40; factor = x * (2 - x); }   // ease-out
                else if (t < 0.60) { factor = 1; }
                else               { const x = (t - 0.60) / 0.40; factor = 1 - x * x; } // ease-in
                offX = da.dx * factor;
                offY = da.dy * factor;
            }
        }
        ctx.save();
        if (offX !== 0 || offY !== 0) ctx.translate(offX, offY);
        drawEntityScrap(ctx, player, SCRAP_VERTS, CIRCLE_VERTS, 'rgba(35, 30, 25, 0.88)');
        drawPlayerHUD(player);
        drawSneakEffects(player);
        ctx.restore();
    }

    // Richtungspfeile: bei Richtungswahl UND bei Bewegungsraster (zum Drehen)
    if (GameState.selectingDirection || GameState.combatMoving) {
        drawDirectionArrows(player, GameState.hoverDirIdx);
    }

    ctx.restore(); // Kamera-Transform beenden
    ctx.restore(); // Zoom beenden

    // Schleich-Vignette (Screen-Space: dunkle Ränder, dramatischer Look)
    if (GameState.sneakAnim) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const r  = Math.sqrt(cx * cx + cy * cy);
        const vg = ctx.createRadialGradient(cx, cy, r * 0.18, cx, cy, r);
        vg.addColorStop(0, 'rgba(0,15,8,0)');
        vg.addColorStop(0.55, 'rgba(0,15,8,0.18)');
        vg.addColorStop(1,   'rgba(0,5,3,0.82)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ── Kampfraster als UI-Overlay (Screen-Space, keine Transform-Abhängigkeit) ──
    if (GameState.combatGridVisible) {
        drawCombatGrid();
    }

    // Würfelanimationen (Screen-Space, über Kampfraster)
    drawDiceAnimations();

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

    // ── Koordinaten-Modus: Live-Vorschau ─────────────────────────────────────
    if (GameState.coordMode) {
        const zoom = GameState.zoom;
        const cam  = GameState.camera;

        // Alle bereits gesetzten Kollisionswände anzeigen
        ctx.save();
        ctx.scale(zoom, zoom);
        ctx.translate(-cam.x, -cam.y);

        // Gezeichnete Wände (blau) und Türen (orange) aus coordDrawn
        GameState.coordDrawn.forEach(item => {
            const w = item.x2 - item.x1, h = item.y2 - item.y1;
            if (item.type === 'wall') {
                ctx.fillStyle   = 'rgba(80,160,255,0.20)';
                ctx.strokeStyle = 'rgba(80,160,255,0.90)';
            } else {
                ctx.fillStyle   = 'rgba(255,165,40,0.25)';
                ctx.strokeStyle = 'rgba(255,165,40,0.95)';
            }
            ctx.lineWidth = 2 / zoom;
            ctx.fillRect(item.x1, item.y1, w, h);
            ctx.strokeRect(item.x1, item.y1, w, h);
        });

        // Laufende Linie vom P1 zur aktuellen Mausposition
        const p1  = GameState._coordPoint1;
        const m   = GameState._coordMouse;
        if (p1 && m) {
            const isWall = GameState.coordMode === 'wall';
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = isWall ? 'rgba(255,232,144,0.90)' : 'rgba(232,120,120,0.90)';
            ctx.lineWidth   = 2 / zoom;
            ctx.strokeRect(
                Math.min(p1.wx, m.wx), Math.min(p1.wy, m.wy),
                Math.abs(m.wx - p1.wx), Math.abs(m.wy - p1.wy)
            );
            ctx.setLineDash([]);
            // Startpunkt-Marker
            ctx.fillStyle = '#7ed878';
            ctx.beginPath();
            ctx.arc(p1.wx, p1.wy, 5 / zoom, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // ── Koordinaten-Modus HUD (oben rechts) ──────────────────────────────────
    if (GameState.coordMode) {
        const m  = GameState._coordMouse || { wx: 0, wy: 0 };
        const W  = GameState.worldW || 1800, H = GameState.worldH || 1200;
        const xp = (m.wx / W * 100).toFixed(1);
        const yp = (m.wy / H * 100).toFixed(1);
        const p1 = GameState._coordPoint1;

        ctx.save();
        ctx.font = "bold 13px monospace";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        // Hintergrund-Pill
        const mode  = GameState.coordMode;
        const modeLabel = mode === 'wall' ? '[C] WAND' : '[T] TÜR ';
        const modeCol   = mode === 'wall' ? '#ffe890' : '#e87878';
        const label = p1
            ? `${modeLabel}  P2-Klick  x=${xp}%  y=${yp}%`
            : `${modeLabel}  x=${xp}%  y=${yp}%`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(14,9,5,0.88)';
        ctx.fillRect(canvas.width - tw - 22, 6, tw + 16, 22);
        ctx.fillStyle = p1 ? '#7ed878' : modeCol;
        ctx.fillText(label, canvas.width - 10, 10);

        // Punkt-1-Marker
        if (p1) {
            ctx.fillStyle = 'rgba(126,216,120,0.9)';
            ctx.font = "bold 11px monospace";
            ctx.textAlign = 'right';
            ctx.fillText(`P1: x=${p1.xp}%  y=${p1.yp}%`, canvas.width - 10, 32);
        }
        ctx.restore();
    }
}

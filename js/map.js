// =============================================================================
// map.js – Karten-Aufbau und Blueprint-Rendering
// Ladeordnung: config.js → state.js → map.js
//
// Verantwortlich für:
//   - addWall / addDoor / addFurniture  (Spielwelt-Geometrie aufbauen)
//   - buildMansion                      (Spencer-Mansion Grundriss + Spawn)
//   - drawSketchLine / drawChair /
//     drawFurniture                     (Bleistift-Skizzen-Zeichenroutinen)
//   - renderBlueprint                   (wallCanvas komplett neu rendern)
//   - drawStairsHatch / drawCompassRose (Dekorations-Hilfsfunktionen)
//
// Globale Abhängigkeiten: wallCtx, GameState, Entities,
//                         FELD_PX, SIGHT_BLOCKING_TYPES, WEAPONS
// =============================================================================

// ── Full-Map Bild (Ansatz B: ein komplettes Karten-Bild als Hintergrund) ──────

const FULL_MAP_IMG = new Image();
FULL_MAP_IMG.onload = () => { try { renderBlueprint(); } catch (_) {} };
// WebP bevorzugen (281 KB), PNG als Fallback (3 MB)
FULL_MAP_IMG.src = 'img/Full_map.webp';
FULL_MAP_IMG.onerror = () => { FULL_MAP_IMG.src = 'img/Full_map.png'; };

// Zeichnet das Vollbild auf wallCanvas (vor den Kollisions-Wandlinien)
function drawRoomImages(W, H) {
    if (!FULL_MAP_IMG.complete || !FULL_MAP_IMG.naturalWidth) return;
    wallCtx.save();
    wallCtx.globalAlpha = 0.95;
    wallCtx.drawImage(FULL_MAP_IMG, 0, 0, W, H);
    wallCtx.globalAlpha = 1;
    wallCtx.restore();
}

// ── Geometrie-Helfer ──────────────────────────────────────────────────────────

function addWall(x, y, w, h) { GameState.walls.push({ x, y, width: w, height: h }); }
function addDoor(x, y, w, h) { GameState.doors.push({ x, y, w, h, open: false, triggered: false }); }

// blockSight: hohe/undurchsichtige Objekte versperren die Sicht (Schrank, Regal).
// Niedrige/transparente Objekte (Tisch, Stuhl, Pflanze…) werden aus jeder Richtung erkannt.
function addFurniture(x, y, w, h, type) {
    GameState.furniture.push({ x, y, w, h, type, blockSight: SIGHT_BLOCKING_TYPES.has(type) });
}

// ── Full_map – Wandlayout abgeleitet aus Pixel-Analyse ───────────────────────
// Außenwände: x[5%,95%], y[7%,93%]
// Haupttrennwände: x=40% (vertikal), y=55% (horizontal links), y=63% (horizontal rechts)
// Spawn: x=11.8%, y=87.3% (Figur unten links im Bild)
function buildMansion() {
    GameState.walls     = [];
    GameState.doors     = [];
    GameState.furniture = [];
    const W = wallCanvas.width, H = wallCanvas.height;
    GameState.worldW = W;
    GameState.worldH = H;
    const T  = 10;  // Wandstärke
    const DW = 56;  // Türbreite

    // ── AUSSENWÄNDE ───────────────────────────────────────────────────────
    addWall(W*.05, H*.07, W*.90, T);              // Nord
    addWall(W*.05, H*.93, W*.90, T);              // Süd
    addWall(W*.05, H*.07, T,     H*.86);          // West
    addWall(W*.95, H*.07, T,     H*.86);          // Ost

    // ── VERTIKALE HAUPTTRENNWAND bei x=40% ────────────────────────────────
    // Tür oben (y≈25%), Tür unten (y≈72%)
    addWall(W*.40, H*.07, T, H*.18);              // N-Segment
    addDoor(W*.40, H*.25, T, DW);                 // Tür 1 (oben)
    addWall(W*.40, H*.25+DW/H, T, H*.72 - H*.25 - DW/H);
    addDoor(W*.40, H*.72, T, DW);                 // Tür 2 (unten)
    addWall(W*.40, H*.72+DW/H, T, H*.93 - H*.72 - DW/H - T);

    // ── SEKUNDÄRE VERTIKALWAND bei x=30% (linke Teilung, nur obere Hälfte) ─
    // Tür bei y≈35%
    addWall(W*.30, H*.07, T, H*.28);
    addDoor(W*.30, H*.35, T, DW);
    addWall(W*.30, H*.35+DW/H, T, H*.55 - H*.35 - DW/H);

    // ── INTERNE VERTIKALWAND bei x=12.9%, y[59.9%..91.1%] ────────────────
    addWall(W*0.129, H*0.599, T, H*0.312);

    // ── HORIZONTALWAND bei y=59.9%, x[12.8%..22.6%] ───────────────────────
    addWall(W*0.128, H*0.599, W*0.098, T);

    // ── TÜR bei x=23.3%, y=58.8% (Breite 4.7%) ────────────────────────────
    addDoor(W*0.233, H*0.588, W*0.047, T);

    // ── HORIZONTALE TRENNWAND LINKS bei y=55% (x[5%..30%]) ───────────────
    // Tür bei x≈17%
    addWall(W*.05, H*.55, W*.12, T);
    addDoor(W*.17, H*.55, DW, T);
    addWall(W*.17+DW/W, H*.55, W*.30 - W*.17 - DW/W - T, T);

    // ── HORIZONTALE TRENNWAND RECHTS bei y=63% (x[40%..95%]) ─────────────
    // Tür bei x≈65%
    addWall(W*.40, H*.63, W*.25, T);
    addDoor(W*.65, H*.63, DW, T);
    addWall(W*.65+DW/W, H*.63, W*.95 - W*.65 - DW/W - T, T);

    // ── SPAWN ─────────────────────────────────────────────────────────────
    // Figur im Bild bei x≈11.8%, y≈87.3% → unterer linker Bereich
    Entities.player.x = W * 0.118;
    Entities.player.y = H * 0.820;
    Entities.player.angle = -Math.PI / 2;

    // Soldaten in den anderen Bereichen platzieren
    const e1 = Entities.enemies[0];
    e1.isDead = false; e1.currentWaypoint = 0; e1.hp = e1.maxHp; e1.ignoreUntil = 0;
    e1.waypoints = [
        { x: W * 0.65, y: H * 0.35 }, { x: W * 0.85, y: H * 0.35 },
        { x: W * 0.85, y: H * 0.50 }, { x: W * 0.65, y: H * 0.50 },
    ];
    e1.x = e1.waypoints[0].x; e1.y = e1.waypoints[0].y;

    const e2 = Entities.enemies[1];
    e2.isDead = false; e2.currentWaypoint = 0; e2.hp = e2.maxHp; e2.ignoreUntil = 0;
    e2.waypoints = [
        { x: W * 0.55, y: H * 0.75 }, { x: W * 0.80, y: H * 0.75 },
        { x: W * 0.80, y: H * 0.85 }, { x: W * 0.55, y: H * 0.85 },
    ];
    e2.x = e2.waypoints[0].x; e2.y = e2.waypoints[0].y;

    // ── WELTGEGENSTÄNDE ───────────────────────────────────────────────────
    if (GameState.worldItems.length === 0) {
        GameState.worldItems.push({
            id: 'world_medikit_1', type: 'medikit', label: 'Medikit',
            img: 'img/icon-medikit.svg', color: 'rgba(180,30,30,0.85)',
            x: W * 0.22, y: H * 0.35,
        });
    }

    renderBlueprint();
}

// ── Blueprint-Zeichenroutinen ─────────────────────────────────────────────────

// Zeichnet eine einzelne, leicht wackelige Bleistiftlinie zwischen zwei Punkten.
function drawSketchLine(ctx, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const nx = -dy / len, ny = dx / len; // Normalvektor (senkrecht zur Linie)

    const steps = Math.max(2, Math.floor(len / 9));
    const amp = 1.4; // maximale Auslenkung in Pixel

    ctx.beginPath();
    ctx.moveTo(x1 + (Math.random() - 0.5) * 0.8, y1 + (Math.random() - 0.5) * 0.8);
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const perp = (Math.random() - 0.5) * amp;
        ctx.lineTo(
            x1 + dx * t + nx * perp + (Math.random() - 0.5) * 0.4,
            y1 + dy * t + ny * perp + (Math.random() - 0.5) * 0.4
        );
    }
    ctx.stroke();
}

// Zeichnet einen kleinen Stuhl (reine Skizze, keine Kollision).
// angle: 0 = Rückenlehne zeigt nach oben, Math.PI = nach unten, etc.
function drawChair(cx, cy, cs, angle) {
    wallCtx.save();
    wallCtx.translate(cx, cy);
    wallCtx.rotate(angle);
    const hs = cs / 2;
    wallCtx.lineWidth = 1.0;
    // Sitzfläche
    drawSketchLine(wallCtx, -hs, -hs,  hs, -hs);
    drawSketchLine(wallCtx,  hs, -hs,  hs,  hs);
    drawSketchLine(wallCtx,  hs,  hs, -hs,  hs);
    drawSketchLine(wallCtx, -hs,  hs, -hs, -hs);
    // Rückenlehne (nach oben, weg vom Tisch)
    const bh = cs * 0.55;
    drawSketchLine(wallCtx, -hs, -hs, -hs, -hs - bh);
    drawSketchLine(wallCtx,  hs, -hs,  hs, -hs - bh);
    drawSketchLine(wallCtx, -hs, -hs - bh, hs, -hs - bh);
    wallCtx.restore();
}

function drawFurniture(item) {
    const { x, y, w, h, type } = item;
    wallCtx.save();
    wallCtx.lineCap = 'round';
    wallCtx.lineJoin = 'round';
    wallCtx.strokeStyle = 'rgba(48, 33, 18, 0.80)';
    wallCtx.lineWidth = 1.3;

    function box() {
        drawSketchLine(wallCtx, x,   y,   x+w, y  );
        drawSketchLine(wallCtx, x+w, y,   x+w, y+h);
        drawSketchLine(wallCtx, x+w, y+h, x,   y+h);
        drawSketchLine(wallCtx, x,   y+h, x,   y  );
    }

    switch (type) {

        case 'bookshelf': {
            // Bücherspinne: senkrechte Linien wie Buchrücken + Regalböden oben/unten
            box();
            wallCtx.lineWidth = 0.85;
            const nBooks = Math.max(3, Math.floor(w / 9));
            for (let i = 1; i < nBooks; i++) {
                const bx = x + (w / nBooks) * i;
                const jitter = (Math.random() - 0.5) * 3;
                drawSketchLine(wallCtx, bx, y + 2, bx, y + h - 2 + jitter);
            }
            break;
        }

        case 'bed': {
            box();
            // Kissen als Oval
            wallCtx.lineWidth = 1.0;
            wallCtx.beginPath();
            if (w >= h) wallCtx.ellipse(x + w*0.22, y+h/2, w*0.13, h*0.28, 0, 0, Math.PI*2);
            else        wallCtx.ellipse(x+w/2, y + h*0.22, w*0.28, h*0.13, 0, 0, Math.PI*2);
            wallCtx.stroke();
            // Deckenfalzlinie
            wallCtx.lineWidth = 0.8;
            if (w >= h) drawSketchLine(wallCtx, x+w*0.42, y+3, x+w*0.42, y+h-3);
            else        drawSketchLine(wallCtx, x+3, y+h*0.42, x+w-3, y+h*0.42);
            break;
        }

        case 'table': {
            box();
            // Stühle (dekorativ, keine Kollision)
            const cs = 16; // Stuhlgröße px
            const jit = () => (Math.random() - 0.5) * 0.22;
            if (w >= h) {
                // Tisch horizontal: Stühle oben + unten
                drawChair(x + w*0.25, y - cs*0.85, cs, 0       + jit());
                drawChair(x + w*0.75, y - cs*0.85, cs, 0       + jit());
                drawChair(x + w*0.25, y+h + cs*0.85, cs, Math.PI + jit());
                drawChair(x + w*0.75, y+h + cs*0.85, cs, Math.PI + jit());
            } else {
                // Tisch vertikal: Stühle links + rechts
                drawChair(x - cs*0.85, y + h*0.25, cs, -Math.PI/2 + jit());
                drawChair(x - cs*0.85, y + h*0.75, cs, -Math.PI/2 + jit());
                drawChair(x+w + cs*0.85, y + h*0.25, cs,  Math.PI/2 + jit());
                drawChair(x+w + cs*0.85, y + h*0.75, cs,  Math.PI/2 + jit());
            }
            break;
        }

        case 'desk': {
            box();
            // Papier/Notizbuch auf der Oberfläche
            wallCtx.lineWidth = 0.85;
            const px = x + w*0.28, py = y + h*0.18, pw = w*0.44, ph = h*0.64;
            drawSketchLine(wallCtx, px, py, px+pw, py);
            drawSketchLine(wallCtx, px+pw, py, px+pw, py+ph);
            drawSketchLine(wallCtx, px+pw, py+ph, px, py+ph);
            drawSketchLine(wallCtx, px, py+ph, px, py);
            wallCtx.lineWidth = 0.65;
            drawSketchLine(wallCtx, px+3, py+ph*0.38, px+pw-3, py+ph*0.38);
            drawSketchLine(wallCtx, px+3, py+ph*0.62, px+pw-3, py+ph*0.62);
            break;
        }

        case 'cabinet': {
            box();
            wallCtx.lineWidth = 0.9;
            if (w >= h) {
                drawSketchLine(wallCtx, x+w/2, y+3, x+w/2, y+h-3);
                wallCtx.fillStyle = 'rgba(48,33,18,0.58)';
                [[x+w/4, y+h/2],[x+3*w/4, y+h/2]].forEach(([px,py]) => {
                    wallCtx.beginPath(); wallCtx.arc(px,py,2.2,0,Math.PI*2); wallCtx.fill();
                });
            } else {
                drawSketchLine(wallCtx, x+3, y+h/2, x+w-3, y+h/2);
                wallCtx.fillStyle = 'rgba(48,33,18,0.58)';
                [[x+w/2, y+h/4],[x+w/2, y+3*h/4]].forEach(([px,py]) => {
                    wallCtx.beginPath(); wallCtx.arc(px,py,2.2,0,Math.PI*2); wallCtx.fill();
                });
            }
            break;
        }

        case 'plant': {
            // Nur Kreis + Blattstriche — KEIN Rechteck (Kollision ist kreisförmig)
            const pr = Math.min(w,h) / 2, pcx = x+w/2, pcy = y+h/2;
            wallCtx.strokeStyle = 'rgba(36, 60, 26, 0.82)';
            wallCtx.lineWidth = 1.3;
            wallCtx.beginPath(); wallCtx.arc(pcx, pcy, pr, 0, Math.PI*2); wallCtx.stroke();
            wallCtx.lineWidth = 0.9;
            for (let a = 0; a < Math.PI*2; a += Math.PI/3)
                drawSketchLine(wallCtx, pcx, pcy,
                    pcx + Math.cos(a + 0.25)*pr*0.60,
                    pcy + Math.sin(a + 0.25)*pr*0.60);
            break;
        }

        case 'crate': {
            box();
            wallCtx.lineWidth = 0.9;
            drawSketchLine(wallCtx, x+3, y+3, x+w-3, y+h-3);
            drawSketchLine(wallCtx, x+w-3, y+3, x+3, y+h-3);
            break;
        }

        case 'sofa': {
            box();
            wallCtx.lineWidth = 1.0;
            if (w >= h) {
                drawSketchLine(wallCtx, x+3,      y+h*0.40, x+w-3,    y+h*0.40);
                drawSketchLine(wallCtx, x+w*0.14, y+h*0.40, x+w*0.14, y+h-3);
                drawSketchLine(wallCtx, x+w*0.86, y+h*0.40, x+w*0.86, y+h-3);
                drawSketchLine(wallCtx, x+w/2,    y+h*0.40, x+w/2,    y+h-3);
            } else {
                drawSketchLine(wallCtx, x+w*0.40, y+3,      x+w*0.40, y+h-3);
                drawSketchLine(wallCtx, x+w*0.40, y+h*0.14, x+w-3,    y+h*0.14);
                drawSketchLine(wallCtx, x+w*0.40, y+h*0.86, x+w-3,    y+h*0.86);
                drawSketchLine(wallCtx, x+w*0.40, y+h/2,    x+w-3,    y+h/2);
            }
            break;
        }
    }
    wallCtx.restore();
}

// Rendert den kompletten Blueprint auf wallCanvas.
// Reihenfolge: Raum-Bilder → Wände → Türen → Möbel → Kompass
function renderBlueprint() {
    const W = wallCanvas.width, H = wallCanvas.height;
    wallCtx.clearRect(0, 0, W, H);

    // 1. Raum-Bild-Module als Bodenbelag (unter allen Linien)
    drawRoomImages(W, H);

    // Wände als einzelne handgezeichnete Linien (Mittellinie des Wandrechtecks)
    wallCtx.strokeStyle = 'rgba(45, 40, 35, 0.88)';
    wallCtx.lineWidth = 1.8;
    wallCtx.lineCap = 'round';
    wallCtx.lineJoin = 'round';

    GameState.walls.forEach(wall => {
        let x1, y1, x2, y2;
        if (wall.width >= wall.height) {
            const cy = wall.y + wall.height / 2;
            x1 = wall.x - wall.height / 2;  y1 = cy;
            x2 = wall.x + wall.width + wall.height / 2; y2 = cy;
        } else {
            const cx = wall.x + wall.width / 2;
            x1 = cx; y1 = wall.y - wall.width / 2;
            x2 = cx; y2 = wall.y + wall.height + wall.width / 2;
        }
        drawSketchLine(wallCtx, x1, y1, x2, y2);
    });

    // ── Geschlossene Türen: gefülltes Panel mit Bleistiftrand + Griff ──────
    GameState.doors.forEach(door => {
        if (door.open) return;
        // Panel-Füllung (warmes Beige, deutlich dunkler als Papier)
        wallCtx.fillStyle = 'rgba(185, 162, 118, 0.88)';
        wallCtx.fillRect(door.x, door.y, door.w, door.h);
        // Bleistift-Rand (wobbly, wie der Rest des Blueprints)
        if (door.w > door.h) {
            const cy = door.y + door.h / 2;
            drawSketchLine(wallCtx, door.x, cy, door.x + door.w, cy);
            // kurze Abschlussstriche an den Enden
            drawSketchLine(wallCtx, door.x,         door.y, door.x,         door.y + door.h);
            drawSketchLine(wallCtx, door.x + door.w, door.y, door.x + door.w, door.y + door.h);
        } else {
            const cx = door.x + door.w / 2;
            drawSketchLine(wallCtx, cx, door.y, cx, door.y + door.h);
            drawSketchLine(wallCtx, door.x, door.y,         door.x + door.w, door.y);
            drawSketchLine(wallCtx, door.x, door.y + door.h, door.x + door.w, door.y + door.h);
        }
        // Griff-Punkt
        wallCtx.fillStyle = 'rgba(60, 42, 22, 0.75)';
        wallCtx.beginPath();
        if (door.w > door.h) {
            wallCtx.arc(door.x + door.w * 0.72, door.y + door.h / 2, 2.5, 0, Math.PI * 2);
        } else {
            wallCtx.arc(door.x + door.w / 2, door.y + door.h * 0.72, 2.5, 0, Math.PI * 2);
        }
        wallCtx.fill();
    });

    // ── Offene Türen: nur Türblatt-Strich ───────────────────────────────────
    GameState.doors.forEach(door => {
        if (!door.open) return;
        const len = door.w > door.h ? door.w : door.h;
        if (door.w > door.h) {
            const hy = door.y + door.h / 2;
            drawSketchLine(wallCtx, door.x, hy, door.x, hy - len);
        } else {
            const cx = door.x + door.w / 2;
            drawSketchLine(wallCtx, cx, door.y, cx + len, door.y);
        }
    });

    // Möbel
    GameState.furniture.forEach(drawFurniture);

    // Compass rose (top-right of mansion interior)
    drawCompassRose(W*0.88, H*0.08);
}

function drawStairsHatch(x, y, w, h) {
    wallCtx.save();
    wallCtx.strokeStyle = 'rgba(100, 80, 50, 0.30)';
    wallCtx.lineWidth = 1;
    const step = Math.max(5, w / 8);
    for (let i = 0; i < w + h; i += step) {
        wallCtx.beginPath();
        wallCtx.moveTo(x + Math.min(i, w), y + Math.max(0, i - w));
        wallCtx.lineTo(x + Math.max(0, i - h), y + Math.min(i, h));
        wallCtx.stroke();
    }
    wallCtx.restore();
}

function drawCompassRose(cx, cy) {
    const r = Math.max(10, wallCanvas.width * 0.018);
    wallCtx.save();
    wallCtx.strokeStyle = 'rgba(80, 60, 40, 0.50)';
    wallCtx.fillStyle   = 'rgba(80, 60, 40, 0.50)';
    wallCtx.lineWidth = 1;
    // N arrow
    wallCtx.beginPath(); wallCtx.moveTo(cx, cy - r); wallCtx.lineTo(cx - r*0.35, cy); wallCtx.lineTo(cx + r*0.35, cy); wallCtx.closePath(); wallCtx.fill();
    // S/E/W stubs
    [[0,r],[r,0],[-r,0]].forEach(([dx,dy]) => { wallCtx.beginPath(); wallCtx.moveTo(cx,cy); wallCtx.lineTo(cx+dx*0.7,cy+dy*0.7); wallCtx.stroke(); });
    wallCtx.font = `bold ${Math.max(8, r*0.8)}px 'Kalam', cursive`;
    wallCtx.textAlign = 'center'; wallCtx.textBaseline = 'middle';
    wallCtx.fillText('N', cx, cy - r*1.5);
    wallCtx.restore();
}

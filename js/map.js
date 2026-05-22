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

// ── LDtk-Karte laden und in Spielwelt übersetzen ─────────────────────────────
async function loadLdtkMap() {
    const W = wallCanvas.width, H = wallCanvas.height;

    try {
        const res  = await fetch('spencer_mansion.ldtk');
        const data = await res.json();
        const level = data.levels[0];

        // Collision-Layer → Wände (horizontal zusammengeführt)
        const colLayer = level.layerInstances.find(l => l.__identifier === 'Collision');
        if (colLayer) {
            const gs  = colLayer.__gridSize;
            const cw  = colLayer.__cWid;
            const ch  = colLayer.__cHei;
            const csv = colLayer.intGridCsv;

            for (let r = 0; r < ch; r++) {
                let c = 0;
                while (c < cw) {
                    const v = csv[r * cw + c];
                    if (!v) { c++; continue; }
                    const start = c;
                    while (c < cw && csv[r * cw + c] === v) c++;
                    const x = start * gs, y = r * gs, w = (c - start) * gs;
                    if (v === 1) addWall(x, y, w, gs);
                    else if (v === 2) addDoor(x, y, w, gs);
                }
            }
        }

        // Entities-Layer → Spieler, Gegner, Items
        const entLayer = level.layerInstances.find(l => l.__identifier === 'Entities');
        if (entLayer) {
            let ei = 0;
            for (const e of entLayer.entityInstances) {
                const [px, py] = e.px;
                if (e.__identifier === 'PlayerSpawn') {
                    Entities.player.x     = px;
                    Entities.player.y     = py;
                    Entities.player.angle = -Math.PI / 2;
                } else if (e.__identifier === 'Enemy' && ei < Entities.enemies.length) {
                    const en = Entities.enemies[ei++];
                    en.isDead = false; en.hp = en.maxHp; en.ignoreUntil = 0;
                    en.currentWaypoint = 0; en.x = px; en.y = py;
                    // Einfache Patrouille: 2 Punkte horizontal
                    const swing = 180;
                    en.waypoints = [
                        { x: px, y: py },
                        { x: Math.min(W - gs, px + swing), y: py },
                    ];
                } else if (e.__identifier === 'Medikit') {
                    GameState.worldItems.push({
                        id: `mk_${px}_${py}`, type: 'medikit', label: 'Medikit',
                        img: 'img/icon-medikit.svg', color: 'rgba(180,30,30,0.85)',
                        x: px, y: py,
                    });
                }
            }
            // Überzählige Gegner deaktivieren
            for (; ei < Entities.enemies.length; ei++) Entities.enemies[ei].isDead = true;
        }

        console.log('[LDtk] Karte geladen');
    } catch (err) {
        console.warn('[LDtk] Fehler beim Laden:', err);
    }

    renderBlueprint();
}

// ── Karten-Aufbau ─────────────────────────────────────────────────────────────
function buildMansion() {
    GameState.walls     = [];
    GameState.doors     = [];
    GameState.furniture = [];
    const W = wallCanvas.width, H = wallCanvas.height;
    GameState.worldW = W;
    GameState.worldH = H;

    // Wände und Türen kommen vollständig aus LDtk (loadLdtkMap)

    // ── AUSRÜSTUNG: Messer rechts, Pistole links ──────────────────────────
    setTimeout(() => {
        const knife  = document.getElementById('messer-skizze');
        const pistol = document.getElementById('pistole-skizze');
        const rSlot  = document.getElementById('slot-rechteHand');
        const lSlot  = document.getElementById('slot-linkeHand');
        if (knife  && rSlot) rSlot.appendChild(knife);
        if (pistol && lSlot) lSlot.appendChild(pistol);
        if (typeof updateWeaponStatus === 'function') updateWeaponStatus();
    }, 200);

    // Sicherheits-Defaults bis LDtk geladen ist (verhindert sofortigen Kampf)
    Entities.player.x = W * 0.5;
    Entities.player.y = H * 0.5;
    Entities.player.angle = -Math.PI / 2;
    Entities.enemies.forEach(e => { e.isDead = true; }); // Gegner erst nach LDtk-Load aktivieren

    GameState.worldItems = [];
    GameState.coordDrawn = [];

    renderBlueprint(); // sofort rendern (Bild sichtbar, Wände kommen async)
    loadLdtkMap();     // lädt Wände + echte Spawns, ruft renderBlueprint() nochmal
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

    // Wände: transparente Füllung (Bild bleibt sichtbar) + starker Rand + Tiefenschatten
    GameState.walls.forEach(wall => {
        const { x, y } = wall;
        const w = wall.width, h = wall.height;

        // Äußerer Schlagschatten für Tiefe
        wallCtx.save();
        wallCtx.shadowColor    = 'rgba(0,0,0,0.55)';
        wallCtx.shadowBlur     = 8;
        wallCtx.shadowOffsetX  = 3;
        wallCtx.shadowOffsetY  = 3;

        // Semi-transparente Füllung: Bild-Wände bleiben erkennbar
        wallCtx.fillStyle = 'rgba(30, 22, 12, 0.28)';
        wallCtx.fillRect(x, y, w, h);
        wallCtx.restore();

        // Starker äußerer Rand (gibt Kontur + Tiefe)
        wallCtx.strokeStyle = 'rgba(18, 12, 4, 0.85)';
        wallCtx.lineWidth   = 2.5;
        wallCtx.strokeRect(x, y, w, h);

        // Innerer Highlight-Rand (Licht von oben links = Tiefen-Effekt)
        wallCtx.strokeStyle = 'rgba(80, 65, 40, 0.30)';
        wallCtx.lineWidth   = 1;
        wallCtx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
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

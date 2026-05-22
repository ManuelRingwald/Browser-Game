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

// ── Sprite Atlas: Raum-Module (1 Bild, ~1 MB, alle Module drin) ──────────────

// Koordinaten im Atlas (erzeugt via Python/Pillow, 512px Breite)
// Quell-Module: Module_Floor.png, Module_Rectangle_Room.png, Module_Square-Room.png
const ROOM_ATLAS_COORDS = {
    floor:  { x: 0, y:    0, w: 512, h: 1633 }, // hoher Korridor / Portrait-Raum
    rect:   { x: 0, y: 1633, w: 512, h:  288 }, // breiter Landscape-Raum
    square: { x: 0, y: 1921, w: 512, h:  507 }, // quadratischer Raum
};

const ROOM_ATLAS_IMG = new Image();
ROOM_ATLAS_IMG.onload = () => { try { renderBlueprint(); } catch (_) {} };
ROOM_ATLAS_IMG.src = 'img/room_atlas.png';

// Zeichnet einen Atlas-Ausschnitt auf wallCanvas
function drawRoomModule(type, dx, dy, dw, dh) {
    if (!ROOM_ATLAS_IMG.complete || !ROOM_ATLAS_IMG.naturalWidth) return;
    const c = ROOM_ATLAS_COORDS[type];
    if (!c) return;
    wallCtx.drawImage(ROOM_ATLAS_IMG, c.x, c.y, c.w, c.h, dx, dy, dw, dh);
}

// Zeichnet alle Raum-Module als Bodenbelag (vor den Wandlinien)
function drawRoomImages(W, H) {
    const T = 6; // Inset damit Wandlinien nicht überlappen
    // [modul, x1%, y1%, x2%, y2%]
    // Modul-Wahl nach Raumverhältnis:
    // floor  = Portrait  (höher als breit, linker Flügel + Zentralhallen)
    // rect   = Landscape (breiter als hoch, rechter Korridor)
    // square = Quadrat   (rechte Einzelräume, oberer Korridor)
    const layout = [
        ['floor',  0.03, 0.15, 0.15, 0.52], // Raum A
        ['floor',  0.15, 0.15, 0.27, 0.52], // Raum B
        ['floor',  0.27, 0.15, 0.38, 0.52], // Raum C
        ['floor',  0.03, 0.52, 0.15, 0.88], // Raum D
        ['floor',  0.15, 0.52, 0.27, 0.88], // Raum E
        ['floor',  0.27, 0.52, 0.38, 0.88], // Raum F
        ['square', 0.43, 0.02, 0.52, 0.15], // Oberer Korridor
        ['floor',  0.38, 0.15, 0.55, 0.55], // Eingangshalle
        ['floor',  0.38, 0.55, 0.55, 0.96], // Hauptsaal
        ['rect',   0.55, 0.15, 0.97, 0.42], // Rechter Korridor
        ['square', 0.55, 0.42, 0.75, 0.75], // Raum G
        ['square', 0.75, 0.42, 0.97, 0.75], // Raum H
    ];

    wallCtx.save();
    wallCtx.globalAlpha = 0.88;
    layout.forEach(([type, x1, y1, x2, y2]) => {
        drawRoomModule(type,
            x1 * W + T, y1 * H + T,
            (x2 - x1) * W - 2 * T,
            (y2 - y1) * H - 2 * T
        );
    });
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

// ── Spencer Mansion – vereinfachter Grundriss inspiriert von RE1 ──────────────
// Linker Flügel : x[.03,.38]  y[.15,.88]  (3×2 Räume)
// Zentrum       : x[.38,.55]  y[.02,.96]  (Korridor + Eingangshalle + Hauptsaal)
// Rechter Flügel: x[.55,.97]  y[.15,.75]  (Korridor + 2 Räume)
function buildMansion() {
    GameState.walls     = [];
    GameState.doors     = [];
    GameState.furniture = [];
    // wallCanvas ist bereits weltgroß (2× Viewport)
    const W = wallCanvas.width, H = wallCanvas.height;
    GameState.worldW = W;
    GameState.worldH = H;
    const T  = 8;   // Wandstärke
    const DW = 52;  // Türbreite
    const DH = DW / 2; // halbe Türbreite

    // ── LINKER FLÜGEL – Außenwände ─────────────────────────────────────────
    addWall(W*.03, H*.15, W*.35, T);                          // N
    addWall(W*.03, H*.88, W*.35, T);                          // S
    addWall(W*.03, H*.15, T, H*.73);                          // W
    // Ostwand (= Westwand Zentrum): Tür 8 bei y_c=.33
    addWall(W*.38, H*.15, T, H*.33 - DH - H*.15);            // E oben
    addDoor(W*.38, H*.33 - DH, T, DW);                        // Tür 8 LW ↔ Zentrum
    addWall(W*.38, H*.33 + DH, T, H*.88 - H*.33 - DH);       // E unten

    // ── LINKER FLÜGEL – vertikale Trennwand x=.15 ─────────────────────────
    // Obere Reihe (y[.15,.52]) – Tür 1 A↔B bei y_c=.32
    addWall(W*.15, H*.15, T, H*.32 - DH - H*.15);
    addDoor(W*.15, H*.32 - DH, T, DW);                        // Tür 1 A ↔ B
    addWall(W*.15, H*.32 + DH, T, H*.52 - H*.32 - DH);
    // Untere Reihe (y[.52,.88]) – Tür 6 D↔E bei y_c=.68
    addWall(W*.15, H*.52, T, H*.68 - DH - H*.52);
    addDoor(W*.15, H*.68 - DH, T, DW);                        // Tür 6 D ↔ E
    addWall(W*.15, H*.68 + DH, T, H*.88 - H*.68 - DH);

    // ── LINKER FLÜGEL – vertikale Trennwand x=.27 ─────────────────────────
    // Obere Reihe – Tür 2 B↔C bei y_c=.32
    addWall(W*.27, H*.15, T, H*.32 - DH - H*.15);
    addDoor(W*.27, H*.32 - DH, T, DW);                        // Tür 2 B ↔ C
    addWall(W*.27, H*.32 + DH, T, H*.52 - H*.32 - DH);
    // Untere Reihe – Tür 7 E↔F bei y_c=.68
    addWall(W*.27, H*.52, T, H*.68 - DH - H*.52);
    addDoor(W*.27, H*.68 - DH, T, DW);                        // Tür 7 E ↔ F
    addWall(W*.27, H*.68 + DH, T, H*.88 - H*.68 - DH);

    // ── LINKER FLÜGEL – horizontale Trennwand y=.52 (Türen 3,4,5) ─────────
    // A↔D  x_c=.08
    addWall(W*.03, H*.52, W*.08 - DH - W*.03, T);
    addDoor(W*.08 - DH, H*.52, DW, T);                        // Tür 3 A ↔ D
    addWall(W*.08 + DH, H*.52, W*.15 - W*.08 - DH, T);
    // B↔E  x_c=.20
    addWall(W*.15, H*.52, W*.20 - DH - W*.15, T);
    addDoor(W*.20 - DH, H*.52, DW, T);                        // Tür 4 B ↔ E
    addWall(W*.20 + DH, H*.52, W*.27 - W*.20 - DH, T);
    // C↔F  x_c=.32
    addWall(W*.27, H*.52, W*.32 - DH - W*.27, T);
    addDoor(W*.32 - DH, H*.52, DW, T);                        // Tür 5 C ↔ F
    addWall(W*.32 + DH, H*.52, W*.38 - W*.32 - DH, T);

    // ── ZENTRUM ────────────────────────────────────────────────────────────
    // Schmaler Oberkorridor x[.43,.52] y[.02,.15]
    addWall(W*.43, H*.02, W*.09, T);                           // N
    addWall(W*.43, H*.02, T, H*.13);                           // W Korridor
    addWall(W*.52, H*.02, T, H*.13);                           // E Korridor
    // Nordwand Zentrum (Lücke für Korridor)
    addWall(W*.38, H*.15, W*.05, T);                           // N west
    addWall(W*.52, H*.15, W*.03, T);                           // N east
    // Südwand Hauptsaal
    addWall(W*.38, H*.96, W*.17, T);                           // S
    // Verlängerung der Westwand unter LF-Südwand
    addWall(W*.38, H*.88, T, H*.08);
    // Ostwand Zentrum (= Westwand rechter Flügel): Tür 10 bei y_c=.27
    addWall(W*.55, H*.15, T, H*.27 - DH - H*.15);
    addDoor(W*.55, H*.27 - DH, T, DW);                        // Tür 10 Zentrum ↔ Rechts
    addWall(W*.55, H*.27 + DH, T, H*.96 - H*.27 - DH);
    // Interne horizontale Trennwand y=.55: Eingangshalle ↔ Hauptsaal, Tür 9 x_c=.46
    addWall(W*.38, H*.55, W*.46 - DH - W*.38, T);
    addDoor(W*.46 - DH, H*.55, DW, T);                        // Tür 9 Halle ↔ Hauptsaal
    addWall(W*.46 + DH, H*.55, W*.55 - W*.46 - DH, T);

    // ── RECHTER FLÜGEL – Außenwände ────────────────────────────────────────
    addWall(W*.55, H*.15, W*.42, T);                           // N
    addWall(W*.55, H*.75, W*.42, T);                           // S
    addWall(W*.97, H*.15, T, H*.60);                           // E

    // Horizontale Trennwand y=.42 (Korridor ↔ Räume), Türen 11 & 12
    // Korridor→G  x_c=.63
    addWall(W*.55, H*.42, W*.63 - DH - W*.55, T);
    addDoor(W*.63 - DH, H*.42, DW, T);                        // Tür 11 Korridor → G
    addWall(W*.63 + DH, H*.42, W*.75 - W*.63 - DH, T);
    // Korridor→H  x_c=.84
    addWall(W*.75, H*.42, W*.84 - DH - W*.75, T);
    addDoor(W*.84 - DH, H*.42, DW, T);                        // Tür 12 Korridor → H
    addWall(W*.84 + DH, H*.42, W*.97 - W*.84 - DH, T);

    // Vertikale Trennwand G↔H  x=.75, Tür 13 y_c=.58
    addWall(W*.75, H*.42, T, H*.58 - DH - H*.42);
    addDoor(W*.75, H*.58 - DH, T, DW);                        // Tür 13 G ↔ H
    addWall(W*.75, H*.58 + DH, T, H*.75 - H*.58 - DH);

    // ── MÖBEL (raumgerecht platziert, Türbereiche freigehalten) ────────────
    // Room A – Trophäensaal x[.03,.15] y[.15,.52]
    addFurniture(W*.038, H*.162, W*.055, H*.030, 'cabinet'); // Vitrine N-links
    addFurniture(W*.102, H*.162, W*.038, H*.030, 'cabinet'); // Vitrine N-rechts
    addFurniture(W*.058, H*.290, W*.030, H*.030, 'plant');   // Sockel
    addFurniture(W*.090, H*.430, W*.030, H*.030, 'plant');   // Sockel

    // Room B – Speisezimmer x[.15,.27] y[.15,.52]
    addFurniture(W*.168, H*.210, W*.085, H*.060, 'table');   // Esstisch

    // Room C – Waffenzimmer x[.27,.38] y[.15,.52]
    addFurniture(W*.278, H*.162, W*.085, H*.025, 'cabinet'); // Waffenregal N
    addFurniture(W*.355, H*.170, W*.014, H*.090, 'cabinet'); // Regal E-Wand (über Tür 8)
    addFurniture(W*.280, H*.400, W*.070, H*.025, 'desk');    // Werkbank S

    // Room D – Bibliothek x[.03,.15] y[.52,.88]
    addFurniture(W*.038, H*.530, W*.014, H*.120, 'bookshelf'); // Regal W
    addFurniture(W*.095, H*.530, W*.014, H*.120, 'bookshelf'); // Regal Mitte
    addFurniture(W*.040, H*.725, W*.065, H*.028, 'desk');      // Schreibtisch

    // Room E – Archiv x[.15,.27] y[.52,.88]
    addFurniture(W*.158, H*.530, W*.028, H*.075, 'cabinet');   // Schrank W-1
    addFurniture(W*.158, H*.618, W*.028, H*.072, 'cabinet');   // Schrank W-2
    addFurniture(W*.202, H*.622, W*.055, H*.028, 'table');     // Tisch

    // Room F – Gemäldegalerie x[.27,.38] y[.52,.88]
    addFurniture(W*.278, H*.542, W*.078, H*.018, 'sofa');    // Bank N
    addFurniture(W*.278, H*.848, W*.078, H*.018, 'sofa');    // Bank S
    addFurniture(W*.316, H*.685, W*.018, H*.042, 'plant');   // Staffelei/Pflanze

    // Eingangshalle x[.38,.55] y[.15,.55]
    addFurniture(W*.392, H*.188, W*.020, H*.060, 'plant');   // Säule L
    addFurniture(W*.526, H*.188, W*.020, H*.060, 'plant');   // Säule R
    addFurniture(W*.432, H*.375, W*.055, H*.028, 'desk');    // Empfangstresen (weg v. Tür 9)

    // Hauptsaal x[.38,.55] y[.55,.96]
    addFurniture(W*.393, H*.605, W*.055, H*.022, 'sofa');    // Sofa N
    addFurniture(W*.393, H*.895, W*.055, H*.022, 'sofa');    // Sofa S
    addFurniture(W*.490, H*.718, W*.028, H*.028, 'table');   // Couchtisch

    // Östl. Korridor NE x[.55,.97] y[.15,.42]
    addFurniture(W*.882, H*.164, W*.060, H*.022, 'cabinet');

    // Lagerhalle G x[.55,.75] y[.42,.75]  — Tür 11 Lücke x[.604,.656]
    addFurniture(W*.560, H*.442, W*.028, H*.028, 'crate');
    addFurniture(W*.560, H*.476, W*.028, H*.028, 'crate');
    addFurniture(W*.672, H*.442, W*.028, H*.028, 'crate');
    addFurniture(W*.672, H*.476, W*.028, H*.028, 'crate');
    addFurniture(W*.712, H*.442, W*.025, H*.025, 'crate');
    addFurniture(W*.615, H*.598, W*.055, H*.035, 'cabinet');

    // Labor H x[.75,.97] y[.42,.75]  — Tür 12 Lücke x[.814,.866]
    addFurniture(W*.758, H*.436, W*.046, H*.025, 'desk');    // Labortisch NW
    addFurniture(W*.874, H*.436, W*.080, H*.025, 'desk');    // Labortisch NE
    addFurniture(W*.758, H*.708, W*.080, H*.025, 'desk');    // Labortisch S
    addFurniture(W*.889, H*.552, W*.025, H*.065, 'cabinet'); // Schrank E
    addFurniture(W*.802, H*.582, W*.030, H*.030, 'plant');   // Pflanze

    // ── SPAWN ─────────────────────────────────────────────────────────────
    // viewDistance kommt aus state.js (feste Feldanzahl, nicht viewport-abhängig)

    Entities.player.x = W * 0.465;
    Entities.player.y = H * 0.75;
    Entities.player.angle = -Math.PI / 2;

    // Soldat 1: patrouilliert im östlichen Korridor
    const e1 = Entities.enemies[0];
    e1.isDead = false; e1.currentWaypoint = 0; e1.hp = e1.maxHp; e1.ignoreUntil = 0;
    e1.waypoints = [
        { x: W * 0.65, y: H * 0.28 }, { x: W * 0.90, y: H * 0.28 },
        { x: W * 0.90, y: H * 0.36 }, { x: W * 0.65, y: H * 0.36 },
    ];
    e1.x = e1.waypoints[0].x; e1.y = e1.waypoints[0].y;

    // Soldat 2: patrouilliert in der Lagerhalle
    const e2 = Entities.enemies[1];
    e2.isDead = false; e2.currentWaypoint = 0; e2.hp = e2.maxHp; e2.ignoreUntil = 0;
    e2.waypoints = [
        { x: W * 0.58, y: H * 0.50 }, { x: W * 0.72, y: H * 0.50 },
        { x: W * 0.72, y: H * 0.65 }, { x: W * 0.58, y: H * 0.65 },
    ];
    e2.x = e2.waypoints[0].x; e2.y = e2.waypoints[0].y;

    // ── WELTGEGENSTÄNDE – nur beim ersten Laden / nach Reset ───────────────
    if (GameState.worldItems.length === 0) {
        // Medikit auf dem Couchtisch im Startraum (Zentrum/Eingangshalle)
        GameState.worldItems.push({
            id: 'world_medikit_1',
            type: 'medikit',
            label: 'Medikit',
            img: 'img/icon-medikit.svg',
            color: 'rgba(180,30,30,0.85)',
            x: W * 0.504,
            y: H * 0.732,
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

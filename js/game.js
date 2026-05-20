// --- SPIELER-VISUALS (einmalig berechnet, kein Flackern) ---
// Abgerissenes Papierstück – unregelmäßiges Polygon (~40×40px)
const SCRAP_VERTS = [
    [-19, -21], [-10, -19], [-2, -22], [ 7, -20], [15, -21], [21, -17],
    [ 22,  -8], [ 19,   2], [21,  11], [17,  20],
    [  8,  22], [ -1,  19], [-9,  21], [-18,  18],
    [-22,   9], [-19,  -1], [-21, -11]
];

// Bleistiftkreis Spieler – vorberechnete unrunde Kurve (Sinuswellen, kein Flackern)
const CIRCLE_VERTS = (() => {
    const pts = [], r = 9, n = 22;
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = r * (1 + 0.07 * Math.sin(a * 3 + 0.5) + 0.05 * Math.sin(a * 7 + 1.1));
        pts.push([Math.cos(a) * w, Math.sin(a) * w]);
    }
    return pts;
})();

// NPC – anderes Schnipsel-Polygon und leicht abweichender Kreis
const NPC_SCRAP_VERTS = [
    [-20, -18], [-11, -21], [-2, -19], [ 9, -22], [18, -19], [22, -9],
    [ 20,   1], [ 22,  12], [17,  21],
    [  6,  22], [ -5,  19], [-15,  21], [-21, 15],
    [-22,   4], [-19,  -9]
];
const NPC_CIRCLE_VERTS = (() => {
    const pts = [], r = 9, n = 22;
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = r * (1 + 0.08 * Math.sin(a * 4 + 1.0) + 0.04 * Math.sin(a * 6 + 2.3));
        pts.push([Math.cos(a) * w, Math.sin(a) * w]);
    }
    return pts;
})();

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

// --- GLOBALE STATUS-OBJEKTE ---
// Diese Objekte halten den aktuellen Stand des Spiels, damit ui.js sie lesen und verändern kann.
const GameState = {
    running: false,
    paused: false,
    isTouching: false,
    targetX: 0,
    targetY: 0,
    walls: [],
    doors: [],
    furniture: [],
    activeDoor: null,
    worldW: 0,
    worldH: 0,
    camera: { x: 0, y: 0 },
    enemySeen: false,
    combatTriggered: false,
    outcome: ''
};

const Entities = {
    stats: { playerKG: 65, enemyParry: 40 },
    player: { x: 0, y: 0, radius: 9, angle: -Math.PI / 2, speed: 2.2, fov: 75 * Math.PI / 180, viewDistance: 160, isAttacking: false },
    enemy: { x: 0, y: 0, radius: 9, angle: 0, speed: 0.8, fov: 60 * Math.PI / 180, viewDistance: 140, waypoints: [], currentWaypoint: 0, isDead: false }
};

const Input = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };

// --- DOM ELEMENTE FÜR CANVAS ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const wallCanvas = document.getElementById('wallCanvas');
const wallCtx = wallCanvas.getContext('2d');
const exploredCanvas = document.getElementById('exploredCanvas');
const exploredCtx = exploredCanvas.getContext('2d');

// --- SETUP & INIT ---
function initGame() {
    GameState.running = true;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('touchstart', (e) => { if(!GameState.paused){ GameState.isTouching = true; updateTarget(e.touches[0].clientX, e.touches[0].clientY); } }, {passive: false});
    canvas.addEventListener('touchmove', (e) => { if(!GameState.paused){ e.preventDefault(); updateTarget(e.touches[0].clientX, e.touches[0].clientY); } }, {passive: false});
    canvas.addEventListener('touchend', () => GameState.isTouching = false);
    canvas.addEventListener('mousedown', (e) => { if(!GameState.paused){ GameState.isTouching = true; updateTarget(e.clientX, e.clientY); } });
    canvas.addEventListener('mousemove', (e) => { if(!GameState.paused && GameState.isTouching) updateTarget(e.clientX, e.clientY); });
    canvas.addEventListener('mouseup', () => GameState.isTouching = false);

    window.addEventListener('keydown', (e) => {
        if(Input.hasOwnProperty(e.key)) Input[e.key] = true;
        if(Input.hasOwnProperty(e.key.toLowerCase())) Input[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', (e) => {
        if(Input.hasOwnProperty(e.key)) Input[e.key] = false;
        if(Input.hasOwnProperty(e.key.toLowerCase())) Input[e.key.toLowerCase()] = false;
    });

    requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
    const paper = document.getElementById('paper');
    canvas.width  = paper.clientWidth;
    canvas.height = paper.clientHeight;
    // Welt = 2× Viewport; wallCanvas/exploredCanvas in Weltgröße
    wallCanvas.width  = exploredCanvas.width  = canvas.width  * 2;
    wallCanvas.height = exploredCanvas.height = canvas.height * 2;
    buildMansion();
}

function addWall(x, y, w, h) { GameState.walls.push({ x, y, width: w, height: h }); }
function addDoor(x, y, w, h) { GameState.doors.push({ x, y, w, h, open: false, triggered: false }); }
function addFurniture(x, y, w, h, type) { GameState.furniture.push({ x, y, w, h, type }); }

// Spencer Mansion – vereinfachter Grundriss inspiriert von RE1
// Linker Flügel : x[.03,.38]  y[.15,.88]  (3×2 Räume)
// Zentrum       : x[.38,.55]  y[.02,.96]  (Korridor + Eingangshalle + Hauptsaal)
// Rechter Flügel: x[.55,.97]  y[.15,.75]  (Korridor + 2 Räume)
function buildMansion() {
    GameState.walls = [];
    GameState.doors = [];
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

    // ── SKALIERUNG & SPAWN ─────────────────────────────────────────────────
    const scale = Math.min(W, H) / 600;
    Entities.player.viewDistance = Math.round(160 * scale);
    Entities.enemy.viewDistance  = Math.round(140 * scale);

    Entities.player.x = W * 0.465;
    Entities.player.y = H * 0.75;
    Entities.player.angle = -Math.PI / 2;

    Entities.enemy.isDead = false;
    Entities.enemy.currentWaypoint = 0;
    Entities.enemy.waypoints = [
        { x: W * 0.65, y: H * 0.28 },
        { x: W * 0.90, y: H * 0.28 },
        { x: W * 0.90, y: H * 0.36 },
        { x: W * 0.65, y: H * 0.36 },
    ];
    Entities.enemy.x = Entities.enemy.waypoints[0].x;
    Entities.enemy.y = Entities.enemy.waypoints[0].y;

    renderBlueprint();
}

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

function drawFurniture(item) {
    const { x, y, w, h, type } = item;
    wallCtx.save();
    wallCtx.lineCap = 'round';
    wallCtx.lineJoin = 'round';
    wallCtx.strokeStyle = 'rgba(50, 35, 20, 0.82)';
    wallCtx.lineWidth = 1.4;

    function outline() {
        drawSketchLine(wallCtx, x,   y,   x+w, y  );
        drawSketchLine(wallCtx, x+w, y,   x+w, y+h);
        drawSketchLine(wallCtx, x+w, y+h, x,   y+h);
        drawSketchLine(wallCtx, x,   y+h, x,   y  );
    }

    switch (type) {
        case 'bookshelf':
            wallCtx.fillStyle = 'rgba(125, 85, 40, 0.28)';
            wallCtx.fillRect(x, y, w, h);
            outline();
            wallCtx.lineWidth = 0.9;
            const ns = Math.max(2, Math.floor(h / 18));
            for (let s = 1; s < ns; s++)
                drawSketchLine(wallCtx, x+2, y+(h/ns)*s, x+w-2, y+(h/ns)*s);
            break;

        case 'bed':
            wallCtx.fillStyle = 'rgba(170, 148, 118, 0.26)';
            wallCtx.fillRect(x, y, w, h);
            outline();
            wallCtx.lineWidth = 1.0;
            wallCtx.beginPath();
            if (w >= h) wallCtx.ellipse(x+w*0.2, y+h/2, w*0.14, h*0.32, 0, 0, Math.PI*2);
            else        wallCtx.ellipse(x+w/2, y+h*0.2, w*0.32, h*0.14, 0, 0, Math.PI*2);
            wallCtx.stroke();
            break;

        case 'table':
            wallCtx.fillStyle = 'rgba(150, 110, 65, 0.22)';
            wallCtx.fillRect(x, y, w, h);
            outline();
            wallCtx.fillStyle = 'rgba(50,35,20,0.55)';
            [[x+4,y+4],[x+w-4,y+4],[x+4,y+h-4],[x+w-4,y+h-4]].forEach(([px,py]) => {
                wallCtx.beginPath(); wallCtx.arc(px,py,2,0,Math.PI*2); wallCtx.fill();
            });
            break;

        case 'desk':
            wallCtx.fillStyle = 'rgba(148, 108, 58, 0.22)';
            wallCtx.fillRect(x, y, w, h);
            outline();
            wallCtx.lineWidth = 0.8;
            if (w >= h) drawSketchLine(wallCtx, x+6, y+3, x+w-6, y+3);
            else        drawSketchLine(wallCtx, x+3, y+6, x+3, y+h-6);
            break;

        case 'cabinet':
            wallCtx.fillStyle = 'rgba(120, 84, 44, 0.30)';
            wallCtx.fillRect(x, y, w, h);
            outline();
            wallCtx.lineWidth = 0.9;
            if (w >= h) {
                drawSketchLine(wallCtx, x+w/2, y+2, x+w/2, y+h-2);
                wallCtx.fillStyle = 'rgba(50,35,20,0.60)';
                [[x+w/4,y+h/2],[x+3*w/4,y+h/2]].forEach(([px,py]) => {
                    wallCtx.beginPath(); wallCtx.arc(px,py,2,0,Math.PI*2); wallCtx.fill();
                });
            } else {
                drawSketchLine(wallCtx, x+2, y+h/2, x+w-2, y+h/2);
                wallCtx.fillStyle = 'rgba(50,35,20,0.60)';
                [[x+w/2,y+h/4],[x+w/2,y+3*h/4]].forEach(([px,py]) => {
                    wallCtx.beginPath(); wallCtx.arc(px,py,2,0,Math.PI*2); wallCtx.fill();
                });
            }
            break;

        case 'plant': {
            const pr = Math.min(w,h)/2, pcx = x+w/2, pcy = y+h/2;
            wallCtx.fillStyle = 'rgba(55, 92, 42, 0.30)';
            wallCtx.beginPath(); wallCtx.arc(pcx,pcy,pr,0,Math.PI*2); wallCtx.fill();
            wallCtx.strokeStyle = 'rgba(38, 64, 28, 0.85)';
            wallCtx.beginPath(); wallCtx.arc(pcx,pcy,pr,0,Math.PI*2); wallCtx.stroke();
            wallCtx.lineWidth = 0.9;
            for (let a = 0; a < Math.PI*2; a += Math.PI/3)
                drawSketchLine(wallCtx, pcx, pcy, pcx+Math.cos(a)*pr*0.62, pcy+Math.sin(a)*pr*0.62);
            break;
        }

        case 'crate':
            wallCtx.fillStyle = 'rgba(140, 100, 52, 0.28)';
            wallCtx.fillRect(x, y, w, h);
            outline();
            wallCtx.lineWidth = 0.9;
            drawSketchLine(wallCtx, x+3, y+3, x+w-3, y+h-3);
            drawSketchLine(wallCtx, x+w-3, y+3, x+3, y+h-3);
            break;

        case 'sofa':
            wallCtx.fillStyle = 'rgba(155, 122, 92, 0.26)';
            wallCtx.fillRect(x, y, w, h);
            outline();
            wallCtx.lineWidth = 1.0;
            if (w >= h) {
                drawSketchLine(wallCtx, x+2,    y+h*0.38, x+w-2,   y+h*0.38);
                drawSketchLine(wallCtx, x+w*0.12, y+h*0.38, x+w*0.12, y+h-2);
                drawSketchLine(wallCtx, x+w*0.88, y+h*0.38, x+w*0.88, y+h-2);
            } else {
                drawSketchLine(wallCtx, x+w*0.38, y+2,     x+w*0.38, y+h-2);
                drawSketchLine(wallCtx, x+w*0.38, y+h*0.12, x+w-2,   y+h*0.12);
                drawSketchLine(wallCtx, x+w*0.38, y+h*0.88, x+w-2,   y+h*0.88);
            }
            break;
    }
    wallCtx.restore();
}

function renderBlueprint() {
    const W = wallCanvas.width, H = wallCanvas.height;
    wallCtx.clearRect(0, 0, W, H);

    // Staircase hatch marks (drawn before walls so walls render on top)

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

    // Room labels
    wallCtx.font = `bold ${Math.max(9, W*0.013)}px 'Kalam', cursive`;
    wallCtx.fillStyle = 'rgba(80, 60, 40, 0.55)';
    wallCtx.textAlign = 'center';
    wallCtx.textBaseline = 'middle';
    const lbl = (txt, fx, fy) => wallCtx.fillText(txt, W*fx, H*fy);
    // Linker Flügel
    lbl('Trophäensaal',   0.09, 0.335);
    lbl('Speisezimmer',   0.21, 0.335);
    lbl('Waffenzimmer',   0.325, 0.335);
    lbl('Bibliothek',     0.09, 0.700);
    lbl('Archiv',         0.21, 0.700);
    lbl('Gemäldegalerie', 0.325, 0.700);
    // Zentrum
    lbl('Korridor',       0.475, 0.085);
    lbl('Eingangshalle',  0.465, 0.350);
    lbl('Hauptsaal',      0.465, 0.755);
    // Rechter Flügel
    lbl('Östl. Korridor', 0.760, 0.285);
    lbl('Lagerhalle',     0.635, 0.585);
    lbl('Laborkorridor',  0.860, 0.585);

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

// --- PHYSIK & LOGIK ---
function updateTarget(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    // Bildschirmkoordinaten → Weltkoordinaten
    GameState.targetX = (clientX - rect.left) * (canvas.width / rect.width)  + GameState.camera.x;
    GameState.targetY = (clientY - rect.top)  * (canvas.height / rect.height) + GameState.camera.y;
}

function updateCamera() {
    const p  = Entities.player;
    const vw = canvas.width, vh = canvas.height;
    GameState.camera.x = Math.max(0, Math.min(p.x - vw / 2, GameState.worldW - vw));
    GameState.camera.y = Math.max(0, Math.min(p.y - vh / 2, GameState.worldH - vh));
}

function lineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
    const uB = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
    return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1);
}

function lineIntersectsRect(x1, y1, x2, y2, rect) {
    const rx = rect.x, ry = rect.y, rw = rect.width, rh = rect.height;
    return lineIntersect(x1,y1, x2,y2, rx,ry, rx+rw,ry) || lineIntersect(x1,y1, x2,y2, rx,ry, rx,ry+rh) || lineIntersect(x1,y1, x2,y2, rx+rw,ry, rx+rw,ry+rh) || lineIntersect(x1,y1, x2,y2, rx,ry+rh, rx+rw,ry+rh);
}

function canSee(observer, target) {
    const dx = target.x - observer.x; const dy = target.y - observer.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > observer.viewDistance) return false;
    const angleToTarget = Math.atan2(dy, dx);
    let diff = angleToTarget - observer.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > observer.fov / 2) return false;
    for (let w of GameState.walls)     { if (lineIntersectsRect(observer.x, observer.y, target.x, target.y, w)) return false; }
    for (let d of GameState.doors)     { if (!d.open && lineIntersectsRect(observer.x, observer.y, target.x, target.y, {x:d.x,y:d.y,width:d.w,height:d.h})) return false; }
    for (let f of GameState.furniture) { if (lineIntersectsRect(observer.x, observer.y, target.x, target.y, {x:f.x,y:f.y,width:f.w,height:f.h})) return false; }
    return true;
}

function checkCollision(nx, ny, obj) {
    const r = obj.radius;
    for (let w of GameState.walls)      { if (nx+r > w.x && nx-r < w.x+w.width  && ny+r > w.y && ny-r < w.y+w.height) return true; }
    for (let d of GameState.doors)      { if (!d.open && nx+r > d.x && nx-r < d.x+d.w && ny+r > d.y && ny-r < d.y+d.h) return true; }
    for (let f of GameState.furniture)  { if (nx+r > f.x && nx-r < f.x+f.w && ny+r > f.y && ny-r < f.y+f.h) return true; }
    return false;
}

// Gibt Wände + geschlossene Türen als einheitliche Rechtecksliste zurück.
function getObstacles() {
    const closedDoors = GameState.doors.filter(d => !d.open)
        .map(d => ({ x: d.x, y: d.y, width: d.w, height: d.h }));
    const furn = GameState.furniture.map(f => ({ x: f.x, y: f.y, width: f.w, height: f.h }));
    return [...GameState.walls, ...closedDoors, ...furn];
}

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

function updatePlayer() {
    const player = Entities.player; const enemy = Entities.enemy;

    if (player.isAttacking) {
        const dx = enemy.x - player.x; const dy = enemy.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy); player.angle = Math.atan2(dy, dx);
        if (dist < 12) {
            player.isAttacking = false; enemy.isDead = true; GameState.enemySeen = false; GameState.combatTriggered = false;
            // Schnipsel dauerhaft auf wallCanvas einbrennen, dann Blut darüber
            drawEntityScrap(wallCtx, enemy, NPC_SCRAP_VERTS, NPC_CIRCLE_VERTS, 'rgba(140, 35, 35, 0.90)');
            wallCtx.fillStyle = 'rgba(180, 30, 30, 0.7)'; wallCtx.beginPath();
            for(let i=0; i < Math.PI*2; i += 0.4) { let r = 10 + Math.random() * 8; wallCtx.lineTo(enemy.x + Math.cos(i)*r, enemy.y + Math.sin(i)*r); } wallCtx.fill();
        } else {
            player.x += Math.cos(player.angle) * (player.speed * 4); player.y += Math.sin(player.angle) * (player.speed * 4);
        } return;
    }

    let moveX = 0; let moveY = 0;
    if (Input.w || Input.ArrowUp) moveY -= 1;
    if (Input.s || Input.ArrowDown) moveY += 1;
    if (Input.a || Input.ArrowLeft) moveX -= 1;
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
        const dx = GameState.targetX - player.x; const dy = GameState.targetY - player.y; const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
            player.angle = Math.atan2(dy, dx);
            const nextX = player.x + Math.cos(player.angle) * player.speed; const nextY = player.y + Math.sin(player.angle) * player.speed;
            if (!checkCollision(nextX, player.y, player)) player.x = nextX;
            if (!checkCollision(player.x, nextY, player)) player.y = nextY;
        }
    }
}

function updateEnemy() {
    const enemy = Entities.enemy;
    if (enemy.isDead) return;
    const wp = enemy.waypoints[enemy.currentWaypoint]; const dx = wp.x - enemy.x; const dy = wp.y - enemy.y; const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) { enemy.currentWaypoint = (enemy.currentWaypoint + 1) % enemy.waypoints.length; } else { enemy.angle = Math.atan2(dy, dx); enemy.x += Math.cos(enemy.angle) * enemy.speed; enemy.y += Math.sin(enemy.angle) * enemy.speed; }
}

function checkCombatState() {
    if (Entities.enemy.isDead) return;

    const playerSeesEnemy = canSee(Entities.player, Entities.enemy);
    const enemySeesPlayer = canSee(Entities.enemy, Entities.player);

    GameState.enemySeen = playerSeesEnemy;

    if (!GameState.combatTriggered) {
        if (enemySeesPlayer) {
            GameState.paused = true; GameState.isTouching = false;
            document.getElementById('enemy-spotted-menu').style.display = 'flex';
            GameState.combatTriggered = true;
        } else if (playerSeesEnemy) {
            GameState.paused = true; GameState.isTouching = false;
            document.getElementById('combat-menu').style.display = 'flex';
            GameState.combatTriggered = true;
        }
    }

    if (!playerSeesEnemy && !enemySeesPlayer) { GameState.combatTriggered = false; }
}

// --- SICHTBARKEITS-RAYCASTING ---
// Gibt den Parameter t zurück, bei dem der Strahl (ox,oy)+t*(dx,dy) das Segment (x1,y1)-(x2,y2) trifft.
function raySegmentT(ox, oy, dx, dy, x1, y1, x2, y2) {
    const ex = x2 - x1, ey = y2 - y1;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-8) return null;
    const t = ((x1 - ox) * ey - (y1 - oy) * ex) / denom;
    const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;
    if (t > 1e-6 && u >= 0 && u <= 1) return t;
    return null;
}

// Berechnet das genaue Sichtbarkeits-Polygon durch Raycasting an allen Wandecken.
function computeVisibilityPolygon(px, py, angle, fov, viewDist, walls) {
    const half = fov / 2;

    // Winkel in [angle-π, angle+π] normalisieren
    function norm(a) {
        let d = a - angle;
        while (d >  Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return angle + d;
    }

    // Kandidaten: FOV-Kanten + alle Wandecken (±ε für saubere Schattenkanten)
    const candidates = [norm(angle - half), norm(angle + half)];
    for (const w of walls) {
        for (const [cx, cy] of [[w.x, w.y], [w.x+w.width, w.y], [w.x, w.y+w.height], [w.x+w.width, w.y+w.height]]) {
            const a = norm(Math.atan2(cy - py, cx - px));
            if (Math.abs(a - angle) <= half) {
                candidates.push(a - 0.00005, a, a + 0.00005);
            }
        }
    }

    // Pro Kandidaten-Winkel: nächste Wandkollision finden.
    const pts = [];
    const hitWallIndices = new Set();

    for (const a of candidates) {
        if (Math.abs(a - angle) > half + 0.001) continue;
        const dx = Math.cos(a), dy = Math.sin(a);
        let t = viewDist;
        let hitIdx = -1;
        for (let wi = 0; wi < walls.length; wi++) {
            const w = walls[wi];
            for (const [x1,y1,x2,y2] of [
                [w.x,         w.y,          w.x+w.width,  w.y         ],
                [w.x+w.width, w.y,          w.x+w.width,  w.y+w.height],
                [w.x+w.width, w.y+w.height, w.x,          w.y+w.height],
                [w.x,         w.y+w.height, w.x,          w.y         ],
            ]) {
                const hit = raySegmentT(px, py, dx, dy, x1, y1, x2, y2);
                if (hit !== null && hit < t) { t = hit; hitIdx = wi; }
            }
        }
        if (hitIdx !== -1) hitWallIndices.add(hitIdx);
        pts.push([a, px + dx * t, py + dy * t]);
    }

    pts.sort((a, b) => a[0] - b[0]);
    return { pts, hitWallIndices };
}

// --- RENDER ---
function drawGame() {
    updateCamera();
    const cam = GameState.camera;
    const player = Entities.player; const enemy = Entities.enemy;

    if (!GameState.paused) {
        const obstacles = getObstacles();
        const { pts, hitWallIndices } = computeVisibilityPolygon(
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
        for (const wi of hitWallIndices) {
            const obs = obstacles[wi];
            exploredCtx.fillRect(obs.x, obs.y, obs.width, obs.height);
        }
    }

    // Welt-Canvas auf Viewport zugeschnitten zeichnen
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(exploredCanvas, -cam.x, -cam.y);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(wallCanvas, -cam.x, -cam.y);
    ctx.globalCompositeOperation = 'source-over';

    // Alle Weltobjekte mit Kamera-Offset zeichnen
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    ctx.strokeStyle = 'rgba(70, 70, 70, 0.15)'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(player.angle - player.fov/2) * player.viewDistance, player.y + Math.sin(player.angle - player.fov/2) * player.viewDistance);
    ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(player.angle + player.fov/2) * player.viewDistance, player.y + Math.sin(player.angle + player.fov/2) * player.viewDistance); ctx.stroke();

    if (!enemy.isDead && GameState.enemySeen) {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(player.x, player.y);
        ctx.arc(player.x, player.y, player.viewDistance, player.angle - player.fov / 2, player.angle + player.fov / 2);
        ctx.closePath(); ctx.clip();
        // NPC-Sichtkegellinien
        ctx.strokeStyle = 'rgba(200, 50, 50, 0.15)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.x + Math.cos(enemy.angle - enemy.fov/2) * enemy.viewDistance, enemy.y + Math.sin(enemy.angle - enemy.fov/2) * enemy.viewDistance);
        ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.x + Math.cos(enemy.angle + enemy.fov/2) * enemy.viewDistance, enemy.y + Math.sin(enemy.angle + enemy.fov/2) * enemy.viewDistance);
        ctx.stroke();
        // NPC als Papierschnipsel
        drawEntityScrap(ctx, enemy, NPC_SCRAP_VERTS, NPC_CIRCLE_VERTS, 'rgba(140, 35, 35, 0.90)');
        ctx.restore();
    }

    // Spieler als Papierschnipsel
    drawEntityScrap(ctx, player, SCRAP_VERTS, CIRCLE_VERTS, 'rgba(35, 30, 25, 0.88)');


    if (!enemy.isDead && !GameState.enemySeen) {
        const dx = enemy.x - player.x; const dy = enemy.y - player.y; const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= player.viewDistance * 2) {
            const angleToEnemy = Math.atan2(dy, dx);
            const textRadius = Math.min(dist - 15, player.viewDistance * 0.85);
            const textX = player.x + Math.cos(angleToEnemy) * textRadius;
            const textY = player.y + Math.sin(angleToEnemy) * textRadius;
            const pulse = 0.3 + 0.7 * Math.abs(Math.sin(Date.now() / 400));

            ctx.save();
            ctx.font = "700 16px 'Kalam'"; ctx.fillStyle = `rgba(180, 50, 50, ${pulse})`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            const wobble = Math.sin(Date.now() / 200) * 0.05;
            ctx.translate(textX, textY); ctx.rotate(wobble);
            ctx.fillText("tap... tap...", 0, 0);
            ctx.restore();
        }
    }

    ctx.restore(); // Kamera-Transform beenden
}

function gameLoop() {
    if (!GameState.running) return;
    if (!GameState.paused) { updatePlayer(); updateEnemy(); checkCombatState(); checkDoorProximity(); }
    drawGame(); requestAnimationFrame(gameLoop);
}
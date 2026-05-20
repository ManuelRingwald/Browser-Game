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

// --- WAFFEN & KAMPF-KONSTANTEN ---
const WEAPONS = {
    faust:        { name: 'Faustkampf',   n:1, s:4, range:70,  blockbar:true,  ammoKey:null },
    messer:       { name: 'Messer',        n:1, s:6, range:70,  blockbar:true,  ammoKey:null },
    pistole:      { name: 'Pistole',       n:1, s:8, range:500, blockbar:false, ammoKey:'pistole' },
    schrotflinte: { name: 'Schrotflinte',  n:2, s:6, range:250, blockbar:false, ammoKey:'schrotflinte' },
};

function rollDice(n, s) {
    let t = 0;
    for (let i = 0; i < n; i++) t += Math.floor(Math.random() * s) + 1;
    return t;
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
    zoom: 0.70,   // < 1 = herausgezoomt (mehr Karte sichtbar)
    enemySeen: false,
    combatTriggered: false,
    combatEnemyFirst: false,
    combatResult: null,
    combatWeapon: null,
    combatTarget: null,
    combatTargets: [],
    combatPhase: 'player',
    combatAP: 4,
    combatMaxAP: 4,
    combatDodging: false,
    combatGridVisible: false,
    combatMoving: false,
    combatAmbush: false,
    combatPlayerHeard: false,
    selectingDirection: false,
    postMoveRotation: false,
    pendingNoiseMsg: null,
    hoverGridCell: null,   // {col,row} – aktuell gehovertes Rasterfeld
    hoverDirIdx: null,     // 0-7 – aktuell gehoveter Richtungspfeil
};

const Entities = {
    player: {
        x: 0, y: 0, radius: 9, angle: -Math.PI / 2, speed: 2.2,
        fov: 75 * Math.PI / 180, viewDistance: 160,
        hp: 12, maxHp: 12,
        angriff: 65, ausweichen: 40, blockwert: 45,
        ammo: { pistole: 12, schrotflinte: 6 },
    },
    enemies: [
        { x:0, y:0, radius:9, angle:0, speed:0.8, fov:60*Math.PI/180, viewDistance:140,
          waypoints:[], currentWaypoint:0, isDead:false, ignoreUntil:0,
          hp:8, maxHp:8, angriff:50, ausweichen:30, blockwert:35,
          waffe:'pistole', ammo:{ pistole:12, schrotflinte:0 }, name:'Soldat' },
        { x:0, y:0, radius:9, angle:0, speed:0.8, fov:60*Math.PI/180, viewDistance:140,
          waypoints:[], currentWaypoint:0, isDead:false, ignoreUntil:0,
          hp:8, maxHp:8, angriff:50, ausweichen:30, blockwert:35,
          waffe:'pistole', ammo:{ pistole:12, schrotflinte:0 }, name:'Soldat' },
    ],
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

    // Richtungswahl nach Bewegung (Maus)
    canvas.addEventListener('click', e => {
        if (!GameState.selectingDirection) return;
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        handleDirectionSelection(
            (e.clientX - rect.left) * (canvas.width / rect.width) / z + GameState.camera.x,
            (e.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y
        );
    });

    // Richtungswahl nach Bewegung (Touch)
    canvas.addEventListener('touchend', e => {
        if (!GameState.selectingDirection || Anim.running) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect  = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        handleDirectionSelection(
            (touch.clientX - rect.left) * (canvas.width / rect.width) / z + GameState.camera.x,
            (touch.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y
        );
    }, { passive: false });

    // Hover-Tracking für Raster-Felder und Richtungspfeile
    canvas.addEventListener('mousemove', e => {
        if (!GameState.combatMoving) {
            GameState.hoverGridCell = null; GameState.hoverDirIdx = null; return;
        }
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        const wx = (e.clientX - rect.left) * (canvas.width / rect.width)  / z + GameState.camera.x;
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

    // Raster-Klick im Kampf (Maus) — Zoom berücksichtigen
    canvas.addEventListener('click', e => {
        if (!GameState.combatMoving) return;
        const rect = canvas.getBoundingClientRect();
        const z = GameState.zoom;
        handleGridClick(
            (e.clientX - rect.left) * (canvas.width / rect.width)  / z + GameState.camera.x,
            (e.clientY - rect.top)  * (canvas.height / rect.height) / z + GameState.camera.y
        );
    });

    // Raster-Klick im Kampf (Touch)
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
// blockSight: hohe/undurchsichtige Objekte versperren die Sicht (Schrank, Regal).
// Niedrige/transparente Objekte (Tisch, Stuhl, Pflanze…) werden aus jeder Richtung erkannt.
const SIGHT_BLOCKING_TYPES = new Set(['cabinet', 'bookshelf']);

function addFurniture(x, y, w, h, type) {
    GameState.furniture.push({ x, y, w, h, type, blockSight: SIGHT_BLOCKING_TYPES.has(type) });
}

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
    Entities.enemies.forEach(e => { e.viewDistance = Math.round(140 * scale); });

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

    // Raumlabels entfernt – Räume werden beim Betreten entdeckt, nicht vorab benannt

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
    for (let f of GameState.furniture) { if (f.blockSight && lineIntersectsRect(observer.x, observer.y, target.x, target.y, {x:f.x,y:f.y,width:f.w,height:f.h})) return false; }
    return true;
}

function checkCollision(nx, ny, obj) {
    const r = obj.radius;
    for (let w of GameState.walls)      { if (nx+r > w.x && nx-r < w.x+w.width  && ny+r > w.y && ny-r < w.y+w.height) return true; }
    for (let d of GameState.doors)      { if (!d.open && nx+r > d.x && nx-r < d.x+d.w && ny+r > d.y && ny-r < d.y+d.h) return true; }
    for (let f of GameState.furniture) {
        if (f.type === 'plant') {
            const fr = Math.min(f.w, f.h) / 2;
            const pdx = nx - (f.x + f.w/2), pdy = ny - (f.y + f.h/2);
            if (pdx*pdx + pdy*pdy < (fr + r) * (fr + r)) return true;
        } else {
            if (nx+r > f.x && nx-r < f.x+f.w && ny+r > f.y && ny-r < f.y+f.h) return true;
        }
    }
    return false;
}

// Gibt Wände + geschlossene Türen als einheitliche Rechtecksliste zurück.
function getObstacles() {
    const closedDoors = GameState.doors.filter(d => !d.open)
        .map(d => ({ x: d.x, y: d.y, width: d.w, height: d.h }));
    // Nur sichtblockierende Möbel (Schrank, Regal) ins Raycasting einbeziehen.
    // Niedrige Objekte (Tisch, Stuhl etc.) sind aus jeder Richtung sichtbar.
    const sightFurn = GameState.furniture
        .filter(f => f.blockSight)
        .map(f => ({ x: f.x, y: f.y, width: f.w, height: f.h }));
    return [...GameState.walls, ...closedDoors, ...sightFurn];
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

function updatePlayer() {
    const player = Entities.player;

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

// ── RUNDENBASIERTER KAMPF ─────────────────────────────────────────────────

const FELD_PX = 60;
const AP_KOSTEN = { angriff: 2, bewegen: 1, ausweichen: 1, nachladen: 1 };
// Kampf wird erst ausgelöst wenn Gegner innerhalb dieser Distanz ist
// Kampfauslösung bei 80% der Spieler-Sichtweite (dynamisch nach Auflösung)
function combatTriggerDist() { return Entities.player.viewDistance * 0.80; }

// Bewegt den Spieler im Kampf (richtung: 1=annähern, -1=zurückweichen)
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

// Gibt zurück ob ein Rasterfeld bereits durch Spieler oder Gegner belegt ist.
// exceptEntity: die Entität, die sich gerade bewegt (wird ignoriert).
function cellOccupied(col, row, exceptEntity) {
    const GS = FELD_PX;
    const p = Entities.player;
    if (exceptEntity !== p &&
        Math.floor(p.x / GS) === col && Math.floor(p.y / GS) === row) return true;
    for (const e of Entities.enemies) {
        if (e === exceptEntity || e.isDead) continue;
        if (Math.floor(e.x / GS) === col && Math.floor(e.y / GS) === row) return true;
    }
    return false;
}

// Prüft Sichtlinie von (x1,y1) nach (x2,y2) – berücksichtigt Wände, Türen, blockierende Möbel.
function hasLOS(x1, y1, x2, y2) {
    for (const w of GameState.walls) {
        if (lineIntersectsRect(x1, y1, x2, y2, w)) return false;
    }
    for (const d of GameState.doors) {
        if (!d.open && lineIntersectsRect(x1, y1, x2, y2, {x:d.x,y:d.y,width:d.w,height:d.h})) return false;
    }
    for (const f of GameState.furniture) {
        if (f.blockSight && lineIntersectsRect(x1, y1, x2, y2, {x:f.x,y:f.y,width:f.w,height:f.h})) return false;
    }
    return true;
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

// Startet den Spieler-Zug (AP auffüllen, Phase wechseln).
function startEnemyTurnReset() {
    GameState.combatPlayerHeard = false; // Lärm wird nach Feind-Zug vergessen
}

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
    // Verlängerung entlang der Wand-EINWÄRTSNORMALE (senkrecht zur Wandfläche).
    // Eindringtiefe = EXT, unabhängig vom Einfallswinkel des Strahls.
    // EXT = 5px: deckt Skizzenlinie (T/2=4px tief) ab ohne durch Wand zu gehen (T=8px).
    const EXT = 5;
    const pts = [];

    for (const a of candidates) {
        if (Math.abs(a - angle) > half + 0.001) continue;
        const dx = Math.cos(a), dy = Math.sin(a);
        let t = viewDist;
        let hnx = 0, hny = 0; // Einwärtsnormale der getroffenen Fläche

        for (const w of walls) {
            // [x1,y1,x2,y2, normalX, normalY] — Normale zeigt INS Wandinnere
            for (const [x1,y1,x2,y2,nx,ny] of [
                [w.x,          w.y,          w.x+w.width,  w.y,           0, +1], // oben  → runter
                [w.x+w.width,  w.y,          w.x+w.width,  w.y+w.height, -1,  0], // rechts→ links
                [w.x+w.width,  w.y+w.height, w.x,          w.y+w.height,  0, -1], // unten → hoch
                [w.x,          w.y+w.height, w.x,          w.y,          +1,  0], // links → rechts
            ]) {
                const h = raySegmentT(px, py, dx, dy, x1, y1, x2, y2);
                if (h !== null && h < t) { t = h; hnx = nx; hny = ny; }
            }
        }

        // Polygon-Endpunkt in Normalenrichtung verschieben → lückenlose Wandabdeckung
        pts.push([a, px + dx * t + hnx * EXT, py + dy * t + hny * EXT]);
    }

    pts.sort((a, b) => a[0] - b[0]);
    return { pts };
}

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

// ── RASTER-KAMPFSYSTEM ───────────────────────────────────────────────────

// Zeichnet das Kampfraster und Bewegungshighlights (muss innerhalb des
// Kamera-Transforms aufgerufen werden → Weltkoordinaten).
// ── ANIMATIONS-QUEUE ─────────────────────────────────────────────────────
// Einfaches sequenzielles Animations-System.
// Jeder Schritt hat: duration (ms), onStart(), onUpdate(t, ease), onComplete().
const Anim = {
    _q: [],
    _t0: 0,

    push(step) { this._q.push(step); },

    update(now) {
        if (!this._q.length) return;
        const s = this._q[0];
        if (!s._started) {
            s._started = true; this._t0 = now;
            if (s.onStart) s.onStart.call(s);
        }
        const raw = Math.min(1, (now - this._t0) / (s.duration || 300));
        const ease = raw < 0.5 ? 2*raw*raw : -1+(4-2*raw)*raw;
        if (s.onUpdate) s.onUpdate.call(s, raw, ease);
        if (raw >= 1) {
            this._q.shift();
            if (s.onComplete) s.onComplete.call(s);
        }
    },

    clear() { this._q = []; },
    get running() { return this._q.length > 0; },
};

// Hilfsfunktionen für Animationen
function lerpAngle(a, b, t) {
    let d = b - a;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

// Animiert Spieler von aktueller zu Zielposition; ruft onDone am Ende auf.
// Aktualisiert exploredCanvas kontinuierlich während der Bewegung (keine Lücken im Nebel).
function animatePlayerMove(tx, ty, onDone) {
    const p = Entities.player;
    const sx = p.x, sy = p.y;
    const faceAngle = Math.atan2(ty - sy, tx - sx);
    Anim.push({
        duration: 320,
        onStart() { p.angle = faceAngle; },
        onUpdate(_, e) {
            p.x = sx + (tx - sx) * e;
            p.y = sy + (ty - sy) * e;
            // Nebel entlang des gesamten Weges aufdecken
            const obstacles = getObstacles();
            const { pts } = computeVisibilityPolygon(
                p.x, p.y, p.angle, p.fov, p.viewDistance, obstacles
            );
            if (pts.length >= 2) {
                exploredCtx.fillStyle = 'black';
                exploredCtx.beginPath();
                exploredCtx.moveTo(p.x, p.y);
                for (const [, x, y] of pts) exploredCtx.lineTo(x, y);
                exploredCtx.closePath();
                exploredCtx.fill();
            }
        },
        onComplete: onDone,
    });
}

// Kampfraster komplett in Screen-Space – garantiert volle Canvas-Abdeckung.
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
    // Erste sichtbare Linie: wo das Gitter den linken/oberen Rand schneidet
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

// Verarbeitet einen Klick auf das Kampfraster (Weltkoordinaten).
// ── RICHTUNGSWAHL NACH BEWEGUNG ──────────────────────────────────────────────

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
        // Aktuelle Blickrichtung oder gehoverte Richtung hervorheben
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

// Baut einen Manhattan-Pfad (Zellen-Koordinaten-Liste).
function buildManhattanCells(fc, fr, tc, tr, colsFirst) {
    const sc = tc > fc ? 1 : tc < fc ? -1 : 0;
    const sr = tr > fr ? 1 : tr < fr ? -1 : 0;
    const cells = [];
    let c = fc, r = fr;
    if (colsFirst) {
        while (c !== tc) { c += sc; cells.push([c, r]); }
        while (r !== tr) { r += sr; cells.push([c, r]); }
    } else {
        while (r !== tr) { r += sr; cells.push([c, r]); }
        while (c !== tc) { c += sc; cells.push([c, r]); }
    }
    return cells;
}
// Gibt den wandfreien Manhattan-Pfad zurück (probiert beide Reihenfolgen).
function getMovePath(fc, fr, tc, tr) {
    const p1 = buildManhattanCells(fc, fr, tc, tr, true);
    const GS = FELD_PX, r = GS * 0.35;
    const clear = cells => cells.every(([c2,r2]) => !checkCollision((c2+0.5)*GS,(r2+0.5)*GS,{radius:r}));
    return clear(p1) ? p1 : buildManhattanCells(fc, fr, tc, tr, false);
}

// Himmelsrichtung vom Ausgangspunkt zum Zielfeld (Deutsch, 8 Richtungen).
function getCardinalDir(fromCol, fromRow, toCol, toRow) {
    const dx = toCol - fromCol, dy = toRow - fromRow;
    if (dx === 0 && dy === 0) return '';
    const deg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    // Canvas: y↓=Süd, y↑=Nord
    return ['O','SO','S','SW','W','NW','N','NO'][Math.round(deg / 45) % 8];
}

// Prüft einen Manhattan-Teilpfad (entweder erst Spalten oder erst Zeilen).
function _tryManhattanPath(pCol, pRow, col, row, colsFirst) {
    const GS = FELD_PX, r = GS * 0.38;
    const sc = col > pCol ? 1 : col < pCol ? -1 : 0;
    const sr = row > pRow ? 1 : row < pRow ? -1 : 0;
    let c = pCol, rw = pRow;
    if (colsFirst) {
        while (c !== col)  { c  += sc; if (checkCollision((c  + 0.5)*GS, (rw + 0.5)*GS, {radius:r})) return false; }
        while (rw !== row) { rw += sr; if (checkCollision((c  + 0.5)*GS, (rw + 0.5)*GS, {radius:r})) return false; }
    } else {
        while (rw !== row) { rw += sr; if (checkCollision((c  + 0.5)*GS, (rw + 0.5)*GS, {radius:r})) return false; }
        while (c !== col)  { c  += sc; if (checkCollision((c  + 0.5)*GS, (rw + 0.5)*GS, {radius:r})) return false; }
    }
    return true;
}

// Ein Feld ist erreichbar, wenn MINDESTENS EINER der beiden Manhattan-Pfade
// (erst Spalten oder erst Zeilen) wandfrei ist.
function gridPathClear(pCol, pRow, col, row) {
    return _tryManhattanPath(pCol, pRow, col, row, true)
        || _tryManhattanPath(pCol, pRow, col, row, false);
}

// Winkel der 8 Richtungspfeile (gleiche Reihenfolge wie in drawDirectionArrows)
const DIR_ANGLES = [-Math.PI/2, -Math.PI/4, 0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, -3*Math.PI/4];

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

// HP-Ring + AP-Punkte direkt am Spieler-Charakter – nur während aktivem Kampf.
function drawPlayerHUD(p) {
    if (!GameState.combatTriggered) return;
    const frac  = Math.max(0, p.hp / p.maxHp);
    const ringR = p.radius + 7;
    const col   = frac > 0.5 ? 'rgba(45,160,45,0.90)'
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
    // Ignoriert = grau; sonst farbig nach HP
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

// --- RENDER ---
function drawGame() {
    updateCamera();
    const cam = GameState.camera;
    const player = Entities.player; const enemy = Entities.enemy;

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

    // (Kampfraster wird NACH dem Fog-of-War als UI-Overlay gezeichnet)

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
    ctx.fillStyle = hpFrac > 0.5 ? 'rgba(55,130,50,0.90)' : hpFrac > 0.25 ? 'rgba(195,135,25,0.90)' : 'rgba(160,35,35,0.90)';
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

function gameLoop() {
    if (!GameState.running) return;
    if (!GameState.paused) { updatePlayer(); updateEnemy(); checkCombatState(); checkDoorProximity(); }
    drawGame(); requestAnimationFrame(gameLoop);
}
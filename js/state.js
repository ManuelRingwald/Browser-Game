// =============================================================================
// state.js – Globaler Spielzustand, Entitäten, Eingabe, Canvas-Referenzen
// Wird nach config.js geladen.
// =============================================================================

// ── Canvas-Elemente ───────────────────────────────────────────────────────────
const canvas        = document.getElementById('gameCanvas');
const ctx           = canvas.getContext('2d');
const wallCanvas    = document.getElementById('wallCanvas');
const wallCtx       = wallCanvas.getContext('2d');
const exploredCanvas= document.getElementById('exploredCanvas');
const exploredCtx   = exploredCanvas.getContext('2d');

// ── Globaler Spielzustand ─────────────────────────────────────────────────────
const GameState = {
    // Grundzustand
    running: false,
    paused: false,
    isTouching: false,
    targetX: 0,
    targetY: 0,

    // Weltinhalt
    walls:     [],
    doors:     [],
    furniture: [],
    activeDoor: null,

    // Kamera & Ansicht
    worldW: 0,
    worldH: 0,
    camera: { x: 0, y: 0 },
    zoom: 0.70,

    // Sicht & Kampf-Auslösung
    enemySeen: false,
    combatTriggered: false,
    combatEnemyFirst: false,
    combatAmbush: false,
    combatPlayerHeard: false,

    // Kampf-Zug
    combatResult: null,
    combatPhase: 'player',
    combatAP: 4,
    combatMaxAP: 4,
    combatDodging: false,

    // Kampf-Ziele & Waffe
    combatWeapon: null,
    combatTarget: null,
    combatTargets: [],

    // Kampf-Raster & Bewegung
    combatGridVisible: false,
    combatMoving: false,
    selectingDirection: false,
    postMoveRotation: false,
    pendingNoiseMsg: null,
    hoverGridCell: null,
    hoverDirIdx: null,
};

// ── Entitäten ─────────────────────────────────────────────────────────────────
const Entities = {
    player: {
        x: 0, y: 0, radius: 9, angle: -Math.PI / 2, speed: 2.2,
        fov: 75 * Math.PI / 180, viewDistance: 160,
        hp: 12, maxHp: 12,
        angriff: 65, ausweichen: 40, blockwert: 45,
        ammo: { pistole: 12, schrotflinte: 6 },
    },
    enemies: [
        {
            x:0, y:0, radius:9, angle:0, speed:0.8,
            fov: 60 * Math.PI / 180, viewDistance: 140,
            waypoints:[], currentWaypoint:0, isDead:false, ignoreUntil:0,
            hp:8, maxHp:8, angriff:50, ausweichen:30, blockwert:35,
            waffe:'pistole', ammo:{ pistole:12, schrotflinte:0 }, name:'Soldat',
        },
        {
            x:0, y:0, radius:9, angle:0, speed:0.8,
            fov: 60 * Math.PI / 180, viewDistance: 140,
            waypoints:[], currentWaypoint:0, isDead:false, ignoreUntil:0,
            hp:8, maxHp:8, angriff:50, ausweichen:30, blockwert:35,
            waffe:'pistole', ammo:{ pistole:12, schrotflinte:0 }, name:'Soldat',
        },
    ],
};

// ── Tastatureingabe ───────────────────────────────────────────────────────────
const Input = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
};

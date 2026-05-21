// =============================================================================
// config.js – Konstanten, Waffen, visuelle Daten
// Wird zuerst geladen; alle anderen Dateien können auf diese Konstanten zugreifen.
// =============================================================================

// ── Raster & Aktionspunkte ────────────────────────────────────────────────────
const FELD_PX = 60;                  // Pixel pro Rasterfeld (Weltkoordinaten)
const AP_KOSTEN = { angriff: 2, bewegen: 1, ausweichen: 1, nachladen: 1 };

// Kampfauslösung bei 80 % der Spieler-Sichtweite
function combatTriggerDist() { return Entities.player.viewDistance * 0.80; }

// ── Waffen ────────────────────────────────────────────────────────────────────
const WEAPONS = {
    faust:        { name: 'Faustkampf',  n:1, s:4, range:90,  blockbar:true,  ammoKey:null },
    messer:       { name: 'Messer',       n:1, s:6, range:90,  blockbar:true,  ammoKey:null },
    pistole:      { name: 'Pistole',      n:1, s:8, range:500, blockbar:false, ammoKey:'pistole' },
    schrotflinte: { name: 'Schrotflinte', n:2, s:6, range:250, blockbar:false, ammoKey:'schrotflinte' },
};

function rollDice(n, s) {
    let t = 0;
    for (let i = 0; i < n; i++) t += Math.floor(Math.random() * s) + 1;
    return t;
}

// Zweihandwaffen: beim Ausrüsten in einen Slot wird der andere als Geist gespiegelt
const TWO_HANDED_WEAPONS = new Set(['schrotflinte']);

// ── Möbel-Kategorien ─────────────────────────────────────────────────────────
// Schrank und Regal blockieren die Sichtlinie; alle anderen Möbel nicht.
const SIGHT_BLOCKING_TYPES = new Set(['cabinet', 'bookshelf']);

// ── Richtungspfeile (8 Richtungen, Winkel in Radiant) ────────────────────────
const DIR_ANGLES = [
    -Math.PI/2,       // ↑ Nord
    -Math.PI/4,       // ↗ Nordost
     0,               // → Ost
     Math.PI/4,       // ↘ Südost
     Math.PI/2,       // ↓ Süd
     3*Math.PI/4,     // ↙ Südwest
     Math.PI,         // ← West
    -3*Math.PI/4,     // ↖ Nordwest
];

// ── Geschoss-Schnipsel (klein, unregelmäßig – wird für Pistole & Schrotflinte genutzt) ──
const BULLET_SCRAP_VERTS = [
    [-9,-4],[-4,-6],[2,-5],[7,-3],
    [8, 2],[6, 5],[0, 6],[-6, 4],[-9, 1],
];

// ── Spieler-Visuals (einmalig berechnet, kein Flackern) ──────────────────────
const SCRAP_VERTS = [
    [-19,-21],[-10,-19],[-2,-22],[7,-20],[15,-21],[21,-17],
    [22,-8],[19,2],[21,11],[17,20],
    [8,22],[-1,19],[-9,21],[-18,18],
    [-22,9],[-19,-1],[-21,-11],
];

const CIRCLE_VERTS = (() => {
    const pts = [], r = 9, n = 22;
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = r * (1 + 0.07 * Math.sin(a * 3 + 0.5) + 0.05 * Math.sin(a * 7 + 1.1));
        pts.push([Math.cos(a) * w, Math.sin(a) * w]);
    }
    return pts;
})();

const NPC_SCRAP_VERTS = [
    [-20,-18],[-11,-21],[-2,-19],[9,-22],[18,-19],[22,-9],
    [20,1],[22,12],[17,21],
    [6,22],[-5,19],[-15,21],[-21,15],
    [-22,4],[-19,-9],
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

// =============================================================================
// animation.js – Animations-Queue und Bewegungsanimationen
// Ladeordnung: config.js → state.js → map.js → physics.js → animation.js
//
// Verantwortlich für:
//   - Anim          (sequenzielles Animations-System mit onStart/onUpdate/onComplete)
//   - lerpAngle     (Winkelinterpolation über kürzesten Weg)
//   - animatePlayerMove (Spieler-Bewegung animiert + Nebel aufdecken)
//
// Globale Abhängigkeiten: Entities, exploredCtx,
//                         getObstacles, computeVisibilityPolygon (physics.js)
// =============================================================================

// ── Animations-Queue ──────────────────────────────────────────────────────────
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

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

// Interpoliert zwischen zwei Winkeln über den kürzesten Weg.
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

// =============================================================================
// physics.js – Kollision, Sichtbarkeit und Wegfindung
// Ladeordnung: config.js → state.js → map.js → physics.js
//
// Verantwortlich für:
//   - lineIntersect / lineIntersectsRect   (geometrische Schnitt-Tests)
//   - raySegmentT                          (Strahl-Segment-Schnittpunkt)
//   - computeVisibilityPolygon             (Raycasting FOV-Polygon)
//   - checkCollision                       (Entität gegen Wände/Türen/Möbel)
//   - canSee                               (FOV + LOS Sichtbarkeitscheck)
//   - getObstacles                         (Hindernisliste für Raycasting)
//   - hasLOS                               (reine Sichtlinienprüfung ohne FOV)
//   - cellOccupied                         (Rasterfeld belegt?)
//   - buildManhattanCells / getMovePath /
//     _tryManhattanPath / gridPathClear    (Gitter-Wegfindung)
//
// Globale Abhängigkeiten: GameState, Entities, FELD_PX
// =============================================================================

// ── Geometrie-Grundlagen ──────────────────────────────────────────────────────

function lineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
    const uB = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
    return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1);
}

function lineIntersectsRect(x1, y1, x2, y2, rect) {
    const rx = rect.x, ry = rect.y, rw = rect.width, rh = rect.height;
    return lineIntersect(x1,y1, x2,y2, rx,ry, rx+rw,ry)
        || lineIntersect(x1,y1, x2,y2, rx,ry, rx,ry+rh)
        || lineIntersect(x1,y1, x2,y2, rx+rw,ry, rx+rw,ry+rh)
        || lineIntersect(x1,y1, x2,y2, rx,ry+rh, rx+rw,ry+rh);
}

// ── Raycasting ────────────────────────────────────────────────────────────────

// Gibt den Parameter t zurück, bei dem der Strahl (ox,oy)+t*(dx,dy) das
// Segment (x1,y1)-(x2,y2) trifft.
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
        for (const [cx, cy] of [
            [w.x, w.y], [w.x+w.width, w.y],
            [w.x, w.y+w.height], [w.x+w.width, w.y+w.height]
        ]) {
            const a = norm(Math.atan2(cy - py, cx - px));
            if (Math.abs(a - angle) <= half) {
                candidates.push(a - 0.00005, a, a + 0.00005);
            }
        }
    }

    // Pro Kandidaten-Winkel: nächste Wandkollision finden.
    // EXT: wie tief das Sichtfeld in die Wandfläche eindringt.
    // Höherer Wert = mehr Wandtiefe sichtbar. Wände sind ~28-30px dick,
    // EXT=20 zeigt ~70% der Wanddicke ohne auf die andere Seite durchzukommen.
    const EXT = 20;
    const pts = [];

    for (const a of candidates) {
        if (Math.abs(a - angle) > half + 0.001) continue;
        const dx = Math.cos(a), dy = Math.sin(a);
        let t = viewDist;
        let hnx = 0, hny = 0; // Einwärtsnormale der getroffenen Fläche

        for (const w of walls) {
            // [x1,y1,x2,y2, normalX, normalY] — Normale zeigt INS Wandinnere
            for (const [x1,y1,x2,y2,nx,ny] of [
                [w.x,         w.y,          w.x+w.width,  w.y,           0, +1], // oben  → runter
                [w.x+w.width, w.y,          w.x+w.width,  w.y+w.height, -1,  0], // rechts→ links
                [w.x+w.width, w.y+w.height, w.x,          w.y+w.height,  0, -1], // unten → hoch
                [w.x,         w.y+w.height, w.x,          w.y,          +1,  0], // links → rechts
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

// ── Kollisionserkennung ───────────────────────────────────────────────────────

function checkCollision(nx, ny, obj) {
    const r = obj.radius;
    for (let w of GameState.walls) {
        if (nx+r > w.x && nx-r < w.x+w.width && ny+r > w.y && ny-r < w.y+w.height) return true;
    }
    for (let d of GameState.doors) {
        if (!d.open && nx+r > d.x && nx-r < d.x+d.w && ny+r > d.y && ny-r < d.y+d.h) return true;
    }
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

// ── Sichtbarkeit ──────────────────────────────────────────────────────────────

function canSee(observer, target) {
    const dx = target.x - observer.x;
    const dy = target.y - observer.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > observer.viewDistance) return false;
    const angleToTarget = Math.atan2(dy, dx);
    let diff = angleToTarget - observer.angle;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > observer.fov / 2) return false;
    for (let w of GameState.walls) {
        if (lineIntersectsRect(observer.x, observer.y, target.x, target.y, w)) return false;
    }
    for (let d of GameState.doors) {
        if (!d.open && lineIntersectsRect(observer.x, observer.y, target.x, target.y,
            {x:d.x, y:d.y, width:d.w, height:d.h})) return false;
    }
    for (let f of GameState.furniture) {
        if (f.blockSight && lineIntersectsRect(observer.x, observer.y, target.x, target.y,
            {x:f.x, y:f.y, width:f.w, height:f.h})) return false;
    }
    return true;
}

// Kampf-Sichtcheck: kein FOV-Winkel, nur Wand-LOS.
// Engagement-Zone (≤ 1,5 Felder) → immer true, unabhängig von Wänden.
function canSeeInCombat(observer, target) {
    const dx   = target.x - observer.x;
    const dy   = target.y - observer.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Engagement-Zone: zu nah um sich zu ignorieren
    if (dist <= FELD_PX * 1.5) return true;

    // Außerhalb: Reichweiten-Cap (2× viewDistance, mind. 400px)
    if (dist > Math.max(observer.viewDistance * 2, 400)) return false;

    // Wand-/Tür-/Möbel-LOS ohne FOV-Winkelprüfung
    for (const w of GameState.walls) {
        if (lineIntersectsRect(observer.x, observer.y, target.x, target.y, w)) return false;
    }
    for (const d of GameState.doors) {
        if (!d.open && lineIntersectsRect(observer.x, observer.y, target.x, target.y,
            { x: d.x, y: d.y, width: d.w, height: d.h })) return false;
    }
    for (const f of GameState.furniture) {
        if (f.blockSight && lineIntersectsRect(observer.x, observer.y, target.x, target.y,
            { x: f.x, y: f.y, width: f.w, height: f.h })) return false;
    }
    return true;
}

// Gibt Wände + geschlossene Türen + sichtblockierende Möbel als einheitliche
// Rechtecksliste zurück (für Raycasting).
function getObstacles() {
    const closedDoors = GameState.doors.filter(d => !d.open)
        .map(d => ({ x: d.x, y: d.y, width: d.w, height: d.h }));
    // Nur sichtblockierende Möbel (Schrank, Regal) ins Raycasting einbeziehen.
    const sightFurn = GameState.furniture
        .filter(f => f.blockSight)
        .map(f => ({ x: f.x, y: f.y, width: f.w, height: f.h }));
    return [...GameState.walls, ...closedDoors, ...sightFurn];
}

// Prüft Sichtlinie von (x1,y1) nach (x2,y2) ohne FOV-Winkelcheck.
function hasLOS(x1, y1, x2, y2) {
    for (const w of GameState.walls) {
        if (lineIntersectsRect(x1, y1, x2, y2, w)) return false;
    }
    for (const d of GameState.doors) {
        if (!d.open && lineIntersectsRect(x1, y1, x2, y2,
            {x:d.x, y:d.y, width:d.w, height:d.h})) return false;
    }
    for (const f of GameState.furniture) {
        if (f.blockSight && lineIntersectsRect(x1, y1, x2, y2,
            {x:f.x, y:f.y, width:f.w, height:f.h})) return false;
    }
    return true;
}

// ── Gitter-Wegfindung ─────────────────────────────────────────────────────────

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

// Baut einen Chebyshev-Pfad (8-Richtungen, Diagonalschritte erlaubt).
// Jeder Schritt bewegt sich um max(|dc|,|dr|)=1 in die nächstgelegene Richtung.
function buildChebyshevPath(fc, fr, tc, tr) {
    const cells = [];
    let c = fc, r = fr;
    while (c !== tc || r !== tr) {
        if (c !== tc) c += tc > c ? 1 : -1;
        if (r !== tr) r += tr > r ? 1 : -1;
        cells.push([c, r]);
    }
    return cells;
}

// Gibt den Chebyshev-Pfad zurück (für Highlight-Anzeige).
function getMovePath(fc, fr, tc, tr) {
    return buildChebyshevPath(fc, fr, tc, tr);
}

// Prüft ob ein Chebyshev-Schritt wandfrei ist.
// Bei Diagonalschritten werden auch beide Orthogonal-Zwischenfelder geprüft
// (verhindert "Ecken-Clipping" durch Wandecken).
function _checkDiagonalStep(c, r, nc, nr) {
    const GS = FELD_PX, rad = GS * 0.38;
    const blocked = (cx, cy) => checkCollision((cx + 0.5) * GS, (cy + 0.5) * GS, { radius: rad });
    if (blocked(nc, nr)) return false;
    // Bei Diagonalschritt: beide angrenzenden Orthogonalfelder prüfen
    if (nc !== c && nr !== r) {
        if (blocked(nc, r) && blocked(c, nr)) return false; // Ecke vollständig blockiert
    }
    return true;
}

// Chebyshev-Pfad-Check: alle Schritte entlang des Chebyshev-Pfads wandfrei?
function gridPathClear(pCol, pRow, col, row) {
    const path = buildChebyshevPath(pCol, pRow, col, row);
    let c = pCol, r = pRow;
    for (const [nc, nr] of path) {
        if (!_checkDiagonalStep(c, r, nc, nr)) return false;
        c = nc; r = nr;
    }
    return true;
}

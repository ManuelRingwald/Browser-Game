// --- GLOBALE STATUS-OBJEKTE ---
// Diese Objekte halten den aktuellen Stand des Spiels, damit ui.js sie lesen und verändern kann.
const GameState = {
    running: false,
    paused: false,
    isTouching: false,
    targetX: 0,
    targetY: 0,
    walls: [],
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
    canvas.width = wallCanvas.width = exploredCanvas.width = paper.clientWidth;
    canvas.height = wallCanvas.height = exploredCanvas.height = paper.clientHeight;
    buildMansion();
}

function addWall(x, y, w, h) { GameState.walls.push({ x, y, width: w, height: h }); }

// RE1 Spencer Mansion – Ground Floor
// Rooms (in canvas fractions):
//   Entrance Corridor : x[.44,.56]  y[.80,.96]
//   Main Hall         : x[.30,.70]  y[.46,.80]  (grand staircase centre)
//   North Landing     : x[.30,.70]  y[.23,.46]
//   Study             : x[.42,.58]  y[.04,.23]
//   West Wing         : x[.05,.30]  y[.04,.80]  (dining upper / corridor lower)
//   East Hall         : x[.70,.95]  y[.28,.80]
//   NE Store          : x[.70,.95]  y[.04,.28]
function buildMansion() {
    GameState.walls = [];
    const W = canvas.width, H = canvas.height;
    const T = 8; // wall thickness

    // ── OUTER PERIMETER ──────────────────────────────────────────────────
    addWall(W*.05,     H*.04,      W*.90, T);          // N outer
    addWall(W*.05,     H*.96-T,    W*.38, T);          // S outer west  (entrance gap .44→.56)
    addWall(W*.57,     H*.96-T,    W*.38, T);          // S outer east
    addWall(W*.05,     H*.04,      T, H*.92);          // W outer
    addWall(W*.95-T,   H*.04,      T, H*.92);          // E outer

    // ── ENTRANCE CORRIDOR  x[.44,.56]  y[.80,.96] ───────────────────────
    addWall(W*.44,  H*.80,  T,      H*.16);            // left wall
    addWall(W*.56,  H*.80,  T,      H*.16);            // right wall

    // ── MAIN HALL  x[.30,.70]  y[.46,.80] ───────────────────────────────
    // south wall (side pieces beside entrance opening)
    addWall(W*.30,  H*.80,  W*.14,  T);                // SW piece
    addWall(W*.56,  H*.80,  W*.14,  T);                // SE piece
    // west wall  (door gap y[.61,.69])
    addWall(W*.30,  H*.46,  T,  H*.15);                // upper  .46→.61
    addWall(W*.30,  H*.69,  T,  H*.11);                // lower  .69→.80
    // east wall  (door gap y[.57,.65])
    addWall(W*.70,  H*.46,  T,  H*.11);                // upper  .46→.57
    addWall(W*.70,  H*.65,  T,  H*.15);                // lower  .65→.80
    // north wall  (staircase opening x[.44,.56])
    addWall(W*.30,  H*.46,  W*.14,  T);                // west piece
    addWall(W*.56,  H*.46,  W*.14,  T);                // east piece

    // GRAND STAIRCASE FEATURE – two stone blocks + top railing
    addWall(W*.415, H*.53,  W*.055, H*.15);            // left stair block
    addWall(W*.53,  H*.53,  W*.055, H*.15);            // right stair block
    addWall(W*.415, H*.53,  W*.17,  T/2);              // connecting top railing

    // ── NORTH LANDING  x[.30,.70]  y[.23,.46] ───────────────────────────
    // north wall  (door to study x[.44,.56])
    addWall(W*.30,  H*.23,  W*.14,  T);                // west piece
    addWall(W*.56,  H*.23,  W*.14,  T);                // east piece
    // west wall  (door gap y[.33,.41])
    addWall(W*.30,  H*.23,  T,  H*.10);                // upper  .23→.33
    addWall(W*.30,  H*.41,  T,  H*.05);                // lower  .41→.46
    // east wall  (door gap y[.33,.41])
    addWall(W*.70,  H*.23,  T,  H*.10);                // upper  .23→.33
    addWall(W*.70,  H*.41,  T,  H*.05);                // lower  .41→.46

    // ── STUDY  x[.42,.58]  y[.04,.23] ───────────────────────────────────
    addWall(W*.42,  H*.04,  T,  H*.19);                // west wall
    addWall(W*.58,  H*.04,  T,  H*.19);                // east wall
    // south wall stubs (door gap x[.44,.56] provided by landing north wall)
    addWall(W*.42,  H*.23,  W*.02,  T);
    addWall(W*.56,  H*.23,  W*.02,  T);

    // ── WEST WING  x[.05,.30]  y[.04,.80] ───────────────────────────────
    // east wall top section (above north landing)
    addWall(W*.30,  H*.04,  T,  H*.19);                // y .04→.23

    // horizontal divider at y=.38 — splits DINING (upper) from W.CORRIDOR (lower)
    // door gap x[.14,.22]
    addWall(W*.05,  H*.38,  W*.09,  T);                // west piece
    addWall(W*.22,  H*.38,  W*.08,  T);                // east piece

    // NW interior wall at x=.17 — creates Trophy Room vs Dining Room
    // door gap y[.12,.20]
    addWall(W*.17,  H*.04,  T,  H*.08);                // upper  .04→.12
    addWall(W*.17,  H*.20,  T,  H*.18);                // lower  .20→.38

    // ── EAST HALL  x[.70,.95]  y[.28,.80] ───────────────────────────────
    // west wall top (above main-hall east door)
    addWall(W*.70,  H*.28,  T,  H*.18);                // y .28→.46
    // north wall  (door gap x[.77,.87])
    addWall(W*.70,  H*.28,  W*.07, T);                 // west piece
    addWall(W*.87,  H*.28,  W*.08, T);                 // east piece
    // south wall
    addWall(W*.70,  H*.80,  W*.25, T);

    // interior horizontal divider at y=.52 — closes off upper east room
    // (top room x[.70,.83] y[.28,.52]; corridor x[.70,.95] y[.52,.80])
    addWall(W*.70,  H*.52,  W*.13, T);                 // x .70→.83
    // interior vertical divider at x=.83 in upper east room (door gap y[.36,.44])
    addWall(W*.83,  H*.28,  T,  H*.08);                // upper  .28→.36
    addWall(W*.83,  H*.44,  T,  H*.08);                // lower  .44→.52

    // ── NE STORE  x[.70,.95]  y[.04,.28] ────────────────────────────────
    // west wall (connects outer north to east hall north wall)
    addWall(W*.70,  H*.04,  T,  H*.24);                // y .04→.28

    // ── PLAYER & ENEMY ───────────────────────────────────────────────────
    Entities.player.x = W * 0.50;
    Entities.player.y = H * 0.91;
    Entities.player.angle = -Math.PI / 2;              // facing north (into mansion)

    Entities.enemy.isDead = false;
    Entities.enemy.currentWaypoint = 0;
    // Patrol rectangle in east corridor (below the horizontal divider at y=.52)
    Entities.enemy.waypoints = [
        { x: W * 0.79, y: H * 0.58 },
        { x: W * 0.88, y: H * 0.58 },
        { x: W * 0.88, y: H * 0.72 },
        { x: W * 0.79, y: H * 0.72 },
    ];
    Entities.enemy.x = Entities.enemy.waypoints[0].x;
    Entities.enemy.y = Entities.enemy.waypoints[0].y;

    renderBlueprint();
}

function renderBlueprint() {
    const W = wallCanvas.width, H = wallCanvas.height;
    wallCtx.clearRect(0, 0, W, H);

    // Staircase hatch marks (drawn before walls so walls render on top)
    drawStairsHatch(W*.415, H*.53, W*.17, H*.15);

    // Walls
    GameState.walls.forEach(wall => {
        wallCtx.fillStyle = 'rgba(80, 80, 80, 0.18)';
        wallCtx.fillRect(wall.x, wall.y, wall.width, wall.height);
        wallCtx.strokeStyle = 'rgba(55, 55, 55, 0.90)';
        wallCtx.lineWidth = 1.3;
        wallCtx.strokeRect(wall.x + (Math.random()-0.5)*0.6, wall.y + (Math.random()-0.5)*0.6, wall.width, wall.height);
        wallCtx.strokeStyle = 'rgba(80,80,80,0.4)';
        wallCtx.lineWidth = 0.6;
        wallCtx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    });

    // Room labels
    wallCtx.font = `bold ${Math.max(9, W*0.013)}px 'Kalam', cursive`;
    wallCtx.fillStyle = 'rgba(80, 60, 40, 0.55)';
    wallCtx.textAlign = 'center';
    wallCtx.textBaseline = 'middle';
    const lbl = (txt, fx, fy) => wallCtx.fillText(txt, W*fx, H*fy);
    lbl('Eingang',        0.50, 0.885);
    lbl('Eingangshalle',  0.50, 0.735);
    lbl('Treppenhaus',    0.50, 0.595);
    lbl('Treppenabsatz',  0.50, 0.343);
    lbl('Arbeitszimmer',  0.50, 0.135);
    lbl('Speisezimmer',   0.17, 0.210);
    lbl('Trophäenraum',   0.11, 0.082);
    lbl('Westkorridor',   0.17, 0.590);
    lbl('Ostflügel',      0.83, 0.660);
    lbl('Lagerraum',      0.83, 0.160);

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
    GameState.targetX = (clientX - rect.left) * (canvas.width / rect.width);
    GameState.targetY = (clientY - rect.top) * (canvas.height / rect.height);
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
    for (let w of GameState.walls) { if (lineIntersectsRect(observer.x, observer.y, target.x, target.y, w)) return false; }
    return true;
}

function checkCollision(nx, ny, obj) {
    for (let wall of GameState.walls) { if (nx + obj.radius > wall.x && nx - obj.radius < wall.x + wall.width && ny + obj.radius > wall.y && ny - obj.radius < wall.y + wall.height) return true; }
    return false;
}

function updatePlayer() {
    const player = Entities.player; const enemy = Entities.enemy;

    if (player.isAttacking) {
        const dx = enemy.x - player.x; const dy = enemy.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy); player.angle = Math.atan2(dy, dx);
        if (dist < 12) {
            player.isAttacking = false; enemy.isDead = true; GameState.enemySeen = false; GameState.combatTriggered = false;
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

// --- RENDER ---
function drawGame() {
    const player = Entities.player; const enemy = Entities.enemy;

    if (!GameState.paused) {
        exploredCtx.fillStyle = 'black'; exploredCtx.beginPath(); exploredCtx.moveTo(player.x, player.y);
        exploredCtx.arc(player.x, player.y, player.viewDistance, player.angle - player.fov / 2, player.angle + player.fov / 2);
        exploredCtx.closePath(); exploredCtx.fill();
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(exploredCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(wallCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = 'rgba(70, 70, 70, 0.15)'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(player.angle - player.fov/2) * player.viewDistance, player.y + Math.sin(player.angle - player.fov/2) * player.viewDistance);
    ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(player.angle + player.fov/2) * player.viewDistance, player.y + Math.sin(player.angle + player.fov/2) * player.viewDistance); ctx.stroke();

    if (!enemy.isDead) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(player.x, player.y);
        ctx.arc(player.x, player.y, player.viewDistance, player.angle - player.fov / 2, player.angle + player.fov / 2);
        ctx.closePath(); ctx.clip();
        ctx.strokeStyle = 'rgba(200, 50, 50, 0.15)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.x + Math.cos(enemy.angle - enemy.fov/2) * enemy.viewDistance, enemy.y + Math.sin(enemy.angle - enemy.fov/2) * enemy.viewDistance);
        ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.x + Math.cos(enemy.angle + enemy.fov/2) * enemy.viewDistance, enemy.y + Math.sin(enemy.angle + enemy.fov/2) * enemy.viewDistance); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(150, 40, 40, 0.9)'; ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#822'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.x + Math.cos(enemy.angle) * enemy.radius, enemy.y + Math.sin(enemy.angle) * enemy.radius); ctx.stroke();
        ctx.restore();
    }

    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(40, 40, 40, 0.9)'; ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(player.angle) * player.radius, player.y + Math.sin(player.angle) * player.radius); ctx.stroke();

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
}

function gameLoop() {
    if (!GameState.running) return;
    if (!GameState.paused) { updatePlayer(); updateEnemy(); checkCombatState(); }
    drawGame(); requestAnimationFrame(gameLoop);
}
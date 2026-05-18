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

function buildMansion() {
    GameState.walls = [];
    const cw = canvas.width; const ch = canvas.height; const pad = 20;

    addWall(pad, pad, cw - pad*2, 6);
    addWall(pad, pad, 6, ch - pad*2);
    addWall(cw - pad - 6, pad, 6, ch - pad*2);
    addWall(pad, ch - pad - 6, cw - pad*2, 6);

    const mhLeft = cw * 0.35; const mhRight = cw * 0.65; const hallTop = ch * 0.45;
    addWall(mhLeft, hallTop, 6, ch * 0.2);
    addWall(mhLeft, hallTop + ch * 0.3, 6, ch * 0.25 - pad);
    addWall(mhRight, hallTop, 6, ch * 0.2);
    addWall(mhRight, hallTop + ch * 0.3, 6, ch * 0.25 - pad);
    addWall(mhLeft, hallTop, cw * 0.1, 6);
    addWall(mhRight - cw * 0.1, hallTop, cw * 0.1 + 6, 6);
    addWall(pad, hallTop, mhLeft - pad, 6);
    addWall(pad + (mhLeft - pad) * 0.25, hallTop + ch * 0.1, (mhLeft - pad) * 0.4, ch * 0.25);
    addWall(mhRight, hallTop, cw - pad - mhRight, 6);
    addWall(mhRight + (cw - pad - mhRight) * 0.4, hallTop + ch * 0.2, 15, 60);

    Entities.player.x = cw / 2; Entities.player.y = ch - pad - 40;
    Entities.enemy.waypoints = [ { x: pad + 30, y: hallTop + 40 }, { x: pad + 30, y: ch - pad - 40 } ];
    Entities.enemy.x = Entities.enemy.waypoints[0].x; Entities.enemy.y = Entities.enemy.waypoints[0].y;

    renderBlueprint();
}

function renderBlueprint() {
    wallCtx.clearRect(0, 0, wallCanvas.width, wallCanvas.height);
    GameState.walls.forEach(wall => {
        wallCtx.strokeStyle = 'rgba(60, 60, 60, 0.85)'; wallCtx.lineWidth = 1.2;
        wallCtx.strokeRect(wall.x + (Math.random() - 0.5), wall.y + (Math.random() - 0.5), wall.width, wall.height);
        wallCtx.strokeStyle = 'rgba(80, 80, 80, 0.5)';
        wallCtx.strokeRect(wall.x + (Math.random() * 0.5), wall.y + (Math.random() * 0.5), wall.width, wall.height);
        wallCtx.fillStyle = 'rgba(100, 100, 100, 0.1)'; wallCtx.fillRect(wall.x, wall.y, wall.width, wall.height);
    });
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
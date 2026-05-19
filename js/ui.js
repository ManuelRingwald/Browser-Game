// --- DOM ELEMENTE ---
const startBtn = document.getElementById('startBtn');
const landingPage = document.getElementById('landing-page');
const charBtn = document.getElementById('charBtn');
const charSheet = document.getElementById('char-sheet');
const combatMenu = document.getElementById('combat-menu');
const enemySpottedMenu = document.getElementById('enemy-spotted-menu');
const attackMenu = document.getElementById('attack-menu');
const resultMenu = document.getElementById('combat-result');
const diceLog = document.getElementById('dice-log');
const btnWeiter = document.getElementById('btn-weiter');

// --- TOOLTIP LOGIK ---
window.toggleTooltip = function(e, element) {
    e.stopPropagation();
    document.querySelectorAll('.tooltip-trigger').forEach(trigger => {
        if (trigger !== element) trigger.classList.remove('active');
    });
    element.classList.toggle('active');
};

document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip-trigger').forEach(trigger => { trigger.classList.remove('active'); });
});

// --- MENÜ INTERAKTIONEN ---
startBtn.addEventListener('click', () => {
    landingPage.style.opacity = '0';
    setTimeout(() => {
        landingPage.style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'block';
        charBtn.style.display = 'block';
        document.getElementById('gameCanvas').getBoundingClientRect();

        // Startet die Engine (definiert in game.js)
        setTimeout(() => { initGame(); }, 50);
    }, 400);
});

charBtn.addEventListener('click', () => {
    if (combatMenu.style.display === 'flex' || attackMenu.style.display === 'flex' || resultMenu.style.display === 'flex' || enemySpottedMenu.style.display === 'flex') return;
    GameState.paused = true; GameState.isTouching = false;
    setCharPage(1);
    charSheet.style.display = 'flex';
});

// Swipe left/right on char-sheet to switch pages
(function() {
    let swipeStartX = 0, swipeStartY = 0;
    charSheet.addEventListener('touchstart', e => {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
    }, { passive: true });
    charSheet.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) window.charPageNext(); else window.charPagePrev();
        }
    }, { passive: true });
}());

window.closeCharSheet = function() { charSheet.style.display = 'none'; GameState.paused = false; };

// ── CHARAKTERBOGEN PAGINATION ─────────────────────────────
let charCurrentPage = 1;
const CHAR_TOTAL_PAGES = 2;

function setCharPage(n) {
    charCurrentPage = n;
    document.querySelectorAll('.char-page').forEach((p, i) => {
        p.classList.toggle('active', i + 1 === n);
    });
    document.getElementById('char-page-indicator').textContent = `${n} / ${CHAR_TOTAL_PAGES}`;
    document.getElementById('btn-char-prev').disabled = n === 1;
    document.getElementById('btn-char-next').disabled = n === CHAR_TOTAL_PAGES;
}

window.charPagePrev = function() { if (charCurrentPage > 1) setCharPage(charCurrentPage - 1); };
window.charPageNext = function() { if (charCurrentPage < CHAR_TOTAL_PAGES) setCharPage(charCurrentPage + 1); };
window.showAttackMenu = function() { combatMenu.style.display = 'none'; attackMenu.style.display = 'flex'; }
window.cancelAttack = function() { attackMenu.style.display = 'none'; combatMenu.style.display = 'flex'; }
window.resumeGame = function() { combatMenu.style.display = 'none'; GameState.paused = false; };
window.resumeFromSpotted = function() { enemySpottedMenu.style.display = 'none'; GameState.paused = false; };

// --- WÜRFEL & KAMPF LOGIK ---
window.executeAttack = function(weapon) {
    attackMenu.style.display = 'none';
    if (weapon === 'Messer') { resolveW100Combat(); } else { GameState.paused = false; GameState.enemySeen = true; }
}

function animateRoll(elementId, finalValue, callback) {
    const el = document.getElementById(elementId);
    let counter = 0; const maxTicks = 15;
    const interval = setInterval(() => {
        el.innerText = Math.floor(Math.random() * 100) + 1;
        counter++;
        if (counter >= maxTicks) {
            clearInterval(interval); el.innerText = finalValue; setTimeout(callback, 400);
        }
    }, 60);
}

function resolveW100Combat() {
    const playerRoll = Math.floor(Math.random() * 100) + 1;
    const enemyRoll = Math.floor(Math.random() * 100) + 1;

    btnWeiter.style.display = 'none'; resultMenu.style.display = 'flex';
    diceLog.innerHTML = `Dein Angriff (KG ${Entities.stats.playerKG}):<br>Gewürfelt... <strong id="roll-player" class="rolling-number">--</strong>`;

    animateRoll('roll-player', playerRoll, () => {
        let logHTML = `Dein Angriff (KG ${Entities.stats.playerKG}):<br>Gewürfelt... <strong>${playerRoll}</strong> - `;
        if (playerRoll <= Entities.stats.playerKG) {
            logHTML += `<span class="success-text">Erfolg!</span><br><br>Wache Parade (${Entities.stats.enemyParry}):<br>Gewürfelt... <strong id="roll-enemy" class="rolling-number">--</strong>`;
            diceLog.innerHTML = logHTML;

            setTimeout(() => {
                animateRoll('roll-enemy', enemyRoll, () => {
                    logHTML = `Dein Angriff (KG ${Entities.stats.playerKG}):<br>Gewürfelt... <strong>${playerRoll}</strong> - <span class="success-text">Erfolg!</span><br><br>Wache Parade (${Entities.stats.enemyParry}):<br>Gewürfelt... <strong>${enemyRoll}</strong> - `;
                    if (enemyRoll <= Entities.stats.enemyParry) {
                        logHTML += `<span class="success-text">Erfolg!</span><br><br><span class="fail-text">ERGEBNIS: Angriff blockiert!</span>`; GameState.outcome = 'block';
                    } else {
                        logHTML += `<span class="fail-text">Fehlschlag!</span><br><br><span class="success-text">ERGEBNIS: Tödlicher Treffer!</span>`; GameState.outcome = 'hit';
                    }
                    diceLog.innerHTML = logHTML; btnWeiter.style.display = 'block';
                });
            }, 300);
        } else {
            logHTML += `<span class="fail-text">Fehlschlag!</span><br><br><span class="fail-text">ERGEBNIS: Daneben gestochen!</span>`; GameState.outcome = 'miss';
            diceLog.innerHTML = logHTML; btnWeiter.style.display = 'block';
        }
    });
}

window.finishCombat = function() {
    resultMenu.style.display = 'none';
    if (GameState.outcome === 'hit') { GameState.paused = false; Entities.player.isAttacking = true; }
    else { GameState.paused = false; GameState.enemySeen = true; }
}

// =========================================
// DRAG & DROP  (Mouse + Touch, iOS-kompatibel)
// =========================================
document.addEventListener('DOMContentLoaded', () => {

    // ── MOUSE drag & drop (Desktop) ───────────────────────
    document.querySelectorAll('.draggable-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', item.id);
            setTimeout(() => { item.style.opacity = '0.4'; }, 0);
        });
        item.addEventListener('dragend', () => { item.style.opacity = '1'; });
    });

    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const el = document.getElementById(e.dataTransfer.getData('text/plain'));
            if (el && !zone.querySelector('.draggable-item')) zone.appendChild(el);
        });
    });

    // ── TOUCH drag & drop (iOS / Android) ────────────────
    let dragging = null, originZone = null;
    const ghost = document.createElement('img');
    ghost.id = 'touch-drag-ghost';
    ghost.style.display = 'none';
    document.body.appendChild(ghost);

    function touchStart(e) {
        const item = e.target.closest('.draggable-item');
        if (!item) return;
        e.preventDefault();
        dragging = item;
        originZone = item.parentElement;
        ghost.src = item.src;
        ghost.style.display = 'block';
        movGhost(e.touches[0]);
        item.style.opacity = '0.3';
    }

    function touchMove(e) {
        if (!dragging) return;
        e.preventDefault();
        movGhost(e.touches[0]);
        // Highlight the zone under finger
        document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
        const el = elementUnderGhost(e.touches[0]);
        const zone = el?.closest('.drop-zone');
        if (zone && zone !== originZone) zone.classList.add('drag-over');
    }

    function touchEnd(e) {
        if (!dragging) return;
        ghost.style.display = 'none';
        dragging.style.opacity = '1';
        document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));

        const el = elementUnderGhost(e.changedTouches[0]);
        const zone = el?.closest('.drop-zone');
        if (zone && zone !== originZone && !zone.querySelector('.draggable-item')) {
            zone.appendChild(dragging);
        }
        dragging = null; originZone = null;
    }

    function movGhost(touch) {
        ghost.style.left = touch.clientX + 'px';
        ghost.style.top  = touch.clientY + 'px';
    }

    function elementUnderGhost(touch) {
        ghost.style.display = 'none';
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        ghost.style.display = 'block';
        return el;
    }

    document.addEventListener('touchstart', touchStart, { passive: false, capture: true });
    document.addEventListener('touchmove',  touchMove,  { passive: false, capture: true });
    document.addEventListener('touchend',   touchEnd,   { passive: false, capture: true });
});
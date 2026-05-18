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
    GameState.paused = true; GameState.isTouching = false; charSheet.style.display = 'flex';
});

window.closeCharSheet = function() { charSheet.style.display = 'none'; GameState.paused = false; };
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
// DRAG & DROP LOGIK
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    const draggables = document.querySelectorAll('.draggable-item');
    const dropZones = document.querySelectorAll('.drop-zone');

    // 1. Wenn wir anfangen, ein Item zu ziehen
    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', (e) => {
            // Wir merken uns die ID des gezogenen Elements
            e.dataTransfer.setData('text/plain', draggable.id);
            // Macht das Original beim Ziehen leicht transparent
            setTimeout(() => { draggable.style.opacity = '0.4'; }, 0);
        });

        draggable.addEventListener('dragend', () => {
            draggable.style.opacity = '1';
        });
    });

    // 2. Was passiert bei den Ablage-Slots (Drop Zones)?
    dropZones.forEach(zone => {

        // Erlaubt das Ablegen (standardmäßig blockiert der Browser das)
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        // Visuelles Feedback entfernen, wenn man den Slot verlässt
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        // 3. Das Item wird fallengelassen
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');

            // Holt sich die ID des Elements, das wir in 'dragstart' gespeichert haben
            const id = e.dataTransfer.getData('text/plain');
            const draggableElement = document.getElementById(id);

            if (draggableElement) {
                // Prüfen, ob der Slot schon voll ist (optional)
                if (zone.querySelector('.draggable-item')) {
                    console.log("Slot ist bereits belegt!");
                    return; // Bricht ab, wenn schon eine Waffe im Slot liegt
                }

                // Hängt das HTML-Element physisch um, wodurch das CSS greift
                zone.appendChild(draggableElement);
            }
        });
    });
});
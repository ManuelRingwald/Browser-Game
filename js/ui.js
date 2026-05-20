// --- DOM ELEMENTE ---
const startBtn = document.getElementById('startBtn');
const landingPage = document.getElementById('landing-page');
const charBtn = document.getElementById('charBtn');
const charSheet = document.getElementById('char-sheet');

// --- TOOLTIP LOGIK ---
// position:fixed → entkommen aus overflow:hidden. Positionierung per JS.

function positionTooltip(trigger) {
    const tip = trigger.querySelector('.tooltip-info');
    if (!tip) return;
    requestAnimationFrame(() => {
        const tr   = trigger.getBoundingClientRect();
        const pad  = 10;
        const tipW = tip.offsetWidth  || 220;
        const tipH = tip.offsetHeight || 80;

        let left = tr.left + tr.width / 2 - tipW / 2;
        left = Math.max(pad, Math.min(left, window.innerWidth - tipW - pad));

        let top = tr.top - tipH - 8;
        if (top < pad) top = tr.bottom + 8;

        tip.style.left = left + 'px';
        tip.style.top  = top  + 'px';
    });
}

// Hover-Support (Desktop): mouseenter positioniert + zeigt, mouseleave schließt
document.addEventListener('mouseover', e => {
    const trigger = e.target.closest('.tooltip-trigger');
    if (!trigger) return;
    trigger.classList.add('active');
    positionTooltip(trigger);
});
document.addEventListener('mouseout', e => {
    const trigger = e.target.closest('.tooltip-trigger');
    if (!trigger) return;
    // Nur schließen wenn Maus wirklich den Trigger verlässt
    if (!trigger.contains(e.relatedTarget)) {
        trigger.classList.remove('active');
    }
});

// Click/Touch: toggle (für Mobile und explizites Tippen)
window.toggleTooltip = function(e, element) {
    e.stopPropagation();
    const wasActive = element.classList.contains('active');
    document.querySelectorAll('.tooltip-trigger.active').forEach(t => t.classList.remove('active'));
    if (!wasActive) {
        element.classList.add('active');
        positionTooltip(element);
    }
};

document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip-trigger.active').forEach(t => t.classList.remove('active'));
});

// Tastenkürzel I: Charakterbogen öffnen/schließen
document.addEventListener('keydown', e => {
    if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (charSheet.style.display === 'flex') {
            closeCharSheet();
        } else if (charBtn.style.display === 'block') {
            charBtn.click();
        }
    }
});

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
    const anyMenu = ['encounter-menu','weapon-menu','combat-result'].some(
        id => document.getElementById(id).style.display === 'flex');
    if (anyMenu) return;
    GameState.paused = true; GameState.isTouching = false;
    resetCharPage();
    // Dynamische Werte aktualisieren
    const p = Entities.player;
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    document.getElementById('cs-lp-cur').textContent = p.hp;
    document.getElementById('cs-lp-max').textContent = p.maxHp;
    document.getElementById('cs-lp-bar').style.width = `${hpFrac * 100}%`;
    document.getElementById('cs-lp-bar').style.background =
        hpFrac > 0.5 ? 'rgba(55,130,50,0.85)' : hpFrac > 0.25 ? 'rgba(195,135,25,0.85)' : 'rgba(160,35,35,0.85)';
    document.getElementById('cs-ammo-pistole').textContent = p.ammo.pistole;
    document.getElementById('cs-ammo-schrot').textContent  = p.ammo.schrotflinte;
    updateWeaponStatus();
    charBtn.style.display = 'none';   // Profil-Button verstecken während Bogen offen
    charSheet.style.display = 'flex';
});

// Swipe left/right on char-sheet to switch pages
// NOTE: swipeActive is set to false during touch-drag so swipe doesn't fire
let swipeActive = false;
(function() {
    let swipeStartX = 0, swipeStartY = 0;
    charSheet.addEventListener('touchstart', e => {
        if (e.target.closest('.draggable-item')) { swipeActive = false; return; }
        swipeActive = true;
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
    }, { passive: true });
    charSheet.addEventListener('touchend', e => {
        if (!swipeActive) return;
        swipeActive = false;
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) changePage(1); else changePage(-1);
        }
    }, { passive: true });
}());

window.closeCharSheet = function() {
    charSheet.style.display = 'none';
    charBtn.style.display = 'block';  // Profil-Button wieder einblenden
    GameState.paused = false;
};

// --- SEITENNAVIGATION ---
let currentCharPage = 1;
const TOTAL_CHAR_PAGES = 2;

function resetCharPage() {
    if (currentCharPage !== 1) {
        document.getElementById('char-page-' + currentCharPage).classList.remove('active');
        currentCharPage = 1;
        document.getElementById('char-page-1').classList.add('active');
        document.getElementById('page-indicator').textContent = '1 / ' + TOTAL_CHAR_PAGES;
        document.getElementById('prev-page').disabled = true;
        document.getElementById('next-page').disabled = false;
    }
}

window.changePage = function(dir) {
    const newPage = currentCharPage + dir;
    if (newPage < 1 || newPage > TOTAL_CHAR_PAGES) return;
    document.getElementById('char-page-' + currentCharPage).classList.remove('active');
    currentCharPage = newPage;
    document.getElementById('char-page-' + currentCharPage).classList.add('active');
    document.getElementById('page-indicator').textContent = currentCharPage + ' / ' + TOTAL_CHAR_PAGES;
    document.getElementById('prev-page').disabled = currentCharPage === 1;
    document.getElementById('next-page').disabled = currentCharPage === TOTAL_CHAR_PAGES;
};

window.doorOpen = function() {
    if (GameState.activeDoor) {
        GameState.activeDoor.open = true;
        GameState.activeDoor.triggered = true;
        GameState.activeDoor = null;
    }
    document.getElementById('door-menu').style.display = 'none';
    renderBlueprint(); // wallCanvas neu zeichnen ohne die geöffnete Tür
    GameState.paused = false;
};

window.doorIgnore = function() {
    document.getElementById('door-menu').style.display = 'none';
    GameState.paused = false;
    // triggered bleibt true – Dialog erst wieder nach Entfernen
};

// =========================================
// INVENTAR-HELPER
// =========================================

// Gibt ein Set aller vom Spieler besessenen Waffen zurück (ausgerüstet ODER im Rucksack).
// Faustkampf ist immer vorhanden. Waffen ohne DOM-Element gelten als nicht im Besitz.
function getOwnedWeapons() {
    const owned = new Set(['faust']);
    document.querySelectorAll('[data-weapon]').forEach(item => {
        owned.add(item.dataset.weapon);
    });
    return owned;
}

// Gibt ein Set der aktuell in Hand-Slots ausgerüsteten Waffen zurück.
// Faustkampf ist immer verfügbar.
function getEquippedWeapons() {
    const eq = new Set(['faust']);
    ['slot-rechteHand', 'slot-linkeHand'].forEach(id => {
        const item = document.getElementById(id)?.querySelector('[data-weapon]');
        if (item) eq.add(item.dataset.weapon);
    });
    return eq;
}

// Gibt zurück, wo eine Waffe liegt: 'hand' | 'rucksack' | 'none'
function getWeaponLocation(weaponItemId) {
    const item = document.getElementById(weaponItemId);
    if (!item) return 'none';
    const pid = item.parentElement?.id;
    return (pid === 'slot-rechteHand' || pid === 'slot-linkeHand') ? 'hand' : 'rucksack';
}

// Aktualisiert die fusionierte Waffentabelle auf Seite 1 sofort.
// Zeigt nur Waffen, die der Spieler besitzt. Versteckt den Rest.
function updateWeaponStatus() {
    const owned = getOwnedWeapons();

    const cfg = {
        messer:  { itemId:'messer-skizze',  rowId:'cs-row-messer',  iconId:'cs-icon-messer',  statId:'cs-status-messer'  },
        pistole: { itemId:'pistole-skizze', rowId:'cs-row-pistole', iconId:'cs-icon-pistole', statId:'cs-status-pistole' },
    };

    // Reihen für nicht-besessene Waffen ausblenden
    const allRows = { messer:'cs-row-messer', pistole:'cs-row-pistole', schrotflinte:'cs-row-schrot' };
    Object.entries(allRows).forEach(([key, rowId]) => {
        const row = document.getElementById(rowId);
        if (row) row.style.display = owned.has(key) ? '' : 'none';
    });

    // Status und Icon für besessene Waffen aktualisieren
    Object.entries(cfg).forEach(([key, { itemId, rowId, iconId, statId }]) => {
        if (!owned.has(key)) return;
        const row    = document.getElementById(rowId);
        const iconEl = document.getElementById(iconId);
        const statEl = document.getElementById(statId);
        const item   = document.getElementById(itemId);
        if (!row || !iconEl || !statEl || !item) return;

        const pid      = item.parentElement?.id;
        const inRechte = pid === 'slot-rechteHand';
        const inLinke  = pid === 'slot-linkeHand';
        row.classList.toggle('wt-equipped', inRechte || inLinke);

        const clone = item.cloneNode(true);
        clone.className = 'wt-item-img pencil-art';
        clone.removeAttribute('id');
        clone.draggable = false;
        iconEl.innerHTML = '';
        iconEl.appendChild(clone);

        if (inRechte)     statEl.innerHTML = '<span class="ws-hand">✓ R.Hand</span>';
        else if (inLinke) statEl.innerHTML = '<span class="ws-hand">✓ L.Hand</span>';
        else              statEl.innerHTML = '<span class="ws-bag">Rucksack</span>';
    });
}

// =========================================
// KAMPFSYSTEM  – BRP-Lite
// =========================================

// Hilfsfunktionen
function el(id) { return document.getElementById(id); }
function showResultMenu() { el('combat-result').style.display = 'flex'; el('btn-weiter').style.display = 'none'; el('react-section').style.display = 'none'; }
function showWeiter()     { el('btn-weiter').style.display = 'block'; }
function setCombatLog(html)    { el('combat-log').innerHTML = html; }
function appendCombatLog(html) {
    const log = el('combat-log');
    if (log.innerHTML) log.innerHTML += '<br>';
    log.innerHTML += html;
}

// ── Ausweichen als Reaktion auf Feind-Angriff ────────────────────────────
let _dodgeCB = null;

const DODGE_AP_COST = 1;

function showDodgeReaction(enemy, callback) {
    _dodgeCB = callback;
    const p = Entities.player;
    const canDodge = GameState.combatAP >= DODGE_AP_COST;
    el('react-desc').textContent =
        `${enemy.name} greift an! Ausweichen? (Chance: ${p.ausweichen}%)`;

    const btn = el('btn-react-dodge');
    btn.disabled = !canDodge;
    btn.classList.toggle('battle-btn-unavail', !canDodge);
    btn.textContent = canDodge
        ? `Ausweichen (${DODGE_AP_COST} AP)`
        : `Ausweichen – kein AP (${GameState.combatAP}/${GameState.combatMaxAP})`;

    el('react-section').style.display = 'flex';
}

window.reactDodge = function() {
    if (GameState.combatAP < DODGE_AP_COST) return;
    GameState.combatAP -= DODGE_AP_COST;
    el('react-section').style.display = 'none';
    const cb = _dodgeCB; _dodgeCB = null;
    if (cb) cb(true);
};
window.reactAccept = function() {
    el('react-section').style.display = 'none';
    const cb = _dodgeCB; _dodgeCB = null;
    if (cb) cb(false);
};

function animateRoll(elementId, finalValue, callback) {
    const node = el(elementId);
    let tick = 0;
    const iv = setInterval(() => {
        node.innerText = Math.floor(Math.random() * 100) + 1;
        if (++tick >= 14) { clearInterval(iv); node.innerText = finalValue; setTimeout(callback, 350); }
    }, 55);
}

// AP-Kosten Referenz (gespiegelt aus game.js-Konstante)
// AP_KOSTEN und FELD_PX sind in game.js definiert (globale Konstanten)

function apDots(cur, max) { return '●'.repeat(cur) + '○'.repeat(max - cur); }

// Spieler-Zug-Menü (AP-basiert)
window.openEncounterMenu = function() {
    const t  = GameState.combatTarget;
    const ap = GameState.combatAP;
    const mx = GameState.combatMaxAP;

    el('enc-title').textContent = GameState.combatAmbush ? 'Hinterhalt!' : 'Dein Zug';
    el('enc-target').textContent = t ? `▸ ${t.name}  ${t.hp}/${t.maxHp} LP` : '';
    el('enc-desc').textContent = GameState.combatAmbush
        ? 'Feind unvorbereitet – kein Ausweichen, Rückzug garantiert.'
        : '';

    // Buttons: visuell grau wenn AP fehlt, aber NICHT disabled (Klick zeigt Erklärung)
    const setGray = (id, unavail) => {
        const b = el(id);
        if (b) b.classList.toggle('battle-btn-unavail', unavail);
    };
    setGray('btn-enc-angriff',  ap < AP_KOSTEN.angriff);
    setGray('btn-enc-bewegen',  ap < AP_KOSTEN.bewegen);
    setGray('btn-enc-flucht',   ap < 1);
    // Zug beenden: immer möglich
    // Ausweichen: nur als Reaktion auf Feind-Angriff (kein eigener Menü-Button mehr)

    // (Schleichangriff deaktiviert – Feature noch nicht implementiert)

    // Zielwechsel
    const btnCT = el('btn-change-target');
    if (btnCT) btnCT.style.display =
        (GameState.combatTargets||[]).filter(e=>!e.isDead).length > 1 ? 'block' : 'none';

    // Abbrechen-Button aus Bewegungsmodus zurücksetzen
    const btnCM = el('btn-cancel-move');
    if (btnCM) btnCM.style.display = 'none';
    ['btn-enc-angriff','btn-enc-bewegen','btn-enc-flucht'].forEach(id => {
        const b = el(id); if (b) b.style.display = 'block';
    });
    const btnEnd = el('btn-enc-end-turn');
    if (btnEnd) btnEnd.style.display = 'block';

    el('encounter-menu').style.display = 'flex';
};

// ── Bewegen: sofort Felder in aktueller Blickrichtung zeigen ────────────
// Richtungspfeile bleiben sichtbar zum Drehen (kein AP).
window.combatMove = function() {
    if (GameState.combatAP < AP_KOSTEN.bewegen) {
        el('enc-desc').textContent = `Nicht genug AP. Bewegen kostet ${AP_KOSTEN.bewegen} AP.`;
        return;
    }
    GameState.postMoveRotation = false;
    enterMoveGridMode(); // sofort Raster anzeigen
};

// Wird von game.js nach der Vorher-Drehung aufgerufen → zeigt Bewegungsraster.
window.enterMoveGridMode = function() {
    GameState.combatMoving = true;
    document.getElementById('gameCanvas').classList.add('combat-move');
    const ap = GameState.combatAP;
    el('enc-title').textContent = 'Bewegung';
    el('enc-desc').textContent  =
        `Klicke ein grünes Feld (max. ${Math.floor(ap / AP_KOSTEN.bewegen)} Felder).`;
    el('btn-cancel-move').style.display = 'block';
};

window.cancelMove = function() {
    GameState.combatMoving       = false;
    GameState.selectingDirection = false;
    GameState.postMoveRotation   = false;
    document.getElementById('gameCanvas').classList.remove('combat-move');
    openEncounterMenu();
};

// ── Zug beenden → Feind ist dran ────────────────────────────────────────
window.combatEndTurn = function() {
    el('encounter-menu').style.display = 'none';
    GameState.combatPhase = 'enemy';
    processEnemyTurnUI();
};

// Feind-Zug: akkumulierter Log, Dodge-Reaktion bei Angriffen
window.processEnemyTurnUI = function() {
    const living = (GameState.combatTargets || []).filter(e => !e.isDead);
    if (living.length === 0) { startPlayerTurn(); return; }

    showResultMenu();
    setCombatLog('');
    Anim.clear();
    startEnemyTurnReset(); // Lärm-Wahrnehmung zurücksetzen
    let ei = 0;

    function doneAll() {
        // Prüfen ob noch Sichtkontakt besteht — wenn nicht: Kampf endet
        const stillEngaged = (GameState.combatTargets||[]).filter(e=>!e.isDead)
            .some(e => canSee(Entities.player, e) || canSee(e, Entities.player));
        if (!stillEngaged) {
            appendCombatLog('<span style="color:#c8b890;">Sichtkontakt verloren – Kampf beendet.</span>');
            showWeiter();
            GameState.combatResult = { enemyDied:false, playerDied:false, contactLost:true };
            return;
        }
        showWeiter();
        GameState.combatResult = { enemyDied:false, playerDied:Entities.player.hp<=0, enemyTurnDone:true };
    }

    function nextEnemy() {
        if (ei >= living.length) { doneAll(); return; }

        const enemy = living[ei];
        const p = Entities.player;
        const plan = enemyComputeAction(enemy);
        const rotStart  = enemy.angle;
        const rotTarget = Math.atan2(p.y - enemy.y, p.x - enemy.x);

        // 1. "dreht sich" sofort anhängen
        appendCombatLog(`<span style="color:#c8b890;">${enemy.name} dreht sich...</span>`);

        // 2. Rotation (280ms)
        Anim.push({
            duration: 280,
            onUpdate(_, e) { enemy.angle = lerpAngle(rotStart, rotTarget, e); }
        });

        if (plan.type === 'chase') {
            // Kein Sichtkontakt → Feind verfolgt, greift nicht an
            Anim.push({
                duration: 400,
                onStart() {
                    const res = enemyExecuteMove(enemy);
                    appendCombatLog(`<span style="color:#c8b890;">${enemy.name} sucht Sichtkontakt... ${res.text}</span>`);
                },
                onComplete() { ei++; nextEnemy(); }
            });
        } else if (plan.type === 'attack') {
            const intention = `${enemy.name} greift mit ${plan.weapon.name} an!`;

            // 3. Absicht anhängen + kurze Pause, dann Dodge-Reaktion
            Anim.push({
                duration: 50,
                onStart() { appendCombatLog(`<span style="color:#ffe890;">${intention}</span>`); },
                onComplete() {
                    // Spieler kann Ausweichen als Reaktion wählen
                    showDodgeReaction(enemy, (tryDodge) => {
                        const res = enemyExecuteAttack(enemy, tryDodge);
                        appendCombatLog(`<span class="${res.type==='hit'?'fail-text':'success-text'}">${res.text}</span>`);
                        if (Entities.player.hp <= 0) { doneAll(); return; }
                        ei++;
                        Anim.push({ duration: 300, onComplete: nextEnemy });
                    });
                }
            });
        } else {
            // Bewegung: keine Reaktion nötig
            Anim.push({
                duration: 400,
                onStart() {
                    const res = enemyExecuteMove(enemy);
                    appendCombatLog(`<span style="color:#c8b890;">${res.text}</span>`);
                },
                onComplete() { ei++; nextEnemy(); }
            });
        }
    }

    nextEnemy();
};

window.combatAttack = function() {
    if (GameState.combatAP < AP_KOSTEN.angriff) {
        el('enc-desc').textContent = `Nicht genug AP. Angriff kostet ${AP_KOSTEN.angriff} AP (du hast ${GameState.combatAP}).`;
        return;
    }
    el('encounter-menu').style.display = 'none';
    const p = Entities.player;
    const equipped = getEquippedWeapons();

    // Bestätigen-Sektion zurücksetzen
    GameState.combatWeapon = null;
    el('weapon-confirm-section').style.display = 'none';
    ['btn-faust','btn-messer','btn-pistole','btn-schrot'].forEach(id =>
        el(id)?.classList.remove('weapon-selected'));

    // Nur ausgerüstete Waffen anzeigen; grau wenn Reichweite/Munition fehlt
    const target = GameState.combatTarget;
    const dist = target ? Math.hypot(p.x - target.x, p.y - target.y) : 9999;
    const btnMap = { faust: 'btn-faust', messer: 'btn-messer', pistole: 'btn-pistole', schrotflinte: 'btn-schrot' };

    Object.entries(btnMap).forEach(([key, btnId]) => {
        const btn = el(btnId);
        if (!btn) return;
        const show = key === 'faust' || equipped.has(key);
        if (!show) { btn.style.display = 'none'; return; }
        btn.style.display = 'block';
        btn.disabled = false;

        const w = WEAPONS[key];
        const tooFar   = dist > w.range;
        const tooClose = w.ammoKey && dist < FELD_PX * 1.5; // mind. 1 freies Feld zwischen Charakteren
        const noAmmo   = w.ammoKey && (p.ammo[w.ammoKey] ?? 0) <= 0;
        btn.classList.toggle('battle-btn-unavail', tooFar || tooClose || noAmmo);
    });

    // Munitionsanzeige
    if (equipped.has('pistole'))
        el('btn-pistole').textContent = `Pistole (1W8) – ${p.ammo.pistole} Schuss`;
    if (equipped.has('schrotflinte'))
        el('btn-schrot').textContent  = `Schrotflinte (2W6) – ${p.ammo.schrotflinte} Schuss`;

    el('weapon-error').style.display = 'none';
    el('weapon-menu').style.display = 'flex';
};

window.cycleTarget = function() {
    const targets = GameState.combatTargets.filter(e => !e.isDead);
    if (targets.length <= 1) return;
    const idx = targets.indexOf(GameState.combatTarget);
    GameState.combatTarget = targets[(idx + 1) % targets.length];
    openEncounterMenu();
};

window.backToEncounter = function() {
    GameState.combatWeapon = null;          // Reichweite ausblenden
    el('weapon-confirm-section').style.display = 'none';
    ['btn-faust','btn-messer','btn-pistole','btn-schrot'].forEach(id =>
        el(id)?.classList.remove('weapon-selected'));
    el('weapon-menu').style.display = 'none';
    openEncounterMenu();
};

// Schritt 1: Waffe auswählen → Reichweite anzeigen, Bestätigen-Button einblenden
window.selectWeapon = function(key) {
    const p = Entities.player, w = WEAPONS[key];
    const dist = Math.hypot(p.x - GameState.combatTarget.x, p.y - GameState.combatTarget.y);

    if (w.ammoKey && dist < FELD_PX * 1.5) {
        el('weapon-error').textContent = `${w.name}: Zu nah! Mind. 1 freies Feld Abstand erforderlich.`;
        el('weapon-error').style.display = 'block'; return;
    }
    if (dist > w.range) {
        const maxF = Math.round(w.range / FELD_PX);
        const curF = Math.round(dist  / FELD_PX);
        el('weapon-error').textContent = `${w.name}: Zu weit! (max. ${maxF} Felder, du bist ~${curF} Felder entfernt)`;
        el('weapon-error').style.display = 'block'; return;
    }
    if (w.ammoKey && p.ammo[w.ammoKey] <= 0) {
        el('weapon-error').textContent = `${w.name}: Keine Munition!`;
        el('weapon-error').style.display = 'block'; return;
    }
    el('weapon-error').style.display = 'none';

    // Auswahl speichern → Reichweite wird in drawGame() gezeichnet
    GameState.combatWeapon = key;

    // Alle Buttons zurücksetzen, gewählten hervorheben
    ['btn-faust','btn-messer','btn-pistole','btn-schrot'].forEach(id =>
        el(id)?.classList.remove('weapon-selected'));
    const btnId = key === 'schrotflinte' ? 'btn-schrot' : `btn-${key}`;
    el(btnId)?.classList.add('weapon-selected');

    // Bestätigen-Sektion einblenden
    const maxF  = Math.round(w.range / FELD_PX);
    const distF = Math.floor(dist   / FELD_PX);
    el('weapon-confirm-label').textContent = `${w.name} · max. ${maxF} Felder · Abstand: ${distF} Felder`;
    el('weapon-confirm-section').style.display = 'block';
};

// Schritt 2: Angriff final bestätigen
window.confirmAttack = function() {
    const key = GameState.combatWeapon;
    if (!key) return;
    GameState.combatAP -= AP_KOSTEN.angriff;
    GameState.combatPlayerHeard = true; // Angriff macht immer Lärm → Feind weiß wo Spieler ist
    GameState.combatWeapon = null;
    el('weapon-confirm-section').style.display = 'none';
    el('weapon-menu').style.display = 'none';
    resolveCombat(key);
};

window.stealthKill = function() {
    el('encounter-menu').style.display = 'none';
    const damage = rollDice(1, 6) * 2;
    const e = GameState.combatTarget;
    e.hp = Math.max(0, e.hp - damage);
    showResultMenu();
    setCombatLog(
        `<b>Schleichangriff!</b> Automatischer Treffer – doppelter Schaden.<br><br>` +
        `Messer: <span class="success-text">${damage} Schaden</span><br><br>` +
        (e.hp <= 0
            ? `<span class="success-text"><b>Feind ausgeschaltet!</b></span>`
            : `Feind: ${e.hp} / ${e.maxHp} LP`)
    );
    showWeiter();
    GameState.combatResult = { enemyDied: e.hp <= 0, playerDied: false };
};

window.combatDodge = function() {
    if (GameState.combatAP < AP_KOSTEN.ausweichen) {
        el('enc-desc').textContent = `Nicht genug AP. Ausweichen kostet ${AP_KOSTEN.ausweichen} AP (du hast ${GameState.combatAP}).`;
        return;
    }
    GameState.combatAP -= AP_KOSTEN.ausweichen;
    GameState.combatDodging = true;
    el('encounter-menu').style.display = 'none';
    const p = Entities.player, e = GameState.combatTarget;
    const eW = WEAPONS[e.waffe];
    const eRoll = Math.floor(Math.random() * 100) + 1;
    let log = `Du weichst aus...<br><br>`;

    if (eRoll <= e.angriff) {
        const eDmg = rollDice(eW.n, eW.s);
        const dRoll = Math.floor(Math.random() * 100) + 1;
        const dodgeBonus = Math.min(95, p.ausweichen + 20);
        log += `Feind greift an (${e.angriff}%): Wurf ${eRoll} → <span class="fail-text">Treffer!</span><br>`;
        if (dRoll <= dodgeBonus) {
            log += `Ausweichen (${dodgeBonus}%): Wurf ${dRoll} → <span class="success-text">Erfolg!</span> – Kein Schaden`;
        } else {
            p.hp = Math.max(0, p.hp - eDmg);
            log += `Ausweichen (${dodgeBonus}%): Wurf ${dRoll} → <span class="fail-text">Fehlschlag!</span><br>` +
                   `Du: <b>${p.hp} / ${p.maxHp} LP</b>`;
        }
    } else {
        log += `Feind greift an (${e.angriff}%): Wurf ${eRoll} → <span class="success-text">Verfehlt!</span>`;
    }
    showResultMenu(); setCombatLog(log); showWeiter();
    GameState.combatResult = { enemyDied: false, playerDied: p.hp <= 0 };
};

window.combatFlee = function() {
    if (GameState.combatAP < 1) {
        el('enc-desc').textContent = 'Nicht genug AP. Rückzug kostet 1 AP.';
        return;
    }
    GameState.combatAP -= 1;
    el('encounter-menu').style.display = 'none';

    // Hinterhalt: Rückzug gelingt immer
    if (GameState.combatAmbush) {
        GameState.combatAmbush = false;
        GameState.combatGridVisible = false; GameState.combatMoving = false;
        document.getElementById('gameCanvas').classList.remove('combat-move');
        showResultMenu();
        setCombatLog('<span class="success-text">Hinterhalt – Rückzug gelingt ohne Gegenwehr!</span>');
        showWeiter();
        GameState.combatResult = { enemyDied:false, playerDied:false, fled:true };
        return;
    }

    const p = Entities.player, e = GameState.combatTarget;
    const eW = WEAPONS[e.waffe];
    const eRoll = Math.floor(Math.random() * 100) + 1;
    let log = `Du flüchtest!<br><br>`;

    if (eRoll <= e.angriff) {
        const eDmg = rollDice(eW.n, eW.s);
        const dRoll = Math.floor(Math.random() * 100) + 1;
        log += `Feind schlägt nach (${e.angriff}%): Wurf ${eRoll} → <span class="fail-text">Treffer!</span><br>`;
        if (dRoll <= p.ausweichen) {
            log += `Ausweichen (${p.ausweichen}%): Wurf ${dRoll} → <span class="success-text">Knapp entkommen!</span>`;
        } else {
            p.hp = Math.max(0, p.hp - eDmg);
            log += `Ausweichen (${p.ausweichen}%): Wurf ${dRoll} → <span class="fail-text">Getroffen!</span> ${eDmg} Schaden<br>Du: <b>${p.hp} / ${p.maxHp} LP</b>`;
        }
    } else {
        log += `<span class="success-text">Du entkommst unversehrt!</span>`;
    }
    showResultMenu(); setCombatLog(log); showWeiter();
    GameState.combatGridVisible = false;
    GameState.combatMoving      = false;
    document.getElementById('gameCanvas').classList.remove('combat-move');
    GameState.combatResult = { enemyDied: false, playerDied: p.hp <= 0, fled: true };
};

function resolveCombat(key) {
    const p = Entities.player, e = GameState.combatTarget, w = WEAPONS[key];
    const dist = Math.hypot(p.x - e.x, p.y - e.y);
    if (w.ammoKey) p.ammo[w.ammoKey]--;

    const atkRoll = Math.floor(Math.random() * 100) + 1;
    const verb = w.ammoKey ? 'Schießt' : 'Schlägt zu';
    showResultMenu();
    setCombatLog(`<b>${w.name}</b> – ${verb} (Trefferchance ${p.angriff}%):<br><span id="rd1" class="rolling-number">--</span>`);

    animateRoll('rd1', atkRoll, () => {
        if (atkRoll <= p.angriff) {
            // Treffer – Schaden würfeln
            let dmg = rollDice(w.n, w.s);
            if (key === 'schrotflinte' && dist < 80) dmg += 2;
            setCombatLog(
                `<b>${w.name}</b> – ${verb}: ${atkRoll} ≤ ${p.angriff}% → <span class="success-text">Treffer!</span><br>` +
                `Schaden: <span id="rd2" class="rolling-number">--</span>`
            );
            animateRoll('rd2', dmg, () => {
                // Hinterhalt: kein Ausweich-/Blockwurf für den Feind
                if (GameState.combatAmbush) {
                    GameState.combatAmbush = false; // Hinterhalt endet nach erstem Treffer
                    e.hp = Math.max(0, e.hp - dmg);
                    setCombatLog(
                        `<b>${w.name}</b> – ${verb}: <span class="success-text">Hinterhalt-Treffer! ${dmg} Schaden (kein Ausweichen)</span><br>` +
                        `Feind: <b>${e.hp}/${e.maxHp} LP</b>` +
                        (e.hp <= 0 ? `<br><span class="success-text"><b>Feind ausgeschaltet!</b></span>` : '')
                    );
                    showWeiter();
                    GameState.combatResult = { enemyDied: e.hp <= 0, playerDied: false };
                    return;
                }
                // Normaler Verteidigungswurf
                const dodgeRoll = Math.floor(Math.random() * 100) + 1;
                setCombatLog(
                    `<b>${w.name}</b>: <span class="success-text">Treffer! ${dmg} Schaden</span><br>` +
                    `Feind weicht aus (${e.ausweichen}%): <span id="rd3" class="rolling-number">--</span>`
                );
                animateRoll('rd3', dodgeRoll, () => {
                    let finalDmg = dmg;
                    let log = `<b>${w.name}</b>: <span class="success-text">Treffer! ${dmg} Schaden</span><br>`;

                    // Feind nutzt NUR eine Verteidigung: Ausweichen (Fernkampf) ODER Blocken (Nahkampf)
                    if (w.blockbar) {
                        // Nahkampf: Feind blockt
                        if (dodgeRoll <= e.blockwert) {
                            finalDmg = Math.max(1, Math.floor(finalDmg / 2));
                            log += `Blocken (${e.blockwert}%): ${dodgeRoll} → <span class="success-text">Erfolg!</span> Schaden halbiert → ${finalDmg}<br>`;
                        } else {
                            log += `Blocken (${e.blockwert}%): ${dodgeRoll} → <span class="fail-text">Fehlschlag!</span><br>`;
                        }
                    } else {
                        // Fernkampf: Feind weicht aus
                        if (dodgeRoll <= e.ausweichen) {
                            finalDmg = 0;
                            log += `Ausweichen (${e.ausweichen}%): ${dodgeRoll} → <span class="success-text">Erfolg!</span> Kein Schaden<br>`;
                        } else {
                            log += `Ausweichen (${e.ausweichen}%): ${dodgeRoll} → <span class="fail-text">Fehlschlag!</span><br>`;
                        }
                    }

                    if (finalDmg > 0) {
                        e.hp = Math.max(0, e.hp - finalDmg);
                        log += `<br>Feind: <b>${e.hp} / ${e.maxHp} LP</b>`;
                    }
                    if (e.hp <= 0) log += `<br><span class="success-text"><b>Feind ausgeschaltet!</b></span>`;

                    setCombatLog(log); showWeiter();
                    GameState.combatResult = { enemyDied: e.hp <= 0, playerDied: false };
                });
            });
        } else {
            // Verfehlt – Feind greift zurück
            const eW = WEAPONS[e.waffe];
            const eRoll = Math.floor(Math.random() * 100) + 1;
            let log = `<b>${w.name}</b> – ${verb}: ${atkRoll} > ${p.angriff}% → <span class="fail-text">Verfehlt!</span><br><br>`;

            if (eRoll <= e.angriff) {
                const eDmg = rollDice(eW.n, eW.s);
                const dRoll = Math.floor(Math.random() * 100) + 1;
                log += `Feind greift zurück (${e.angriff}%): Wurf ${eRoll} → <span class="fail-text">Treffer! ${eDmg} Schaden</span><br>`;
                if (dRoll <= p.ausweichen) {
                    log += `Ausweichen (${p.ausweichen}%): Wurf ${dRoll} → <span class="success-text">Erfolg!</span> Kein Schaden`;
                } else {
                    p.hp = Math.max(0, p.hp - eDmg);
                    log += `Ausweichen (${p.ausweichen}%): Wurf ${dRoll} → <span class="fail-text">Fehlschlag!</span><br>Du: <b>${p.hp} / ${p.maxHp} LP</b>`;
                }
            } else {
                log += `Feind greift zurück (${e.angriff}%): Wurf ${eRoll} → <span class="success-text">Auch verfehlt!</span>`;
            }
            if (p.hp <= 0) log += `<br><span class="fail-text"><b>Du wurdest besiegt!</b></span>`;
            setCombatLog(log); showWeiter();
            GameState.combatResult = { enemyDied: false, playerDied: p.hp <= 0 };
        }
    });
}

window.combatContinue = function() {
    el('combat-result').style.display = 'none';
    const r = GameState.combatResult;

    if (r.playerDied) {
        GameState.paused = true;
        setTimeout(() => alert('Du wurdest besiegt!'), 100);
        return;
    }
    if (r.enemyDied) {
        killEnemy(GameState.combatTarget);
        const remaining = (GameState.combatTargets || []).filter(e => !e.isDead);
        if (remaining.length > 0) {
            GameState.combatTarget = remaining[0];
            startPlayerTurn();
        } else {
            GameState.paused = false;
        }
        return;
    }
    if (r.fled) {
        el('combat-result').style.display = 'none';
        // C: Gegner ignorieren Spieler 5 Sekunden
        const IGNORE_MS = 5000;
        (GameState.combatTargets || []).forEach(e => {
            if (!e.isDead) e.ignoreUntil = performance.now() + IGNORE_MS;
        });
        // D: Spieler flieht 3 Felder rückwärts (animiert), dann Kampf beenden
        const target = GameState.combatTarget ||
                       (GameState.combatTargets || []).find(e => !e.isDead);
        if (target) { retreatPlayer(target, endCombat); } else { endCombat(); }
        return;
    }
    if (r.contactLost) {
        // Sichtkontakt verloren – kurze Ignorier-Zeit, dann normales Spiel
        (GameState.combatTargets||[]).forEach(e => {
            if (!e.isDead) e.ignoreUntil = performance.now() + 2500;
        });
        endCombat(); return;
    }
    if (r.enemyTurnDone) {
        startPlayerTurn(); return;
    }
    if (r.continuePlayer) {
        // Spieler-Aktion abgeschlossen, noch AP übrig
        openEncounterMenu(); return;
    }
    // Kampf geht weiter auf Spielerseite (noch AP?)
    if (GameState.combatAP > 0) {
        openEncounterMenu();
    } else {
        combatEndTurn();
    }
};

// =========================================
// DRAG & DROP  (Mouse + Touch, iOS-kompatibel)
// =========================================
document.addEventListener('DOMContentLoaded', () => {

    let draggedItem = null;

    // ── MOUSE drag & drop (Desktop) ───────────────────────
    document.querySelectorAll('.draggable-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            draggedItem = item;
            e.dataTransfer.setData('text/plain', item.id);
            setTimeout(() => { item.style.opacity = '0.4'; }, 0);
        });
        item.addEventListener('dragend', () => { item.style.opacity = '1'; draggedItem = null; });
    });

    function categoryMatch(zone) {
        const accepts = zone.dataset.accepts;
        if (!accepts || !draggedItem) return true;
        return draggedItem.dataset.category === accepts;
    }

    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.toggle('drag-over', categoryMatch(zone));
            zone.classList.toggle('drag-invalid', !categoryMatch(zone));
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over', 'drag-invalid'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over', 'drag-invalid');
            const el = document.getElementById(e.dataTransfer.getData('text/plain'));
            if (!el || zone.querySelector('.draggable-item') || !categoryMatch(zone)) return;
            zone.appendChild(el);
            updateWeaponStatus(); // Seite 1 sofort aktualisieren
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
        swipeActive = false;          // disable swipe while dragging
        dragging = item;
        draggedItem = item;
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
        document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over', 'drag-invalid'));
        // Temporarily hide ghost to hit-test the element below
        ghost.style.display = 'none';
        const zone = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)?.closest('.drop-zone');
        ghost.style.display = 'block';
        if (zone && zone !== originZone) {
            zone.classList.toggle('drag-over', categoryMatch(zone));
            zone.classList.toggle('drag-invalid', !categoryMatch(zone));
        }
    }

    function touchEnd(e) {
        if (!dragging) return;
        // Hide ghost permanently — do NOT re-show it
        ghost.style.display = 'none';
        dragging.style.opacity = '1';
        document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over', 'drag-invalid'));

        // Find drop target with ghost hidden
        const zone = document.elementFromPoint(
            e.changedTouches[0].clientX, e.changedTouches[0].clientY
        )?.closest('.drop-zone');

        if (zone && zone !== originZone && !zone.querySelector('.draggable-item') && categoryMatch(zone)) {
            zone.appendChild(dragging);
            updateWeaponStatus(); // Seite 1 sofort aktualisieren
        }
        dragging = null; originZone = null; draggedItem = null;
    }

    function movGhost(touch) {
        ghost.style.left = touch.clientX + 'px';
        ghost.style.top  = touch.clientY + 'px';
    }

    document.addEventListener('touchstart', touchStart, { passive: false, capture: true });
    document.addEventListener('touchmove',  touchMove,  { passive: false, capture: true });
    document.addEventListener('touchend',   touchEnd,   { passive: false, capture: true });
});

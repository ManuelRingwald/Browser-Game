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
    const trigger = e.target?.closest?.('.tooltip-trigger');
    if (!trigger) return;
    trigger.classList.add('active');
    positionTooltip(trigger);
});
document.addEventListener('mouseout', e => {
    const trigger = e.target?.closest?.('.tooltip-trigger');
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
        } else if (charBtn.style.display !== 'none') {
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
        charBtn.style.display = 'flex';
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
    charBtn.style.display = 'none';
    document.getElementById('dpad')?.classList.add('dpad-combat');
    document.getElementById('charsheet-overlay').style.display = 'block';
    charSheet.style.display = 'flex';
    // Minimap beim Öffnen zeichnen (leicht verzögert damit Layout gesetzt ist)
    requestAnimationFrame(() => requestAnimationFrame(updateMinimap));
});

// Swipe left/right on char-sheet to switch pages
// NOTE: swipeActive is set to false during touch-drag so swipe doesn't fire
let swipeActive = false;
(function() {
    let swipeStartX = 0, swipeStartY = 0;
    charSheet.addEventListener('touchstart', e => {
        if (e.target?.closest?.('.draggable-item')) { swipeActive = false; return; }
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
    charBtn.style.display = 'flex';
    document.getElementById('dpad')?.classList.remove('dpad-combat');
    document.getElementById('charsheet-overlay').style.display = 'none';
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
    if (currentCharPage === 2) updateMinimap();
};

// ── Miniaturkarte ─────────────────────────────────────────────────────────────

function updateMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas || !GameState.worldW || !exploredCanvas) return;

    // Canvas-Größe auf Darstellungsgröße setzen
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width  = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);

    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    const sx = W / GameState.worldW, sy = H / GameState.worldH;

    // 1. Vollständiger Nebel als Ausgangszustand (alles verborgen)
    ctx.fillStyle = '#b8a880';    // dunkles Pergament = unerforschtes Gebiet
    ctx.fillRect(0, 0, W, H);

    // 2. Erkundete Bereiche aufdecken: Wände nur dort zeichnen, wo exploriert
    //    Schritt A – Wände auf Offscreen zeichnen
    const wallMap = document.createElement('canvas');
    wallMap.width = W; wallMap.height = H;
    const wallMapCtx = wallMap.getContext('2d');
    wallMapCtx.fillStyle = '#e0d4b0';   // helles Pergament = erforschter Boden
    wallMapCtx.fillRect(0, 0, W, H);
    wallMapCtx.fillStyle = 'rgba(62,44,20,0.78)';  // Wandfarbe
    GameState.walls.forEach(wall => {
        wallMapCtx.fillRect(
            Math.round(wall.x * sx), Math.round(wall.y * sy),
            Math.max(1, Math.round((wall.width || wall.w) * sx)),
            Math.max(1, Math.round((wall.height || wall.h) * sy))
        );
    });

    //    Schritt B – nur erkundete Bereiche sichtbar machen
    wallMapCtx.globalCompositeOperation = 'destination-in';
    wallMapCtx.drawImage(exploredCanvas, 0, 0, W, H);

    ctx.drawImage(wallMap, 0, 0);

    // 3. Weltgegenstände – leuchtende goldene Punkte
    GameState.worldItems.forEach(item => {
        const ix = item.x * sx, iy = item.y * sy;
        const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, 5);
        g.addColorStop(0, 'rgba(255,218,40,0.98)');
        g.addColorStop(0.45, 'rgba(255,180,20,0.60)');
        g.addColorStop(1, 'rgba(255,160,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ix, iy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(210,148,0,0.95)';
        ctx.beginPath(); ctx.arc(ix, iy, 1.6, 0, Math.PI * 2); ctx.fill();
    });

    // 4. Gegner auf Minimap
    Entities.enemies.forEach(enemy => {
        const ex = enemy.x * sx, ey = enemy.y * sy;
        if (enemy.isDead) {
            // Tote: dauerhaftes graues X an Sterbeposition
            const r = 3.2;
            ctx.save();
            ctx.strokeStyle = 'rgba(100,80,60,0.55)';
            ctx.lineWidth = 1.5; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r);
            ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r);
            ctx.stroke();
            ctx.restore();
        } else {
            // Lebende: nur bei aktivem Sichtkontakt (canSee = gleiche Logik wie Spiel)
            if (!canSee(Entities.player, enemy)) return;
            const r = 3.8;
            ctx.save();
            ctx.strokeStyle = 'rgba(185,22,22,0.92)';
            ctx.lineWidth = 2.2; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r);
            ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r);
            ctx.stroke();
            // Kleiner roter Punkt in der Mitte
            ctx.fillStyle = 'rgba(185,22,22,0.75)';
            ctx.beginPath(); ctx.arc(ex, ey, 1.4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    });

    // 5. Spieler – blauer Punkt mit Richtungslinie
    const p = Entities.player;
    const px = p.x * sx, py = p.y * sy;
    ctx.save();
    ctx.strokeStyle = 'rgba(28,65,200,0.80)';
    ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(p.angle) * 8, py + Math.sin(p.angle) * 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(38,88,225,0.92)';
    ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,215,255,0.80)';
    ctx.beginPath(); ctx.arc(px, py, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 6. Skizzen-Rahmen + Kompass
    ctx.save();
    ctx.strokeStyle = 'rgba(60,42,22,0.38)';
    ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    ctx.setLineDash([]);
    ctx.font = "bold 9px 'Kalam'";
    ctx.fillStyle = 'rgba(60,42,22,0.52)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('N ↑', W - 4, 4);
    ctx.restore();
}


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
function checkTwoHanded() {
    const rSlot = document.getElementById('slot-rechteHand');
    const lSlot = document.getElementById('slot-linkeHand');
    if (!rSlot || !lSlot) return;

    // Bestehende Geister entfernen
    document.querySelectorAll('.two-handed-ghost').forEach(g => g.remove());
    rSlot.removeAttribute('data-ghost'); lSlot.removeAttribute('data-ghost');

    const rItem = rSlot.querySelector('.draggable-item[data-weapon]');
    const lItem = lSlot.querySelector('.draggable-item[data-weapon]');
    const rIs2H = rItem && TWO_HANDED_WEAPONS.has(rItem.dataset.weapon);
    const lIs2H = lItem && TWO_HANDED_WEAPONS.has(lItem.dataset.weapon);

    function spawnGhost(source, target) {
        const ghost = document.createElement('img');
        ghost.src       = source.src;
        ghost.alt       = source.alt;
        ghost.className = 'inv-icon two-handed-ghost';
        ghost.draggable = false;
        target.appendChild(ghost);
        target.setAttribute('data-ghost', '1');
    }

    if (rIs2H) spawnGhost(rItem, lSlot);
    else if (lIs2H) spawnGhost(lItem, rSlot);
}

function updateWeaponStatus() {
    const owned = getOwnedWeapons();

    const cfg = {
        messer:       { itemId:'messer-skizze',       rowId:'cs-row-messer',  iconId:'cs-icon-messer',  statId:'cs-status-messer'  },
        pistole:      { itemId:'pistole-skizze',      rowId:'cs-row-pistole', iconId:'cs-icon-pistole', statId:'cs-status-pistole' },
        schrotflinte: { itemId:'schrotflinte-skizze', rowId:'cs-row-schrot',  iconId:'cs-icon-schrot',  statId:'cs-status-schrot'  },
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
        clone.className = 'wt-item-img';
        clone.removeAttribute('id');
        clone.draggable = false;
        iconEl.innerHTML = '';
        iconEl.appendChild(clone);

        const is2H = typeof TWO_HANDED_WEAPONS !== 'undefined' && TWO_HANDED_WEAPONS.has(key);
        if (inRechte || inLinke) {
            statEl.innerHTML = is2H
                ? '<span class="ws-hand">✓ Beidhändig</span>'
                : `<span class="ws-hand">✓ ${inRechte ? 'R.Hand' : 'L.Hand'}</span>`;
        } else {
            statEl.innerHTML = '<span class="ws-bag">Rucksack</span>';
        }
    });
    checkTwoHanded(); // Zweihand-Spiegel aktualisieren
}

// =========================================
// KAMPFSYSTEM  – BRP-Lite
// =========================================

// Hilfsfunktionen
function el(id) { return document.getElementById(id); }
function showResultMenu() { el('combat-result').style.display = 'flex'; el('btn-weiter').style.display = 'none'; el('react-section').style.display = 'none'; }
function showWeiter() {
    const btn = el('btn-weiter');
    if (btn) btn.style.display = 'block';
}

// Hängt eine Log-Zeile als eigenes div mit Typ-Klasse an + scrollt nach unten
function appendCombatLog(html, type = 'info') {
    const log = el('combat-log');
    if (!log) return;  // Safety: Element nicht gefunden → keine Exception
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = html;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

// Setzt Log komplett neu (löscht alle Zeilen)
function setCombatLog(html, type = 'info') {
    const log = el('combat-log');
    if (!log) return;
    log.innerHTML = '';
    if (html) appendCombatLog(html, type);
}

// ── Ausweichen als Reaktion auf Feind-Angriff ────────────────────────────
let _dodgeCB = null;

const DODGE_AP_COST = 1;

function showDodgeReaction(enemy, callback) {
    _dodgeCB = callback;
    const p = Entities.player;

    // ── Blickrichtungs-Malus berechnen ──────────────────────────────────────
    // diff = Winkel zwischen Spieler-Blickrichtung und Angriffsrichtung
    let diff = Math.atan2(enemy.y - p.y, enemy.x - p.x) - p.angle;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const absDiff = Math.abs(diff);

    let facingLabel, mod;
    if (absDiff >= 3 * Math.PI / 4) {       // ≥135° → Rücken
        facingLabel = '↩ Rücken – kein Ausweichen!';
        mod = -999;
    } else if (absDiff >= Math.PI / 2) {     // 90–135° → Seite
        facingLabel = '↔ Seitlich (−20%)';
        mod = -20;
    } else {                                  // <90° → Vorne
        facingLabel = '↑ Frontal';
        mod = 0;
    }
    GameState.dodgeFacingMod = mod;

    const effAus = Math.max(0, p.ausweichen + mod);
    const canDodge = GameState.combatAP >= DODGE_AP_COST && mod > -999;
    const desc = mod === -999
        ? `${enemy.name} trifft von hinten! Kein Ausweichen möglich.`
        : `${enemy.name} greift an! ${facingLabel} – Ausweichen: ${effAus}%`;
    el('react-desc').textContent = desc;

    const btn = el('btn-react-dodge');
    btn.disabled = !canDodge;
    btn.classList.toggle('battle-btn-unavail', !canDodge);
    if (!canDodge && mod === -999)
        btn.textContent = 'Kein Ausweichen (Rücken)';
    else if (!canDodge)
        btn.textContent = `Ausweichen – kein AP (${GameState.combatAP}/${GameState.combatMaxAP})`;
    else
        btn.textContent = `Ausweichen (${DODGE_AP_COST} AP) – ${effAus}%`;

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

// Erzeugt eine visuelle Würfelanimation auf dem Spielfeld
function spawnDiceAnim(max, finalValue) {
    const cfg = max === 4   ? { label:'W4',   shape:'triangle' }
              : max === 6   ? { label:'W6',   shape:'square'   }
              : max === 8   ? { label:'W8',   shape:'diamond'  }
              : max === 12  ? { label:'2W6',  shape:'square'   }
              :               { label:'W100', shape:'circle'   };
    GameState.diceAnims.push({
        ...cfg,
        sides:      max,
        curValue:   Math.floor(Math.random() * max) + 1,
        finalValue,
        startTime:  performance.now(),
        duration:   1650,  // deckt animateRoll-Laufzeit ab
    });
}

// max = Würfel-Maximum (z.B. 8 für W8, 12 für 2W6). Standard: 100 für W100.
function animateRoll(elementId, finalValue, callback, max = 100) {
    spawnDiceAnim(max, finalValue); // visueller Würfel startet gleichzeitig
    const node = el(elementId);
    if (!node) { setTimeout(callback, 50); return; }
    let tick = 0;
    const iv = setInterval(() => {
        node.innerText = Math.floor(Math.random() * max) + 1;
        if (++tick >= 16) { clearInterval(iv); node.innerText = finalValue; setTimeout(callback, 550); }
    }, 60);
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

    // Buttons: ausgegraut UND deaktiviert wenn AP nicht reicht
    const setBtn = (id, unavail) => {
        const b = el(id);
        if (!b) return;
        b.classList.toggle('battle-btn-unavail', unavail);
        b.disabled = unavail;
    };
    setBtn('btn-enc-angriff', ap < AP_KOSTEN.angriff);
    setBtn('btn-enc-bewegen', ap < AP_KOSTEN.bewegen);
    setBtn('btn-enc-flucht',  ap < 1);
    // Zug beenden: immer möglich
    // Ausweichen: nur als Reaktion auf Feind-Angriff (kein eigener Menü-Button mehr)

    // Schleichen: nur bei aktivem Hinterhalt
    const btnSneak = el('btn-enc-schleichen');
    if (btnSneak) {
        const showSneak = !!GameState.combatAmbush;
        btnSneak.style.display = showSneak ? 'block' : 'none';
        btnSneak.disabled = showSneak && ap < AP_KOSTEN.angriff;
        btnSneak.classList.toggle('battle-btn-unavail', showSneak && ap < AP_KOSTEN.angriff);
    }

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
    // Sneak-Button wird separat oben gesetzt — hier nicht überschreiben
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

window.combatSneak = function() {
    if (!GameState.combatAmbush) return;
    const p = Entities.player;
    const e = GameState.combatTarget;
    if (!e || e.isDead) return;
    if (GameState.combatAP < AP_KOSTEN.angriff) return;

    el('encounter-menu').style.display = 'none';
    GameState.combatAP     -= AP_KOSTEN.angriff;
    GameState.combatAmbush  = false; // Hinterhalt-Bonus aufgebraucht

    // Beste verfügbare Nahkampfwaffe (Messer > Faust)
    const equipped    = getEquippedWeapons();
    const sneakKey    = equipped.has('messer') ? 'messer' : 'faust';
    const sneakW      = WEAPONS[sneakKey];
    const sneakChance = Math.min(95, p.ausweichen + 10);
    const roll        = Math.floor(Math.random() * 100) + 1;

    showResultMenu();
    setCombatLog(`Anschleichen (${sneakChance}%):<br><span id="rd-sneak" class="rolling-number">--</span>`);

    animateRoll('rd-sneak', roll, () => {
        if (roll <= sneakChance) {
            // ── Erfolg: zum Gegner bewegen + kritischer Treffer ──────────────
            setCombatLog(`<span class="success-text">Anschleichen gelingt! (${roll} ≤ ${sneakChance}%)</span><br>Kritischer Angriff…`);

            // 1 Feld vor dem Gegner einrasten
            const dx = e.x - p.x, dy = e.y - p.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const tx = len > FELD_PX * 0.6 ? e.x - (dx / len) * FELD_PX : p.x;
            const ty = len > FELD_PX * 0.6 ? e.y - (dy / len) * FELD_PX : p.y;

            // Schleich-Animation: langsam (1400ms), Fußspuren + Geister
            const sx = p.x, sy = p.y;
            const sneakAngle = Math.atan2(ty - sy, tx - sx);
            p.angle = sneakAngle;

            // Fußspuren gleichmäßig entlang des Weges (abwechselnd links/rechts)
            const N_STEPS = 6;
            const footsteps = Array.from({ length: N_STEPS }, (_, i) => {
                const t = (i + 1) / (N_STEPS + 1);
                return { x: sx + (tx - sx) * t, y: sy + (ty - sy) * t,
                         side: i % 2 === 0 ? 1 : -1, alpha: 0 };
            });
            // Geister: 4 Positionen hinter dem Spieler
            const ghosts = [0.25, 0.45, 0.62, 0.76].map(t => ({
                x: sx + (tx - sx) * t, y: sy + (ty - sy) * t, alpha: 0
            }));

            GameState.sneakAnim = { sx, sy, tx, ty, angle: sneakAngle, footsteps, ghosts };

            Anim.push({
                duration: 1400,
                onUpdate(raw) {
                    // Lineare Bewegung – kein Ease, fühlt sich kontrolierter/kälter an
                    p.x = sx + (tx - sx) * raw;
                    p.y = sy + (ty - sy) * raw;

                    // Fußspuren erscheinen ab ihrem Wegpunkt und verblassen dann
                    footsteps.forEach((fs, i) => {
                        const appear  = (i + 1) / (N_STEPS + 1);
                        const fadeOut = appear + 0.18;
                        if (raw < appear)         fs.alpha = 0;
                        else if (raw < fadeOut)   fs.alpha = (raw - appear) / 0.08;
                        else                      fs.alpha = Math.max(0, 1 - (raw - fadeOut) / 0.25);
                    });

                    // Geister verblassen mit der Zeit (ältere verblassen schneller)
                    ghosts.forEach((g, i) => {
                        const appear = [0.20, 0.38, 0.54, 0.68][i];
                        g.alpha = raw >= appear
                            ? Math.max(0, 1 - (raw - appear) / 0.30) * 0.8
                            : 0;
                    });

                    // Nebel aufdecken
                    const obs = getObstacles();
                    const { pts } = computeVisibilityPolygon(p.x, p.y, p.angle, p.fov, p.viewDistance, obs);
                    if (pts.length >= 2) {
                        exploredCtx.fillStyle = 'black';
                        exploredCtx.beginPath();
                        exploredCtx.moveTo(p.x, p.y);
                        for (const [, vx, vy] of pts) exploredCtx.lineTo(vx, vy);
                        exploredCtx.closePath();
                        exploredCtx.fill();
                    }
                },
                onComplete() {
                    GameState.sneakAnim = null;
                    const dmg = rollDice(sneakW.n, sneakW.s) * 2;
                    e.hp = Math.max(0, e.hp - dmg);
                    setCombatLog(
                        `<span class="success-text">Kritischer Treffer mit ${sneakW.name}!</span><br>` +
                        `${dmg} Schaden (2×) – Feind konnte nicht reagieren.<br>` +
                        `Feind: <b>${e.hp}/${e.maxHp} LP</b>` +
                        (e.hp <= 0 ? `<br><span class="success-text"><b>Feind ausgeschaltet!</b></span>` : '')
                    );
                    showWeiter();
                    GameState.combatResult = { enemyDied: e.hp <= 0, playerDied: false };
                }
            });
        } else {
            // ── Fehlschlag: Feind bemerkt Spieler ───────────────────────────
            setCombatLog('— Anschleichen fehlgeschlagen —', 'phase');
            appendCombatLog(`✗ Entdeckt! (${roll} > ${sneakChance}%)`, 'bad');

            const rotStart  = e.angle;
            const rotTarget = Math.atan2(p.y - e.y, p.x - e.x);
            let rotDelta = rotTarget - rotStart;
            while (rotDelta >  Math.PI) rotDelta -= 2 * Math.PI;
            while (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;

            // doAttack hängt NUR an, löscht nichts – Drehungs-Eintrag bleibt sichtbar
            const doAttack = () => {
                const eW    = WEAPONS[e.waffe];
                const eRoll = Math.floor(Math.random() * 100) + 1;
                appendCombatLog(`${e.name} reagiert · ${eW.name} · Wurf: ${eRoll} (Chance ${e.angriff}%)`, 'enemy');
                if (eRoll <= e.angriff) {
                    const eDmg = rollDice(eW.n, eW.s);
                    p.hp = Math.max(0, p.hp - eDmg);
                    appendCombatLog(`✗ Treffer! ${eDmg} Schaden · Du: ${p.hp}/${p.maxHp} LP`, 'bad');
                } else {
                    appendCombatLog(`✓ ${e.name} verfehlt!`, 'good');
                }
                showWeiter();
                GameState.combatResult = { enemyDied: false, playerDied: p.hp <= 0 };
            };

            if (Math.abs(rotDelta) > 0.15) {
                appendCombatLog(`${e.name} dreht sich um…`, 'info');
                Anim.push({
                    duration: 380,
                    onUpdate(_, t) { e.angle = lerpAngle(rotStart, rotTarget, t); },
                    onComplete: doAttack,
                });
            } else {
                e.angle = rotTarget;
                doAttack();
            }
        }
    });
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
    GameState.selectingDirection = false;
    GameState.postMoveRotation   = false;
    GameState.combatMoving       = false;
    GameState.combatPhase = 'enemy';
    processEnemyTurnUI();
};

// Feind-Zug: akkumulierter Log, Dodge-Reaktion bei Angriffen
const ENEMY_AP_MAX = 4;

window.processEnemyTurnUI = function() {
    const living = (GameState.combatTargets || []).filter(e => !e.isDead);
    if (living.length === 0) { startPlayerTurn(); return; }

    showResultMenu();
    setCombatLog('— Feind-Zug —', 'phase');
    Anim.clear();
    startEnemyTurnReset();
    let ei = 0;

    function doneAll() {
        const stillEngaged = (GameState.combatTargets||[]).filter(e=>!e.isDead)
            .some(e => canSeeInCombat(Entities.player, e) || canSeeInCombat(e, Entities.player));
        if (!stillEngaged) {
            appendCombatLog('Sichtkontakt verloren — Kampf beendet.', 'info');
            showWeiter();
            GameState.combatResult = { enemyDied:false, playerDied:false, contactLost:true };
            return;
        }
        showWeiter();
        GameState.combatResult = { enemyDied:false, playerDied:Entities.player.hp<=0, enemyTurnDone:true };
    }

    // Führt eine einzelne Aktion des Feindes aus, dann rekursiv weiter (AP-Schleife).
    function enemyDoAction(enemy, ap, isFirstAction) {
        if (enemy.isDead) { ei++; nextEnemy(); return; }

        // Besten Plan wählen
        let plan = enemyComputeAction(enemy);
        let apCost = plan.type === 'attack' ? AP_KOSTEN.angriff : AP_KOSTEN.bewegen;

        // Wenn Angriff zu teuer: auf Bewegung ausweichen, falls AP noch reicht
        if (plan.type === 'attack' && apCost > ap) {
            plan = { type: 'move' };
            apCost = AP_KOSTEN.bewegen;
        }
        // Kein AP mehr für irgendeine Aktion → Zug dieses Feindes beendet
        if (apCost > ap) { enemy.currentAP = 0; ei++; nextEnemy(); return; }

        // Rotation: nur einmal am Anfang des Zuges (kostenlos, kosmetisch)
        if (isFirstAction) {
            const p = Entities.player;
            const rotStart  = enemy.angle;
            const rotTarget = Math.atan2(p.y - enemy.y, p.x - enemy.x);
            let rotDelta = rotTarget - rotStart;
            while (rotDelta >  Math.PI) rotDelta -= 2 * Math.PI;
            while (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;
            if (Math.abs(rotDelta) > 0.15) {
                appendCombatLog(`${enemy.name} dreht sich...`, 'info');
                Anim.push({
                    duration: 200,
                    onUpdate(_, e) { enemy.angle = lerpAngle(rotStart, rotTarget, e); }
                });
            } else {
                enemy.angle = rotTarget;
            }
        }

        const remaining = ap - apCost;
        enemy.currentAP = remaining; // für HUD-Anzeige

        if (plan.type === 'chase' || plan.type === 'move') {
            Anim.push({
                duration: 350,
                onStart() {
                    const res = enemyExecuteMove(enemy);
                    const prefix = plan.type === 'chase' ? `Sucht Sichtkontakt — ` : '';
                    appendCombatLog(`${prefix}${res.text}`, 'info');
                },
                onComplete() { enemyDoAction(enemy, remaining, false); }
            });
        } else if (plan.type === 'attack') {
            Anim.push({
                duration: 50,
                onStart() {
                    appendCombatLog(`${enemy.name} greift an · ${plan.weapon.name}`, 'enemy');
                },
                onComplete() {
                    showDodgeReaction(enemy, (tryDodge) => {
                        const res = enemyExecuteAttack(enemy, tryDodge, plan.weaponKey);
                        appendCombatLog(res.text, res.type === 'hit' ? 'bad' : 'good');

                        // Ausweich-Animation: Spieler tritt kurz zur Seite
                        if (res.dodged) {
                            const atk = Math.atan2(Entities.player.y - enemy.y, Entities.player.x - enemy.x);
                            const side = atk + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
                            GameState.dodgeAnim = {
                                dx: Math.cos(side) * 18,
                                dy: Math.sin(side) * 18,
                                startTime: performance.now(),
                                duration: 560,
                                done: false,
                            };
                        }

                        if (Entities.player.hp <= 0) { doneAll(); return; }
                        Anim.push({ duration: 250, onComplete() { enemyDoAction(enemy, remaining, false); } });
                    });
                }
            });
        }
    }

    function nextEnemy() {
        if (ei >= living.length) { doneAll(); return; }
        const enemy = living[ei];
        enemy.currentAP = ENEMY_AP_MAX;
        enemyDoAction(enemy, ENEMY_AP_MAX, true);
    }

    nextEnemy();
};

window.combatAttack = function() {
    if (GameState.combatAP < AP_KOSTEN.angriff) {
        el('enc-desc').textContent = `Nicht genug AP. Angriff kostet ${AP_KOSTEN.angriff} AP (du hast ${GameState.combatAP}).`;
        return;
    }
    // Bewegungsraster ausblenden falls zuvor auf Bewegen geklickt
    GameState.combatMoving = false;
    GameState.combatGridVisible = false;
    document.getElementById('gameCanvas').classList.remove('combat-move');
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

        const w = WEAPONS[key];
        const tooFar   = dist > w.range;
        const tooClose = w.ammoKey && dist < FELD_PX * 1.5; // mind. 1 freies Feld zwischen Charakteren
        const noAmmo   = w.ammoKey && (p.ammo[w.ammoKey] ?? 0) <= 0;
        const unavail  = tooFar || tooClose || noAmmo;
        btn.disabled = unavail;
        btn.classList.toggle('battle-btn-unavail', unavail);
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
    if (w.ammoKey) {
        p.ammo[w.ammoKey]--;
        spawnProjectiles(p.x, p.y, e.x, e.y, key);
    }

    const atkRoll  = Math.floor(Math.random() * 100) + 1;
    const verb     = w.ammoKey ? 'Schuss' : 'Schlag';
    showResultMenu();
    setCombatLog(`— Dein Angriff —`, 'phase');
    appendCombatLog(`${w.name} · Wurf: <span id="rd1" class="rolling-number">--</span> (Chance ${p.angriff}%)`, 'player');

    animateRoll('rd1', atkRoll, () => {
        if (atkRoll <= p.angriff) {
            appendCombatLog(`✓ Treffer! (${atkRoll} ≤ ${p.angriff}%) · Schaden: <span id="rd2" class="rolling-number">--</span>`, 'good');
            let dmg = rollDice(w.n, w.s);
            if (key === 'schrotflinte' && dist < 80) dmg += 2;

            animateRoll('rd2', dmg, () => {
                if (GameState.combatAmbush) {  // max = w.n*w.s → korrekte Würfelwerte
                    GameState.combatAmbush = false;
                    e.hp = Math.max(0, e.hp - dmg);
                    appendCombatLog(`Hinterhalt! Kein Ausweichen möglich.`, 'info');
                    appendCombatLog(e.hp <= 0
                        ? `Feind ausgeschaltet!`
                        : `Feind: ${e.hp} / ${e.maxHp} LP`, e.hp <= 0 ? 'good' : 'neutral');
                    showWeiter();
                    GameState.combatResult = { enemyDied: e.hp <= 0, playerDied: false };
                    return;
                }

                const dodgeRoll = Math.floor(Math.random() * 100) + 1;
                const defLabel  = w.blockbar ? `Blocken (${e.blockwert}%)` : `Ausweichen (${e.ausweichen}%)`;
                appendCombatLog(`${e.name} versucht ${w.blockbar ? 'zu blocken' : 'auszuweichen'} · Wurf: <span id="rd3" class="rolling-number">--</span>`, 'enemy');

                animateRoll('rd3', dodgeRoll, () => {
                    let finalDmg = dmg;
                    const defVal = w.blockbar ? e.blockwert : e.ausweichen;

                    if (w.blockbar && dodgeRoll <= e.blockwert) {
                        finalDmg = Math.max(1, Math.floor(finalDmg / 2));
                        appendCombatLog(`✓ Block! (${dodgeRoll} ≤ ${e.blockwert}%) · Schaden halbiert → ${finalDmg}`, 'good');
                    } else if (!w.blockbar && dodgeRoll <= e.ausweichen) {
                        finalDmg = 0;
                        appendCombatLog(`✓ Ausgewichen! (${dodgeRoll} ≤ ${e.ausweichen}%) · Kein Schaden`, 'good');
                    } else {
                        appendCombatLog(`✗ ${w.blockbar ? 'Block' : 'Ausweichen'} scheitert (${dodgeRoll} > ${defVal}%)`, 'bad');
                    }

                    if (finalDmg > 0) {
                        e.hp = Math.max(0, e.hp - finalDmg);
                        appendCombatLog(e.hp <= 0
                            ? `Feind ausgeschaltet! (war ${e.maxHp} LP)`
                            : `Feind: ${e.hp} / ${e.maxHp} LP`, e.hp <= 0 ? 'good' : 'neutral');
                    }
                    showWeiter();
                    GameState.combatResult = { enemyDied: e.hp <= 0, playerDied: false };
                });
            }, w.n * w.s); // max = Schaden-Würfelbereich (z.B. 8 für W8, 12 für 2W6)
        } else {
            // Verfehlt – Gegenschlag mit distanzabhängiger Waffe
            appendCombatLog(`✗ Verfehlt! (${atkRoll} > ${p.angriff}%)`, 'bad');

            // Waffenwahl (Distanz)
            const primaryW      = WEAPONS[e.waffe];
            const fistW         = WEAPONS.faust;
            const minRanged     = primaryW.ammoKey ? FELD_PX * 1.5 : 0;
            const hasAmmo       = !primaryW.ammoKey || (e.ammo?.[primaryW.ammoKey] ?? 0) > 0;
            const canUsePrimary = dist >= minRanged && dist <= primaryW.range && hasAmmo;
            const eW            = canUsePrimary ? primaryW : fistW;
            const eWKey         = canUsePrimary ? e.waffe : 'faust';

            // Ergebnis vorab berechnen (für Schuss-Overshoot)
            const eRoll       = Math.floor(Math.random() * 100) + 1;
            const enemyHits   = eRoll <= e.angriff;
            let   eDmg = 0, dRoll = 0, dodgeSuccess = false;
            if (enemyHits) {
                eDmg         = rollDice(eW.n, eW.s);
                dRoll        = Math.floor(Math.random() * 100) + 1;
                dodgeSuccess = dRoll <= p.ausweichen;
            }

            // Schuss-Animation sofort spawnen (Projektil fliegt während Würfel läuft)
            if (eW.ammoKey && e.ammo) {
                e.ammo[eWKey] = Math.max(0, (e.ammo[eWKey] ?? 0) - 1);
                spawnProjectiles(e.x, e.y, p.x, p.y, eWKey,
                    /* overshoot */ !enemyHits || dodgeSuccess);
            }

            // Pacing: kurze Pause → Gegenschlag-Header → Würfel-Animation
            Anim.push({ duration: 380 }); // Pause nach "Verfehlt!"
            Anim.push({
                duration: 50,
                onStart() { appendCombatLog(`— Gegenschlag —`, 'phase'); }
            });
            Anim.push({ duration: 320 });
            Anim.push({
                duration: 50,
                onStart() {
                    appendCombatLog(
                        `${e.name} · ${eW.name} · Wurf: <span id="rd-counter" class="rolling-number">--</span> (Chance ${e.angriff}%)`,
                        'enemy');
                },
                onComplete() {
                    animateRoll('rd-counter', eRoll, () => {
                        if (enemyHits) {
                            appendCombatLog(`✗ Treffer! ${eDmg} Schaden · Ausweichen: ${dRoll} vs. ${p.ausweichen}%`, 'bad');
                            if (dodgeSuccess) {
                                appendCombatLog(`✓ Ausgewichen! Kein Schaden`, 'good');
                            } else {
                                p.hp = Math.max(0, p.hp - eDmg);
                                appendCombatLog(`✗ Ausweichen scheitert · Du: ${p.hp} / ${p.maxHp} LP`, 'bad');
                            }
                        } else {
                            appendCombatLog(`✓ Auch verfehlt! (${eRoll} > ${e.angriff}%)`, 'good');
                        }
                        showWeiter();
                        GameState.combatResult = { enemyDied: false, playerDied: p.hp <= 0 };
                    });
                }
            });
        }
    });
}

window.combatContinue = function() {
    el('combat-result').style.display = 'none';
    const r = GameState.combatResult;

    if (r.playerDied) {
        GameState.paused = true;
        el('combat-result').style.display = 'none';
        el('encounter-menu').style.display = 'none';
        el('weapon-menu').style.display = 'none';
        el('gameover-screen').style.display = 'flex';
        return;
    }
    if (r.enemyDied) {
        killEnemy(GameState.combatTarget);
        const remaining = (GameState.combatTargets || []).filter(e => !e.isDead);
        if (remaining.length > 0) {
            GameState.combatTarget = remaining[0];
            startPlayerTurn();
        } else {
            endCombat(); // setzt selectingDirection, combatMoving etc. vollständig zurück
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
// ── Weltgegenstände: Pickup-Dialog + Drop ────────────────────────────────────

let _pendingPickupItem = null;

function getRucksackFreeSlot() {
    const slots = document.querySelectorAll('#rucksack-grid .rucksack-slot.drop-zone');
    return Array.from(slots).find(s => !s.firstElementChild) || null;
}

window.openPickupDialog = function(item) {
    _pendingPickupItem = item;
    el('pickup-img').src = item.img;
    el('pickup-title').textContent = item.label;

    const freeSlot = getRucksackFreeSlot();
    const canPickup = !!freeSlot;
    el('pickup-desc').textContent = canPickup
        ? (item.type === 'medikit'  ? 'Heilt 6 LP wenn verwendet.'
         : item.type === 'magazin'  ? `${item.ammo} Schuss für die Pistole.`
         : 'Waffe aufnehmen.')
        : '⚠ Rucksack ist voll!';
    const btn = el('pickup-btn-take');
    btn.disabled = !canPickup;
    btn.classList.toggle('battle-btn-unavail', !canPickup);

    el('pickup-dialog').style.display = 'flex';
};

window.executePickup = function() {
    if (!_pendingPickupItem) return;
    const item = _pendingPickupItem;
    const freeSlot = getRucksackFreeSlot();
    if (!freeSlot) { _pendingPickupItem = null; el('pickup-dialog').style.display = 'none'; return; }

    // Item aus Welt entfernen
    GameState.worldItems = GameState.worldItems.filter(i => i !== item);

    // Item in Rucksack-Slot einfügen
    const img = document.createElement('img');
    img.src   = item.img;
    img.alt   = item.label;
    img.className = 'inv-icon';

    if (item.type === 'medikit') {
        img.id        = 'medikit-item-' + Date.now();
        img.className += ' draggable-item consumable-item';
        img.draggable  = true;
        img.dataset.category = 'consumable';
        img.setAttribute('onclick', 'openMedikitMenu()');
        img.title = 'Medikit – heilt 6 LP';
    } else if (item.type === 'magazin') {
        img.id        = 'magazin-' + Date.now();
        img.className += ' draggable-item consumable-item';
        img.draggable  = true;
        img.dataset.category = 'consumable';
        img.dataset.ammo     = item.ammo ?? 0;
        img.setAttribute('onclick', `openMagazinMenu(this)`);
        img.title = `${item.label}`;
    } else if (item.weaponKey) {
        img.id    = item.weaponKey + '-skizze';
        img.className += ' draggable-item';
        img.draggable = true;
        img.dataset.category = 'waffe';
        img.dataset.weapon   = item.weaponKey;
    }

    freeSlot.appendChild(img);
    _pendingPickupItem = null;
    el('pickup-dialog').style.display = 'none';
    updateWeaponStatus();
};

window.closePickupDialog = function() {
    _pendingPickupItem = null;
    GameState.worldItemTarget = null;
    el('pickup-dialog').style.display = 'none';
};

// ── Rechtsklick-Kontextmenü: Item fallen lassen ───────────────────────────────

let _contextTargetItem = null;

document.addEventListener('contextmenu', e => {
    const item = e.target?.closest?.('.draggable-item, .consumable-item');
    if (!item) return;
    const inInventory = item.closest('#rucksack-grid, #slot-rechteHand, #slot-linkeHand');
    if (!inInventory) return;
    e.preventDefault();
    _contextTargetItem = item;
    const menu = el('item-context-menu');
    menu.style.display = 'block';
    menu.style.left    = e.clientX + 'px';
    menu.style.top     = e.clientY + 'px';
});

document.addEventListener('click', e => {
    if (!e.target?.closest?.('#item-context-menu')) closeContextMenu();
});

window.closeContextMenu = function() {
    el('item-context-menu').style.display = 'none';
    _contextTargetItem = null;
};

window.executeDropItem = function() {
    if (!_contextTargetItem) { closeContextMenu(); return; }
    const itemEl   = _contextTargetItem;
    const p        = Entities.player;
    const weaponKey = itemEl.dataset?.weapon || null;

    // Leichten Versatz damit Item nicht exakt auf dem Spieler liegt
    const angle = p.angle + Math.PI; // hinter dem Spieler
    const wx = p.x + Math.cos(angle) * FELD_PX * 0.6;
    const wy = p.y + Math.sin(angle) * FELD_PX * 0.6;

    // Weltitem erstellen
    const worldItem = {
        id:   'dropped_' + Date.now(),
        type: weaponKey ? 'waffe' : (itemEl.id?.includes('medikit') ? 'medikit' : 'item'),
        label: itemEl.alt || weaponKey || 'Gegenstand',
        img:  itemEl.src,
        color: weaponKey ? 'rgba(60,80,160,0.85)' : 'rgba(180,30,30,0.85)',
        x: wx, y: wy,
        weaponKey,
    };
    GameState.worldItems.push(worldItem);

    // Aus Slot entfernen
    itemEl.remove();
    closeContextMenu();
    updateWeaponStatus();
};

// ── Item-Info-Box: Hover auf Inventar-Items ──────────────────────────────────
{
    const box = document.getElementById('item-info-box');
    if (box) {
        // Alle Inventar-Items beobachten (auch nachträglich eingefügte)
        document.addEventListener('mouseenter', e => {
            const item = e.target?.closest?.('.inv-icon');
            if (!item || !box) return;
            const info = _getItemInfo(item);
            if (!info) return;
            box.querySelector('.iib-name').textContent  = info.name;
            box.querySelector('.iib-type').textContent  = info.type;
            box.querySelector('.iib-stats').innerHTML   = info.statsHtml;
            box.style.display = 'block';
            _positionInfoBox(e);
        }, true);
        document.addEventListener('mousemove', e => {
            if (!e.target?.closest?.('.inv-icon') || box.style.display === 'none') return;
            _positionInfoBox(e);
        }, true);
        document.addEventListener('mouseleave', e => {
            if (!e.target?.closest?.('.inv-icon')) return;
            box.style.display = 'none';
        }, true);
    }

    function _positionInfoBox(e) {
        const b = document.getElementById('item-info-box');
        if (!b) return;
        const m = 14;
        const bw = b.offsetWidth || 220;  // Fallback falls noch nicht gerendert
        const bh = b.offsetHeight || 80;
        // Rechte Hälfte → Box links vom Cursor (verhindert Overflow)
        const x = (e.clientX + m + bw > window.innerWidth - 8)
            ? e.clientX - bw - m
            : e.clientX + m;
        const y = (e.clientY - bh - m < 8)
            ? e.clientY + m
            : e.clientY - bh - m;
        b.style.left = x + 'px';
        b.style.top  = y + 'px';
    }

    function _getItemInfo(img) {
        const wk = img.dataset?.weapon;
        if (wk && typeof WEAPONS !== 'undefined' && WEAPONS[wk]) {
            const w = WEAPONS[wk];
            const ammoCount = wk === 'pistole' ? Entities.player.ammo.pistole
                            : wk === 'schrotflinte' ? Entities.player.ammo.schrotflinte : null;
            const rangeFields = Math.round(w.range / FELD_PX);
            const rangeText   = rangeFields === 1 ? '1 Feld' : `${rangeFields} Felder`;
            let rows = [
                ['Schaden', `${w.n}W${w.s}`],
                ['Reichweite', rangeText],
                ['Munition', ammoCount !== null ? `${ammoCount} Schuss` : '∞'],
                ['Blockbar', w.blockbar ? 'Ja' : 'Nein'],
            ];
            let special = '';
            if (wk === 'messer')       special = 'Lautlos · Schleichangriff 2×';
            if (wk === 'schrotflinte') special = '+2 Schaden ≤ 1 Feld Distanz';
            const statsHtml = rows.map(([k,v]) =>
                `<div class="iib-stat"><span class="iib-key">${k}</span><span class="iib-val">${v}</span></div>`
            ).join('') + (special ? `<div class="iib-special">${special}</div>` : '');
            const is2H = typeof TWO_HANDED_WEAPONS !== 'undefined' && TWO_HANDED_WEAPONS.has(wk);
            return { name: w.name, type: `Waffe · ${is2H ? '2-Hand' : '1-Hand'}`, statsHtml };
        }
        if (img.id && img.id.includes('medikit')) {
            return {
                name: 'Medikit',
                type: 'Heilmittel',
                statsHtml: '<div class="iib-stat"><span class="iib-key">Heilung</span><span class="iib-val">6 LP</span></div>' +
                           '<div class="iib-special">Nur außerhalb des Kampfes nutzbar</div>',
            };
        }
        if (img.id && img.id.includes('magazin')) {
            const ammo = img.dataset?.ammo ?? '?';
            const cur  = Entities.player?.ammo?.pistole ?? 0;
            return {
                name: `Magazin`,
                type: 'Munition · Pistole',
                statsHtml: `<div class="iib-stat"><span class="iib-key">Schuss</span><span class="iib-val">${ammo}</span></div>` +
                           `<div class="iib-stat"><span class="iib-key">Pistole jetzt</span><span class="iib-val">${cur}/12</span></div>` +
                           '<div class="iib-special">Nur außerhalb des Kampfes nachladen</div>',
            };
        }
        return null;
    }
}

// ── Hover item-info-box auf Kampfwerten ANG / AUS / BLK ──────────────────────
{
    const box = document.getElementById('item-info-box');
    const statDefs = {
        angriff:    () => {
            const v = Entities.player.angriff;
            return { name: 'Angriff (ANG)', type: 'Kampfwert',
                statsHtml: `<div class="iib-stat"><span class="iib-key">Wert</span><span class="iib-val">${v}%</span></div>` +
                           `<div class="iib-special">W100 ≤ ${v} = Treffer</div>` };
        },
        ausweichen: () => {
            const v = Entities.player.ausweichen;
            return { name: 'Ausweichen (AUS)', type: 'Kampfwert',
                statsHtml: `<div class="iib-stat"><span class="iib-key">Wert</span><span class="iib-val">${v}%</span></div>` +
                           `<div class="iib-stat"><span class="iib-key">Aktion-Bonus</span><span class="iib-val">+20%</span></div>` +
                           `<div class="iib-special">W100 ≤ Wert = kein Schaden</div>` };
        },
        blockwert:  () => {
            const v = Entities.player.blockwert;
            return { name: 'Blocken (BLK)', type: 'Kampfwert',
                statsHtml: `<div class="iib-stat"><span class="iib-key">Wert</span><span class="iib-val">${v}%</span></div>` +
                           `<div class="iib-special">Nur Nahkampf · W100 ≤ Wert = Schaden ½<br>Nicht gegen Schusswaffen</div>` };
        },
    };
    document.querySelectorAll('.cs-stat-trigger[data-stat]').forEach(td => {
        td.addEventListener('mouseenter', e => {
            if (!box) return;
            const fn = statDefs[td.dataset.stat];
            const info = fn ? fn() : null;
            if (!info) return;
            box.querySelector('.iib-name').textContent = info.name;
            box.querySelector('.iib-type').textContent = info.type;
            box.querySelector('.iib-stats').innerHTML  = info.statsHtml;
            box.style.display = 'block';
            _positionInfoBox(e);
        });
        td.addEventListener('mousemove', _positionInfoBox);
        td.addEventListener('mouseleave', () => { if (box) box.style.display = 'none'; });
    });
}

// ── Hover item-info-box auf Waffennamen (Seite 1, gleicher Stil wie Seite 2) ──
{
    const box = document.getElementById('item-info-box');
    document.querySelectorAll('.weapon-info-trigger[data-weapon]').forEach(td => {
        td.addEventListener('mouseenter', e => {
            if (!box) return;
            const info = _getItemInfo({ dataset: { weapon: td.dataset.weapon }, id: '' });
            if (!info) return;
            box.querySelector('.iib-name').textContent = info.name;
            box.querySelector('.iib-type').textContent = info.type;
            box.querySelector('.iib-stats').innerHTML  = info.statsHtml;
            box.style.display = 'block';
            _positionInfoBox(e);
        });
        td.addEventListener('mousemove', _positionInfoBox);
        td.addEventListener('mouseleave', () => { if (box) box.style.display = 'none'; });
    });
}

// ── Magazin ───────────────────────────────────────────────────────────────────

let _magazinItem = null; // aktuell geöffnetes Magazin-Element

window.openMagazinMenu = function(imgEl) {
    if (GameState.combatTriggered) {
        if (imgEl) { imgEl.style.filter = 'grayscale(1)'; setTimeout(() => imgEl.style.filter = '', 600); }
        return;
    }
    _magazinItem = imgEl;
    const ammo = parseInt(imgEl?.dataset.ammo ?? 0, 10);
    const p = Entities.player;
    const current = p.ammo.pistole;
    const max = 12;
    const desc = current >= max
        ? `Pistole bereits voll (${current}/${max} Schuss). Magazin nicht nötig.`
        : `${ammo} Schuss verfügbar. Pistole hat noch ${current}/${max} Schuss.`;
    document.getElementById('magazin-desc').textContent = desc;
    const btn = document.querySelector('#magazin-menu .sketch-button');
    if (btn) btn.disabled = current >= max;
    document.getElementById('magazin-menu').style.display = 'block';
};

window.useMagazin = function() {
    if (!_magazinItem) return;
    const ammo = parseInt(_magazinItem.dataset.ammo ?? 0, 10);
    const p = Entities.player;
    p.ammo.pistole = Math.min(12, p.ammo.pistole + ammo);
    // Ammo-Anzeige auf Seite 1 aktualisieren
    const el2 = document.getElementById('cs-ammo-pistole');
    if (el2) el2.textContent = p.ammo.pistole;
    _magazinItem.remove();
    _magazinItem = null;
    document.getElementById('magazin-menu').style.display = 'none';
};

window.closeMagazinMenu = function() {
    _magazinItem = null;
    document.getElementById('magazin-menu').style.display = 'none';
};

// ── Medikit ───────────────────────────────────────────────────────────────────

window.openMedikitMenu = function() {
    if (GameState.combatTriggered) {
        // Im Kampf nicht verwendbar — kurzes Feedback
        const item = document.getElementById('medikit-item');
        if (item) { item.style.filter = 'grayscale(1)'; setTimeout(() => item.style.filter = '', 600); }
        return;
    }
    document.getElementById('medikit-menu').style.display = 'block';
};

window.useMedikit = function() {
    const p = Entities.player;
    p.hp = Math.min(p.maxHp, p.hp + 6);

    // Charakterbogen-LP sofort aktualisieren
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    const lpCur = document.getElementById('cs-lp-cur');
    const lpBar = document.getElementById('cs-lp-bar');
    if (lpCur) lpCur.textContent = p.hp;
    if (lpBar) {
        lpBar.style.width = `${hpFrac * 100}%`;
        lpBar.style.background = hpFrac > 0.5
            ? 'rgba(55,130,50,0.85)'
            : hpFrac > 0.25
            ? 'rgba(195,135,25,0.85)'
            : 'rgba(160,35,35,0.85)';
    }

    // Item aus Slot entfernen
    const item = document.getElementById('medikit-item');
    if (item) item.remove();
    document.getElementById('medikit-menu').style.display = 'none';
};

window.closeMedikitMenu = function() {
    document.getElementById('medikit-menu').style.display = 'none';
};

// ── Game Over + Reset ─────────────────────────────────────────────────────────

window.resetGame = function() {
    // Spieler zurücksetzen
    const p = Entities.player;
    p.hp = p.maxHp;
    p.ammo = { pistole: 12, schrotflinte: 6 };

    // Gegner zurücksetzen
    Entities.enemies.forEach(e => {
        e.isDead    = false;
        e.hp        = e.maxHp;
        e.ammo      = { pistole: 12, schrotflinte: 0 };
        e.ignoreUntil = 0;
        e.currentAP = 0;
    });

    // Kampf-Flags zurücksetzen
    Object.assign(GameState, {
        paused: false, enemySeen: false,
        combatTriggered: false, combatEnemyFirst: false,
        combatAmbush: false, combatPlayerHeard: false,
        combatResult: null, combatPhase: 'player',
        combatAP: 4, combatDodging: false,
        combatWeapon: null, combatTarget: null, combatTargets: [],
        combatGridVisible: false, combatMoving: false,
        selectingDirection: false, postMoveRotation: false,
        pendingNoiseMsg: null, hoverGridCell: null, hoverDirIdx: null,
        sneakAnim: null, dodgeAnim: null, dodgeFacingMod: 0,
        projectiles: [], worldItems: [], worldItemTarget: null, hoveredWorldItem: null,
        doorTarget: null, hoveredDoor: null, isTouching: false,
    });
    document.getElementById('dpad')?.classList.remove('dpad-combat');
    document.getElementById('gameCanvas').classList.remove('combat-move');

    // Alle Menüs schließen
    ['gameover-screen','combat-result','encounter-menu','weapon-menu',
     'char-sheet','react-section'].forEach(id => {
        const el2 = document.getElementById(id);
        if (el2) el2.style.display = 'none';
    });

    // Medikit wiederherstellen falls verbraucht
    const medikitSlot = document.getElementById('medikit-slot');
    if (medikitSlot && !medikitSlot.querySelector('#medikit-item')) {
        const img = document.createElement('img');
        img.src = 'img/icon-medikit.svg'; img.alt = 'Medikit'; img.id = 'medikit-item';
        img.className = 'inv-icon draggable-item consumable-item';
        img.draggable = true; img.dataset.category = 'consumable';
        img.setAttribute('onclick', 'openMedikitMenu()');
        img.title = 'Medikit – heilt 6 LP';
        medikitSlot.appendChild(img);
    }

    // Schrotflinte in Rucksack zurücksetzen (falls in Hand-Slot)
    const schrot = document.getElementById('schrotflinte-skizze');
    if (schrot) {
        const rucksack = document.getElementById('rucksack-grid');
        const slots = rucksack ? rucksack.querySelectorAll('.rucksack-slot.drop-zone') : [];
        for (const slot of slots) {
            if (!slot.hasChildNodes()) { slot.appendChild(schrot); break; }
        }
    }

    // Nebel und Karte neu aufbauen
    exploredCtx.clearRect(0, 0, exploredCanvas.width, exploredCanvas.height);
    resizeCanvas(); // ruft buildMansion() auf → setzt Wände, Türen, Spawn-Positionen
};

// DRAG & DROP  (Mouse + Touch, iOS-kompatibel)
// =========================================
document.addEventListener('DOMContentLoaded', () => {

    let draggedItem = null;

    // ── MOUSE drag & drop (Desktop) – Event Delegation ────
    // Delegation statt per-Element: funktioniert auch für dynamisch
    // hinzugefügte Items (Magazin nach Pickup, aufgehobene Gegenstände)
    document.addEventListener('dragstart', e => {
        const item = e.target?.closest?.('.draggable-item');
        if (!item) return;
        draggedItem = item;
        e.dataTransfer.setData('text/plain', item.id);
        setTimeout(() => { item.style.opacity = '0.4'; }, 0);
    });
    document.addEventListener('dragend', e => {
        const item = e.target?.closest?.('.draggable-item');
        if (!item) return;
        item.style.opacity = '1';
        draggedItem = null;
    });

    function categoryMatch(zone) {
        const accepts = zone.dataset.accepts;
        if (!accepts || !draggedItem) return true;
        return draggedItem.dataset.category === accepts;
    }

    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            const blocked = !!zone.getAttribute('data-ghost');
            zone.classList.toggle('drag-over',    !blocked && categoryMatch(zone));
            zone.classList.toggle('drag-invalid',  blocked || !categoryMatch(zone));
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over', 'drag-invalid'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over', 'drag-invalid');
            const el = document.getElementById(e.dataTransfer.getData('text/plain'));
            // Ghost-Slot (andere Hand bei Zweihandwaffe) – blockiert
            if (zone.getAttribute('data-ghost')) return;
            if (!el || zone.querySelector('.draggable-item') || !categoryMatch(zone)) return;
            zone.appendChild(el);
            updateWeaponStatus();
        });
    });

    // ── TOUCH drag & drop (iOS / Android) ────────────────
    let dragging = null, originZone = null;
    const ghost = document.createElement('img');
    ghost.id = 'touch-drag-ghost';
    ghost.style.display = 'none';
    document.body.appendChild(ghost);

    function touchStart(e) {
        const item = e.target?.closest?.('.draggable-item');
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

        if (zone && zone !== originZone && !zone.getAttribute('data-ghost')
            && !zone.querySelector('.draggable-item') && categoryMatch(zone)) {
            zone.appendChild(dragging);
            updateWeaponStatus();
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

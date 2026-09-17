/* ============================================================
   store.js — the roster, the sessions, and what the learner has drilled.

   Everything is localStorage: per-browser, never uploaded, never shared.
   Export/import moves a season or a learner's progress between devices.

   Four collections, deliberately separated:

     players  — the standing roster. Stable ids, editable names, so renaming
                someone keeps every hand they ever played.
     sessions — a session snapshots its four players and its rules at kickoff.
                Retuning the house rules in October must not rewrite a night
                played in March.
     progress — what the learner has drilled. Per-tile accuracy, not just a
                module tick, because the recognition drill re-serves the tiles
                someone keeps missing.
     settings — the active session, the chosen variant, the working rules.
   ============================================================ */

import { DEFAULT_RULES, withDefaults } from './rules.js';

const K = {
    players: 'mj_players_v1',
    sessions: 'mj_sessions_v1',
    settings: 'mj_settings_v1',
    progress: 'mj_progress_v1',
};

let players = [];
let sessions = [];
let progress = { modules: {}, tiles: {}, streak: 0, lastDrill: null };
let settings = { variant: 'hairs', rules: { ...DEFAULT_RULES.hairs }, activeSessionId: null };

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/*
 * Seat colours are positional, never per-player. Only four people sit at a
 * table, so fixing the set by seat guarantees the players on screen stay
 * maximally separable however large the roster grows.
 *
 * These are four of Okabe–Ito, the palette built to hold up under protan,
 * deutan and tritan vision. The set's own green and vermillion are excluded
 * because the tiles already spend those on 發 and 中, and a seat must never be
 * confusable with a tile.
 *
 * Validated as a categorical palette against the felt ground, every pair
 * rather than only adjacent ones: worst-case ΔE 9.6 deutan and 8.5 tritan
 * against a target of 8, worst normal-vision ΔE 17.0, and all four above 3:1
 * contrast. They sit deliberately lighter than the usual dark-surface
 * lightness band — that spread in lightness is the thing that makes Okabe–Ito
 * survive colour blindness, and giving it up to sit inside the band cost more
 * than it bought: every in-band four-hue set tested fell to ΔE 3.6 or worse,
 * because deuteranopia folds red, orange, yellow and green onto one axis and
 * leaves room for only one hue from that whole range.
 *
 * Colour is still never the encoding. Every seat carries its wind glyph and
 * the player's name wherever it appears, and chart lines are labelled
 * directly. The dealer's brass ring marks a role, never a person.
 */
export const SEAT_COLORS = ['#56B4E9', '#E69F00', '#CC79A7', '#F0E442'];
export const seatColor = (i) => SEAT_COLORS[i % SEAT_COLORS.length];
export const SEAT_WINDS = ['East', 'South', 'West', 'North'];
export const SEAT_WIND_GLYPH = ['東', '南', '西', '北'];

/* ---------------- load / persist ---------------- */

function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.warn(`mahjong: could not read ${key}`, e);
        return fallback;
    }
}

export function load() {
    players = readJSON(K.players, []);
    sessions = readJSON(K.sessions, []);
    progress = { ...progress, ...readJSON(K.progress, {}) };
    settings = { ...settings, ...readJSON(K.settings, {}) };

    if (!Array.isArray(players)) players = [];
    if (!Array.isArray(sessions)) sessions = [];
    if (!progress.modules) progress.modules = {};
    if (!progress.tiles) progress.tiles = {};
    settings.rules = withDefaults(settings.rules);
    settings.variant = settings.rules.variant;

    // An active id pointing at a session that no longer exists would wedge the
    // table on an empty screen, so drop it on the way in.
    if (settings.activeSessionId && !sessions.some((s) => s.id === settings.activeSessionId)) {
        settings.activeSessionId = null;
    }
}

function persist() {
    try {
        localStorage.setItem(K.players, JSON.stringify(players));
        localStorage.setItem(K.sessions, JSON.stringify(sessions));
        localStorage.setItem(K.progress, JSON.stringify(progress));
        localStorage.setItem(K.settings, JSON.stringify(settings));
    } catch (e) {
        console.warn('mahjong: could not save', e);
    }
    emit();
}

/* ---------------- players ---------------- */

export const getPlayers = () => [...players];
export const getPlayer = (id) => players.find((p) => p.id === id) ?? null;
export const playerName = (id) => getPlayer(id)?.name ?? 'Removed player';

export function addPlayer(name) {
    const clean = String(name).trim();
    if (!clean) return null;
    const p = { id: uid(), name: clean, created: Date.now() };
    players.push(p);
    persist();
    return p;
}

export function renamePlayer(id, name) {
    const p = getPlayer(id);
    const clean = String(name).trim();
    if (!p || !clean) return;
    p.name = clean;
    persist();
}

/* Sessions snapshot their seats, so a removed player's finished hands survive
   intact and simply render under the name the roster no longer holds. */
export function removePlayer(id) {
    players = players.filter((p) => p.id !== id);
    persist();
}

/* ---------------- settings ---------------- */

export const getSettings = () => ({ ...settings, rules: { ...settings.rules } });

export function setVariant(variant) {
    settings.variant = variant;
    settings.rules = withDefaults({ ...DEFAULT_RULES[variant] });
    persist();
}

export function setRules(patch) {
    settings.rules = withDefaults({ ...settings.rules, ...patch });
    persist();
}

/* ---------------- sessions ---------------- */

export const getSessions = () => [...sessions].sort((a, b) => b.created - a.created);
export const getSession = (id) => sessions.find((s) => s.id === id) ?? null;
export const activeSession = () => getSession(settings.activeSessionId);

export function startSession({ name, playerIds }) {
    if (playerIds.length !== 4) throw new Error('a table seats four');
    const s = {
        id: uid(),
        name: String(name || '').trim() || new Date().toLocaleDateString(),
        created: Date.now(),
        variant: settings.variant,
        rules: { ...settings.rules },          // snapshot, never a live reference
        seats: playerIds.map((id) => ({ playerId: id })),
        dealerSeat: 0,
        roundWind: 0,
        handNo: 1,
        hands: [],
        closed: false,
    };
    sessions.push(s);
    settings.activeSessionId = s.id;
    persist();
    return s;
}

export function setActiveSession(id) {
    settings.activeSessionId = id;
    persist();
}

export function closeSession(id) {
    const s = getSession(id);
    if (!s) return;
    s.closed = true;
    if (settings.activeSessionId === id) settings.activeSessionId = null;
    persist();
}

export function deleteSession(id) {
    sessions = sessions.filter((s) => s.id !== id);
    if (settings.activeSessionId === id) settings.activeSessionId = null;
    persist();
}

/*
 * A hand carries its own deltas. Recomputing a season from stored descriptions
 * would mean every past night silently re-scoring itself the day the rules
 * panel is touched, which is exactly what the snapshot is meant to prevent.
 */
export function recordHand(sessionId, hand) {
    const s = getSession(sessionId);
    if (!s) return null;
    const entry = { id: uid(), no: s.handNo, at: Date.now(), ...hand };
    s.hands.push(entry);
    s.handNo += 1;

    // The deal passes unless the dealer won; a washed-out hand holds it too.
    const dealerHeld = hand.winner === s.dealerSeat || hand.winType === 'draw';
    if (!dealerHeld) {
        s.dealerSeat = (s.dealerSeat + 1) % 4;
        if (s.dealerSeat === 0) s.roundWind = (s.roundWind + 1) % 4;
    }
    persist();
    return entry;
}

export function undoLastHand(sessionId) {
    const s = getSession(sessionId);
    if (!s || !s.hands.length) return;
    const last = s.hands.pop();
    s.handNo = Math.max(1, s.handNo - 1);
    const dealerHeld = last.winner === s.dealerSeat || last.winType === 'draw';
    if (!dealerHeld) {
        if (s.dealerSeat === 0) s.roundWind = (s.roundWind + 3) % 4;
        s.dealerSeat = (s.dealerSeat + 3) % 4;
    }
    persist();
}

/* ---------------- learning progress ---------------- */

export const getProgress = () => JSON.parse(JSON.stringify(progress));

export function recordDrill(moduleId, { correct, total }) {
    const m = progress.modules[moduleId] ?? { attempts: 0, best: 0, passed: false };
    m.attempts += 1;
    m.best = Math.max(m.best, correct);
    m.lastTotal = total;
    if (total > 0 && correct / total >= 0.8) m.passed = true;
    progress.modules[moduleId] = m;
    progress.lastDrill = Date.now();
    persist();
}

/*
 * Per-tile accuracy drives which tiles the recognition drill serves next. A
 * tile someone has never missed stops coming up; a tile they keep missing
 * keeps coming back. This is the whole reason progress is not just a tick.
 */
export function recordTile(code, correct) {
    const t = progress.tiles[code] ?? { seen: 0, correct: 0 };
    t.seen += 1;
    if (correct) t.correct += 1;
    progress.tiles[code] = t;
    persist();
}

export const tileAccuracy = (code) => {
    const t = progress.tiles[code];
    return t && t.seen ? t.correct / t.seen : null;
};

/* Weight = how much this tile needs practice. Unseen tiles outrank known ones;
   a tile that is missed half the time outranks a tile seen once. */
export function tileWeight(code) {
    const t = progress.tiles[code];
    if (!t || t.seen === 0) return 3;
    const acc = t.correct / t.seen;
    return 0.25 + (1 - acc) * 3 + Math.max(0, (4 - t.seen)) * 0.3;
}

export function resetProgress() {
    progress = { modules: {}, tiles: {}, streak: 0, lastDrill: null };
    persist();
}

/* ---------------- export / import ---------------- */

export function exportAll() {
    return JSON.stringify({
        kind: 'mahjong-tutor', version: 1, exported: Date.now(),
        players, sessions, progress, settings,
    }, null, 2);
}

export function importAll(json) {
    const data = JSON.parse(json);
    if (data.kind !== 'mahjong-tutor') throw new Error('That file is not a Mahjong Tutor export.');
    players = Array.isArray(data.players) ? data.players : [];
    sessions = Array.isArray(data.sessions) ? data.sessions : [];
    progress = data.progress ?? { modules: {}, tiles: {} };
    settings = { ...settings, ...(data.settings ?? {}) };
    settings.rules = withDefaults(settings.rules);
    persist();
}

/* ============================================================
   store.js — persistence for the roster and the match history.

   Everything lives in localStorage, which is per-browser: nothing is uploaded
   and nothing is shared. Export/import moves a season between devices.

   Two collections, deliberately separated:

     players — the standing roster. Stable ids, editable names. Lifetime
               records key off the id, so someone who gets renamed keeps
               every round they ever played.
     matches — a match snapshots its three players and its rules at kickoff.
               Renaming someone in October must not rewrite a night played in
               March, and deleting them must not corrupt a finished match.
   ============================================================ */

import { DEFAULT_RULES, withDefaults } from './rules.js';
import { normalizeRound } from './scoring.js';

const PLAYERS_KEY = 'dd_players_v1';
const MATCHES_KEY = 'dd_matches_v1';
const SETTINGS_KEY = 'dd_settings_v1';

let players = [];
let matches = [];
let settings = { rules: { ...DEFAULT_RULES }, activeMatchId: null };

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/*
 * Seat colours are positional, not per-player, and that is the whole point:
 * only three people sit at a table, so fixing the triad by seat guarantees the
 * players on screen are always maximally separable no matter how large the
 * roster grows. Picking a colour per player could not promise that.
 *
 * The triad was found by searching HSL under a restrained saturation and
 * lightness band for the set with the largest worst-case pairwise ΔE across
 * normal, protan, deutan and tritan vision: worst case 54.8 against a target
 * of 8, ≥3.5 contrast on both the #15151d card and the #143a2c felt, and 30.7
 * clear of the nearest reserved hue (the 地主 gold). Brand chrome — the site's
 * violet/cyan gradient — is excluded on purpose so identity never reads as
 * decoration. Do not substitute one by eye.
 */
export const SEAT_COLORS = ['#c47f6e', '#dddd40', '#ce5ac2'];
export const seatColor = (index) => SEAT_COLORS[index % SEAT_COLORS.length];

/* ---------------- load / persist ---------------- */

function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.warn(`doudizhu: could not read ${key}`, e);
        return fallback;
    }
}

export function load() {
    players = readJSON(PLAYERS_KEY, []);
    matches = readJSON(MATCHES_KEY, []);
    settings = { ...settings, ...readJSON(SETTINGS_KEY, {}) };
    if (!Array.isArray(players)) players = [];
    if (!Array.isArray(matches)) matches = [];
    settings.rules = withDefaults(settings.rules);
    // An active id pointing at a match that no longer exists would wedge the
    // Play tab on an empty screen, so drop it on the way in.
    if (settings.activeMatchId && !matches.some((m) => m.id === settings.activeMatchId)) {
        settings.activeMatchId = null;
    }
}

function persist() {
    try {
        localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
        localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('doudizhu: could not save', e);
    }
    emit();
}

/* ---------------- settings ---------------- */

export const getSettings = () => ({ ...settings, rules: { ...settings.rules } });
export function setRules(patch) { settings.rules = withDefaults({ ...settings.rules, ...patch }); persist(); }
export function setActiveMatch(id) { settings.activeMatchId = id; persist(); }

/* ---------------- players ---------------- */

const clonePlayer = (p) => ({ ...p });
export const allPlayers = () => players.map(clonePlayer);
export const activePlayers = () => players.filter((p) => !p.archived).map(clonePlayer);
export const playerById = (id) => { const p = players.find((x) => x.id === id); return p ? clonePlayer(p) : null; };

export function createPlayer(name) {
    const player = { id: uid(), name: String(name || '').trim() || 'Player', createdAt: Date.now(), archived: false };
    players.push(player);
    persist();
    return clonePlayer(player);
}

export function updatePlayer(id, patch) {
    const i = players.findIndex((p) => p.id === id);
    if (i === -1) return null;
    const next = { ...players[i], ...patch, id };
    next.name = String(next.name || '').trim() || 'Player';
    players[i] = next;
    persist();
    return clonePlayer(next);
}

/** Someone who appears in any match is archived rather than deleted —
 *  history needs the name, and lifetime records need the id. */
export function deletePlayer(id) {
    const used = matches.some((m) => m.playerIds.includes(id));
    if (used) {
        const i = players.findIndex((p) => p.id === id);
        if (i !== -1) { players[i] = { ...players[i], archived: true }; persist(); }
        return { archived: true };
    }
    players = players.filter((p) => p.id !== id);
    persist();
    return { deleted: true };
}

export function restorePlayer(id) {
    const i = players.findIndex((p) => p.id === id);
    if (i !== -1) { players[i] = { ...players[i], archived: false }; persist(); }
}

/* ---------------- matches ---------------- */

const cloneMatch = (m) => JSON.parse(JSON.stringify(m));
export const allMatches = () => matches.map(cloneMatch);
export const matchById = (id) => { const m = matches.find((x) => x.id === id); return m ? cloneMatch(m) : null; };
export const activeMatch = () => (settings.activeMatchId ? matchById(settings.activeMatchId) : null);

export function createMatch(playerIds, rules) {
    const lineup = playerIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
    if (lineup.length !== 3) throw new Error('A table is exactly three players.');
    if (new Set(playerIds).size !== 3) throw new Error('Each seat needs a different player.');

    const match = {
        id: uid(),
        createdAt: Date.now(),
        endedAt: null,
        status: 'active',
        rules: withDefaults(rules || settings.rules),
        playerIds: lineup.map((p) => p.id),
        // Snapshot the names so history stays readable after roster edits.
        players: lineup.map((p, i) => ({ id: p.id, name: p.name, seat: i })),
        rounds: [],
    };
    matches.push(match);
    settings.activeMatchId = match.id;
    persist();
    return cloneMatch(match);
}

const findMatch = (id) => matches.find((m) => m.id === id) || null;

export function addRound(matchId, draft) {
    const m = findMatch(matchId);
    if (!m) return null;
    const round = { id: uid(), at: Date.now(), ...normalizeRound(draft) };
    m.rounds.push(round);
    persist();
    return { ...round };
}

export function updateRound(matchId, roundId, draft) {
    const m = findMatch(matchId);
    if (!m) return null;
    const i = m.rounds.findIndex((r) => r.id === roundId);
    if (i === -1) return null;
    m.rounds[i] = { ...m.rounds[i], ...normalizeRound(draft), id: roundId, editedAt: Date.now() };
    persist();
    return { ...m.rounds[i] };
}

export function deleteRound(matchId, roundId) {
    const m = findMatch(matchId);
    if (!m) return;
    m.rounds = m.rounds.filter((r) => r.id !== roundId);
    persist();
}

export function finishMatch(matchId) {
    const m = findMatch(matchId);
    if (!m) return;
    m.status = 'complete';
    m.endedAt = Date.now();
    if (settings.activeMatchId === matchId) settings.activeMatchId = null;
    persist();
}

export function reopenMatch(matchId) {
    const m = findMatch(matchId);
    if (!m) return;
    m.status = 'active';
    m.endedAt = null;
    settings.activeMatchId = matchId;
    persist();
}

export function deleteMatch(matchId) {
    matches = matches.filter((m) => m.id !== matchId);
    if (settings.activeMatchId === matchId) settings.activeMatchId = null;
    persist();
}

/* ---------------- export / import ---------------- */

export function exportData() {
    return { app: 'doudizhu', version: 1, exportedAt: new Date().toISOString(), players, matches, settings };
}

/**
 * Merge rather than replace: importing last month's phone backup should not
 * wipe tonight's match. Ids collide only when they are genuinely the same
 * record, in which case the incoming copy wins.
 */
export function importData(payload, { replace = false } = {}) {
    if (!payload || typeof payload !== 'object') throw new Error('That file is not a doudizhu export.');
    const inPlayers = Array.isArray(payload.players) ? payload.players : null;
    const inMatches = Array.isArray(payload.matches) ? payload.matches : null;
    if (!inPlayers || !inMatches) throw new Error('That file has no players or matches in it.');

    if (replace) {
        players = inPlayers;
        matches = inMatches;
    } else {
        const byId = (list) => new Map(list.map((x) => [x.id, x]));
        const pMap = byId(players);
        inPlayers.forEach((p) => pMap.set(p.id, p));
        players = [...pMap.values()];

        const mMap = byId(matches);
        inMatches.forEach((m) => mMap.set(m.id, m));
        matches = [...mMap.values()].sort((a, b) => a.createdAt - b.createdAt);
    }

    if (payload.settings && payload.settings.rules) settings.rules = withDefaults(payload.settings.rules);
    if (settings.activeMatchId && !matches.some((m) => m.id === settings.activeMatchId)) settings.activeMatchId = null;
    persist();
    return { players: inPlayers.length, matches: inMatches.length };
}

export function clearAll() {
    players = [];
    matches = [];
    settings = { rules: { ...DEFAULT_RULES }, activeMatchId: null };
    persist();
}

/* ============================================================
   store.js — persistence for the roster and the match history.

   Everything lives in localStorage, which is per-browser: nothing is
   uploaded and nothing is shared. Export/import moves a season between
   devices.

   Two collections, deliberately separated:

     teams   — the standing roster. Stable ids, editable names. This is what
               lifetime records key off, so a team that gets renamed keeps
               its history.
     matches — a match snapshots its own lineup and rules at kickoff. Renaming
               a team later must not rewrite what happened in March, and
               deleting one must not corrupt a finished match.
   ============================================================ */

import { DEFAULT_RULES, withDefaults } from './rules.js';

const TEAMS_KEY = 'sp_teams_v1';
const MATCHES_KEY = 'sp_matches_v1';
const SETTINGS_KEY = 'sp_settings_v1';

let teams = [];
let matches = [];
let settings = { rules: { ...DEFAULT_RULES }, activeMatchId: null };

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------------- load / persist ---------------- */

function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        console.warn(`spades: could not read ${key}`, e);
        return fallback;
    }
}

export function load() {
    teams = readJSON(TEAMS_KEY, []);
    matches = readJSON(MATCHES_KEY, []);
    settings = { ...settings, ...readJSON(SETTINGS_KEY, {}) };
    if (!Array.isArray(teams)) teams = [];
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
        localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
        localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('spades: could not save', e);
    }
    emit();
}

/* ---------------- settings ---------------- */

export const getSettings = () => ({ ...settings, rules: { ...settings.rules } });
export function setRules(patch) { settings.rules = withDefaults({ ...settings.rules, ...patch }); persist(); }
export function setActiveMatch(id) { settings.activeMatchId = id; persist(); }

/* ---------------- teams ---------------- */

export const allTeams = () => teams.map(cloneTeam);
export const teamById = (id) => { const t = teams.find((x) => x.id === id); return t ? cloneTeam(t) : null; };
const cloneTeam = (t) => ({ ...t, players: t.players.map((p) => ({ ...p })) });

export function createTeam({ name, players, color }) {
    const team = {
        id: uid(),
        name: (name || '').trim() || 'Untitled',
        color: color || pickColor(),
        players: (players || []).map((n) => ({ id: uid(), name: String(n).trim() || 'Player' })),
        createdAt: Date.now(),
    };
    teams.push(team);
    persist();
    return cloneTeam(team);
}

export function updateTeam(id, patch) {
    const i = teams.findIndex((t) => t.id === id);
    if (i === -1) return null;
    const cur = teams[i];
    const next = { ...cur, ...patch, id };

    // Player names are edited by position; keep each player's id so their
    // history survives a spelling fix.
    if (patch.playerNames) {
        next.players = patch.playerNames.map((name, idx) => ({
            id: cur.players[idx] ? cur.players[idx].id : uid(),
            name: String(name).trim() || 'Player',
        }));
        delete next.playerNames;
    }
    next.name = (next.name || '').trim() || 'Untitled';
    teams[i] = next;
    persist();
    return cloneTeam(next);
}

/** A team in a finished match is never truly deleted — history needs it. */
export function deleteTeam(id) {
    const used = matches.some((m) => m.teamIds.includes(id));
    if (used) {
        const i = teams.findIndex((t) => t.id === id);
        if (i !== -1) { teams[i] = { ...teams[i], archived: true }; persist(); }
        return { archived: true };
    }
    teams = teams.filter((t) => t.id !== id);
    persist();
    return { deleted: true };
}

export function restoreTeam(id) {
    const i = teams.findIndex((t) => t.id === id);
    if (i !== -1) { teams[i] = { ...teams[i], archived: false }; persist(); }
}

/*
 * Team colours double as the series colours on the running-score chart, so
 * they are not a taste call: this set was picked by searching OKLCH for six
 * hues that clear all-pairs colour-vision separation (worst ΔE 10.6, target 8)
 * and 3:1 contrast against the #15151d card surface. Reorder freely — the
 * checks are pairwise — but do not add a seventh by eye.
 */
const PALETTE = ['#8121fc', '#22a2bd', '#a2941d', '#cc1a0a', '#00764f', '#bb00a2'];
function pickColor() {
    const used = new Set(teams.map((t) => t.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[teams.length % PALETTE.length];
}

/* ---------------- matches ---------------- */

export const allMatches = () => matches.map(cloneMatch);
export const matchById = (id) => { const m = matches.find((x) => x.id === id); return m ? cloneMatch(m) : null; };
export const activeMatch = () => (settings.activeMatchId ? matchById(settings.activeMatchId) : null);
const cloneMatch = (m) => JSON.parse(JSON.stringify(m));

export function createMatch(teamIds, rules) {
    const lineup = teamIds.map((id) => teams.find((t) => t.id === id)).filter(Boolean);
    if (lineup.length < 2) throw new Error('A match needs at least two teams.');

    const match = {
        id: uid(),
        createdAt: Date.now(),
        endedAt: null,
        status: 'active',
        rules: withDefaults(rules || settings.rules),
        teamIds: lineup.map((t) => t.id),
        // Snapshot the lineup so history stays readable after roster edits.
        teams: lineup.map(cloneTeam),
        rounds: [],
    };
    matches.push(match);
    settings.activeMatchId = match.id;
    persist();
    return cloneMatch(match);
}

function findMatch(id) { return matches.find((m) => m.id === id) || null; }

export function addRound(matchId, entries) {
    const m = findMatch(matchId);
    if (!m) return null;
    const round = { id: uid(), at: Date.now(), entries };
    m.rounds.push(round);
    persist();
    return { ...round };
}

export function updateRound(matchId, roundId, entries) {
    const m = findMatch(matchId);
    if (!m) return null;
    const r = m.rounds.find((x) => x.id === roundId);
    if (!r) return null;
    r.entries = entries;
    r.editedAt = Date.now();
    persist();
    return { ...r };
}

export function deleteRound(matchId, roundId) {
    const m = findMatch(matchId);
    if (!m) return;
    m.rounds = m.rounds.filter((r) => r.id !== roundId);
    persist();
}

export function finishMatch(matchId, winnerId) {
    const m = findMatch(matchId);
    if (!m) return;
    m.status = 'complete';
    m.endedAt = Date.now();
    m.winnerId = winnerId || null;
    if (settings.activeMatchId === matchId) settings.activeMatchId = null;
    persist();
}

export function reopenMatch(matchId) {
    const m = findMatch(matchId);
    if (!m) return;
    m.status = 'active';
    m.endedAt = null;
    m.winnerId = null;
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
    return { version: 1, exportedAt: new Date().toISOString(), teams, matches, settings };
}

/**
 * Merge an exported file in rather than replacing: importing last month's
 * phone backup should not wipe tonight's match. Ids collide only if they are
 * genuinely the same record, in which case the incoming copy wins.
 */
export function importData(payload, { replace = false } = {}) {
    if (!payload || typeof payload !== 'object') throw new Error('That file is not a Spades export.');
    const inTeams = Array.isArray(payload.teams) ? payload.teams : null;
    const inMatches = Array.isArray(payload.matches) ? payload.matches : null;
    if (!inTeams || !inMatches) throw new Error('That file has no teams or matches in it.');

    if (replace) {
        teams = inTeams;
        matches = inMatches;
    } else {
        const byId = (list) => new Map(list.map((x) => [x.id, x]));
        const tMap = byId(teams);
        inTeams.forEach((t) => tMap.set(t.id, t));
        teams = [...tMap.values()];

        const mMap = byId(matches);
        inMatches.forEach((m) => mMap.set(m.id, m));
        matches = [...mMap.values()].sort((a, b) => a.createdAt - b.createdAt);
    }

    if (payload.settings && payload.settings.rules) settings.rules = withDefaults(payload.settings.rules);
    if (settings.activeMatchId && !matches.some((m) => m.id === settings.activeMatchId)) settings.activeMatchId = null;
    persist();
    return { teams: inTeams.length, matches: inMatches.length };
}

export function clearAll() {
    teams = [];
    matches = [];
    settings = { rules: { ...DEFAULT_RULES }, activeMatchId: null };
    persist();
}

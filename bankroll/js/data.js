/* ============================================================
   data.js — read-only data source for the public site.

   Loads a static data.json committed alongside the page. There is no
   localStorage, no mutation path, and no way for a visitor to change what
   anyone else sees: the file is the single source of truth and only changes
   when it is committed to the repo.
   ============================================================ */

import { normalize } from './session.js';

let sessions = [];
let meta = { updated: null, placeholder: false };

export const all = () => sessions.slice();
export const getMeta = () => ({ ...meta });

export async function load(url = 'data.json') {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);

    const raw = await res.json();
    const list = Array.isArray(raw) ? raw : raw.sessions;
    if (!Array.isArray(list)) throw new Error(`${url} has no "sessions" array.`);

    sessions = list.map(normalize).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    meta = {
        updated: raw.updated || null,
        // The shipped placeholder marks itself; a real export won't carry this flag.
        placeholder: raw.placeholder === true,
    };
    return sessions;
}

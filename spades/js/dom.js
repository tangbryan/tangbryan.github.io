/* ============================================================
   dom.js — the small amount of DOM plumbing the views share.

   `h` builds elements and sets text via textContent, never innerHTML, so a
   team named after an inside joke full of angle brackets renders as typed
   instead of executing.
   ============================================================ */

export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);

    for (const [k, v] of Object.entries(props || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') el.innerHTML = v; // only ever called with literals in this file's callers
        else if (k in el && k !== 'list') el[k] = v;
        else el.setAttribute(k, v);
    }

    for (const c of children.flat(Infinity)) {
        if (c === null || c === undefined || c === false) continue;
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...nodes) => { clear(el).append(...nodes.flat(Infinity).filter(Boolean)); return el; };

/* ---------------- formatting ---------------- */

export const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}`;
export const pct = (x) => `${Math.round(x * 100)}%`;
export const dec = (x, places = 1) => (Number.isFinite(x) ? x.toFixed(places) : '—');
export const signedDec = (x, places = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(places)}`;

export function relTime(ts) {
    if (!ts) return '';
    const days = Math.floor((Date.now() - ts) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------------- toast ---------------- */

let toastTimer = null;
export function toast(message, kind = 'ok') {
    const el = qs('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast is-shown is-${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

/* ---------------- modal ---------------- */

let lastFocus = null;

export function openModal(title, body, actions = []) {
    const root = qs('#modal-root');
    lastFocus = document.activeElement;

    const card = h('div', { class: 'modal-card' },
        h('header', { class: 'modal-head' },
            h('h2', {}, title),
            h('button', { class: 'icon-btn', type: 'button', title: 'Close', onClick: closeModal }, '✕')),
        h('div', { class: 'modal-body' }, body),
        actions.length ? h('footer', { class: 'modal-actions' }, actions) : null);

    mount(root, card);
    root.classList.remove('hidden');
    root.onclick = (e) => { if (e.target === root) closeModal(); };
    document.addEventListener('keydown', escClose);

    const focusable = card.querySelector('input, select, button:not(.icon-btn), textarea');
    if (focusable) focusable.focus();
    return card;
}

function escClose(e) { if (e.key === 'Escape') closeModal(); }

export function closeModal() {
    const root = qs('#modal-root');
    root.classList.add('hidden');
    clear(root);
    document.removeEventListener('keydown', escClose);
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
}

/** A destructive step gets its own confirm — deleting a season is not undoable. */
export function confirmAction(title, message, confirmLabel, onConfirm) {
    openModal(title, h('p', { class: 'muted' }, message), [
        h('button', { class: 'btn', type: 'button', onClick: closeModal }, 'Cancel'),
        h('button', {
            class: 'btn btn-danger', type: 'button',
            onClick: () => { closeModal(); onConfirm(); },
        }, confirmLabel),
    ]);
}

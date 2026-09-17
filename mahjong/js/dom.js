/* ============================================================
   dom.js — the small amount of DOM plumbing this app needs.

   No framework. These six helpers are the whole abstraction.
   ============================================================ */

export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
        if (c == null || c === false) continue;
        node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
}

export const fill = (node, ...children) => {
    clear(node);
    children.flat().forEach((c) => c != null && c !== false
        && node.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return node;
};

/* Announcements for screen readers — drill feedback is a colour and a shake
   otherwise, which is no feedback at all if you cannot see it. */
let liveRegion = null;
export function announce(message) {
    if (!liveRegion) {
        liveRegion = el('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
        document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = '';
    setTimeout(() => { liveRegion.textContent = message; }, 40);
}

export function toast(message) {
    const t = el('div', { class: 'toast', role: 'status', text: message });
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-in'));
    setTimeout(() => {
        t.classList.remove('is-in');
        setTimeout(() => t.remove(), 300);
    }, 2600);
}

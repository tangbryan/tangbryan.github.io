/* ============================================================
   dom.js — element builder, modal and toast. The only file besides app.js
   and table.js that touches the document.
   ============================================================ */

/**
 * el('div.card', { onclick }, [child, 'text'])
 * Tag string carries classes so views read as structure rather than as
 * setAttribute noise.
 */
export function el(spec, props = {}, children = []) {
    const [tag, ...classes] = String(spec).split('.');
    const node = document.createElement(tag || 'div');
    if (classes.length) node.className = classes.join(' ');

    Object.entries(props || {}).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k in node && k !== 'list') node[k] = v;
        else node.setAttribute(k, v === true ? '' : v);
    });

    (Array.isArray(children) ? children : [children])
        .filter((c) => c != null && c !== false)
        .forEach((c) => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };
export const mount = (node, children) => { clear(node); (Array.isArray(children) ? children : [children]).filter(Boolean).forEach((c) => node.append(c)); return node; };

/* ---------------- formatting ---------------- */

/** Points always carry their sign: −8 and +8 are different stories. */
export const signed = (n) => (n > 0 ? `+${n}` : String(n));
export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const dec = (v, places = 2) => (v == null ? '—' : Number(v).toFixed(places).replace(/\.?0+$/, '') || '0');
export const initials = (name) => {
    const s = String(name || '').trim();
    if (!s) return '?';
    // A CJK name reads best as its first character; a latin one as its initial.
    if (/[㐀-鿿]/.test(s[0])) return s[0];
    return s.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
};
export const when = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/* ---------------- toast ---------------- */

let toastTimer = null;
export function toast(message, kind = '') {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.className = `toast is-open ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast'; }, 2600);
}

/* ---------------- modal ---------------- */

let closeModal = null;

/** Opens a dialog and returns a function that closes it. Escape and a click
 *  on the backdrop both dismiss; focus moves to the first field. */
export function modal({ title, body, actions = [], onClose }) {
    const root = document.getElementById('modal-root');
    if (!root) return () => {};
    if (closeModal) closeModal();

    const card = el('div.modal-card', { role: 'document' }, [
        el('h2.modal-title', {}, title),
        el('div.modal-body', {}, body),
        el('div.modal-actions', {}, actions),
    ]);
    mount(root, card);
    root.classList.remove('hidden');

    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onClick = (e) => { if (e.target === root) close(); };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', onClick);

    function close() {
        document.removeEventListener('keydown', onKey);
        root.removeEventListener('click', onClick);
        root.classList.add('hidden');
        clear(root);
        closeModal = null;
        if (onClose) onClose();
    }
    closeModal = close;

    const first = card.querySelector('input, select, textarea, button');
    if (first) first.focus();
    return close;
}

export const button = (label, props = {}) => el('button.btn', { type: 'button', ...props }, label);

import test from 'node:test';
import assert from 'node:assert/strict';
import { toCounts } from '../js/tiles.js';
import { isWinningHand, shanten } from '../js/hand.js';
import { rulesFor } from '../js/rules.js';
import { scoreHand } from '../js/scoring.js';
import { makeRng, DRILLS, generate } from '../js/drills.js';

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
const each = (fn) => SEEDS.forEach((s) => fn(makeRng(s), s));

test('every drill kind is registered and generates', () => {
    assert.ok(DRILLS.length >= 6);
    for (const d of DRILLS) {
        const q = generate(d.id, makeRng(7), { rules: rulesFor('hairs') });
        assert.ok(q, `${d.id} generated nothing`);
        assert.equal(typeof q.prompt, 'string');
    }
});

test('every question has exactly one correct option', () => {
    for (const d of DRILLS) {
        each((rng, seed) => {
            const q = generate(d.id, rng, { rules: rulesFor('hairs') });
            const correct = q.options.filter((o) => o.id === q.answerId);
            assert.equal(correct.length, 1, `${d.id} seed ${seed}: answer not in options`);
        });
    }
});

test('options are distinct so no two answers look identical', () => {
    for (const d of DRILLS) {
        each((rng, seed) => {
            const q = generate(d.id, rng, { rules: rulesFor('hairs') });
            const labels = q.options.map((o) => o.label);
            assert.equal(new Set(labels).size, labels.length,
                `${d.id} seed ${seed}: duplicate option labels`);
        });
    }
});

test('every question explains itself', () => {
    for (const d of DRILLS) {
        each((rng) => {
            const q = generate(d.id, rng, { rules: rulesFor('hairs') });
            assert.ok(q.explain && q.explain.length > 10, `${d.id}: thin explanation`);
        });
    }
});

test('the tile drill serves the tiles a learner keeps missing', () => {
    const weights = { '5z': 50 };
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
        const q = generate('tile-id', makeRng(i + 1), { weightFor: (t) => (weights[t] ?? 0.01) });
        seen.add(q.tile);
    }
    assert.ok(seen.has('5z'));
    assert.ok(seen.size <= 4, `weighting ignored: drew ${seen.size} distinct tiles`);
});

test('the win-check drill labels its hands truthfully', () => {
    each((rng, seed) => {
        const q = generate('is-winning', rng, {});
        const actuallyWins = isWinningHand(toCounts(q.tiles));
        const saysWins = q.answerId === 'yes';
        assert.equal(saysWins, actuallyWins, `seed ${seed}: ${q.tiles.join('')}`);
    });
});

test('the win-check drill shows fourteen tiles', () => {
    each((rng) => {
        const q = generate('is-winning', rng, {});
        assert.equal(q.tiles.length, 14);
    });
});

test('the discard drill offers a hand of fourteen with a genuinely best tile', () => {
    each((rng, seed) => {
        const q = generate('best-discard', rng, {});
        assert.equal(q.tiles.length, 14);
        const counts = toCounts(q.tiles);
        const best = q.options.find((o) => o.id === q.answerId);
        const after = toCounts(q.tiles.filter((t, i) => i !== q.tiles.indexOf(best.tile)));
        assert.ok(shanten(after) <= shanten(counts) + 1, `seed ${seed}`);
    });
});

test('the set drill names the shape it shows', () => {
    each((rng, seed) => {
        const q = generate('name-the-set', rng, {});
        const tiles = q.tiles;
        const kinds = new Set(tiles);
        const expected = tiles.length === 2 ? 'pair'
            : tiles.length === 4 ? 'kong'
            : kinds.size === 1 ? 'pung' : 'chow';
        assert.equal(q.answerId, expected, `seed ${seed}: ${tiles.join('')}`);
    });
});

test('the claim drill resolves to the claim that actually outranks the others', () => {
    each((rng, seed) => {
        const q = generate('who-claims', rng, {});
        assert.ok(q.options.some((o) => o.id === q.answerId), `seed ${seed}`);
    });
});

test('the scoring drill agrees with the scoring engine', () => {
    const rules = rulesFor('hairs');
    each((rng, seed) => {
        const q = generate('score-it', rng, { rules });
        const expected = scoreHand(q.win, rules).score;
        const chosen = q.options.find((o) => o.id === q.answerId);
        assert.equal(Number(chosen.label), expected, `seed ${seed}`);
    });
});

test('the same seed always generates the same question', () => {
    for (const d of DRILLS) {
        const a = generate(d.id, makeRng(42), { rules: rulesFor('hairs') });
        const b = generate(d.id, makeRng(42), { rules: rulesFor('hairs') });
        assert.deepEqual(a.options.map((o) => o.label), b.options.map((o) => o.label));
        assert.equal(a.answerId, b.answerId);
    }
});

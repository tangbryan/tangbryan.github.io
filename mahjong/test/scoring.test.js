import test from 'node:test';
import assert from 'node:assert/strict';
import { rulesFor, withDefaults } from '../js/rules.js';
import {
    faanToPoints, scoreHand, canDeclarePile, canJoinPile,
    pileHairs, resolvePayment,
} from '../js/scoring.js';

const HAIRS = rulesFor('hairs');
const HK = rulesFor('hkos');

/* ================= Hairs: declaring a pile ================= */

test('three distinct tiles of one group declares a pile', () => {
    assert.equal(canDeclarePile(['1z', '2z', '3z'], 'winds').ok, true);
    assert.equal(canDeclarePile(['5z', '6z', '7z'], 'dragons').ok, true);
    assert.equal(canDeclarePile(['1m', '9m', '1p'], 'terminals').ok, true);
});

test('a pile needs three tiles, not two', () => {
    assert.equal(canDeclarePile(['1z', '2z'], 'winds').ok, false);
});

test('a pile needs distinct tiles', () => {
    const r = canDeclarePile(['1z', '1z', '2z'], 'winds');
    assert.equal(r.ok, false);
    assert.match(r.reason, /distinct/i);
});

test('tiles from outside the group cannot join it', () => {
    const r = canDeclarePile(['1z', '2z', '5z'], 'winds');
    assert.equal(r.ok, false);
    assert.match(r.reason, /winds/i);
});

test('the one of bamboo is wild and stands in for any group', () => {
    assert.equal(canDeclarePile(['1z', '2z', '1s'], 'winds').ok, true);
    assert.equal(canDeclarePile(['5z', '6z', '1s'], 'dragons').ok, true);
    assert.equal(canDeclarePile(['1s', '1s', '1z'], 'winds').ok, true);
});

test('three wilds cannot declare a pile, there is nothing distinct about them', () => {
    assert.equal(canDeclarePile(['1s', '1s', '1s'], 'winds').ok, false);
});

test('a live pile accepts any tile of its group, duplicates included', () => {
    assert.equal(canJoinPile('winds', '4z'), true);
    assert.equal(canJoinPile('winds', '1z'), true);
    assert.equal(canJoinPile('dragons', '7z'), true);
    assert.equal(canJoinPile('terminals', '9s'), true);
});

test('a live pile rejects a tile from another group', () => {
    assert.equal(canJoinPile('winds', '7z'), false);
    assert.equal(canJoinPile('dragons', '1z'), false);
    assert.equal(canJoinPile('terminals', '5m'), false);
});

test('the wild joins any live pile', () => {
    assert.equal(canJoinPile('winds', '1s'), true);
    assert.equal(canJoinPile('dragons', '1s'), true);
});

/* ================= Hairs: scoring ================= */

test('a bare win is worth one point', () => {
    assert.equal(scoreHand({ piles: [] }, HAIRS).score, 1);
});

test('seven pairs doubles the base', () => {
    assert.equal(scoreHand({ sevenPairs: true, piles: [] }, HAIRS).score, 2);
});

test('a pile of exactly three is the seed and scores nothing', () => {
    assert.equal(scoreHand({ piles: [{ group: 'winds', size: 3 }] }, HAIRS).score, 1);
});

test('every tile past the seed is a point', () => {
    const r = scoreHand({ piles: [{ group: 'winds', size: 5 }] }, HAIRS);
    assert.equal(r.hairs, 2);
    assert.equal(r.score, 3);
});

test('each pile pays its own way past its own seed', () => {
    const r = scoreHand({ piles: [
        { group: 'winds', size: 4 },
        { group: 'dragons', size: 5 },
    ] }, HAIRS);
    assert.equal(r.hairs, 3);
    assert.equal(r.score, 4);
});

test('seven pairs and hairs stack', () => {
    const r = scoreHand({ sevenPairs: true, piles: [{ group: 'terminals', size: 6 }] }, HAIRS);
    assert.equal(r.score, 5);
});

test('under one-seed-overall the three is subtracted once, not per pile', () => {
    const rules = withDefaults({ ...HAIRS, hairSeedPerPile: false });
    const r = scoreHand({ piles: [
        { group: 'winds', size: 4 },
        { group: 'dragons', size: 5 },
    ] }, rules);
    assert.equal(r.hairs, 6);
    assert.equal(r.score, 7);
});

test('under multiplicative hairs each hair doubles the base', () => {
    const rules = withDefaults({ ...HAIRS, hairMode: 'multiplicative' });
    const r = scoreHand({ piles: [{ group: 'winds', size: 6 }] }, rules);
    assert.equal(r.hairs, 3);
    assert.equal(r.score, 8);
});

test('pileHairs never goes negative on an undersized pile', () => {
    assert.equal(pileHairs({ size: 2 }, HAIRS), 0);
});

/* ================= Hairs: payment ================= */

test('on a discard the discarder alone pays', () => {
    const d = resolvePayment({
        seats: 4, winner: 1, winType: 'discard', discarder: 3, dealer: 0, score: 4,
    }, HAIRS);
    assert.deepEqual(d, [0, 4, 0, -4]);
});

test('on a self-draw all three pay the full amount', () => {
    const d = resolvePayment({
        seats: 4, winner: 2, winType: 'selfdraw', dealer: 0, score: 3,
    }, HAIRS);
    assert.deepEqual(d, [-3, -3, 9, -3]);
});

test('the dealer has no multiplier in this variant', () => {
    const d = resolvePayment({
        seats: 4, winner: 0, winType: 'selfdraw', dealer: 0, score: 2,
    }, HAIRS);
    assert.deepEqual(d, [6, -2, -2, -2]);
});

test('every hand sums to zero', () => {
    for (const w of [0, 1, 2, 3]) {
        const a = resolvePayment({ seats: 4, winner: w, winType: 'selfdraw', dealer: 0, score: 5 }, HAIRS);
        const b = resolvePayment({ seats: 4, winner: w, winType: 'discard', discarder: (w + 1) % 4, dealer: 0, score: 5 }, HAIRS);
        assert.equal(a.reduce((x, y) => x + y, 0), 0);
        assert.equal(b.reduce((x, y) => x + y, 0), 0);
    }
});

test('a washed-out hand moves no points', () => {
    const d = resolvePayment({ seats: 4, winner: null, winType: 'draw', dealer: 0, score: 0 }, HAIRS);
    assert.deepEqual(d, [0, 0, 0, 0]);
});

/* ================= Hong Kong Old Style ================= */

test('the faan table follows the half-double schedule', () => {
    const expected = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];
    expected.forEach((points, faan) => {
        assert.equal(faanToPoints(faan, HK), points, `${faan} faan`);
    });
});

test('faan above the limit is capped', () => {
    assert.equal(faanToPoints(20, HK), faanToPoints(13, HK));
});

test('a hand below the minimum faan cannot be declared', () => {
    const r = scoreHand({ faan: 2 }, HK);
    assert.equal(r.valid, false);
    assert.match(r.reason, /3 faan/);
});

test('a hand at the minimum scores', () => {
    const r = scoreHand({ faan: 3 }, HK);
    assert.equal(r.valid, true);
    assert.equal(r.score, 8);
});

test('flowers add a faan each', () => {
    assert.equal(scoreHand({ faan: 3, flowers: 2 }, HK).score, faanToPoints(5, HK));
});

test('the dealer pays and collects double', () => {
    const d = resolvePayment({
        seats: 4, winner: 1, winType: 'selfdraw', dealer: 0, score: 8,
    }, HK);
    assert.deepEqual(d, [-16, 32, -8, -8]);
});

test('a dealer self-draw collects double from everyone', () => {
    const d = resolvePayment({
        seats: 4, winner: 0, winType: 'selfdraw', dealer: 0, score: 8,
    }, HK);
    assert.deepEqual(d, [48, -16, -16, -16]);
});

test('on a discard in Hong Kong the discarder pays alone', () => {
    const d = resolvePayment({
        seats: 4, winner: 2, winType: 'discard', discarder: 1, dealer: 0, score: 8,
    }, HK);
    assert.deepEqual(d, [0, -8, 8, 0]);
});

test('Hong Kong hands sum to zero too', () => {
    const d = resolvePayment({ seats: 4, winner: 3, winType: 'selfdraw', dealer: 1, score: 16 }, HK);
    assert.equal(d.reduce((x, y) => x + y, 0), 0);
});

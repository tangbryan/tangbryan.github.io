import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTiles, toCounts, formatTiles } from '../js/tiles.js';
import {
    decompose, isWinningHand, isSevenPairs, isThirteenOrphans,
    shanten, waits, discardOptions,
} from '../js/hand.js';

const H = (s) => toCounts(parseTiles(s));

/* ---------------- decomposition ---------------- */

test('a plain hand decomposes into four sets and a pair', () => {
    const [d] = decompose(H('123456789m123p11s'));
    assert.equal(d.sets.length, 4);
    assert.equal(d.pair, '1s');
    assert.deepEqual(d.sets.map((s) => s.type).sort(), ['chow', 'chow', 'chow', 'chow']);
});

test('pungs are recognised as pungs', () => {
    const [d] = decompose(H('111m222p333444s55z'));
    assert.equal(d.pair, '5z');
    assert.deepEqual(d.sets.map((s) => s.type), ['pung', 'pung', 'pung', 'pung']);
});

test('an ambiguous hand yields every distinct decomposition', () => {
    // 111222333m reads as three pungs or as three identical chows.
    const ds = decompose(H('111222333m123p11s'));
    const shapes = ds.map((d) => d.sets.map((s) => s.type).sort().join(',')).sort();
    assert.equal(ds.length, 2);
    assert.deepEqual(shapes, ['chow,chow,chow,chow', 'chow,pung,pung,pung']);
});

test('a hand that cannot be completed decomposes into nothing', () => {
    assert.deepEqual(decompose(H('123456789m1234p1s')), []);
});

test('decomposition accounts for melds already on the table', () => {
    const ds = decompose(H('11m'), [
        { type: 'pung', tiles: parseTiles('111p') },
        { type: 'chow', tiles: parseTiles('123s') },
        { type: 'kong', tiles: parseTiles('2222m') },
        { type: 'pung', tiles: parseTiles('555z') },
    ]);
    assert.equal(ds.length, 1);
    assert.equal(ds[0].pair, '1m');
    assert.equal(ds[0].sets.length, 4);
});

/* ---------------- win detection ---------------- */

test('four sets and a pair is a win', () => {
    assert.equal(isWinningHand(H('123456789m123p11s')), true);
});

test('thirteen tiles is not a win', () => {
    assert.equal(isWinningHand(H('123456789m123p1s')), false);
});

test('seven pairs is a win, and is reported as such', () => {
    assert.equal(isSevenPairs(H('11223344556677z')), true);
    assert.equal(isWinningHand(H('11223344556677z')), true);
});

test('four pairs and two triplets is not seven pairs', () => {
    assert.equal(isSevenPairs(H('111222m3344556p')), false);
});

test('seven pairs requires seven distinct kinds, not two kongs', () => {
    assert.equal(isSevenPairs(H('1111222233m4455p')), false);
});

test('thirteen orphans is a win', () => {
    assert.equal(isThirteenOrphans(H('19m19p19s12345677z')), true);
    assert.equal(isWinningHand(H('19m19p19s12345677z')), true);
});

test('thirteen orphans needs every terminal and honor', () => {
    assert.equal(isThirteenOrphans(H('19m19p11s12345677z')), false);
});

/* ---------------- shanten ---------------- */

test('a complete hand is shanten -1', () => {
    assert.equal(shanten(H('123456789m123p11s')), -1);
    assert.equal(shanten(H('11223344556677z')), -1);
    assert.equal(shanten(H('19m19p19s12345677z')), -1);
});

test('a hand one tile from winning is tenpai, shanten 0', () => {
    assert.equal(shanten(H('123456789m123p1s')), 0);
    assert.equal(shanten(H('1122334455667z')), 0);
    assert.equal(shanten(H('19m19p19s1234567z')), 0);
});

test('three sets plus a bare pair is one away from tenpai', () => {
    // 123m 456m 789m + 11s, with 1p and 5z as floaters.
    assert.equal(shanten(H('123456789m1p11s5z')), 1);
});

test('three sets, a run partial and a pair is already tenpai', () => {
    // 12p completes to 123p: this hand waits on 3p.
    assert.equal(shanten(H('123456789m12p11s')), 0);
});

test('a hand of unconnected junk has a high shanten', () => {
    const s = shanten(H('147m258p369s1234z'));
    assert.ok(s >= 5, `expected junk to be 5+ shanten, got ${s}`);
});

test('shanten never exceeds the seven-pairs route when pairs are plentiful', () => {
    // six pairs and a floater: seven pairs says 0, standard form says more.
    assert.equal(shanten(H('1122334455667m')), 0);
});

test('melds reduce shanten', () => {
    const melds = [
        { type: 'pung', tiles: parseTiles('111p') },
        { type: 'chow', tiles: parseTiles('123s') },
    ];
    assert.equal(shanten(H('123456m1p'), melds), 0);
});

/* ---------------- waits and discards ---------------- */

test('waits lists the tiles that complete a tenpai hand', () => {
    assert.deepEqual(waits(H('123456789m123p1s')), ['1s']);
});

test('a two-sided wait lists both ends', () => {
    assert.deepEqual(waits(H('123456789m11s23p')), ['1p', '4p']);
});

test('waits is empty when the hand is not tenpai', () => {
    assert.deepEqual(waits(H('123456789m1p11s5z')), []);
});

test('discardOptions ranks discards by the shanten they leave', () => {
    const opts = discardOptions(H('123456789m123p1s5z'));
    assert.equal(opts[0].shanten, 0);
    assert.ok(opts.every((o, i) => i === 0 || o.shanten >= opts[i - 1].shanten));
    assert.equal(opts.find((o) => o.tile === '1m').shanten, 1);
});

test('among equal-shanten discards the one with the wider wait ranks first', () => {
    // 123m 456m 789m + 11223p. Three discards reach tenpai: 2p waits on 1p/4p
    // and 3p waits on 1p/2p, but 1p waits only on 2p and must rank below both.
    const opts = discardOptions(H('123456789m11223p'));
    assert.equal(opts[0].shanten, 0);
    assert.equal(opts[0].waits.length, 2);
    const rank = (t) => opts.findIndex((o) => o.tile === t);
    assert.ok(rank('1p') > rank('2p'), 'the narrow wait must not outrank a wide one');
    assert.ok(rank('1p') > rank('3p'), 'the narrow wait must not outrank a wide one');
    assert.deepEqual(opts.find((o) => o.tile === '1p').waits, ['2p']);
});

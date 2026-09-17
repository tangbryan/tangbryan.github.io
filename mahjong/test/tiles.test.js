import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TILES, WILD, tileIndex, tileFromIndex, suitOf, rankOf,
    isHonor, isTerminal, isWind, isDragon, hairGroupOf, tileName,
    sortTiles, parseTiles, toCounts, fromCounts, buildWall,
} from '../js/tiles.js';

test('there are 34 distinct tile kinds in suit order', () => {
    assert.equal(TILES.length, 34);
    assert.equal(new Set(TILES).size, 34);
    assert.equal(TILES[0], '1m');
    assert.equal(TILES[8], '9m');
    assert.equal(TILES[9], '1p');
    assert.equal(TILES[18], '1s');
    assert.equal(TILES[26], '9s');
    assert.equal(TILES[27], '1z');
    assert.equal(TILES[33], '7z');
});

test('tileIndex and tileFromIndex are inverses', () => {
    for (let i = 0; i < 34; i++) assert.equal(tileIndex(tileFromIndex(i)), i);
});

test('tileIndex rejects a code that is not a tile', () => {
    assert.throws(() => tileIndex('0m'));
    assert.throws(() => tileIndex('8z'));
    assert.throws(() => tileIndex('banana'));
});

test('suit and rank decompose a code', () => {
    assert.equal(suitOf('5p'), 'p');
    assert.equal(rankOf('5p'), 5);
    assert.equal(suitOf('3z'), 'z');
    assert.equal(rankOf('3z'), 3);
});

test('honors are the z suit, winds and dragons split it', () => {
    assert.equal(isHonor('1z'), true);
    assert.equal(isHonor('9s'), false);
    assert.equal(isWind('4z'), true);
    assert.equal(isWind('5z'), false);
    assert.equal(isDragon('5z'), true);
    assert.equal(isDragon('7z'), true);
    assert.equal(isDragon('4z'), false);
});

test('terminals are the 1s and 9s of the three suits, not honors', () => {
    assert.equal(isTerminal('1m'), true);
    assert.equal(isTerminal('9s'), true);
    assert.equal(isTerminal('5m'), false);
    assert.equal(isTerminal('1z'), false);
});

/* The three hair groups. 1s is a terminal in its own right as well as the
   wild, which is why the wild check lives in hand/scoring, not here. */
test('hairGroupOf sorts a tile into its hair group or nothing', () => {
    assert.equal(hairGroupOf('2z'), 'winds');
    assert.equal(hairGroupOf('6z'), 'dragons');
    assert.equal(hairGroupOf('9p'), 'terminals');
    assert.equal(hairGroupOf('1s'), 'terminals');
    assert.equal(hairGroupOf('5m'), null);
});

test('the wild is the one of bamboo', () => {
    assert.equal(WILD, '1s');
});

test('tiles have readable names', () => {
    assert.equal(tileName('1m'), '1 Characters');
    assert.equal(tileName('1z'), 'East Wind');
    assert.equal(tileName('4z'), 'North Wind');
    assert.equal(tileName('5z'), 'White Dragon');
    assert.equal(tileName('6z'), 'Green Dragon');
    assert.equal(tileName('7z'), 'Red Dragon');
});

test('sortTiles orders by suit then rank and does not mutate', () => {
    const input = ['7z', '3p', '1m', '1s', '2m'];
    const out = sortTiles(input);
    assert.deepEqual(out, ['1m', '2m', '3p', '1s', '7z']);
    assert.deepEqual(input, ['7z', '3p', '1m', '1s', '2m']);
});

test('parseTiles reads compact notation', () => {
    assert.deepEqual(parseTiles('123m'), ['1m', '2m', '3m']);
    assert.deepEqual(parseTiles('11m99p1z'), ['1m', '1m', '9p', '9p', '1z']);
    assert.deepEqual(parseTiles(''), []);
});

test('parseTiles rejects digits with no suit', () => {
    assert.throws(() => parseTiles('123'));
});

test('counts round-trip through a 34-slot histogram', () => {
    const tiles = parseTiles('1112345678999m');
    const counts = toCounts(tiles);
    assert.equal(counts.length, 34);
    assert.equal(counts[0], 3);
    assert.equal(counts[8], 3);
    assert.deepEqual(fromCounts(counts), sortTiles(tiles));
});

test('toCounts rejects a fifth copy of a tile', () => {
    assert.throws(() => toCounts(parseTiles('11111m')));
});

test('a flowerless wall is 136 tiles, four of each kind', () => {
    const wall = buildWall({ flowers: false });
    assert.equal(wall.length, 136);
    const counts = toCounts(wall);
    assert.ok(counts.every((c) => c === 4));
});

test('a Hong Kong wall adds eight bonus tiles', () => {
    const wall = buildWall({ flowers: true });
    assert.equal(wall.length, 144);
    assert.equal(wall.filter((t) => t.endsWith('f') || t.endsWith('g')).length, 8);
});

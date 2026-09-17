import test from 'node:test';
import assert from 'node:assert/strict';
import { standings, runningScores, lifetime, sessionSummary } from '../js/stats.js';

const session = (hands) => ({
    id: 's1',
    variant: 'hairs',
    seats: [{ playerId: 'a' }, { playerId: 'b' }, { playerId: 'c' }, { playerId: 'd' }],
    hands,
});

const hand = (o) => ({ winType: 'discard', deltas: [0, 0, 0, 0], ...o });

test('standings total the deltas of every hand', () => {
    const s = standings(session([
        hand({ winner: 0, discarder: 1, deltas: [4, -4, 0, 0] }),
        hand({ winner: 2, discarder: 0, deltas: [-3, 0, 3, 0] }),
    ]));
    assert.deepEqual(s.map((r) => r.score), [1, -4, 3, 0]);
});

test('standings sum to zero', () => {
    const s = standings(session([
        hand({ winner: 1, winType: 'selfdraw', deltas: [-2, 6, -2, -2] }),
    ]));
    assert.equal(s.reduce((a, r) => a + r.score, 0), 0);
});

test('wins and self-draws are counted apart', () => {
    const s = standings(session([
        hand({ winner: 0, winType: 'discard', discarder: 3, deltas: [2, 0, 0, -2] }),
        hand({ winner: 0, winType: 'selfdraw', deltas: [6, -2, -2, -2] }),
    ]));
    assert.equal(s[0].wins, 2);
    assert.equal(s[0].selfDraws, 1);
});

test('the seat that fed a win is charged with it', () => {
    const s = standings(session([
        hand({ winner: 0, winType: 'discard', discarder: 3, deltas: [2, 0, 0, -2] }),
        hand({ winner: 1, winType: 'discard', discarder: 3, deltas: [0, 2, 0, -2] }),
    ]));
    assert.equal(s[3].dealInto, 2);
    assert.equal(s[0].dealInto, 0);
});

test('a self-draw feeds nobody', () => {
    const s = standings(session([
        hand({ winner: 0, winType: 'selfdraw', deltas: [6, -2, -2, -2] }),
    ]));
    assert.equal(s.reduce((a, r) => a + r.dealInto, 0), 0);
});

test('a washed-out hand counts as played but won by nobody', () => {
    const s = standings(session([
        hand({ winner: null, winType: 'draw', deltas: [0, 0, 0, 0] }),
    ]));
    assert.equal(s.reduce((a, r) => a + r.wins, 0), 0);
    assert.equal(s[0].handsPlayed, 1);
});

test('an empty session stands at zero, not at nothing', () => {
    const s = standings(session([]));
    assert.equal(s.length, 4);
    assert.ok(s.every((r) => r.score === 0 && r.wins === 0));
});

test('running scores accumulate and start from zero', () => {
    const r = runningScores(session([
        hand({ winner: 0, deltas: [4, -4, 0, 0] }),
        hand({ winner: 1, deltas: [-1, 3, -1, -1] }),
    ]));
    assert.deepEqual(r[0], [0, 4, 3]);
    assert.deepEqual(r[1], [0, -4, -1]);
});

test('lifetime totals a player across every session they sat in', () => {
    const sessions = [
        { id: 's1', seats: [{ playerId: 'a' }, { playerId: 'b' }, { playerId: 'c' }, { playerId: 'd' }],
          hands: [hand({ winner: 0, discarder: 1, deltas: [4, -4, 0, 0] })] },
        { id: 's2', seats: [{ playerId: 'b' }, { playerId: 'a' }, { playerId: 'c' }, { playerId: 'd' }],
          hands: [hand({ winner: 1, discarder: 0, deltas: [-3, 3, 0, 0] })] },
    ];
    const life = lifetime([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], sessions);
    const a = life.find((r) => r.playerId === 'a');
    assert.equal(a.score, 7);
    assert.equal(a.wins, 2);
    assert.equal(a.handsPlayed, 2);
    const b = life.find((r) => r.playerId === 'b');
    assert.equal(b.score, -7);
    assert.equal(b.dealInto, 2);
});

test('lifetime ignores sessions a player never sat in', () => {
    const sessions = [
        { id: 's1', seats: [{ playerId: 'x' }, { playerId: 'y' }, { playerId: 'z' }, { playerId: 'w' }],
          hands: [hand({ winner: 0, discarder: 1, deltas: [4, -4, 0, 0] })] },
    ];
    const life = lifetime([{ id: 'a', name: 'A' }], sessions);
    assert.equal(life[0].handsPlayed, 0);
    assert.equal(life[0].score, 0);
});

test('a summary reports the biggest single swing', () => {
    const sum = sessionSummary(session([
        hand({ winner: 0, deltas: [4, -4, 0, 0] }),
        hand({ winner: 1, winType: 'selfdraw', deltas: [-9, 27, -9, -9] }),
    ]));
    assert.equal(sum.handsPlayed, 2);
    assert.equal(sum.biggestSwing, 27);
    assert.equal(sum.selfDraws, 1);
});

/* ============================================================
   lessons.js — the curriculum.

   Ordered the way people actually learn this game, which is not the order a
   rulebook is organised. Recognition first, because that is the documented
   wall. Claims fourth, because losing the thread of whose turn it is is the
   second wall and no amount of reading fixes it. Scoring last, because it is
   a separate body of knowledge and putting it early makes people quit.

   Each module is short. The drills do the teaching; the prose only has to get
   a learner to the point where the drill makes sense.
   ============================================================ */

const p = (text) => ({ type: 'p', text });
const h = (text) => ({ type: 'h', text });
const note = (text) => ({ type: 'note', text });
const tiles = (list, caption) => ({ type: 'tiles', tiles: list, caption });
const list = (items) => ({ type: 'list', items });
const table = (head, rows) => ({ type: 'table', head, rows });

export const MODULES = [
    {
        id: 0,
        title: 'The tiles',
        subtitle: 'Three suits, four winds, three dragons',
        minutes: 6,
        blocks: [
            p('A mahjong set is 34 kinds of tile, four copies of each. Almost everything else in the game follows from being able to name a tile without thinking about it, so this is the only part worth drilling until it is boring.'),
            h('The three suits'),
            p('Each suit runs 1 to 9. They behave identically — the difference is only how the rank is drawn.'),
            tiles(['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'], 'Dots (筒). Count the circles.'),
            tiles(['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'], 'Bamboo (索). Count the stalks — except the 1, which is a bird.'),
            tiles(['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'], 'Characters (萬). The rank is a Chinese numeral above the 萬.'),
            note('Characters are the suit beginners find unreadable, because the rank is a character rather than a countable shape. You only need the nine numerals — 一二三四五六七八九 — and you already know four of them from the dots and bamboo you just counted.'),
            h('The honours'),
            p('Seven kinds that have no rank and no order. They cannot form runs, only triplets and pairs.'),
            tiles(['1z', '2z', '3z', '4z'], 'The winds: east, south, west, north. Learn them in that order — the deal, the seating and the rounds all follow it.'),
            tiles(['7z', '6z', '5z'], 'The dragons: red (中), green (發), white (白). The white dragon is a blank frame, not a spare tile.'),
            note('That is the whole set: 9 × 3 suits + 4 winds + 3 dragons = 34 kinds, 136 tiles. A Hong Kong set adds eight bonus tiles — four flowers and four seasons — which the Hairs variant does not use.'),
        ],
    },
    {
        id: 1,
        title: 'Sets',
        subtitle: 'The four shapes you are ever building',
        minutes: 4,
        blocks: [
            p('A hand is made of sets. There are only three kinds, plus the pair — and once you can see them, a rack of thirteen tiles stops looking like noise.'),
            h('Pung — three alike'),
            tiles(['5p', '5p', '5p']),
            p('Any tile can form a pung, honours included.'),
            h('Chow — three in a row'),
            tiles(['3s', '4s', '5s']),
            p('Consecutive ranks, all in one suit. Runs never wrap: 8-9-1 is not a chow. Honours have no order, so they can never form one.'),
            h('Kong — four alike'),
            tiles(['1z', '1z', '1z', '1z']),
            p('A pung with the fourth tile added. A kong is still one set, not two, but it is worth declaring: you draw a replacement tile for it, which is a free extra draw.'),
            h('The pair'),
            tiles(['7z', '7z']),
            p('Two alike. Every hand needs exactly one, and it is the piece beginners most often forget to keep.'),
            note('Pung, chow, kong, pair. That is the whole vocabulary — nothing else in the game is a shape you build.'),
        ],
    },
    {
        id: 2,
        title: 'The winning hand',
        subtitle: 'Four sets and a pair',
        minutes: 4,
        blocks: [
            p('You hold thirteen tiles. On your turn you draw a fourteenth and throw one away, so your hand is thirteen tiles again. You win at the moment those fourteen tiles form four sets and a pair.'),
            tiles(['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '3p', '5z', '5z'],
                'Four chows and a pair of white dragons. Fourteen tiles, and it wins.'),
            p('That is it. Nearly every hand you ever win will be exactly this shape, and the fastest way to get good is to stop looking for anything else.'),
            h('Two hands that break the rule'),
            p('Two special hands are worth knowing because they come up and because they score well.'),
            tiles(['1m', '1m', '4m', '4m', '7p', '7p', '2s', '2s', '9s', '9s', '1z', '1z', '6z', '6z'],
                'Seven pairs. Seven different pairs, no sets at all. In the Hairs variant it is worth double.'),
            tiles(['1m', '9m', '1p', '9p', '1s', '9s', '1z', '2z', '3z', '4z', '5z', '6z', '7z', '7z'],
                'Thirteen orphans. One of every terminal and honour, plus a second copy of any one of them. Rare, and a limit hand wherever it is played.'),
            note('Being one tile away from winning is called being ready — tenpai. Knowing whether you are ready, and on what, is the single most useful thing to be able to see at a table.'),
        ],
    },
    {
        id: 3,
        title: 'A turn',
        subtitle: 'The deal, the wall, and the rhythm',
        minutes: 5,
        blocks: [
            h('Setting up'),
            list([
                'Four players sit as east, south, west and north — counter-clockwise, which is the opposite of what most people expect.',
                'East is the dealer. Tiles are shuffled face down and built into a wall.',
                'Everyone is dealt thirteen tiles. East is dealt a fourteenth and begins.',
            ]),
            h('The turn itself'),
            p('Play passes counter-clockwise — to the right. On your turn you do exactly two things:'),
            list([
                'Draw one tile, from the wall or by claiming the tile just discarded.',
                'Discard one tile, face up, where everyone can see it.',
            ]),
            p('Your hand is thirteen tiles before your turn and thirteen after it. If it ever is not, something went wrong.'),
            note('The discard pile is public and it is information. What a player throws tells you what they are not collecting — and late in a hand, what they are. Beginners look only at their own rack; that is the habit to break earliest.'),
            h('Ending a hand'),
            p('A hand ends when someone wins, or when the wall runs out and nobody has. A washed-out hand scores nothing and the deal usually stays with east.'),
        ],
    },
    {
        id: 4,
        title: 'Claiming a discard',
        subtitle: 'The part that breaks the turn order',
        minutes: 6,
        blocks: [
            p('This is the rule that makes mahjong feel fast, and the one new players lose the thread of. When a tile is discarded, anyone may be able to take it — and taking it jumps the turn order.'),
            h('What you may claim, and from whom'),
            table(
                ['Claim', 'Who may', 'What you show'],
                [
                    ['Win', 'Anyone', 'Your whole hand — the hand ends'],
                    ['Kong', 'Anyone', 'Your three matching tiles'],
                    ['Pung', 'Anyone', 'Your two matching tiles'],
                    ['Chow', 'Only the player to the discarder’s right', 'Your two tiles either side'],
                ],
            ),
            h('What outranks what'),
            p('If two players want the same tile, the higher claim takes it:'),
            list([
                'A win beats everything.',
                'A pung or kong beats a chow, from any seat.',
                'A chow is the weakest, and only the next player may make it.',
            ]),
            note('Claiming skips everyone between you and the discarder. If west discards and north pungs it, east and south simply lose their turns. This is why the game does not go around the table in a tidy circle, and why counting on "my turn is next" will cost you tiles.'),
            h('The cost of claiming'),
            p('A claimed set is laid face up and stays there. Everyone can see part of your hand for the rest of the game, and in most rule sets some hands can only be scored if you never claimed at all. Claiming is fast; concealment is worth points. Choosing between them is most of the strategy in this game.'),
        ],
    },
    {
        id: 5,
        title: 'Reading your hand',
        subtitle: 'What to keep and what to throw',
        minutes: 6,
        blocks: [
            p('Every discard is a choice about which hand you are still trying to build. A few habits get a beginner most of the way.'),
            h('Count how far you are'),
            p('Look for finished sets first, then pairs and two-tile pieces that could become sets. Each finished set is progress; each stranded tile is a discard waiting to happen.'),
            tiles(['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '1s', '5z'],
                'Three sets done, 1p2p needs a 3p, and 1s and 5z are doing nothing. Throw one of those two.'),
            h('Keep the wider wait'),
            p('Two tiles waiting on both ends beat two tiles waiting on one. 3-4 completes with a 2 or a 5 — eight tiles. 1-2 completes only with a 3, and 8-9 only with a 7 — four tiles each. Given the choice, keep the middle shape.'),
            h('Throw honours early, or commit to them'),
            p('A lone wind or dragon is worth nothing until you have two of them, and it gets harder to pair as the game goes on. Either pair it early or let it go — holding a single honour into the late game is the most common way beginners fall behind.'),
            note('Watch what everyone else throws. Three players discarding bamboo means bamboo is safe to throw and hard to collect. One player who has stopped discarding dots is collecting dots.'),
        ],
    },
    {
        id: 6,
        title: 'Scoring',
        subtitle: 'What a win is worth',
        minutes: 7,
        variantSplit: true,
        blocks: [
            p('Scoring is where mahjong varies most from table to table. Two systems are covered here; the app scores whichever one you have selected.'),
            h('Hong Kong: faan'),
            p('A won hand is examined for patterns, each worth some number of faan. The faan are added, then converted to points on a doubling scale — so faan are multiplicative, and a hand worth twice the faan is worth far more than twice the points.'),
            table(
                ['Pattern', 'Faan'],
                [
                    ['All chows', '1'],
                    ['All pungs', '3'],
                    ['Half flush — one suit plus honours', '3'],
                    ['Little dragons — two dragon pungs and the pair', '5'],
                    ['Full flush — one suit, nothing else', '7'],
                    ['Great dragons — all three dragon pungs', '8'],
                    ['All honours', '10'],
                ],
            ),
            p('Most tables require at least three faan to declare a win at all, which is the rule that stops people winning instantly with nothing.'),
            h('Hairs: the house game'),
            p('No faan. A win is worth one point, and seven pairs is worth two. Everything above that comes from hairs.'),
            list([
                'Before your first discard, peng or chi, you may lay down three distinct tiles from one group — winds, dragons, or terminals — face up. That is a pile.',
                'After that, any tile of that group you draw joins the pile, and you draw a replacement from the back of the wall.',
                'You may declare more than one pile, but only at the start. Once you have acted, no new pile can be declared.',
                'Each pile scores its size minus the three it was seeded with.',
            ]),
            tiles(['1z', '2z', '3z', '4z', '1z'], 'A winds pile of five: five tiles, minus the seed of three, is two points.'),
            note('The one of bamboo is wild. It counts as a distinct tile in any pile and joins any pile you have declared — which makes the bird the most valuable tile in this variant, and the reason it is drawn as a bird and not a stalk.'),
            p('So a win with one pile of five is 1 + 2 = 3 points. Seven pairs with the same pile is 2 + 2 = 4.'),
            h('Who pays'),
            p('If you win on someone’s discard, that player pays you alone. If you draw the winning tile yourself, all three pay you the full amount — so a self-drawn win is worth three times as much.'),
        ],
    },
    {
        id: 7,
        title: 'At the table',
        subtitle: 'Flow, etiquette, and not being the slow one',
        minutes: 4,
        blocks: [
            h('How a game is structured'),
            p('The deal passes to the right whenever east loses the hand. When it has gone all the way round, the prevailing wind advances — east round, then south, and so on. Most casual games play one or two rounds.'),
            note('The app tracks the dealer and the prevailing wind for you on the Table screen, because this is the thing every table loses track of and then argues about.'),
            h('Etiquette worth knowing'),
            list([
                'Announce claims clearly and immediately — "pung", "chow", "mahjong". A claim made after the next player has drawn is usually too late.',
                'Discard into the middle where everyone can see, and say the tile aloud if your table does that.',
                'Do not rearrange your rack constantly. It tells people how your hand is changing.',
                'Do not slow-roll a win. Show the hand.',
            ]),
            h('The real advice'),
            p('Ask. Mahjong is taught at the table, and every experienced player expects to coach a new one — the mistake beginners make is staying quiet and guessing. Playing your first few hands face up with someone watching will teach you more than any amount of reading, including this.'),
        ],
    },
];

export const moduleById = (id) => MODULES.find((m) => m.id === id) ?? null;
export const nextModule = (id) => MODULES.find((m) => m.id === id + 1) ?? null;

/**
 * findBaseLocation.js
 *
 * Finds a good place for a base in a Screeps room.
 *
 * WHAT "GOOD" MEANS HERE
 *   1. SAFE:  every tile of the base is far (by walking PATH distance, not
 *             straight-line distance) from every room exit.
 *   2. FITS:  there is a clear wall-free square (at least 5x5, and the
 *             bigger the better up to 10x10), AND the base can grow outward
 *             from it, up to 150 buildable tiles in total.
 *   3. CLOSE: the base is near at least one source (hard requirement), and
 *             ideally close to all sources and the controller (soft bonus).
 *
 * HOW IT WORKS (big picture)
 *   Step 1: Build a "blocked" map of the room (walls, sources, controller).
 *   Step 2: Run a breadth-first search (BFS) outward from all the exit tiles.
 *           This gives every tile a number: "how many steps to the nearest
 *           exit, walking around walls". Bigger number = safer.
 *   Step 3: Run a BFS from each source and from the controller, so we know
 *           how far every tile is from the things we care about.
 *   Step 4: Slide a square window over the whole room. At every corner try
 *           the biggest size first (10x10) and shrink one tile at a time
 *           down to 5x5 until the square is wall-free and far enough from
 *           the exits. Bigger squares earn a bonus. Score the survivors.
 *   Step 5: Take the best few squares and "grow" each one outward, up to 150
 *           tiles. Re-check safety on the grown shape, re-score (more tiles
 *           earns a small bonus), and return the winner.
 *
 * NOTE ON SIZES
 *   5x5 is the MINIMUM solid block, 10x10 is preferred, and the whole base
 *   area may grow up to 150 tiles. (A 10x10 is only 100 tiles, so the other
 *   50 are grown around it.) How much size matters compared with safety and
 *   distance is controlled by the `footprint` and `area` weights below.
 *
 * USAGE
 *   const findBaseLocation = require('findBaseLocation');
 *   const result = findBaseLocation(Game.rooms['E47N39']);
 *   if (result) {
 *       console.log('Base center:', result.x, result.y);
 *   }
 *
 * This is written for learning, so it favors readability over micro-speed.
 * It is a one-time calculation: run it once and cache the answer
 * (see the bottom of this file for an example).
 */

// ---------------------------------------------------------------------------
// CONFIGURATION - tweak these to change the behavior
// ---------------------------------------------------------------------------
const DEFAULT_OPTIONS = {
    // The solid wall-free SQUARE can be any side length from the minimum
    // (5 = 5x5) up to the maximum (10 = 10x10). Bigger is preferred.
    minFootprint: 5,
    maxFootprint: 10,

    // The base area grows outward from the square to at most this many
    // tiles in total...
    maxTotalTiles: 150,
    // ...but a spot is only accepted if it can reach at least this many
    // (25 = just the 5x5 itself, so by default there is no extra rule).
    minTotalTiles: 25,

    // HARD RULE: every tile of the base must be at least this many walking
    // steps away from the nearest room exit.
    minExitDistance: 8,

    // HARD RULE: at least ONE source must be within this many walking steps
    // of the base center.
    maxNearestSourceDistance: 20,

    // Safety stops mattering past this many steps. Without a cap, the
    // algorithm might drag the base far from your sources just to gain a
    // tiny bit more safety.
    safetyCap: 20,

    // Scoring weights. Higher score = better location.
    //   score = safety*wSafety + squareSide*wFootprint + (tiles/maxTiles)*wArea
    //           - nearestSource*wNearest - averageTarget*wAverage
    weights: {
        safety: 3,          // reward distance from exits
        footprint: 2,       // reward a bigger solid square (per tile of side length)
        area: 10,           // reward reaching the full 150-tile area (scaled 0..1)
        nearestSource: 1.5, // punish being far from the closest source
        averageTarget: 0.75 // punish being far from ALL sources + controller
    },

    // How many of the best rectangle candidates get the (slower) "grow to
    // 150 tiles" treatment. Higher = more thorough, but costs more CPU.
    candidatesToGrow: 15
};

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const ROOM_SIZE = 50;               // Screeps rooms are always 50x50 tiles
const TILE_COUNT = ROOM_SIZE * ROOM_SIZE;
const UNREACHED = 65535;            // BFS marker meaning "never got here"

// The 8 directions a creep can step (including diagonals).
// Each entry is [dx, dy].
const NEIGHBOR_OFFSETS = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1]
];

// ---------------------------------------------------------------------------
// SMALL HELPERS
// ---------------------------------------------------------------------------

/**
 * Convert an (x, y) coordinate into a single array index.
 * We store the whole room in flat arrays of 2500 numbers because flat typed
 * arrays are fast and use very little memory.
 *   index = y * 50 + x
 */
function toIndex(x, y) {
    return y * ROOM_SIZE + x;
}

/**
 * Breadth-first search (BFS) over the room.
 *
 * BFS spreads outward from the starting tiles one "ring" at a time, so the
 * first time it reaches a tile is guaranteed to be by the SHORTEST walking
 * path. We record that step count for every tile.
 *
 * @param {number[]} seedIndexes - tiles to start from (they get distance 0)
 * @param {Uint8Array} blocked   - 1 where a tile can't be walked through
 * @returns {Uint16Array} distance map (UNREACHED where BFS never arrived)
 */
function bfsDistanceMap(seedIndexes, blocked) {
    // Start with every tile marked "not reached yet".
    const distance = new Uint16Array(TILE_COUNT).fill(UNREACHED);

    // A plain array used as a queue. `head` is the next tile to process and
    // `tail` is where the next discovered tile gets written.
    const queue = new Uint16Array(TILE_COUNT);
    let head = 0;
    let tail = 0;

    // Seed the queue with the starting tiles.
    for (const seed of seedIndexes) {
        if (blocked[seed] === 1) continue;          // can't start inside a wall
        if (distance[seed] !== UNREACHED) continue; // already seeded
        distance[seed] = 0;
        queue[tail++] = seed;
    }

    // Process tiles in the order they were discovered.
    while (head < tail) {
        const current = queue[head++];
        const cx = current % ROOM_SIZE;
        const cy = (current / ROOM_SIZE) | 0; // "| 0" drops the decimal part

        // Look at all 8 neighbors.
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
            const nx = cx + dx;
            const ny = cy + dy;

            // Skip anything outside the room.
            if (nx < 0 || nx >= ROOM_SIZE || ny < 0 || ny >= ROOM_SIZE) continue;

            const next = toIndex(nx, ny);

            // Skip walls/objects and tiles we've already reached.
            if (blocked[next] === 1) continue;
            if (distance[next] !== UNREACHED) continue;

            // One step further than the tile we came from.
            distance[next] = distance[current] + 1;
            queue[tail++] = next;
        }
    }

    return distance;
}

/**
 * Build a 2D "prefix sum" (also called a summed-area table) of the blocked
 * map. This trick lets us ask "how many blocked tiles are inside this
 * rectangle?" in constant time, no matter how big the rectangle is.
 *
 * prefix[(y+1)*51 + (x+1)] = number of blocked tiles in the box from (0,0)
 * up to and including (x,y).
 */
function buildPrefixSum(blocked) {
    const width = ROOM_SIZE + 1; // one extra row/column of zeros makes the math easier
    const prefix = new Int32Array(width * width);

    for (let y = 0; y < ROOM_SIZE; y++) {
        for (let x = 0; x < ROOM_SIZE; x++) {
            prefix[(y + 1) * width + (x + 1)] =
                blocked[toIndex(x, y)] +
                prefix[y * width + (x + 1)] +        // the box above
                prefix[(y + 1) * width + x] -        // the box to the left
                prefix[y * width + x];               // overlap counted twice
        }
    }
    return prefix;
}

/**
 * Count blocked tiles in a rectangle using the prefix-sum table.
 * (x0, y0) is the top-left corner; w and h are the rectangle's size.
 */
function countBlockedInRect(prefix, x0, y0, w, h) {
    const width = ROOM_SIZE + 1;
    const x1 = x0 + w; // exclusive right edge
    const y1 = y0 + h; // exclusive bottom edge
    return (
        prefix[y1 * width + x1] -
        prefix[y0 * width + x1] -
        prefix[y1 * width + x0] +
        prefix[y0 * width + x0]
    );
}

/**
 * Take the smaller of two numbers, treating UNREACHED as "no information".
 * (UNREACHED is a huge number, so a normal Math.min already works, but this
 * name makes the intent clearer when reading the code below.)
 */
function smallest(a, b) {
    return a < b ? a : b;
}

// ---------------------------------------------------------------------------
// STEP 5 HELPER: GROW A RECTANGLE OUTWARD TO N TILES
// ---------------------------------------------------------------------------

/**
 * Starting from the solid square, keep adding the neighboring tile that is
 * closest to the square's center until we have `maxTiles` tiles (or run out
 * of room to grow).
 * This keeps the base compact instead of sprawling in one direction.
 *
 * A neighbor is NOT allowed to join if it is blocked, or if it is closer to
 * an exit than `minExitDistance` (that would make the base unsafe).
 *
 * @returns {number[]} list of tile indexes. It may hold fewer than `maxTiles`
 *                    if the surroundings are cramped - the caller decides
 *                    whether that is still big enough.
 */
function growRegion(rect, maxTiles, blocked, exitDistance, minExitDistance) {
    // Which tiles are already part of the base.
    const inRegion = new Uint8Array(TILE_COUNT);
    // Which tiles are already waiting on the frontier (so we don't add twice).
    const onFrontier = new Uint8Array(TILE_COUNT);

    const region = [];   // final list of tile indexes
    const frontier = []; // tiles adjacent to the region that might join

    // Center of the rectangle, used to keep the shape round-ish.
    const centerX = rect.x0 + (rect.w - 1) / 2;
    const centerY = rect.y0 + (rect.h - 1) / 2;

    // Helper: look at a tile's neighbors and add eligible ones to the frontier.
    function addNeighborsToFrontier(index) {
        const cx = index % ROOM_SIZE;
        const cy = (index / ROOM_SIZE) | 0;
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= ROOM_SIZE || ny < 0 || ny >= ROOM_SIZE) continue;
            const next = toIndex(nx, ny);
            if (inRegion[next] === 1 || onFrontier[next] === 1) continue;
            if (blocked[next] === 1) continue;
            // Too close to an exit? Never let it join the base.
            if (exitDistance[next] < minExitDistance) continue;
            onFrontier[next] = 1;
            frontier.push(next);
        }
    }

    // 1) Put every tile of the solid rectangle into the region.
    for (let y = rect.y0; y < rect.y0 + rect.h; y++) {
        for (let x = rect.x0; x < rect.x0 + rect.w; x++) {
            const index = toIndex(x, y);
            inRegion[index] = 1;
            region.push(index);
        }
    }

    // 2) Seed the frontier from the rectangle's surroundings.
    for (const index of region) {
        addNeighborsToFrontier(index);
    }

    // 3) Repeatedly absorb the frontier tile closest to the center.
    while (region.length < maxTiles) {
        // Nowhere left to grow: stop and hand back what we managed to collect.
        if (frontier.length === 0) break;

        // Find the frontier tile with the smallest distance to the center.
        // (A simple scan is fine: the frontier is only ever a few dozen tiles.)
        let bestPosition = 0;
        let bestDistance = Infinity;
        for (let i = 0; i < frontier.length; i++) {
            const fx = frontier[i] % ROOM_SIZE;
            const fy = (frontier[i] / ROOM_SIZE) | 0;
            // Squared distance is enough for comparing (no sqrt needed).
            const d = (fx - centerX) * (fx - centerX) + (fy - centerY) * (fy - centerY);
            if (d < bestDistance) {
                bestDistance = d;
                bestPosition = i;
            }
        }

        // Remove it from the frontier (swap with the last item, then pop -
        // much faster than splice because we don't care about order).
        const chosen = frontier[bestPosition];
        frontier[bestPosition] = frontier[frontier.length - 1];
        frontier.pop();

        // Add it to the region and expose its neighbors.
        inRegion[chosen] = 1;
        region.push(chosen);
        addNeighborsToFrontier(chosen);
    }

    return region;
}

// ---------------------------------------------------------------------------
// THE MAIN FUNCTION
// ---------------------------------------------------------------------------

/**
 * Find the best base location in a room.
 *
 * @param {Room}   room    - the room to analyze (you need vision of it)
 * @param {Object} options - optional overrides for DEFAULT_OPTIONS
 * @returns {Object|null}  - info about the best spot, or null if none fits:
 *   {
 *     x, y            : center tile of the solid square (good "anchor")
 *     topLeft         : {x, y} corner of the solid square
 *     width, height   : size of the solid square (5 up to 10 tiles per side)
 *     tiles           : [{x, y}, ...] all tiles of the base area (up to 150)
 *     safety          : fewest steps from any base tile to any exit
 *     nearestSource   : steps from center to the closest source
 *     averageTarget   : average steps from center to sources + controller
 *     score           : final score (higher is better)
 *   }
 */
function findBaseLocation(room, options) {
    // Merge the caller's options on top of the defaults.
    const opts = Object.assign({}, DEFAULT_OPTIONS, options);
    opts.weights = Object.assign({}, DEFAULT_OPTIONS.weights, (options || {}).weights);

    // ---------------------------------------------------------------------
    // STEP 1: BUILD THE "BLOCKED" MAP
    // ---------------------------------------------------------------------
    const terrain = room.getTerrain(); // cheap, works even for rooms you can't see
    const blocked = new Uint8Array(TILE_COUNT); // 1 = blocked, 0 = open

    // Natural walls block everything.
    for (let y = 0; y < ROOM_SIZE; y++) {
        for (let x = 0; x < ROOM_SIZE; x++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                blocked[toIndex(x, y)] = 1;
            }
        }
    }

    // Sources and the controller sit on otherwise-walkable ground, but you
    // can't walk or build on them, so we block those tiles too.
    const sources = room.find(FIND_SOURCES);
    const controller = room.controller;
    for (const source of sources) {
        blocked[toIndex(source.pos.x, source.pos.y)] = 1;
    }
    if (controller) {
        blocked[toIndex(controller.pos.x, controller.pos.y)] = 1;
    }

    // Without sources there is nothing to be "near", so we can't do our job.
    if (sources.length === 0) return null;

    // ---------------------------------------------------------------------
    // STEP 2: PATH DISTANCE FROM THE EXITS
    // ---------------------------------------------------------------------
    // FIND_EXIT returns every walkable tile on the room edge that leads
    // into another room. These are where enemies walk in from.
    const exitSeeds = room.find(FIND_EXIT).map(pos => toIndex(pos.x, pos.y));
    const exitDistance = bfsDistanceMap(exitSeeds, blocked);
    // Each tile now knows how many steps an invader needs to reach it.
    // (A tile sealed off from every exit stays UNREACHED, a huge number,
    //  which correctly counts as "extremely safe".)

    // ---------------------------------------------------------------------
    // STEP 3: PATH DISTANCE TO SOURCES AND THE CONTROLLER
    // ---------------------------------------------------------------------
    // We can't walk INTO a source, so we seed the BFS from the open tiles
    // around it. Distance 0 therefore means "standing next to the source",
    // which is exactly where a harvester would stand.
    function seedsAround(pos) {
        const seeds = [];
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
            const nx = pos.x + dx;
            const ny = pos.y + dy;
            if (nx < 0 || nx >= ROOM_SIZE || ny < 0 || ny >= ROOM_SIZE) continue;
            seeds.push(toIndex(nx, ny)); // bfsDistanceMap ignores blocked seeds
        }
        return seeds;
    }

    // One distance map per source.
    const sourceDistanceMaps = sources.map(s => bfsDistanceMap(seedsAround(s.pos), blocked));
    // One distance map for the controller (if the room has one).
    const controllerDistanceMap = controller
        ? bfsDistanceMap(seedsAround(controller.pos), blocked)
        : null;

    // ---------------------------------------------------------------------
    // STEP 4: SLIDE A WINDOW OVER THE ROOM AND SCORE EVERY SPOT
    // ---------------------------------------------------------------------
    const prefix = buildPrefixSum(blocked);
    const candidates = []; // survivors of the quick checks

    // Tiles 0 and 49 are the exit lanes, so a square may only use tiles 1..48.
    // `limit` is the first tile index we are NOT allowed to touch (49).
    const limit = ROOM_SIZE - 1;

    // (x0, y0) is the top-left corner of the window.
    for (let y0 = 1; y0 + opts.minFootprint <= limit; y0++) {
        for (let x0 = 1; x0 + opts.minFootprint <= limit; x0++) {

            // At this corner, find the BIGGEST square that is valid. We try
            // 10x10 first, then 9x9, 8x8 ... down to the 5x5 minimum, and
            // stop at the first one that passes every check.
            let size = 0;           // 0 means "no valid square found here"
            let windowSafety = 0;   // fewest steps to an exit inside that square

            for (let trySize = opts.maxFootprint; trySize >= opts.minFootprint; trySize--) {

                // Skip sizes that would poke past the usable part of the room.
                if (x0 + trySize > limit || y0 + trySize > limit) continue;

                // Check #1: any wall/source/controller inside the square?
                if (countBlockedInRect(prefix, x0, y0, trySize, trySize) > 0) continue;

                // Check #2: how close does the square get to an exit?
                // Walk every tile and remember the smallest distance.
                let safetyHere = UNREACHED;
                for (let y = y0; y < y0 + trySize; y++) {
                    for (let x = x0; x < x0 + trySize; x++) {
                        safetyHere = smallest(safetyHere, exitDistance[toIndex(x, y)]);
                    }
                }
                if (safetyHere < opts.minExitDistance) continue;

                // Passed everything: this is the biggest valid size here.
                size = trySize;
                windowSafety = safetyHere;
                break;
            }

            // Not even a 5x5 fits safely at this corner.
            if (size === 0) continue;

            // Use the square's center tile to measure distances to targets.
            const centerX = x0 + Math.floor(size / 2);
            const centerY = y0 + Math.floor(size / 2);
            const centerIndex = toIndex(centerX, centerY);

            // Distance to the closest source (this is the hard requirement).
            let nearestSource = UNREACHED;
            let targetDistanceSum = 0;
            let targetCount = 0;
            let anyTargetUnreachable = false;

            for (const map of sourceDistanceMaps) {
                const d = map[centerIndex];
                if (d === UNREACHED) { anyTargetUnreachable = true; continue; }
                nearestSource = smallest(nearestSource, d);
                targetDistanceSum += d;
                targetCount++;
            }
            if (controllerDistanceMap) {
                const d = controllerDistanceMap[centerIndex];
                if (d === UNREACHED) anyTargetUnreachable = true;
                else { targetDistanceSum += d; targetCount++; }
            }

            // Reject if no source is reachable or the nearest is too far.
            if (nearestSource === UNREACHED) continue;
            if (nearestSource > opts.maxNearestSourceDistance) continue;
            // If something (like a second source) is walled off from this
            // spot entirely, it's a bad base location.
            if (anyTargetUnreachable) continue;

            const averageTarget = targetDistanceSum / targetCount;

            // Combine everything into one number (see weights up top).
            // Note the new `footprint` term: a bigger square scores higher.
            const safety = Math.min(windowSafety, opts.safetyCap);
            const score =
                safety * opts.weights.safety +
                size * opts.weights.footprint -
                nearestSource * opts.weights.nearestSource -
                averageTarget * opts.weights.averageTarget;

            candidates.push({
                rect: { x0, y0, w: size, h: size },
                size,
                centerX, centerY, centerIndex,
                nearestSource, averageTarget, score
            });
        }
    }

    // Nothing survived the quick checks: the room can't host this base.
    if (candidates.length === 0) return null;

    // ---------------------------------------------------------------------
    // STEP 5: GROW THE BEST CANDIDATES TO 150 TILES AND PICK THE WINNER
    // ---------------------------------------------------------------------
    // Sort best-first and only keep the top few; growing is the slow part.
    candidates.sort((a, b) => b.score - a.score);
    const finalists = candidates.slice(0, opts.candidatesToGrow);

    let best = null;

    for (const candidate of finalists) {
        const region = growRegion(
            candidate.rect,
            opts.maxTotalTiles,
            blocked,
            exitDistance,
            opts.minExitDistance
        );

        // Too cramped to reach the minimum area - try the next candidate.
        if (region.length < opts.minTotalTiles) continue;

        // Re-measure safety over the WHOLE grown area, not just the square.
        let regionSafety = UNREACHED;
        for (const index of region) {
            regionSafety = smallest(regionSafety, exitDistance[index]);
        }

        // Re-score using the full area's safety, plus a bonus for how much of
        // the 150-tile target we actually reached (region.length / 150 is
        // between 0 and 1, so the bonus is at most `weights.area`).
        const safety = Math.min(regionSafety, opts.safetyCap);
        const finalScore =
            safety * opts.weights.safety +
            candidate.size * opts.weights.footprint +
            (region.length / opts.maxTotalTiles) * opts.weights.area -
            candidate.nearestSource * opts.weights.nearestSource -
            candidate.averageTarget * opts.weights.averageTarget;

        if (best === null || finalScore > best.score) {
            best = {
                x: candidate.centerX,
                y: candidate.centerY,
                topLeft: { x: candidate.rect.x0, y: candidate.rect.y0 },
                width: candidate.rect.w,
                height: candidate.rect.h,
                // Convert flat indexes back into {x, y} coordinates.
                tiles: region.map(i => ({ x: i % ROOM_SIZE, y: (i / ROOM_SIZE) | 0 })),
                safety: regionSafety,
                nearestSource: candidate.nearestSource,
                averageTarget: Math.round(candidate.averageTarget * 10) / 10,
                score: Math.round(finalScore * 100) / 100
            };
        }
    }

    return best; // may still be null if every finalist was too cramped
}

// ---------------------------------------------------------------------------
// OPTIONAL: DRAW THE RESULT SO YOU CAN SEE IT IN THE GAME
// ---------------------------------------------------------------------------

/**
 * Draws the chosen base area on the room using RoomVisual.
 * Call this every tick (visuals only last one tick):
 *     findBaseLocation.draw(room, result);
 */
findBaseLocation.draw = function (room, result) {
    if (!result) return;

    // Shade every tile of the base area.
    for (const tile of result.tiles) {
        room.visual.rect(tile.x - 0.5, tile.y - 0.5, 1, 1, {
            fill: '#00ff88',
            opacity: 0.15
        });
    }

    // Outline the solid rectangle.
    room.visual.rect(
        result.topLeft.x - 0.5,
        result.topLeft.y - 0.5,
        result.width,
        result.height,
        { fill: 'transparent', stroke: '#ffffff', opacity: 0.6 }
    );

    // Mark the center.
    room.visual.circle(result.x, result.y, { radius: 0.4, fill: '#ffff00' });
};

module.exports = findBaseLocation;

// ---------------------------------------------------------------------------
// EXAMPLE: RUN ONCE AND CACHE THE ANSWER
// ---------------------------------------------------------------------------
// The search is relatively expensive, so don't run it every tick. Do it once
// and store the small result in Memory. (Store only the center and corner,
// not the 150-tile list, to keep Memory small - you can always rebuild the
// tile list by running the function again.)
//
//   const findBaseLocation = require('findBaseLocation');
//
//   module.exports.loop = function () {
//       const room = Game.rooms['E47N39'];
//       if (!room.memory.base) {
//           const result = findBaseLocation(room);
//           if (result) {
//               room.memory.base = {
//                   x: result.x,
//                   y: result.y,
//                   topLeft: result.topLeft
//               };
//           }
//       }
//       // Optional visual debugging while you tune the options:
//       // findBaseLocation.draw(room, findBaseLocation(room));
//   };

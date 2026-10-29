'use strict'

/**
 * WallPlanner.js - plans the DEFENCE of a room: wall line, gates (ramparts) and towers.
 *
 * It does NOT build anything. It only writes a plan into memory; RoomPlanner.buildRoom() reads that
 * plan and places the construction sites (so there is still one place that talks to the game).
 *
 * ---------------------------------------------------------------------------------------------------
 * HOW IT WORKS (educational overview)
 * ---------------------------------------------------------------------------------------------------
 * 1. WALL LINE = MINIMUM CUT  (the same idea as https://github.com/Josef37/screeps-min-cut-wall)
 *      "What is the fewest number of tiles I must block to separate my base from every room exit?"
 *      That is a classic graph problem (max-flow / min-cut):
 *        - Every walkable tile becomes TWO graph nodes, "in" and "out", joined by one edge.
 *        - That in->out edge has capacity 1 (blocking the tile "costs" 1) - except tiles we must never
 *          block (the protected base and the room edge), which get infinite capacity.
 *        - Neighbouring tiles are linked out->in with infinite capacity (creeps can walk between them).
 *        - SOURCE = the protected base, SINK = the room exits.
 *      The maximum flow from source to sink equals the minimum number of tiles to block, and the tiles
 *      whose in->out edge is saturated on the source side of the residual graph ARE the cut.
 *      We solve it with Dinic's algorithm.
 *
 *    PROTECTED AREA: the base structures PLUS the sources, the mineral and the controller (with their
 *      containers/links), so miners and upgraders work INSIDE the walls. If walling all of them in would
 *      cost too many wall tiles (MAX_WALL_TILES) or one can't be walled in at all (e.g. it hugs the room
 *      edge), the least important one is dropped and the cut is recomputed: first the mineral, then the
 *      controller, then sources - farthest from the base first. The result lists what was left outside.
 *
 *    BUILDABILITY: Screeps refuses to build walls/ramparts on a room-edge tile or on any tile touching an
 *      exit tile (NEAR_EXIT_BLOCK). Those tiles can never be part of the cut, so every wall and gate this
 *      planner outputs can actually be placed.
 *    SAFETY: the protected area is fattened by CENTER_MARGIN = 3 tiles, which guarantees an attacker
 *      standing OUTSIDE the walls is at least 4 tiles from every protected structure - out of reach of
 *      ranged attacks (range 3). Towers are held to the same standard (TOWER_SAFE_DIST).
 *
 * 2. GATES: a solid ring would lock our own creeps in. So for every room exit we find the shortest path
 *      from the base to it, and the first cut tile on that path becomes a GATE (a rampart: our creeps
 *      walk through it, enemies cannot). Every other cut tile becomes a constructed WALL. Afterwards the
 *      result is CHECKED: walking from the base while treating walls as solid must still reach every
 *      exit opening that is reachable at all; any opening that doesn't gets an extra gate.
 *
 * 3. TOWERS: after the wall line is known we place towers to make the WEAKEST wall tile as strong as possible
 *      (tower damage falls from 600 at range 5 to 150 at range 20, so a tile far from every tower is a weak
 *      spot an attacker would target). The goal is a MAX-MIN one: raise the weakest tile first, then the
 *      second weakest, then the third, and only then the overall average.
 *        PRIME cluster  - 1 container with 3 towers + 1 link all touching it. One hauler standing ON the
 *                         container can pull from the link and fill all 3 towers and the container
 *                         without moving.
 *        SUB towers     - up to 3 more. Their favourite homes are HUBS: next to each source's container/link,
 *                         the controller's container/link, and the core link by the storage, because energy
 *                         and haulers are always nearby there, and they are spread around the room so
 *                         coverage stays even no matter how far from the anchor the wall is. Next to the
 *                         prime container is the other preferred home. A hub site is only used if a tower
 *                         there would NOT block the paths (roads still connected, the hub still reachable,
 *                         no harvesting spot taken). A spot anywhere else is used only when it raises the
 *                         weakest wall tile by SUB_FAR_GAIN or when no hub site is available.
 *      The prime cluster location itself is chosen by trying the best few sites and seeing which one gives
 *      the strongest final result once its three sub towers are placed at hub sites.
 *
 * ---------------------------------------------------------------------------------------------------
 * CPU SAFETY (this is heavy maths, so it is built to be cheap per tick)
 * ---------------------------------------------------------------------------------------------------
 *   - It only starts AFTER the room plan exists, and never on the same tick the plan was created.
 *   - The work is cut into tiny "units". Each tick we run units until a small CPU budget is used
 *     (SLICE_CPU), then stop and continue next tick. State lives in the global heap, not in Memory.
 *   - It refuses to run when the CPU bucket is low, or when the tick has already used a lot of CPU.
 *   - Only ONE room is processed at a time.
 *   - Everything is wrapped in try/catch: an error is stored and retried later; it never breaks your loop.
 *   - If the global heap resets mid-job, the job simply restarts (nothing half-done is saved).
 *
 * ---------------------------------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------------------------------
 *   main loop, every tick, for each owned room:   WallPlanner.run(roomName);
 *   console:  WallPlanner.status('E47N39')   WallPlanner.redo('E47N39')   WallPlanner.draw('E47N39')
 *
 * MEMORY (shared folder with RoomPlanner):   Memory.rooms[room].planner = {
 *     plan, planTick, lastRun,          <- written by RoomPlanner
 *     defense                           <- written by this file (see buildResult() for the fields)
 * }
 */

// ---------------------------------------------------------------- tunables
const DEFENSE_VERSION = 1 // bump to force every room's defence to be recomputed
const PLANNER_KEY = 'planner' // Memory.rooms[room][PLANNER_KEY]  (must match RoomPlanner)

// -- wall line
const CENTER_MARGIN = 3 // protected structures are fattened by this many tiles; walls never go inside.
// 3 means a ranged (range 3) attacker standing outside the wall can't reach a structure.
const CENTER_MARGIN_MAX = 5 // if no tower cluster fits, retry with a bigger margin up to this
const GATES_PER_EXIT = 1 // gates (ramparts our creeps can pass) per room exit opening
const MAX_WALL_TILES = 160 // if enclosing sources/mineral/controller needs more wall tiles than this, drop the least
// important one and try again (so a far-away source can't force a huge wall)
const MAX_WALL_RANGE = 10 // walls may only stand within this many tiles of a protected structure, so the
// towers can actually reach the whole line. A pure min-cut (Infinity) would often
// just seal the far-away room exits, 20+ tiles from the towers.

// -- towers
const SUB_FAR_GAIN = 0.1 // a sub tower goes to a non-hub spot only if it raises the weakest wall tile by >= 10%
const CLUSTER_FINALISTS = 6 // how many different cluster sites are fully simulated (with their sub towers)
const CLUSTER_SEPARATION = 4 // finalists must be at least this many tiles apart (no near-duplicates)
const SCORE_EPS = 0.5 // damage differences smaller than this count as a tie when comparing coverage
const TOWER_SAFE_DIST = 4 // every tower-cluster tile must be at least this far from ANY tile an enemy can stand on
// outside the walls (ranged attackers hit from 3 tiles away, so 4 is safe)
const CLUSTER_MAX_FROM_ANCHOR = 14 // the prime tower cluster must be within this many tiles of the anchor (it belongs by the core)
const CLUSTER_VERIFY_MAX = 25 // how many top-scored cluster sites get the (more expensive) connectivity test

// -- CPU protection
const MIN_BUCKET = 1500 // do nothing while the CPU bucket is below this
const SLICE_CPU = 3 // CPU ms this module may use per tick
const TICK_CPU_FRACTION = 0.6 // never run if the tick has already used this share of its limit
const MIN_RCL = 2 // start planning from this controller level (first tower comes at RCL 3)
const RETRY_AFTER = 200 // ticks to wait before retrying after an error
// Work-unit sizes. Each unit must be small (well under 1 ms warm) so the CPU budget check between units is
// fine-grained. Making these bigger = fewer, chunkier units; smaller = more precise CPU control.
const NEAR_EXIT_BLOCK = true // walls/gates may not touch an exit tile (the game won't let you build there)
const EDGE_TILES_PER_UNIT = 150 // tiles whose graph edges are created per unit
const BFS_NODES_PER_UNIT = 1500 // graph nodes expanded per BFS unit
const AUGMENTS_PER_UNIT = 5 // max-flow paths pushed per work unit
const DFS_STEPS_PER_UNIT = 3000 // max edge scans/moves inside the flow search per unit (it can pause mid-path)
const DIST_NODES_PER_UNIT = 800 // nodes expanded per unit while measuring distances
const CANDIDATES_PER_UNIT = 12 // cluster sites scored per work unit
const SUB_TILES_PER_UNIT = 25 // tiles scored per unit while placing sub towers

// ---------------------------------------------------------------- constants and helpers
const SIZE = 50,
    N = SIZE * SIZE
const INF = 1 << 20 // "infinite" capacity (bigger than any possible cut)
const NEIGH8 = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
]
const idxOf = (x, y) => y * SIZE + x
const xOf = i => i % SIZE
const yOf = i => (i / SIZE) | 0
const cheb = (a, b) => Math.max(Math.abs(xOf(a) - xOf(b)), Math.abs(yOf(a) - yOf(b)))
const isBorder = i => {
    const x = xOf(i),
        y = yOf(i)
    return x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1
}
const inRoom = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE

// Tower damage by range: full power up to range 5, linearly down to 25% at range 20 and beyond.
// (Game constants are used when they exist so this stays correct if the game changes them.)
const T_POWER = typeof TOWER_POWER_ATTACK !== 'undefined' ? TOWER_POWER_ATTACK : 600
const T_OPTIMAL = typeof TOWER_OPTIMAL_RANGE !== 'undefined' ? TOWER_OPTIMAL_RANGE : 5
const T_FALLOFF_RANGE = (typeof TOWER_FALLOFF_RANGE !== 'undefined' ? TOWER_FALLOFF_RANGE : 20) - 3 //reduced optimal range by 3 to factor in hiting units as the approach the walls instead of targeting the walls
const T_FALLOFF = typeof TOWER_FALLOFF !== 'undefined' ? TOWER_FALLOFF : 0.75
const DAMAGE_BY_RANGE = new Float32Array(SIZE)
for (let r = 0; r < SIZE; r++) {
    const rr = Math.min(Math.max(r, T_OPTIMAL), T_FALLOFF_RANGE) // clamp into the sloped section
    DAMAGE_BY_RANGE[r] = T_POWER * (1 - (T_FALLOFF * (rr - T_OPTIMAL)) / (T_FALLOFF_RANGE - T_OPTIMAL))
}

// Terrain wall bit (1 in the real game).
const WALL_BIT = typeof TERRAIN_MASK_WALL !== 'undefined' ? TERRAIN_MASK_WALL : 1

// Which planned structure types must be INSIDE the walls (roads, containers, the mineral extractor and
// the far-away source/controller links are deliberately left out so they don't drag the walls around them).
const PROTECTED_TYPES = () => [
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
    STRUCTURE_FACTORY,
    STRUCTURE_LAB,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_OBSERVER,
    STRUCTURE_NUKER,
]

// Types that block walking (everything except roads, containers and ramparts).
const WALKABLE_STRUCTURES = () => new Set([STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART])

/** True if coverage result a (see DefenseJob.coverage) is better than b: higher weakest tile wins, ties go down the list. */
function isBetter(a, b) {
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i] + SCORE_EPS) return true
        if (a[i] < b[i] - SCORE_EPS) return false
    }
    return a[3] > b[3] + 1e-9
}

// ---------------------------------------------------------------- the job (pure, resumable)
/**
 * DefenseJob - all the maths, written as a state machine so it can be paused between ticks.
 *
 * input = {
 *   terrain:   { get(x, y) }           room terrain (bit 1 = wall)
 *   plan:      { a, s, roles, temp }   the RoomPlanner layout (a = anchor index, s = { type: [tile indexes] })
 *   obstacles: [tile index]            sources, minerals, controller (tiles creeps cannot enter)
 *   assets:    [{ kind, tiles, hubs }] things to keep INSIDE the walls if affordable: kind is 'source' |
 *                                      'mineral' | 'controller'; tiles = its own tile + container + link;
 *                                      hubs = just its container/link (good homes for sub towers)
 *   towerCap:  number                  how many towers the room gets at RCL 8
 * }
 * Call advance(keepGoing) repeatedly; when job.done is true, job.result holds the finished defence.
 */
class DefenseJob {
    constructor(input) {
        this.input = input
        this.margin = CENTER_MARGIN
        this.phase = 'prep'
        this.done = false
        this.error = null
        this.units = 0 // work units executed (for stats)
        this.flow = 0
    }

    /** Run work units while keepGoing() says we still have budget. Always runs at least one unit. */
    advance(keepGoing) {
        do {
            this.work()
            this.units++
        } while (!this.done && keepGoing())
    }

    /** One small bounded unit of work. */
    work() {
        switch (this.phase) {
            case 'prep':
                return this.prep()
            case 'prep2':
                return this.prep2()
            case 'build0':
                return this.buildSetup()
            case 'build0b':
                return this.buildSetup2()
            case 'build1':
                return this.buildEdges()
            case 'bfs':
                return this.levelGraph()
            case 'dfs':
                return this.pushFlow()
            case 'extract':
                return this.extractCut()
            case 'gates':
                return this.findGates()
            case 'gates2':
                return this.verifyGates()
            case 'towerprep':
                return this.prepareTowers()
            case 'towerprep2':
                return this.prepareTowers2()
            case 'reach0':
                return this.baselineReach()
            case 'cand':
                return this.scoreCandidates()
            case 'pick':
                return this.pickCluster()
            case 'sim':
                return this.simulateFinalists()
            case 'subs':
                return this.placeSubTowers()
            case 'finish':
                return this.finish()
            default:
                this.done = true
        }
    }

    // ------------------------------------------------------------ phase: prep (terrain facts that never change)
    prep() {
        const { terrain } = this.input
        // walkable[i]: not a natural wall
        this.walkable = new Uint8Array(N)
        for (let y = 0; y < SIZE; y++)
            for (let x = 0; x < SIZE; x++) {
                this.walkable[idxOf(x, y)] = terrain.get(x, y) & WALL_BIT ? 0 : 1
            }
        this.phase = 'prep2'
    }

    prep2() {
        const { plan, obstacles } = this.input

        // occupied[i]: a planned structure or road is here (cannot hold a tower); solid[i]: it also blocks walking
        this.occupied = new Uint8Array(N)
        this.solid = new Uint8Array(N)
        const passable = WALKABLE_STRUCTURES()
        for (const type in plan.s) {
            for (const i of plan.s[type]) {
                this.occupied[i] = 1
                if (!passable.has(type)) this.solid[i] = 1
            }
        }
        if (plan.temp !== undefined && plan.temp >= 0) this.occupied[plan.temp] = 1
        for (const i of obstacles || []) {
            this.occupied[i] = 1
            this.solid[i] = 1
        }
        for (let i = 0; i < N; i++) if (!this.walkable[i]) this.solid[i] = 1

        // protected structure tiles (these must end up inside the walls)
        const wanted = new Set(PROTECTED_TYPES())
        this.baseProtected = []
        for (const type in plan.s) if (wanted.has(type)) for (const i of plan.s[type]) this.baseProtected.push(i)
        if (plan.roles && plan.roles.coreLink >= 0) this.baseProtected.push(plan.roles.coreLink)
        this.baseProtected.push(plan.a) // the anchor (storage) itself

        // nearObstacle[i] = 1 within 1 tile of a source, the mineral or the controller. Towers are never put there:
        // those tiles are the harvesting / working spots our creeps need.
        this.nearObstacle = new Uint8Array(N)
        for (const o of obstacles || []) {
            const ox = xOf(o),
                oy = yOf(o)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (inRoom(ox + dx, oy + dy)) this.nearObstacle[idxOf(ox + dx, oy + dy)] = 1
                }
        }

        // Optional assets (sources / mineral / controller). They are included while affordable; see dropAsset().
        // Order = the ORDER THEY ARE DROPPED IN when the wall gets too big: mineral first, then controller, then
        // sources, and within a kind the one farthest from the anchor first.
        const KIND_WEIGHT = { mineral: 0, controller: 1, source: 2 }
        const ax = xOf(plan.a),
            ay = yOf(plan.a)
        this.included = (this.input.assets || [])
            .map(a => ({
                kind: a.kind,
                tiles: a.tiles.filter(t => t >= 0),
                hubs: (a.hubs || []).filter(t => t !== undefined && t >= 0), // container/link: sub-tower homes
                away: Math.max(
                    ...a.tiles.filter(t => t >= 0).map(t => Math.max(Math.abs(xOf(t) - ax), Math.abs(yOf(t) - ay)))
                ),
            }))
            .filter(a => a.tiles.length)
            .sort((p, q) => KIND_WEIGHT[p.kind] - KIND_WEIGHT[q.kind] || q.away - p.away)
        this.dropped = []

        // room exits: walkable border tiles, grouped into contiguous openings
        this.exits = this.findExitGroups()

        // nearExit[i] = 1 for every exit tile and every tile touching one. The game does not allow building
        // walls or ramparts there, so these tiles can never be part of the cut (see NEAR_EXIT_BLOCK).
        this.nearExit = new Uint8Array(N)
        for (const group of this.exits) {
            for (const e of group) {
                const ex = xOf(e),
                    ey = yOf(e)
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        if (inRoom(ex + dx, ey + dy)) this.nearExit[idxOf(ex + dx, ey + dy)] = 1
                    }
            }
        }
        this.phase = 'build0'
    }

    /** Walkable border tiles grouped into contiguous runs along each edge (each run = one "opening"). */
    findExitGroups() {
        const groups = []
        const sides = [
            i => idxOf(i, 0),
            i => idxOf(i, SIZE - 1), // top, bottom (i = x)
            i => idxOf(0, i),
            i => idxOf(SIZE - 1, i), // left, right (i = y)
        ]
        for (const tile of sides) {
            let run = []
            for (let k = 0; k < SIZE; k++) {
                const t = tile(k)
                if (this.walkable[t]) run.push(t)
                else if (run.length) {
                    groups.push(run)
                    run = []
                }
            }
            if (run.length) groups.push(run)
        }
        return groups
    }

    // ------------------------------------------------------------ phases: build0 + build1 (the flow network)
    /**
     * Node numbering:  in(i) = 2i,  out(i) = 2i + 1,  SOURCE = 2N,  SINK = 2N + 1.
     * Edges are stored in the classic "forward star" arrays (head/next/to/cap); edge e and e^1 are a pair
     * (the second is the reverse edge that carries residual capacity).
     */
    buildSetup() {
        // What must be inside the walls THIS attempt: the base plus every asset not dropped yet.
        // distance (in tiles, Chebyshev) from every tile to the nearest protected tile: a multi-source BFS
        // that ignores terrain. Used to keep the wall line within MAX_WALL_RANGE of what it protects.
        // It runs in chunks (DIST_NODES_PER_UNIT nodes per unit) so no single unit is big.
        if (!this.distInit) {
            this.protectedTiles = this.baseProtected.slice()
            for (const a of this.included) for (const t of a.tiles) this.protectedTiles.push(t)
            this.baseDist = new Int16Array(N).fill(-1)
            this.bq = new Int32Array(N)
            this.bh = 0
            this.bt = 0
            for (const p of this.protectedTiles)
                if (this.baseDist[p] === -1) {
                    this.baseDist[p] = 0
                    this.bq[this.bt++] = p
                }
            this.distInit = true
        }
        const dist = this.baseDist,
            bq = this.bq
        let budget = DIST_NODES_PER_UNIT
        while (this.bh < this.bt && budget-- > 0) {
            const u = bq[this.bh++],
                x = xOf(u),
                y = yOf(u)
            for (const [dx, dy] of NEIGH8) {
                const nx = x + dx,
                    ny = y + dy
                if (!inRoom(nx, ny)) continue
                const v = idxOf(nx, ny)
                if (dist[v] === -1) {
                    dist[v] = dist[u] + 1
                    bq[this.bt++] = v
                }
            }
        }
        if (this.bh < this.bt) return // keep measuring next unit
        this.distInit = false // (ready for the next attempt, if any)

        const nodes = 2 * N + 2
        const maxEdges = 2 * (N * 11 + 8)
        this.S = 2 * N
        this.T = 2 * N + 1
        this.head = new Int32Array(nodes).fill(-1)
        this.next = new Int32Array(maxEdges)
        this.to = new Int32Array(maxEdges)
        this.cap = new Int32Array(maxEdges)
        this.level = new Int32Array(nodes)
        this.it = new Int32Array(nodes)
        this.queue = new Int32Array(nodes)
        this.pathBuf = new Int32Array(nodes)
        this.ec = 0
        this.phase = 'build0b'
    }

    /** Second half of the setup: which tiles are the protected centre, and which may never be cut. */
    buildSetup2() {
        // CENTER = every protected tile fattened by `margin` tiles. Walls may never be placed here.
        const center = new Uint8Array(N)
        for (let i = 0; i < N; i++)
            if (this.walkable[i] && !isBorder(i) && this.baseDist[i] <= this.margin) center[i] = 1
        this.center = center

        // Tiles that may NOT be cut: the centre, the room edge, tiles touching an exit (unbuildable), and anything
        // beyond MAX_WALL_RANGE from the base.
        this.keepOpen = new Uint8Array(N)
        for (let i = 0; i < N; i++)
            this.keepOpen[i] =
                center[i] ||
                isBorder(i) ||
                (NEAR_EXIT_BLOCK && this.nearExit[i]) ||
                this.baseDist[i] > Math.max(MAX_WALL_RANGE, this.margin + 2)
                    ? 1
                    : 0

        this.edgeCursor = 0
        this.flow = 0
        this.phase = 'build1'
    }

    /**
     * The wall would be too big (or impossible) with everything inside: give up the least important asset
     * and redo the cut. Returns false when there is nothing left to drop.
     */
    dropAsset() {
        if (!this.included.length) return false
        this.dropped.push(this.included.shift())
        this.phase = 'build0'
        return true
    }

    addEdge(u, v, c) {
        const e = this.ec
        this.to[e] = v
        this.cap[e] = c
        this.next[e] = this.head[u]
        this.head[u] = e // forward
        this.to[e + 1] = u
        this.cap[e + 1] = 0
        this.next[e + 1] = this.head[v]
        this.head[v] = e + 1 // reverse
        this.ec += 2
    }

    /** Create the graph edges for a chunk of tiles per unit. */
    buildEdges() {
        const end = Math.min(N, this.edgeCursor + EDGE_TILES_PER_UNIT)
        for (let i = this.edgeCursor; i < end; i++) {
            if (!this.walkable[i]) continue
            this.addEdge(2 * i, 2 * i + 1, this.keepOpen[i] ? INF : 1) // the tile itself: cutting it costs 1
            if (this.center[i]) this.addEdge(this.S, 2 * i, INF) // source feeds the protected centre
            if (isBorder(i)) this.addEdge(2 * i + 1, this.T, INF) // room exits drain into the sink
            const x = xOf(i),
                y = yOf(i)
            for (const [dx, dy] of NEIGH8) {
                const nx = x + dx,
                    ny = y + dy
                if (!inRoom(nx, ny)) continue
                const j = idxOf(nx, ny)
                if (this.walkable[j]) this.addEdge(2 * i + 1, 2 * j, INF) // creeps can step from i to j
            }
        }
        this.edgeCursor = end
        if (end >= N) {
            this.bfsReset = true
            this.phase = 'bfs'
        }
    }

    // ------------------------------------------------------------ phases: bfs + dfs (Dinic's algorithm)
    /**
     * BFS from the source over edges with spare capacity; level[] = distance. It is chunked: each unit expands
     * BFS_NODES_PER_UNIT nodes. Done when the sink is unreachable (max flow reached).
     */
    levelGraph() {
        const { head, next, to, cap, level, queue, S, T } = this
        if (this.bfsReset) {
            level.fill(-1)
            level[S] = 0
            this.qh = 0
            this.qt = 0
            queue[this.qt++] = S
            this.bfsReset = false
        }
        let budget = BFS_NODES_PER_UNIT
        while (this.qh < this.qt && budget-- > 0) {
            const u = queue[this.qh++]
            for (let e = head[u]; e !== -1; e = next[e]) {
                const v = to[e]
                if (cap[e] > 0 && level[v] === -1) {
                    level[v] = level[u] + 1
                    queue[this.qt++] = v
                }
            }
        }
        if (this.qh < this.qt) return // not finished: continue next unit
        if (level[T] === -1) {
            this.phase = 'extract'
            return
        } // no more augmenting paths: max flow reached
        this.it.set(head) // reset the per-node "next edge to try" pointers
        this.dfsReset = true // and start the path search from scratch
        this.phase = 'dfs'
    }

    /** Push paths through the level graph until this unit's budget (augment count or search steps) is used up. */
    pushFlow() {
        if (this.dfsDepth === undefined || this.dfsReset) {
            this.dfsDepth = 0
            this.dfsU = this.S
            this.dfsReset = false
        }
        this.steps = DFS_STEPS_PER_UNIT
        for (let n = 0; n < AUGMENTS_PER_UNIT; n++) {
            const f = this.augmentOnce()
            if (f === -1) return // out of step budget: resume this path next unit
            if (f === 0) {
                this.bfsReset = true
                this.dfsReset = true
                this.phase = 'bfs'
                return
            } // blocked: next level graph
            if (f >= INF) {
                // protected area touches a room exit
                if (!this.dropAsset()) {
                    this.error = 'protected area touches a room exit'
                    this.done = true
                }
                this.dfsReset = true
                return
            }
            this.flow += f
        }
    }

    /**
     * Find ONE path source->sink along "downhill" edges and push the bottleneck amount along it.
     * Iterative (no recursion) so long paths can't overflow the call stack. Because the it[] pointers are
     * kept between calls, each edge is only ever scanned once per level graph, so a whole phase is cheap.
     * RESUMABLE: the half-built path (dfsDepth / dfsU / pathBuf) lives on the job, so when the step budget
     * runs out we simply return -1 and carry on from exactly the same place next unit.
     * Returns the flow pushed, 0 when no path remains in this level graph, or -1 when paused.
     */
    augmentOnce() {
        const { next, to, cap, level, it, S, T, pathBuf } = this
        let depth = this.dfsDepth,
            u = this.dfsU
        for (;;) {
            if (u === T) {
                let f = INF
                for (let k = 0; k < depth; k++) if (cap[pathBuf[k]] < f) f = cap[pathBuf[k]]
                for (let k = 0; k < depth; k++) {
                    cap[pathBuf[k]] -= f
                    cap[pathBuf[k] ^ 1] += f
                }
                this.dfsDepth = 0
                this.dfsU = S // next call starts a fresh path
                return f
            }
            let e = it[u]
            while (e !== -1 && !(cap[e] > 0 && level[to[e]] === level[u] + 1)) {
                e = next[e]
                if (--this.steps <= 0) {
                    it[u] = e
                    this.dfsDepth = depth
                    this.dfsU = u
                    return -1
                } // pause
            }
            it[u] = e
            if (--this.steps <= 0) {
                this.dfsDepth = depth
                this.dfsU = u
                return -1
            }
            if (e !== -1) {
                // go deeper
                pathBuf[depth++] = e
                u = to[e]
            } else {
                // dead end: forget this node and step back
                if (u === S) {
                    this.dfsDepth = 0
                    this.dfsU = S
                    return 0
                }
                level[u] = -1
                const back = pathBuf[--depth]
                u = to[back ^ 1]
                it[u] = next[back] // don't try the edge that led into the dead end again
            }
        }
    }

    // ------------------------------------------------------------ phase: extract (read the cut off the residual graph)
    extractCut() {
        // After the final BFS, level[v] !== -1 means "v is still reachable from the source" = source side.
        const { level } = this
        const cut = [],
            interior = new Uint8Array(N)
        for (let i = 0; i < N; i++) {
            if (!this.walkable[i]) continue
            const inSide = level[2 * i] !== -1,
                outSide = level[2 * i + 1] !== -1
            if (inSide && !outSide)
                cut.push(i) // the in->out edge is saturated: this tile is cut
            else if (inSide && outSide) interior[i] = 1 // fully inside the protected side
        }
        if (cut.length > MAX_WALL_TILES && this.dropAsset()) return // too many walls: leave something outside, retry
        this.cut = cut
        this.cutSet = new Uint8Array(N)
        for (const i of cut) this.cutSet[i] = 1
        this.interior = interior
        this.phase = 'gates'
    }

    // ------------------------------------------------------------ phases: gates + gates2
    findGates() {
        const anchor = this.input.plan.a
        // Plain BFS (8 directions) over walkable tiles from the anchor: shortest walking route to every tile.
        const prev = new Int32Array(N).fill(-2),
            dist = new Int16Array(N),
            queue = new Int32Array(N)
        let qh = 0,
            qt = 0
        prev[anchor] = -1
        queue[qt++] = anchor
        while (qh < qt) {
            const u = queue[qh++],
                x = xOf(u),
                y = yOf(u)
            for (const [dx, dy] of NEIGH8) {
                const nx = x + dx,
                    ny = y + dy
                if (!inRoom(nx, ny)) continue
                const v = idxOf(nx, ny)
                if (!this.walkable[v] || prev[v] !== -2) continue
                prev[v] = u
                dist[v] = dist[u] + 1
                queue[qt++] = v
            }
        }
        this.prevAll = prev
        this.distAll = dist

        // For each exit opening: walk the shortest route from the anchor to its nearest tile; the FIRST cut
        // tile on that route becomes that opening's gate (so our creeps always have a way out through a rampart).
        // If two openings sit behind the same chokepoint and would share one gate tile, the second opening gets
        // its OWN gate on a neighbouring cut tile when there is one - every exit gets a gate.
        const gates = new Set()
        this.exitRoute = [] // per opening: { group, best } or null if unreachable
        for (const group of this.exits) {
            const best = this.nearestExitTile(group)
            this.exitRoute.push(best === -1 ? null : { group, best })
            if (best === -1) continue // opening not connected to the base at all
            const route = this.routeTo(best) // anchor -> exit
            let placed = 0
            for (const t of route) {
                if (!this.cutSet[t]) continue
                let gate = t
                if (gates.has(gate)) {
                    // already another opening's gate: find a free neighbour
                    const alt = this.freeCutNeighbour(t, gates)
                    if (alt !== -1) gate = alt
                }
                gates.add(gate)
                if (++placed >= GATES_PER_EXIT) break
            }
        }
        this.gates = gates
        this.phase = 'gates2'
    }

    /** The tile of an exit opening that is closest to the anchor on foot (or -1 if the opening is unreachable). */
    nearestExitTile(group) {
        let best = -1
        for (const t of group)
            if (this.prevAll[t] !== -2 && (best === -1 || this.distAll[t] < this.distAll[best])) best = t
        return best
    }

    /** Shortest walking route anchor -> tile t, as a list of tiles. */
    routeTo(t) {
        const route = []
        for (let c = t; c !== -1; c = this.prevAll[c]) route.push(c)
        return route.reverse()
    }

    /** A cut tile next to `t` that is not a gate yet (or -1). */
    freeCutNeighbour(t, gates) {
        const x = xOf(t),
            y = yOf(t)
        for (const [dx, dy] of NEIGH8) {
            if (!inRoom(x + dx, y + dy)) continue
            const n = idxOf(x + dx, y + dy)
            if (this.cutSet[n] && !gates.has(n)) return n
        }
        return -1
    }

    /**
     * SAFETY NET: walk from the anchor treating WALLS (cut tiles that are not gates) as solid. Every exit opening
     * that is reachable on open ground must still be reachable now. If one is not (e.g. the shortest route
     * crossed the line more than once), the first blocking wall on its route is turned into a gate. Repeats
     * until every opening is served.
     */
    verifyGates() {
        const anchor = this.input.plan.a
        this.gatePass = (this.gatePass || 0) + 1 // one pass per unit; up to 8 passes
        const seen = new Uint8Array(N),
            q = [anchor]
        seen[anchor] = 1
        for (let h = 0; h < q.length; h++) {
            const u = q[h],
                x = xOf(u),
                y = yOf(u)
            for (const [dx, dy] of NEIGH8) {
                const nx = x + dx,
                    ny = y + dy
                if (!inRoom(nx, ny)) continue
                const v = idxOf(nx, ny)
                if (seen[v] || !this.walkable[v] || (this.cutSet[v] && !this.gates.has(v))) continue // walls block us too
                seen[v] = 1
                q.push(v)
            }
        }
        let added = false
        for (const r of this.exitRoute) {
            if (!r || r.group.some(t => seen[t])) continue // unreachable on open ground, or already served
            const blocker = this.routeTo(r.best).find(t => this.cutSet[t] && !this.gates.has(t))
            if (blocker !== undefined) {
                this.gates.add(blocker)
                added = true
            }
        }
        if (added) this.fixedGates = (this.fixedGates || 0) + 1
        if (!added || this.gatePass >= 8) this.phase = 'towerprep' // otherwise check again next unit
    }

    // ------------------------------------------------------------ phase: towerprep
    prepareTowers() {
        this.line = this.cut.slice().sort((a, b) => a - b) // every tile the towers should cover
        this.L = this.line.length
        this.tables = new Map() // tile -> Float32Array(L) of damage to each line tile
        this.singleJ = new Map() // tile -> coverage score of one tower there
        this.scratch = new Float32Array(this.L) // reusable buffer (no allocation in hot loops)

        // OUTSIDE tiles = walkable tiles on the enemy side of the line (not inside, not the line itself). A ranged
        // attacker can stand on any of them, so outsideDist[i] = how many tiles (Chebyshev) tile i is from the
        // nearest one. Computed with a multi-source BFS that ignores terrain.
        this.outsideDist = new Int16Array(N).fill(-1)
        const oq = new Int32Array(N)
        let oh = 0,
            ot = 0
        for (let i = 0; i < N; i++) {
            if (this.walkable[i] && !this.interior[i] && !this.cutSet[i]) {
                this.outsideDist[i] = 0
                oq[ot++] = i
            }
        }
        while (oh < ot) {
            const u = oq[oh++],
                x = xOf(u),
                y = yOf(u)
            for (const [dx, dy] of NEIGH8) {
                const nx = x + dx,
                    ny = y + dy
                if (!inRoom(nx, ny)) continue
                const v = idxOf(nx, ny)
                if (this.outsideDist[v] === -1) {
                    this.outsideDist[v] = this.outsideDist[u] + 1
                    oq[ot++] = v
                }
            }
        }

        this.phase = 'towerprep2'
    }

    /** Second half of the tower preparation: which tiles are free AND safe for towers. */
    prepareTowers2() {
        // Free tiles: inside the walls, not planned/obstructed, not on the line, away from the room edge, and
        // SAFE: at least TOWER_SAFE_DIST from every tile an enemy can stand on (so ranged attackers outside the
        // walls can't hit the towers, their container or their link).
        this.free = []
        this.freeSet = new Uint8Array(N)
        for (let i = 0; i < N; i++) {
            if (!this.interior[i] || this.occupied[i] || this.cutSet[i] || !this.walkable[i]) continue
            const x = xOf(i),
                y = yOf(i)
            if (x < 2 || y < 2 || x > SIZE - 3 || y > SIZE - 3) continue
            if (this.outsideDist[i] !== -1 && this.outsideDist[i] < TOWER_SAFE_DIST) continue // exposed to ranged attacks
            if (this.nearObstacle[i]) continue // a harvesting / upgrading spot
            this.free.push(i)
            this.freeSet[i] = 1
        }

        // HUB SITES: free tiles touching a source's / the controller's container or link, or the core link.
        // hubSites maps tile -> the hub tile(s) it touches; hubKind maps hub tile -> 'source' | 'controller' | 'core'.
        this.hubKind = new Map()
        this.hubSites = new Map()
        const addHub = (h, kind) => {
            if (h === undefined || h === null || h < 0) return
            this.hubKind.set(h, kind)
            const hx = xOf(h),
                hy = yOf(h)
            for (const [dx, dy] of NEIGH8) {
                if (!inRoom(hx + dx, hy + dy)) continue
                const n = idxOf(hx + dx, hy + dy)
                if (!this.freeSet[n]) continue
                if (!this.hubSites.has(n)) this.hubSites.set(n, [])
                this.hubSites.get(n).push(h)
            }
        }
        for (const a of this.included) for (const h of a.hubs) addHub(h, a.kind) // only assets that are INSIDE the walls
        const roles = this.input.plan.roles
        addHub(roles ? roles.coreLink : -1, 'core') // the link by the storage
        this.hubSiteList = Array.from(this.hubSites.keys())
        this.finalists = null
        this.roads = this.input.plan.s[STRUCTURE_ROAD] || []
        // Prime cluster sites: only free tiles reasonably close to the anchor (keeps the search small and the cluster by the core).
        this.clusterSites = this.free.filter(i => cheb(i, this.input.plan.a) <= CLUSTER_MAX_FROM_ANCHOR)
        this.cands = [] // scored cluster sites
        this.candCursor = 0
        this.phase = 'reach0'
    }

    /** Baseline road connectivity (before any tower), used later to make sure towers never cut the base in two. */
    baselineReach() {
        this.baseReach = this.reachFromRoads(null)
        this.phase = 'cand'
    }

    /** Damage table for a tower on tile t: damage[k] = damage it deals to line tile k. Cached. */
    table(t) {
        let tab = this.tables.get(t)
        if (!tab) {
            tab = new Float32Array(this.L)
            for (let k = 0; k < this.L; k++) tab[k] = DAMAGE_BY_RANGE[cheb(t, this.line[k])]
            this.tables.set(t, tab)
        }
        return tab
    }

    /**
     * Coverage score of a total-damage array: sum of ln(1 + damage). The logarithm makes the score care
     * about the WEAKEST parts of the wall (raising 0 -> 150 helps a lot, 1500 -> 1650 barely), which is
     * exactly the "evenly covered" goal.
     */
    score(sum) {
        let j = 0
        for (let k = 0; k < this.L; k++) j += Math.log(1 + sum[k])
        return j
    }

    /**
     * MAX-MIN coverage of a total-damage array (optionally plus one more tower's table), written into out[]:
     *   out[0..2] = the three WEAKEST wall tiles' damage (lowest first), out[3] = sum of ln(1 + damage).
     * Allocation free. Compare two results with isBetter(): weakest tile first, then 2nd, then 3rd, then average.
     */
    coverage(out, sum, tab) {
        let m1 = Infinity,
            m2 = Infinity,
            m3 = Infinity,
            ln = 0
        for (let k = 0; k < this.L; k++) {
            const v = tab ? sum[k] + tab[k] : sum[k]
            ln += Math.log(1 + v)
            if (v < m1) {
                m3 = m2
                m2 = m1
                m1 = v
            } else if (v < m2) {
                m3 = m2
                m2 = v
            } else if (v < m3) {
                m3 = v
            }
        }
        if (this.L === 0) {
            m1 = m2 = m3 = 0
        } else {
            if (m2 === Infinity) m2 = m1
            if (m3 === Infinity) m3 = m2
        }
        out[0] = m1
        out[1] = m2
        out[2] = m3
        out[3] = ln
    }

    /** Add tower table of tile t into the running total. */
    addTable(sum, t) {
        const tab = this.table(t)
        for (let k = 0; k < this.L; k++) sum[k] += tab[k]
    }

    singleScore(t) {
        let j = this.singleJ.get(t)
        if (j === undefined) {
            j = this.score(this.table(t))
            this.singleJ.set(t, j)
        }
        return j
    }

    /** Set of tiles reachable on foot from the nearest-to-anchor road, treating `blockers` as solid. */
    reachFromRoads(blockers) {
        const seen = new Uint8Array(N)
        if (!this.roads.length) return seen
        const blocked = blockers ? new Set(blockers) : null
        const q = [this.roads[0]]
        seen[this.roads[0]] = 1
        for (let h = 0; h < q.length; h++) {
            const u = q[h],
                x = xOf(u),
                y = yOf(u)
            for (const [dx, dy] of NEIGH8) {
                const nx = x + dx,
                    ny = y + dy
                if (!inRoom(nx, ny)) continue
                const v = idxOf(nx, ny)
                if (seen[v] || this.solid[v] || (blocked && blocked.has(v))) continue
                seen[v] = 1
                q.push(v)
            }
        }
        return seen
    }

    /**
     * Is tile m usable by a hauler in this reach map? An open tile (container, road...) just has to be reached; a solid
     * one (a link) has to have a reachable neighbour to stand on.
     */
    tileServed(m, seen) {
        if (!this.solid[m]) return !!seen[m]
        const x = xOf(m),
            y = yOf(m)
        for (const [dx, dy] of NEIGH8) {
            if (inRoom(x + dx, y + dy) && seen[idxOf(x + dx, y + dy)]) return true
        }
        return false
    }

    /**
     * True if putting solid `blockers` (new towers/links) on the map leaves every road reachable AND every tile in
     * mustReach (containers/links the haulers use) still reachable if it was reachable before. So a tower can never
     * wall in a hub or cut the road network.
     */
    keepsBaseConnected(blockers, mustReach) {
        const after = this.reachFromRoads(blockers)
        for (const r of this.roads) if (this.baseReach[r] && !after[r]) return false
        if (mustReach)
            for (const m of mustReach)
                if (m >= 0 && this.tileServed(m, this.baseReach) && !this.tileServed(m, after)) return false
        return true
    }

    // ------------------------------------------------------------ phase: cand (score every possible prime cluster site)
    scoreCandidates() {
        const end = Math.min(this.clusterSites.length, this.candCursor + CANDIDATES_PER_UNIT)
        for (; this.candCursor < end; this.candCursor++) {
            const c = this.clusterSites[this.candCursor] // c = the container tile
            const x = xOf(c),
                y = yOf(c)
            const nb = []
            for (const [dx, dy] of NEIGH8) {
                const nx = x + dx,
                    ny = y + dy
                if (inRoom(nx, ny) && this.freeSet[idxOf(nx, ny)]) nb.push(idxOf(nx, ny))
            }
            if (nb.length < 4) continue // need 3 towers + 1 link around the container
            // best neighbours make the towers; the weakest remaining neighbour becomes the link
            nb.sort((a, b) => this.singleScore(b) - this.singleScore(a) || a - b)
            const towers = nb.slice(0, 3)
            const link = nb[nb.length - 1]
            const slots = nb.slice(3, nb.length - 1) // still-free neighbours: homes for sub towers
            const sum = this.scratch
            sum.fill(0)
            for (const t of towers) {
                const tab = this.table(t)
                for (let k = 0; k < this.L; k++) sum[k] += tab[k]
            }
            this.cands.push({ container: c, towers, link, slots, J: this.score(sum) })
        }
        if (this.candCursor >= this.clusterSites.length) {
            this.cands.sort((a, b) => b.J - a.J || a.container - b.container)
            this.verifyCursor = 0
            this.phase = 'pick'
        }
    }

    // ------------------------------------------------------------ phase: pick (choose cluster finalists)
    /**
     * Walk down the cluster sites (best prefilter score first) and keep the first CLUSTER_FINALISTS that (a) are
     * reachable, (b) don't cut the road network, and (c) aren't near-duplicates of an earlier finalist. One site is
     * tested per unit (each test is a flood fill).
     */
    pickCluster() {
        if (!this.finalists) this.finalists = []
        const limit = Math.min(this.cands.length, CLUSTER_VERIFY_MAX)
        if (this.finalists.length < CLUSTER_FINALISTS && this.verifyCursor < limit) {
            const cand = this.cands[this.verifyCursor++]
            const duplicate = this.finalists.some(f => cheb(f.container, cand.container) < CLUSTER_SEPARATION)
            if (
                !duplicate &&
                this.baseReach[cand.container] &&
                this.keepsBaseConnected(cand.towers.concat([cand.link]), [cand.container])
            )
                this.finalists.push(cand)
            return
        }
        if (!this.finalists.length && this.margin < CENTER_MARGIN_MAX) {
            // Not enough free space inside the walls for a cluster: fatten the protected area and redo the cut.
            this.margin++
            this.finalists = null
            this.phase = 'build0'
            return
        }
        this.simCursor = 0
        this.phase = 'sim'
    }

    // ------------------------------------------------------------ phase: sim (which cluster gives the best final result?)
    /**
     * For each finalist cluster, pretend to place its sub towers at the best hub sites (and the slots beside the
     * cluster container) and score the finished layout. The finalist with the strongest weakest-wall-tile wins.
     * One finalist per unit.
     */
    simulateFinalists() {
        if (this.simCursor < this.finalists.length) {
            const f = this.finalists[this.simCursor++]
            f.sim = this.simulate(f)
            return
        }
        let best = null
        for (const f of this.finalists) if (!best || isBetter(f.sim.score, best.sim.score)) best = f
        this.prime = best // null when no cluster fits anywhere
        this.startSubs()
    }

    /** Greedy sub-tower placement for one candidate cluster, preferred sites only. Returns { score }. */
    simulate(f) {
        const sum = new Float32Array(this.L)
        for (const t of f.towers) this.addTable(sum, t)
        const blockers = f.towers.concat([f.link])
        const used = new Set(blockers)
        used.add(f.container)
        const tried = new Set()
        const out = new Float64Array(4),
            best = new Float64Array(4)
        const sites = this.hubSiteList.concat(f.slots)
        for (let n = Math.max(0, this.input.towerCap - 3); n > 0; n--) {
            let pick = -1
            for (let attempt = 0; attempt < 6 && pick === -1; attempt++) {
                let bt = -1
                for (const t of sites) {
                    // best untried preferred site
                    if (used.has(t) || tried.has(t)) continue
                    this.coverage(out, sum, this.table(t))
                    if (bt === -1 || isBetter(out, best)) {
                        best.set(out)
                        bt = t
                    }
                }
                if (bt === -1) break // no preferred site left
                const must = [f.container].concat(this.hubSites.get(bt) || [])
                if (this.keepsBaseConnected(blockers.concat([bt]), must)) pick = bt
                else tried.add(bt)
            }
            if (pick === -1) break
            this.addTable(sum, pick)
            blockers.push(pick)
            used.add(pick)
        }
        const score = new Float64Array(4)
        this.coverage(score, sum, null)
        return { score }
    }

    /** Set up the running totals for the winning cluster and start placing the real sub towers. */
    startSubs() {
        this.sum = new Float32Array(this.L)
        this.towers = [] // [{ tile, role, mode, near }] in build order
        this.used = new Set()
        this.blockers = []
        if (this.prime) {
            for (const t of this.prime.towers) {
                this.addTable(this.sum, t)
                this.towers.push({ tile: t, role: 'prime' })
                this.used.add(t)
                this.blockers.push(t)
            }
            this.used.add(this.prime.link)
            this.blockers.push(this.prime.link)
            this.used.add(this.prime.container)
            this.slots = this.prime.slots.slice()
        } else {
            this.slots = []
        }
        this.subsLeft = Math.max(0, this.input.towerCap - this.towers.length)
        this.subCursor = 0
        this.prefOut = new Float64Array(4)
        this.farOut = new Float64Array(4)
        this.tmpOut = new Float64Array(4)
        this.phase = 'subs'
    }

    // ------------------------------------------------------------ phase: subs (the remaining towers)
    /**
     * One sub tower at a time. Scan the free tiles (SUB_TILES_PER_UNIT per unit), remembering the best PREFERRED
     * site (hub sites + slots beside the prime container) and the best spot ANYWHERE ELSE, judged by the max-min
     * coverage. A non-hub spot only wins if it raises the weakest wall tile by SUB_FAR_GAIN, or if no preferred
     * site is left. A chosen site must also pass the "doesn't block anything" test.
     */
    placeSubTowers() {
        if (this.subsLeft <= 0) {
            this.phase = 'finish'
            return
        }
        if (this.subCursor === 0) {
            this.bestPref = -1
            this.bestFar = -1
            this.prefSet = new Set(this.slots.concat(this.hubSiteList))
        }
        const end = Math.min(this.free.length, this.subCursor + SUB_TILES_PER_UNIT)
        for (; this.subCursor < end; this.subCursor++) {
            const t = this.free[this.subCursor]
            if (this.used.has(t)) continue
            const preferred = this.prefSet.has(t)
            // Non-hub spots are sampled on a checkerboard (half the tiles): neighbours score almost the same, so this
            // halves the CPU for a negligible loss. Preferred sites are always scored.
            if (!preferred && (xOf(t) + yOf(t)) & 1) continue
            this.coverage(this.tmpOut, this.sum, this.table(t))
            if (preferred) {
                if (this.bestPref === -1 || isBetter(this.tmpOut, this.prefOut)) {
                    this.prefOut.set(this.tmpOut)
                    this.bestPref = t
                }
            } else if (this.bestFar === -1 || isBetter(this.tmpOut, this.farOut)) {
                this.farOut.set(this.tmpOut)
                this.bestFar = t
            }
        }
        if (this.subCursor < this.free.length) return // keep scanning next unit
        this.subCursor = 0

        const farWins =
            this.bestFar !== -1 &&
            (this.bestPref === -1 || (this.farOut[0] - this.prefOut[0]) / Math.max(this.prefOut[0], 1) >= SUB_FAR_GAIN)
        const order = farWins ? [this.bestFar, this.bestPref] : [this.bestPref, this.bestFar]
        let pick = -1
        for (const t of order) {
            if (t === -1) continue
            // never let a tower cut the base in two, wall in a hub, or trap the prime container
            const must = (this.prime ? [this.prime.container] : []).concat(this.hubSites.get(t) || [])
            if (!this.keepsBaseConnected(this.blockers.concat([t]), must)) {
                this.used.add(t)
                return
            } // skip it, rescan
            pick = t
            break
        }
        if (pick === -1) {
            this.subsLeft = 0
            this.phase = 'finish'
            return
        } // nowhere left to put a tower

        this.addTable(this.sum, pick)
        const hubs = this.hubSites.get(pick)
        const mode = this.slots.indexOf(pick) !== -1 ? 'cluster' : hubs ? 'hub' : 'remote'
        this.towers.push({ tile: pick, role: 'sub', mode, near: hubs ? this.hubKind.get(hubs[0]) : undefined })
        this.used.add(pick)
        this.blockers.push(pick)
        this.slots = this.slots.filter(s => s !== pick)
        this.subsLeft--
    }

    /** Damage on the three weakest wall tiles (rounded). */
    weakestThree() {
        const out = new Float64Array(4)
        this.coverage(out, this.sum, null)
        return [Math.round(out[0]), Math.round(out[1]), Math.round(out[2])]
    }

    /** Distance from the nearest outside tile to the nearest protected tile (>= 4 means safe from range-3 attacks). */
    minStructOutside() {
        let best = Infinity
        const tiles = this.baseProtected.concat(...this.included.map(a => a.tiles))
        for (const t of tiles) if (this.outsideDist[t] !== -1 && this.outsideDist[t] < best) best = this.outsideDist[t]
        return best === Infinity ? -1 : best
    }

    // ------------------------------------------------------------ phase: finish (assemble the saved result)
    finish() {
        const damageAt = new Map()
        for (let k = 0; k < this.L; k++) damageAt.set(this.line[k], this.sum[k])
        let min = Infinity,
            total = 0
        for (let k = 0; k < this.L; k++) {
            if (this.sum[k] < min) min = this.sum[k]
            total += this.sum[k]
        }

        // walls sorted best-covered first (they get built first)
        const walls = this.line
            .filter(t => !this.gates.has(t))
            .sort((a, b) => damageAt.get(b) - damageAt.get(a) || a - b)
        const gates = Array.from(this.gates).sort((a, b) => a - b)

        this.result = {
            v: DEFENSE_VERSION,
            margin: this.margin,
            walls, // constructed walls (impassable)
            gates, // ramparts in the line (our creeps pass)
            towers: this.towers.map(t => t.tile), // build order: prime cluster first, then subs
            container: this.prime ? this.prime.container : -1, // the prime cluster's container
            link: this.prime ? this.prime.link : -1, // ... and its link
            subs: this.towers.filter(t => t.role === 'sub').map(t => ({ tile: t.tile, mode: t.mode, near: t.near })), // mode: cluster | hub | remote
            inside: this.included.map(a => a.kind), // assets enclosed by the wall line
            outside: this.dropped.map(a => ({ kind: a.kind, tile: a.tiles[0] })), // assets left OUTSIDE (too costly / impossible)
            stats: {
                cut: this.line.length,
                flow: this.flow,
                minDamage: this.L ? Math.round(min) : 0, // damage on the WEAKEST wall tile (what we maximise)
                weakest: this.weakestThree(),
                avgDamage: this.L ? Math.round(total / this.L) : 0,
                openings: this.exitRoute.length, // exit openings in the room
                openingsServed: this.exitRoute.filter(r => r).length, // ... that are connected to the base (each has a gate)
                gatesAdded: this.fixedGates || 0, // extra gates the safety net had to add
                structSafeDist: this.minStructOutside(), // closest an outside tile gets to a protected structure
                freeTiles: this.free.length,
                clusterSites: this.cands.length,
                units: this.units,
            },
        }
        this.done = true
    }
}

// ---------------------------------------------------------------- pure entry point (tests / console)
/** Run the whole job in one go (no CPU slicing). Handy for tests and the console. */
function planDefense(input) {
    const job = new DefenseJob(input)
    job.advance(() => true)
    if (job.error) return { error: job.error }
    return job.result
}

// ---------------------------------------------------------------- game glue (memory, scheduling, CPU guards)
const cpuNow = () => (typeof Game !== 'undefined' && Game.cpu && Game.cpu.getUsed ? Game.cpu.getUsed() : Date.now())

/** Memory.rooms[room].planner - shared with RoomPlanner. Never creates the folder (RoomPlanner owns that). */
function plannerMem(roomName) {
    const rooms = Memory.rooms
    return rooms && rooms[roomName] && rooms[roomName][PLANNER_KEY]
}

let active = null // the one job in progress: { roomName, planTick, job, ticks, cpu, worst }
let lastWarn = -1000

function warnOnce(msg) {
    // keep logs quiet: at most one warning every 500 ticks
    if (Game.time - lastWarn < 500) return
    lastWarn = Game.time
    console.log(`[WallPlanner] ${msg}`)
}

/**
 * Call once per tick per owned room. Does nothing unless the room needs a (re)computed defence,
 * and then only spends SLICE_CPU ms per tick on it.
 */
function run(roomName) {
    const room = Game.rooms[roomName]
    if (!room || !room.controller || !room.controller.my || room.controller.level < MIN_RCL) return
    const pm = plannerMem(roomName)
    if (!pm || !pm.plan) return // buildings not planned yet: nothing to protect
    if (!pm.plan.towersByWallPlanner) return // an old layout that will be replanned: don't waste CPU on it

    // already done for this exact building plan?
    const d = pm.defense
    if (d && d.v === DEFENSE_VERSION && d.planTick === pm.planTick) {
        if (d.done) return
        if (d.errorAt !== undefined && Game.time - d.errorAt < RETRY_AFTER) return // cooling down after an error
    }
    if (Game.time <= pm.planTick) return // never on the same tick the plan was made

    // CPU guards
    if (Game.cpu.bucket < MIN_BUCKET) {
        warnOnce(`${roomName}: waiting for CPU bucket (${Game.cpu.bucket}/${MIN_BUCKET})`)
        return
    }
    const tickCap = (Game.cpu.tickLimit || Game.cpu.limit) * TICK_CPU_FRACTION
    const startUsed = cpuNow()
    if (startUsed >= tickCap) return // this tick is already busy
    if (active && active.roomName !== roomName) {
        if (active.planTick === (plannerMem(active.roomName) || {}).planTick) return // another room is mid-job
        active = null // that job went stale
    }
    if (active && active.planTick !== pm.planTick) active = null // the building plan changed: start over

    try {
        if (!active) {
            const mineral = room.find(FIND_MINERALS)[0]
            const obstacles = room
                .find(FIND_SOURCES)
                .map(s => idxOf(s.pos.x, s.pos.y))
                .concat(mineral ? [idxOf(mineral.pos.x, mineral.pos.y)] : [], [
                    idxOf(room.controller.pos.x, room.controller.pos.y),
                ])
            // Things worth keeping inside the walls: each source (+ its container and link), the mineral, the controller.
            const roles = pm.plan.roles || {}
            const assets = []
            room.find(FIND_SOURCES).forEach(src => {
                const si = idxOf(src.pos.x, src.pos.y)
                const r = (roles.sources || []).find(x => x.source === si) || {}
                assets.push({
                    kind: 'source',
                    tiles: [si, r.container, r.link].filter(t => t !== undefined && t >= 0),
                    hubs: [r.container, r.link],
                }) // container/link = sub-tower homes
            })
            if (mineral)
                assets.push({
                    kind: 'mineral',
                    tiles: [idxOf(mineral.pos.x, mineral.pos.y), roles.mineral ? roles.mineral.container : -1],
                })
            assets.push({
                kind: 'controller',
                tiles: [
                    idxOf(room.controller.pos.x, room.controller.pos.y),
                    roles.controller ? roles.controller.container : -1,
                    roles.controller ? roles.controller.link : -1,
                ],
                hubs: roles.controller ? [roles.controller.container, roles.controller.link] : [],
            })
            active = {
                roomName,
                planTick: pm.planTick,
                ticks: 0,
                cpu: 0,
                worst: 0,
                job: new DefenseJob({
                    terrain: room.getTerrain(),
                    plan: pm.plan,
                    obstacles,
                    assets,
                    towerCap: CONTROLLER_STRUCTURES[STRUCTURE_TOWER][8],
                }),
            }
        }
        const sliceEnd = Math.min(startUsed + SLICE_CPU, tickCap)
        active.job.advance(() => cpuNow() < sliceEnd)

        const spent = cpuNow() - startUsed
        active.ticks++
        active.cpu += spent
        active.worst = Math.max(active.worst, spent)
        if (spent > SLICE_CPU * 2)
            warnOnce(
                `${roomName}: slice used ${spent.toFixed(1)} ms in phase '${active.job.phase}' (budget ${SLICE_CPU})`
            )

        const job = active.job
        if (job.error) throw new Error(job.error)
        if (job.done) {
            pm.defense = Object.assign({}, job.result, { planTick: pm.planTick, done: true })
            console.log(
                `[WallPlanner] ${roomName}: defence planned in ${active.ticks} tick(s), ${active.cpu.toFixed(1)} ms CPU ` +
                    `(worst slice ${active.worst.toFixed(1)} ms): ${job.result.walls.length} walls, ${job.result.gates.length} gates, ` +
                    `${job.result.towers.length} towers, margin ${job.result.margin}, min damage ${job.result.stats.minDamage}` +
                    (job.result.outside.length
                        ? `; LEFT OUTSIDE the walls: ${job.result.outside.map(o => o.kind).join(', ')}`
                        : '; sources, mineral and controller are inside')
            )
            active = null
        }
    } catch (err) {
        console.log(`[WallPlanner] ${roomName}: ERROR ${err && err.stack ? err.stack : err}`)
        pm.defense = { v: DEFENSE_VERSION, planTick: pm.planTick, done: false, errorAt: Game.time, error: String(err) }
        active = null
    }
}

// ---------------------------------------------------------------- console helpers
function status(roomName) {
    const pm = plannerMem(roomName)
    if (!pm || !pm.plan) return `${roomName}: no building plan yet`
    const d = pm.defense
    if (active && active.roomName === roomName) {
        return `${roomName}: running, phase '${active.job.phase}', ${active.ticks} tick(s), ${active.cpu.toFixed(1)} ms so far`
    }
    if (!d) return `${roomName}: waiting to start`
    if (d.error)
        return `${roomName}: error (${d.error}), retry in ${Math.max(0, RETRY_AFTER - (Game.time - d.errorAt))} ticks`
    return (
        `${roomName}: done. walls ${d.walls.length}, gates ${d.gates.length}, towers ${d.towers.length}, ` +
        `min damage ${d.stats.minDamage}, avg ${d.stats.avgDamage}, inside: ${(d.inside || []).join(',') || '-'}, outside: ${(d.outside || []).map(o => o.kind).join(',') || '-'}`
    )
}

/** Throw away the stored defence so it is recomputed (e.g. after changing tunables). */
function redo(roomName) {
    const pm = plannerMem(roomName)
    if (pm) delete pm.defense
    if (active && active.roomName === roomName) active = null
    return `${roomName}: defence will be recomputed`
}

/** RoomVisual overlay: walls (red), gates (green), towers, container and link. */
function draw(roomName) {
    const pm = plannerMem(roomName)
    const d = pm && pm.defense
    if (!d || !d.done) return
    const vis = new RoomVisual(roomName)
    for (const t of d.walls) vis.rect(xOf(t) - 0.5, yOf(t) - 0.5, 1, 1, { fill: '#ff4444', opacity: 0.45 })
    for (const t of d.gates) vis.rect(xOf(t) - 0.5, yOf(t) - 0.5, 1, 1, { fill: '#44ff44', opacity: 0.55 })
    d.towers.forEach((t, k) => vis.text(k < 3 ? 'T' : 't', xOf(t), yOf(t) + 0.2, { font: 0.6, color: '#ffaa00' }))
    if (d.container >= 0) vis.text('c', xOf(d.container), yOf(d.container) + 0.2, { font: 0.6, color: '#ffffff' })
    if (d.link >= 0) vis.text('l', xOf(d.link), yOf(d.link) + 0.2, { font: 0.6, color: '#66ccff' })
}

module.exports = { run, status, redo, draw, planDefense, DefenseJob, DEFENSE_VERSION }

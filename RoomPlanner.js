'use strict';

/**
 * RoomPlanner.js - dynamic room layout for Screeps (replaces the fixed 13x13 bunker template)
 *
 * Three layers, kept separate on purpose:
 *   1. planRoom()      PURE function. terrain + source/controller/mineral positions -> layout.
 *                      Runs once per room, result cached in Memory.rooms[name].planner.plan.
 *   2. buildRoom()     Every TICK_INTERVAL ticks: reads the cached plan and places construction
 *                      sites, respecting RCL caps (CONTROLLER_STRUCTURES) and site limits.
 *   3. drawPlan()      Optional RoomVisual overlay so you can eyeball the layout.
 *
 * Memory: EVERYTHING this module (and WallPlanner) keeps lives in ONE folder per room:
 *     Memory.rooms[roomName].planner = {
 *       plan,        the building layout from planRoom()
 *       planTick,    the tick that layout was created (WallPlanner uses it to know its defence is current)
 *       lastRun,     the last tick buildRoom() ran for this room
 *       defense      walls / gates / towers, written by WallPlanner.js (see that file)
 *     }
 *   (Older versions used Memory.rooms[name].plan and .planLastRun; plannerMem() moves them over once.)
 *
 * Defence: walls, gate ramparts and ALL towers are planned by WallPlanner.js, not here. planRoom()
 *   leaves the towers out; buildRoom() places whatever WallPlanner decided (towers, the tower
 *   container + link, the wall line) once that plan is ready.
 *
 * Layout strategy ("checkerboard field"):
 *   - Pick an anchor (storage tile): open area, close to sources/controller. A flag named
 *     "C.<roomName>" still works as a manual override.
 *   - Tiles with the same parity as the anchor hold structures; the other parity holds roads.
 *     Every structure is orthogonally touched by roads, and roads connect diagonally.
 *   - Tiles are claimed nearest-first by walking distance, so the base grows organically
 *     around walls/swamps instead of needing a 13x13 clear square.
 *   - Compact clusters that need exact geometry (labs) use a small stamp that is *searched for*
 *     (2 orientations) instead of being pinned to a flag.
 *
 * Remote infrastructure ("roles"):
 *   The planner is the single source of truth for WHICH container/link serves WHICH source,
 *   the controller and the mineral. That mapping is saved in plan.roles and exposed to the rest
 *   of the bot through getInfra(room) (see bottom of file). CondensedMain.findLinks and
 *   CondensedMain.updateRoomSources read it instead of searching the room themselves.
 *   Container tiles are SCORED (not just "closest to the base"): short haul back to the anchor,
 *   far from room exits by walking distance, and plenty of open space around them.
 *   Containers/links that already stand in a sensible spot are ADOPTED, never duplicated.
 *
 *  S Spawn       e Ext      T Tower      W Storage
 *  l Link        L Lab      t Terminal   F Factory
 *  P PowerSpawn  o Observer N Nuker
 *  c Container   X Extractor · Road
 * 
 */

// ---------------------------------------------------------------- tunables
const PLAN_VERSION     = 16;     // bump to force every room to re-plan (15 = towers/walls moved to WallPlanner, memory in one folder)
const TICK_INTERVAL    = 73;
const REPLAN_MIN_BUCKET = 5000;  // only (re)plan a room when the CPU bucket is at least half full
const MAX_SITES_PER_RUN = 10;    // sites this module keeps alive per room
const MAX_GAME_SITES   = 100;    // hard game limit
const TRUNK_ROAD_MIN_RCL = 2;
const ROAD_MIN_RCL     = 3;
const RAMPART_MIN_RCL  = 4;
const DEFENSE_SITE_CAP = 15;       // at most this many wall/rampart sites alive at once, so a long wall line can't starve other structures
const DEFENSE_LINE_MIN_RCL = 4;  // the wall line / gates (planned by WallPlanner) start being built at this controller level
const PLANNER_KEY      = 'planner';   // Memory.rooms[room][PLANNER_KEY]; must match WallPlanner.js
const MINERAL_CONTAINER_MIN_RCL = 6;
const ANCHOR_ON_SPAWN  = true;   // existing spawn (and no storage/flag) -> anchor = spawn + (1,1)
const SWAMP_COST       = 3;
const OPEN_RADIUS      = 6;      // anchor scoring: count walkable tiles in this radius ...
const OPEN_WEIGHT      = 0.3;    // ... and subtract this * count from the walking-distance score
const LAB_MIN_DIST     = 4;      // keep the lab stamp at least this far (walking) from the anchor
const FIELD_MIN        = 6;      // base tiles stay inside [FIELD_MIN, FIELD_MAX] (away from exits)
const FIELD_MAX        = 43;
const ANCHOR_EXIT_WEIGHT = 2;    // anchor scoring: reward each step of walking distance from room exits (defensible core)
const ANCHOR_EXIT_CAP  = 90;
const CLUSTER_SIZE     = 9;     // extensions in the SMALLEST pod (a 4-road pod); used to decide when to stop adding pods
// ---- Extension pods --------------------------------------------------------------------------------
// A pod is simply a DIAGONAL ROAD (the "spine") with extensions packed on both sides of it:
//
//        R e e         R = spine road      Every spine tile touches up to 6 extensions, so a creep
//        e R e e       e = extension       walking the spine can fill them all without leaving it.
//          e R e e
//            e R e     A spine of L roads fits in an LxL box and holds 4L-6 extensions
//              e e R   (L=4 -> 10, L=5 -> 14, L=6 -> 18, L=7 -> 22, L=8 -> 26).
//
// The two ends of the spine are exits. To stop long pods turning into one congested dead-end corridor,
// there must be an exit at least every POD_EXIT_EVERY roads, so longer pods get extra SIDE DOORS: one
// extension tile next to the spine becomes a road tile that opens to the outside (that costs one
// extension per door). Pods may be any length from POD_MIN_LEN to POD_MAX_LEN.
const POD_MIN_LEN    = 4;
const POD_MAX_LEN    = 8;
const POD_EXIT_EVERY = 3;       // max number of spine steps between two exits
// Bigger pods need fewer roads per extension and fewer exits, so each extension in a pod lowers its score
// by this much (same units as walking distance). 2 means "one more extension is worth being 2 steps further out".
const POD_SIZE_BONUS = 2;

// Build the two variants (the diagonal and its mirror image) of a pod with a spine of L roads.
function makePodVariants(L) {
  // How many side doors? Exits sit at both ends already, so we need ceil((L-1)/POD_EXIT_EVERY)-1 more.
  const doorCount = Math.max(0, Math.ceil((L - 1) / POD_EXIT_EVERY) - 1);
  // Spread the doors evenly along the spine (spine index of the tile each door hangs off).
  const doorAt = [];
  for (let j = 1; j <= doorCount; j++) doorAt.push(Math.round(j * (L - 1) / (doorCount + 1)));

  const tiles = [];
  for (let k = 0; k < L; k++) tiles.push([k, k, 'R']);                      // the spine
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const d = Math.abs(x - y);                                            // 0 = spine itself
      if (d === 1 || d === 2) tiles.push([x, y, 'E']);                      // the two bands beside the spine
    }
  }
  // A door can hang off either side of the spine tile: (k+1,k) or (k,k+1). podAt() picks a usable side.
  const doors = doorAt.map(k => [[k + 1, k], [k, k + 1]]);
  const ends = [[0, 0], [L - 1, L - 1]];
  const mid = (L - 1) >> 1;

  const make = flip => {
    const f = ([x, y]) => flip ? [L - 1 - x, y] : [x, y];                   // mirror left<->right when flip
    const t = tiles.map(([x, y, k]) => { const q = f([x, y]); return [q[0], q[1], k]; });
    const keys = new Set(t.map(([x, y]) => x * 16 + y));                    // fast "is this offset part of the pod?"
    // Flat typed arrays so the hot search loop needs no destructuring/iterators:
    //   off[k] = tile index offset from the pod's top-left corner, isE[k] = 1 for extension tiles.
    const off = Int16Array.from(t.map(([x, y]) => y * SIZE + x));
    const isE = Uint8Array.from(t.map(([, , k]) => k === 'E' ? 1 : 0));
    const extCount = isE.reduce((a, b) => a + b, 0) - doorCount;       // each door turns one extension into a road
    return { L, tiles: t, keys, off, isE, n: t.length, extCount, nb: {}, doors: doors.map(pair => pair.map(f)),
             ends: ends.map(f), centre: f([mid, mid]) };
  };
  return [make(false), make(true)];
}
const CLUSTER_SPACING  = 5;      // preferred min distance between pod centres (was 6): a pod is 4x4, so 5 leaves a 1-tile lane
// Pods may sit right up against walls/cliffs. That is safe because a pod is only accepted when BOTH ends
// of its road spine have a way out to the main network (checked in exitsOf), so a wall can never trap it.
const POD_ALLOW_WALL   = true;
// Clustering: each tile of distance from a pod to the NEAREST already-placed pod adds this much to its
// score, so pods grow outward as a connected blob instead of scattering. Compared with the anchor-distance
// term (1 per step), 1.5 means "touching an existing pod" beats "a few steps closer to the anchor but alone".
const POD_CLUSTER_WEIGHT = 1.5;
const POD_EXIT_WEIGHT  = 1;      // pods lean away from room exits so one cheap wall can enclose most of the base
// How many NEW road tiles a pod may need, per exit, to join the road network. This used to be 3, which
// stopped pods from ever spreading beyond the first few tiles of existing road and pushed every other
// extension back onto the checkerboard. It is now only a sanity ceiling; the real pressure is the
// POD_LINK_WEIGHT penalty below, so nearer pods still win and far pods are still allowed.
const POD_LINK_MAX     = 40;
// Score penalty per NEW road tile a pod needs (both exits added together). Same units as walking
// distance, so 3 means "one extra road tile is as bad as the pod being three steps further from the anchor".
const POD_LINK_WEIGHT  = 3;      // was 1: a pod that needs a long road back to the network now loses to one that plugs straight in
// Cheap pre-check ranks every candidate; only the best few get the expensive full connectivity test.
const POD_VERIFY_MAX   = 40;

// A road on a swamp costs 5x more to build AND 5x more upkeep (decay) than one on plain ground. This is
// how many plain road tiles a swamp road is "worth" when routing roads and scoring pods. Bigger = swamps
// are avoided harder. It is a PENALTY, not a ban: if the only way through is swamp, the road still goes
// there rather than leaving the base disconnected.
const SWAMP_ROAD_COST  = 8;

// --- Source / controller / mineral container scoring --------------------------------------------
// Every candidate tile gets a score (LOWER IS BETTER):
//     score = HAUL * (walking cost back to the anchor)
//           - EXIT * min(walking cost from nearest room exit, EXIT_CAP)
//           - OPEN * (walkable tiles in the surrounding window)
// All distances are in "walking cost" units (plain = 1, swamp = SWAMP_COST), so they are comparable.
const CONTAINER_HAUL_WEIGHT  = 1;    // each step of hauling distance costs 1 point
const CONTAINER_EXIT_WEIGHT  = 1;    // each step further from an exit earns 1 point (safer from raiders)
const CONTAINER_EXIT_CAP     = 25;   // beyond this many steps from an exit, extra distance adds no safety
const CONTAINER_OPEN_WEIGHT  = 2;    // each walkable tile around the container earns 2 points
const CONTAINER_OPEN_RADIUS  = 2;    // "around" = a 5x5 window (radius 2) centred on the candidate tile

// ---------------------------------------------------------------- grid helpers
const SIZE = 50, N = SIZE * SIZE, INF = 1e9;
const idxOf = (x, y) => y * SIZE + x;

// For an exit at pod offset (dx,dy): the index offsets (relative to the pod's top-left corner) of its
// neighbours that lie OUTSIDE the pod. Cached per variant because the search asks this constantly.
function outsideOffsets(variant, dx, dy) {
  const key = dx * 16 + dy;
  let cached = variant.nb[key];
  if (!cached) {
    const list = [];
    for (const [ax, ay] of NEIGH8) {
      const nx = dx + ax, ny = dy + ay;
      if (nx >= 0 && ny >= 0 && variant.keys.has(nx * 16 + ny)) continue;   // that neighbour is part of the pod
      list.push(ny * SIZE + nx);
    }
    cached = variant.nb[key] = Int16Array.from(list);
  }
  return cached;
}

// Every pod shape (each length, plus its mirror image). Built here, after SIZE exists, because the shapes
// store tile index offsets that depend on the room width.
const POD_VARIANTS = [];
for (let L = POD_MIN_LEN; L <= POD_MAX_LEN; L++) POD_VARIANTS.push(...makePodVariants(L));
const xOf = i => i % SIZE;
const yOf = i => (i / SIZE) | 0;
const NEIGH8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const cheb = (a, b) => Math.max(Math.abs(xOf(a) - xOf(b)), Math.abs(yOf(a) - yOf(b)));
const neighbors = i => {
  const x = xOf(i), y = yOf(i), out = [];
  for (const [dx, dy] of NEIGH8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) out.push(idxOf(nx, ny));
  }
  return out;
};
const cap8 = type => (CONTROLLER_STRUCTURES[type] || {})[8] || 0;

// Labs: 10 labs, the two "inputs" (1,1)/(2,1) are within range 2 of every other lab.
// 'L' = lab, 'R' = road. Listed inputs-first so the first 3 labs (RCL6) are already usable.
const LAB_STAMP = [
  [1, 1, 'L'], [2, 1, 'L'], [1, 0, 'L'], [2, 0, 'L'], [0, 0, 'L'],
  [3, 0, 'L'], [0, 1, 'L'], [3, 1, 'L'], [1, 2, 'L'], [2, 2, 'L'],
  [0, 2, 'R'], [3, 2, 'R']
];
const LAB_VARIANTS = [LAB_STAMP, LAB_STAMP.map(([dx, dy, k]) => [dy, dx, k])];

// ---------------------------------------------------------------- tiny binary heap + dijkstra
class MinHeap {
  constructor() { this.k = []; this.v = []; this.lastKey = 0; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const topK = k[0], topV = v[0];
    const lastK = k.pop(), lastV = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    this.lastKey = topK;
    return topV;
  }
}

// Start tiles are always seeded (even if not walkable, e.g. a source tile); only `walkable`
// tiles are expanded into. prev[] walks back toward the start.
function dijkstra(starts, walkable, cost) {
  const dist = new Int32Array(N).fill(INF);
  const prev = new Int16Array(N).fill(-1);
  const heap = new MinHeap();
  for (const s of starts) { dist[s] = 0; heap.push(0, s); }
  while (heap.size) {
    const u = heap.pop();
    const d = heap.lastKey;
    if (d > dist[u]) continue;
    const ux = xOf(u), uy = yOf(u);
    for (const [dx, dy] of NEIGH8) {
      const nx = ux + dx, ny = uy + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const v = idxOf(nx, ny);
      if (!walkable[v]) continue;
      const nd = d + cost[v];
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push(nd, v); }
    }
  }
  return { dist, prev };
}

// Chebyshev distance of every tile to the nearest wall/edge.
function wallDistance(wallT) {
  const dt = new Int16Array(N).fill(-1);
  const q = [];
  for (let i = 0; i < N; i++) if (wallT[i]) { dt[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const v of neighbors(u)) if (dt[v] < 0) { dt[v] = dt[u] + 1; q.push(v); }
  }
  return dt;
}

// Number of walkable tiles in a (2R+1)^2 window around every tile (summed-area table).
function openness(walkable, R) {
  const W = SIZE + 1;
  const I = new Int32Array(W * W);
  for (let y = 0; y < SIZE; y++) {
    let row = 0;
    for (let x = 0; x < SIZE; x++) {
      row += walkable[idxOf(x, y)];
      I[(y + 1) * W + (x + 1)] = I[y * W + (x + 1)] + row;
    }
  }
  const out = new Int16Array(N);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(SIZE - 1, x + R);
      const y0 = Math.max(0, y - R), y1 = Math.min(SIZE - 1, y + R);
      out[idxOf(x, y)] = I[(y1 + 1) * W + (x1 + 1)] - I[y0 * W + (x1 + 1)] - I[(y1 + 1) * W + x0] + I[y0 * W + x0];
    }
  }
  return out;
}

// Best storage tile = low (weighted) walking distance to sources/controller/mineral, lots of open space.
function chooseAnchor(info, walkable, cost, dt, dExit) {
  const targets = info.sources.map(p => ({ p, w: 1 }));
  targets.push({ p: info.controller, w: 1 });
  if (info.mineral) targets.push({ p: info.mineral, w: 0.3 });
  const maps = targets.map(t => dijkstra([idxOf(t.p.x, t.p.y)], walkable, cost).dist);
  const open = openness(walkable, OPEN_RADIUS);

  // Strictest first; relaxed step by step for cramped rooms: [wall clearance, min walking distance to any target]
  for (const [minDt, minTarget] of [[3, 6], [2, 4], [1, 2], [1, 0]]) {
    let best = -1, bestScore = Infinity;
    for (let y = 4; y <= 45; y++) {
      for (let x = 4; x <= 45; x++) {
        const i = idxOf(x, y);
        if (!walkable[i] || dt[i] < minDt) continue;
        let sum = 0, ok = true;
        for (let k = 0; k < maps.length; k++) {
          const d = maps[k][i];
          if (d >= INF || d < minTarget) { ok = false; break; }
          sum += targets[k].w * d;
        }
        if (!ok) continue;
        const score = sum - OPEN_WEIGHT * open[i] - ANCHOR_EXIT_WEIGHT * Math.min(dExit[i], ANCHOR_EXIT_CAP);
        if (score < bestScore) { bestScore = score; best = i; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// ---------------------------------------------------------------- the planner (pure)
/**
 * info = {
 *   terrain: { get(x, y) },            // room.getTerrain()
 *   sources: [{x, y}], controller: {x, y}, mineral: {x, y} | null,
 *   anchor?: {x, y},                   // optional manual storage position
 *   fixed?: [{x, y, type}],            // structures that already exist and must be kept (spawns)
 *   existing?: [{x, y, type}]          // BUILT containers/links that may be adopted for a role
 * }
 * returns { v, a, s: { [structureType]: [tileIndex, ...] (priority order) }, short,
 *           deferredUntilRcl, roles } or null
 * roles = { coreLink, sources: [{source, container, link}], controller: {container, link}|null,
 *           mineral: {container}|null }   (all values are tile indices, -1 = none)
 */
function planRoom(info) {
  // --- terrain tables
  const wallT = new Uint8Array(N);
  const cost = new Uint8Array(N);
  // Every NON-wall tile on the outer border ring is a room exit. We collect them so we can later
  // measure "how far (by walking) is this tile from the nearest exit?" - that is our safety metric.
  const exitStarts = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = info.terrain.get(x, y), i = idxOf(x, y);
      const edge = x < 1 || y < 1 || x > 48 || y > 48;
      if (edge && !(t & TERRAIN_MASK_WALL)) exitStarts.push(i);
      wallT[i] = (edge || (t & TERRAIN_MASK_WALL)) ? 1 : 0;
      cost[i] = (t & TERRAIN_MASK_SWAMP) ? SWAMP_COST : 1;
    }
  }
  const objects = info.sources.concat([info.controller], info.mineral ? [info.mineral] : []);
  const blocked = new Uint8Array(N);
  for (const o of objects) blocked[idxOf(o.x, o.y)] = 1;
  const walkable = new Uint8Array(N);
  for (let i = 0; i < N; i++) walkable[i] = (!wallT[i] && !blocked[i]) ? 1 : 0;

  // --- anchor
  const dt = wallDistance(wallT);
  const dExit = dijkstra(exitStarts, walkable, cost).dist;   // walking cost from the nearest room exit
  const nearWall = i => dt[i] <= 1;                          // touches a wall/edge: keep structures off these
  const isSwamp = i => cost[i] > 1;                          // cost[] is SWAMP_COST on swamp, 1 otherwise (roads here = upkeep x5)
  let anchor = info.anchor ? idxOf(info.anchor.x, info.anchor.y) : -1;
  if (anchor >= 0 && !walkable[anchor]) anchor = -1;
  if (anchor < 0) anchor = chooseAnchor(info, walkable, cost, dt, dExit);
  if (anchor < 0) return null;
  const ax = xOf(anchor), ay = yOf(anchor);
  const dA = dijkstra([anchor], walkable, cost).dist;

  // --- bookkeeping
  const taken = new Uint8Array(N);
  const base = new Uint8Array(N);            // "real" base structures (drives where the road lattice goes)
  const plan = {};
  const deferredUntilRcl = {};
  const roads = new Set();
  const trunkSet = new Set();                // container -> anchor roads, built before the lattice
  const add = (type, i, isBase) => { (plan[type] = plan[type] || []).push(i); taken[i] = 1; if (isBase) base[i] = 1; };
  const addRoad = i => { if (!roads.has(i) && !taken[i]) { roads.add(i); taken[i] = 1; } };
  const isEven = i => (((xOf(i) - ax + yOf(i) - ay) & 1) === 0);
  const inField = i => { const x = xOf(i), y = yOf(i); return x >= FIELD_MIN && x <= FIELD_MAX && y >= FIELD_MIN && y <= FIELD_MAX; };
  const isFree = i => i >= 0 && walkable[i] && !taken[i] && dA[i] < INF;
  const at = (dx, dy) => { const x = ax + dx, y = ay + dy; return (x < 1 || y < 1 || x > 48 || y > 48) ? -1 : idxOf(x, y); };
  let reach = null;                          // set in step 8: tiles connected to the anchor by road/lattice
  const hasAccess = i => neighbors(i).some(n => reach ? reach[n] : (roads.has(n) || (walkable[n] && !taken[n] && !isEven(n))));

  let podCentres = [];
  const podExt = [];                         // extension tiles that belong to a pod (they already have their own road spine)
  const evenTiles = [];
  for (let i = 0; i < N; i++) if (walkable[i] && dA[i] < INF && isEven(i) && inField(i)) evenTiles.push(i);
  evenTiles.sort((a, b) => dA[a] - dA[b] || a - b);

  // claim a structure tile: preferred spot if usable, otherwise nearest free one
  // Tiles beside the main (trunk) roads; extensions stay off them so haulers keep a clear lane.
  const trunkBuf = new Uint8Array(N);
  // relax 0: no wall-adjacent tiles, extensions off trunk lanes; 1: allow trunk lanes; 2: allow wall-adjacent too
  const claim = (type, preferred) => {
    if (preferred !== undefined && preferred >= 0 && isFree(preferred) && inField(preferred) && !nearWall(preferred)) {
      add(type, preferred, true); return preferred;
    }
    for (let relax = 0; relax <= 2; relax++) {
      for (const i of evenTiles) {
        if (taken[i] || !hasAccess(i)) continue;
        if (relax < 2 && nearWall(i)) continue;
        if (relax < 1 && type === STRUCTURE_EXTENSION && trunkBuf[i]) continue;
        add(type, i, true); return i;
      }
    }
    return -1;
  };

  // best free tile within `range` of (cx,cy), nearest to the anchor
  const bestTileWithin = (cx, cy, range, filter) => {
    let best = -1;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        const i = idxOf(x, y);
        if (!isFree(i) || (filter && !filter(i))) continue;
        if (best < 0 || dA[i] < dA[best] || (dA[i] === dA[best] && i < best)) best = i;
      }
    }
    return best;
  };

  // ---- container placement helpers -------------------------------------------------------------
  // dExit[i] = walking cost from the NEAREST room exit to tile i (multi-source Dijkstra seeded with
  // every exit tile). A big number means "deep inside the room", i.e. harder for raiders to reach.
  // If the room has no open exits every value stays INF, which the cap below turns into a constant.
  // openInfra[i] = how many walkable tiles sit in the window around i. Containers in a cramped
  // nook leave no space for a harvester + haulers (+ upgraders at the controller) to queue.
  const openInfra = openness(walkable, CONTAINER_OPEN_RADIUS);
  // Lower score = better container tile (see the CONTAINER_* tunables at the top of the file).
  const infraScore = i =>
    CONTAINER_HAUL_WEIGHT * dA[i]                                   // hauling distance back to the anchor
    - CONTAINER_EXIT_WEIGHT * Math.min(dExit[i], CONTAINER_EXIT_CAP) // reward distance from exits
    - CONTAINER_OPEN_WEIGHT * openInfra[i];                          // reward open space around the tile

  // Like bestTileWithin, but picks the free tile with the best infraScore instead of "closest to anchor".
  // Ties are broken by tile index so the result is deterministic between runs.
  const bestTileScored = (cx, cy, range, filter) => {
    let best = -1, bestScore = Infinity;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;        // stay off the border ring
        const i = idxOf(x, y);
        if (!isFree(i) || (filter && !filter(i))) continue;       // must be a free, reachable tile
        const sc = infraScore(i);
        if (sc < bestScore || (sc === bestScore && i < best)) { bestScore = sc; best = i; }
      }
    }
    return best;
  };

  // ADOPTION: info.existing lists containers/links that are already BUILT in the room. Before planning
  // a brand-new one we look for an existing structure of that type within `range` of `centerIdx`
  // and reuse it. This avoids duplicates (and wasted energy) in rooms that already have infrastructure.
  const usedExisting = new Set();                 // existing structures already assigned to a role
  const adopt = (type, centerIdx, range) => {
    let best = -1;
    for (const e of info.existing || []) {
      if (e.type !== type) continue;
      const i = idxOf(e.x, e.y);
      if (usedExisting.has(i) || taken[i]) continue;      // already used by another role / the plan
      const d = cheb(i, centerIdx);
      if (d > range) continue;                             // too far from the thing it should serve
      if (best < 0 || d < cheb(best, centerIdx)) best = i; // prefer the closest one
    }
    if (best >= 0) usedExisting.add(best);
    return best;
  };

  // roles = who-serves-what. This is the contract with CondensedMain (via getInfra). Tile indices;
  // -1 means "none planned".
  const roles = { coreLink: -1, sources: [], controller: null, mineral: null };

  // Non-walkable structures must never seal a corridor: after tentatively placing one, every
  // remote container still has to be reachable from the anchor. (Containers/roads are walkable.)
  const containers = [];
  const containerSet = new Set();
  const canWalk = v => walkable[v] && (!taken[v] || roads.has(v) || containerSet.has(v));
  const allConnected = () => {
    const seen = new Uint8Array(N), q = [anchor];
    seen[anchor] = 1;
    for (let h = 0; h < q.length; h++) for (const v of neighbors(q[h])) if (!seen[v] && canWalk(v)) { seen[v] = 1; q.push(v); }
    return containers.every(c => seen[c]);
  };
  const keepsConnected = tiles => {
    for (const t of tiles) taken[t] = 1;
    const ok = allConnected();
    for (const t of tiles) taken[t] = 0;
    return ok;
  };
  const addContainer = c => { add(STRUCTURE_CONTAINER, c, false); containers.push(c); containerSet.add(c); };

  // 1) structures that already exist
  for (const f of info.fixed || []) {
    const i = idxOf(f.x, f.y);
    if (!taken[i]) add(f.type, i, true);
  }

  // 2) core around the anchor: a hauler on the road tile (ax+1, ay) reaches storage, link, terminal
  if (!taken[anchor]) add(STRUCTURE_STORAGE, anchor, true);
  if ((plan[STRUCTURE_SPAWN] || []).length < cap8(STRUCTURE_SPAWN)) claim(STRUCTURE_SPAWN, at(-1, -1));
  // The "core" (storage) link. If a link already stands within range 3 of storage (the rule the old
  // findLinks used for its storageLink) we adopt it; otherwise we claim the preferred core slot.
  {
    const existingCore = adopt(STRUCTURE_LINK, anchor, 3);
    if (existingCore >= 0) { add(STRUCTURE_LINK, existingCore, true); roles.coreLink = existingCore; }
    else roles.coreLink = claim(STRUCTURE_LINK, at(1, -1));
  }
  claim(STRUCTURE_TERMINAL, at(1, 1));
  claim(STRUCTURE_FACTORY, at(-1, 1));

  // 3) remote infrastructure: container (+ link) at each source, controller, mineral
  const posOf = i => ({ x: xOf(i), y: yOf(i) });

  // Link that serves a container (so the creep standing on the container can transfer into it).
  // Returns the link's tile index, or -1 if none could be placed. `source` (optional) is the tile of
  // the source being mined: we try not to put the link on one of the source's harvest spots.
  const linkNear = (c, source) => {
    // 1) reuse a link that already stands right next to this container
    const existingLink = adopt(STRUCTURE_LINK, c, 1);
    if (existingLink >= 0) { add(STRUCTURE_LINK, existingLink, false); return existingLink; }
    // 2) otherwise plan a new one, but never in a spot that would seal a corridor
    const cp = posOf(c);
    const ok = i => keepsConnected([i]);
    let l = -1;
    if (source !== undefined) l = bestTileWithin(cp.x, cp.y, 1, i => cheb(i, source) > 1 && ok(i));   // keep harvest spots free
    if (l < 0) l = bestTileWithin(cp.x, cp.y, 1, ok);
    if (l >= 0) add(STRUCTURE_LINK, l, false);
    return l;
  };

  // --- one container + link per source -------------------------------------------------------
  for (const s of info.sources) {
    const sIdx = idxOf(s.x, s.y);
    // The container must touch the source (range 1) so the miner standing on it can harvest.
    // Reuse an existing one if there is one; otherwise choose the best-SCORED adjacent tile:
    // short haul to the base, far from exits, lots of open space around it.
    let c = adopt(STRUCTURE_CONTAINER, sIdx, 1);
    if (c < 0) c = bestTileScored(s.x, s.y, 1);
    if (c < 0) continue;                                  // source completely boxed in: nothing to build
    addContainer(c);
    roles.sources.push({ source: sIdx, container: c, link: linkNear(c, sIdx) });
  }

  // --- controller container + link -----------------------------------------------------------
  // Upgraders stand within range 3 of the controller, so the container may sit up to 2 tiles away.
  // That gives ~24 candidate tiles, which makes scoring (exits / open space) matter even more here.
  {
    const ctrlIdx = idxOf(info.controller.x, info.controller.y);
    let c = adopt(STRUCTURE_CONTAINER, ctrlIdx, 2);        // old "temp" containers sat within range 1
    if (c < 0) c = bestTileScored(info.controller.x, info.controller.y, 2);
    if (c >= 0) {
      addContainer(c);
      // The old findLinks wanted the controller link within range 1 of the controller; accept up to 2
      let l = adopt(STRUCTURE_LINK, ctrlIdx, 2);
      if (l >= 0) add(STRUCTURE_LINK, l, false);
      else l = linkNear(c);
      roles.controller = { container: c, link: l };
    }
  }

  // --- mineral extractor + container ---------------------------------------------------------
  if (info.mineral) {
    const mIdx = idxOf(info.mineral.x, info.mineral.y);
    plan[STRUCTURE_EXTRACTOR] = [mIdx];
    let c = adopt(STRUCTURE_CONTAINER, mIdx, 1);
    if (c < 0) c = bestTileScored(info.mineral.x, info.mineral.y, 1);
    if (c >= 0) {
      addContainer(c);
      deferredUntilRcl[c] = MINERAL_CONTAINER_MIN_RCL;   // don't build it before the extractor is useful
      roles.mineral = { container: c };
    }
  }

  // 4) lab stamp - searched for (2 orientations), kept away from the core, wrapped in a road ring
  //    so every lab can be reached from outside. Candidates with a blocked ring are penalised, and
  //    the winner must not seal off any remote container.
  const buildStamps = strictWall => {
  const stamps = [];
  for (const variant of LAB_VARIANTS) {
    const w = Math.max(...variant.map(t => t[0])) + 1, h = Math.max(...variant.map(t => t[1])) + 1;
    for (let oy = FIELD_MIN; oy + h - 1 <= FIELD_MAX; oy++) {
      for (let ox = FIELD_MIN; ox + w - 1 <= FIELD_MAX; ox++) {
        let sum = 0, n = 0, ok = true;
        for (const [dx, dy, k] of variant) {
          const i = idxOf(ox + dx, oy + dy);
          if (!isFree(i) || (strictWall && k === 'L' && nearWall(i))) { ok = false; break; }
          if (k === 'L') { sum += dA[i]; n++; }
        }
        if (!ok) continue;
        let blockedRing = 0, swampRing = 0;
        for (let ry = oy - 1; ry <= oy + h; ry++) {
          for (let rx = ox - 1; rx <= ox + w; rx++) {
            if (rx >= ox && rx < ox + w && ry >= oy && ry < oy + h) continue;   // inside the box
            if (!isFree(idxOf(rx, ry))) blockedRing++;
            else if (isSwamp(idxOf(rx, ry))) swampRing++;   // swamp ring tiles would be skipped (upkeep): prefer dry spots
          }
        }
        const avg = sum / n;
        stamps.push({ score: (avg < LAB_MIN_DIST ? avg + 100 : avg) + 8 * blockedRing + 2 * swampRing, variant, ox, oy, w, h });
      }
    }
  }
  stamps.sort((a, b) => a.score - b.score);
  return stamps.slice(0, 40).find(st =>
    keepsConnected(st.variant.filter(t => t[2] === 'L').map(([dx, dy]) => idxOf(st.ox + dx, st.oy + dy))));
  };
  const bestStamp = buildStamps(true) || buildStamps(false);
  if (bestStamp) {
    const { variant, ox, oy, w, h } = bestStamp;
    for (const [dx, dy, k] of variant) if (k === 'L') add(STRUCTURE_LAB, idxOf(ox + dx, oy + dy), true);
    for (let ry = oy - 1; ry <= oy + h; ry++) {
      for (let rx = ox - 1; rx <= ox + w; rx++) {
        const i = idxOf(rx, ry);
        // ring + the stamp's own two road cells, but never on swamp: labs only need a creep standing
        // NEXT to them, and a swamp road would cost 5x the upkeep for no real benefit
        if (isFree(i) && !isSwamp(i)) addRoad(i);
      }
    }
  }

  // 5) remaining spawns + power spawn close to the core
  while ((plan[STRUCTURE_SPAWN] || []).length < cap8(STRUCTURE_SPAWN)) if (claim(STRUCTURE_SPAWN) < 0) break;
  claim(STRUCTURE_POWER_SPAWN);

  // Temporary storage container sits on the power spawn tile (RCL8 only) until the real storage is built.
  const tempStorage = (plan[STRUCTURE_POWER_SPAWN] || [])[0] ?? -1;

  // 6) roads from every container to the anchor, built as ONE shared network. Done BEFORE extensions so
  //    extensions can't block the routes.
  {
    const walkFree = new Uint8Array(N);
    const costR = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      walkFree[i] = (walkable[i] && (!taken[i] || roads.has(i))) ? 1 : 0;
      // Existing road = 1 (cheap, so routes merge into trunks); new plain road = 2;
      // new SWAMP road = 2 * SWAMP_ROAD_COST, so trunks detour around swamps whenever a dry route exists.
      costR[i] = roads.has(i) ? 1 : (isSwamp(i) ? Math.min(255, 2 * SWAMP_ROAD_COST) : 2);
    }
    walkFree[anchor] = 1;

    // SHARED TRUNK. The goal is the SHORTEST COMBINED set of roads that connects every container to the
    // anchor, so roads are shared instead of each container getting its own route. Finding the perfect
    // answer is a hard problem (Steiner tree), so we try three cheap strategies on scratch copies of the
    // cost map and keep whichever needs the fewest NEW road tiles (a swamp tile counts as SWAMP_ROAD_COST):
    //
    //   A) "grow":    grow ONE network from the anchor; each round attach whichever container is cheapest
    //                 to reach from the network so far, laying only the new connecting tiles.
    //   B) "in order": one container at a time in list order, each reusing earlier roads (the old method).
    //   C) "far first": same as B but the FARTHEST container goes first, so nearer ones can merge into
    //                 its long road instead of every container making its own.
    //
    // Each strategy returns the Set of tiles it would use; nothing is placed until the winner is chosen.

    // Sequential strategy (B and C): route container -> anchor one by one, existing roads get cheaper.
    const sequentialTrunk = order => {
      const cr = costR.slice();                                    // scratch copy: don't disturb the real costs
      const tiles = new Set();
      for (const c of order) {
        const { prev } = dijkstra([c], walkFree, cr);              // search outward from the container
        for (let cur = prev[anchor]; cur !== -1 && cur !== c; cur = prev[cur]) { tiles.add(cur); cr[cur] = 1; }
      }
      return tiles;
    };

    // Growing-network strategy (A).
    const growTrunk = () => {
      const cr = costR.slice();
      const tiles = new Set();
      const remaining = containers.slice();
      while (remaining.length) {
        const starts = [anchor].concat(Array.from(tiles));         // the network = everything connected so far
        const { dist, prev } = dijkstra(starts, walkFree, cr);
        // Containers are not walkable in walkFree, so attach via one of the tiles next to them.
        let bestK = -1, bestN = -1, bestD = INF;
        for (let k = 0; k < remaining.length; k++) {
          for (const n of neighbors(remaining[k])) {
            if (!walkFree[n] || dist[n] >= INF) continue;          // blocked / unreachable
            if (dist[n] < bestD) { bestD = dist[n]; bestK = k; bestN = n; }
          }
        }
        if (bestK < 0) break;                                      // nothing left is reachable
        remaining.splice(bestK, 1);
        // Walk back toward the network (dist 0 = already part of it), collecting only the new tiles.
        for (let cur = bestN; cur !== -1 && dist[cur] > 0; cur = prev[cur]) { tiles.add(cur); cr[cur] = 1; }
      }
      return tiles;
    };

    // Price of a strategy = number of NEW road tiles it needs (tiles that are already roads are free;
    // swamp tiles cost SWAMP_ROAD_COST because of their 5x upkeep).
    const trunkPrice = tiles => {
      let price = 0;
      for (const t of tiles) if (!roads.has(t)) price += isSwamp(t) ? SWAMP_ROAD_COST : 1;
      return price;
    };

    const farthestFirst = containers.slice().sort((a, b) => dA[b] - dA[a] || a - b);
    const options = [growTrunk(), sequentialTrunk(containers), sequentialTrunk(farthestFirst)];
    let winner = options[0];
    for (const opt of options) if (trunkPrice(opt) < trunkPrice(winner)) winner = opt;   // ties keep the earlier option

    // Commit the winning network: these become real planned roads (and the "trunk" list built first).
    for (const t of winner) {
      addRoad(t);
      if (roads.has(t)) trunkSet.add(t);
    }
    for (const t of trunkSet) for (const n of neighbors(t)) trunkBuf[n] = 1;
  }

  // 7) grow the connected road region from the anchor: existing roads + free odd-parity tiles
  //    (odd tiles connect diagonally and extensions only ever take even tiles, so this region
  //    can't be cut off later). Extensions may only be claimed next to it.
  // Cost of turning tile v into (part of) the road network: existing road = free, plain = 1, swamp =
  // SWAMP_ROAD_COST. Used to make every link/lattice chain below prefer dry tiles.
  const roadWeight = v => roads.has(v) ? 0 : (isSwamp(v) ? SWAMP_ROAD_COST : 1);
  // Same idea as before (what is connected to the anchor through roads + free odd tiles?), but now a
  // weighted search instead of a plain flood fill. The parent map p[] therefore follows the CHEAPEST
  // chain back to the network, which sidesteps swamps whenever a dry way exists, and every tile that was
  // reachable before is still reachable (swamps are penalised, not blocked).
  const computeReach = () => {
    const dist = new Int32Array(N).fill(INF), p = new Int16Array(N).fill(-1);
    const passable = v => roads.has(v) || (walkable[v] && !taken[v] && !isEven(v) && inField(v));
    const heap = new MinHeap();
    for (const n of neighbors(anchor)) if (passable(n)) { dist[n] = roadWeight(n); heap.push(dist[n], n); }
    while (heap.size) {
      const u = heap.pop();
      const d = heap.lastKey;
      if (d > dist[u]) continue;                       // stale heap entry
      for (const v of neighbors(u)) {
        if (!passable(v)) continue;
        const nd = d + roadWeight(v);
        if (nd < dist[v]) { dist[v] = nd; p[v] = u; heap.push(nd, v); }
      }
    }
    const r = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (dist[i] < INF) r[i] = 1;
    return { r, p };
  };
  let par;
  ({ r: reach, p: par } = computeReach());

  // 8) towers are NOT planned here any more: WallPlanner.js places them after it has computed the wall
  //    line, so the towers can be positioned to cover that line evenly. (Step number kept so the
  //    comments below still line up.)

  // 9) extensions in spaced-out pods that ignore the checkerboard, off walls and trunk lanes. A pod is
  //    accepted only if BOTH ends of its road spine reach the main network without going through the pod.
  //    Leftovers fall back to checkerboard tiles; then the single RCL8 odds and ends.
  {
    const extCap = cap8(STRUCTURE_EXTENSION);
    const centres = [];                         // centre tile of every pod placed so far
    podCentres = centres;                       // exposed on the plan for debugging/visuals
    let placed = 0, spacing = CLUSTER_SPACING;

    // Try to put a pod variant with its top-left corner at (ox, oy). Every tile must be free.
    // This is the HOT loop (thousands of positions per pod), so it only does cheap array lookups and
    // builds a small "light" description; materialize() below builds the full tile lists for the few
    // pods that actually get verified. Returns null if the pod does not fit here.
    let okTile = null;                          // per-pass map: tile is free, in the field, and allowed for pods
    const podAt = (variant, ox, oy) => {
      // 1) every tile must be usable. (Extension tiles also must not touch a trunk road, so extensions
      //    never block the main roads; this is applied to door candidates too, which is slightly stricter.)
      const base = idxOf(ox, oy);
      let swampRoads = 0;                      // road tiles standing on swamp (each costs 5x upkeep)
      for (let k = 0; k < variant.n; k++) {
        const i = base + variant.off[k];
        if (!okTile[i]) return null;           // blocked, wall, outside the field...
        if (variant.isE[k]) { if (trunkBuf[i]) return null; }
        else if (isSwamp(i)) swampRoads++;
      }

      // 2) side doors (long pods only): pick, for each door, a side whose tile has a free tile OUTSIDE
      //    the pod to step onto. If neither side works the pod is not possible here.
      const exitOff = variant.ends.slice();     // offsets of every exit; doors are appended below
      const doorTiles = [];
      for (const sides of variant.doors) {
        let chosen = -1;
        for (const [dx, dy] of sides) {
          let opens = false;
          for (const o of outsideOffsets(variant, dx, dy)) if (isFree(base + o)) { opens = true; break; }
          if (opens) { chosen = idxOf(ox + dx, oy + dy); exitOff.push([dx, dy]); break; }
        }
        if (chosen < 0) return null;
        doorTiles.push(chosen);
      }
      for (const d of doorTiles) if (isSwamp(d)) swampRoads++;     // a door is a road tile too

      const centre = idxOf(ox + variant.centre[0], oy + variant.centre[1]);
      return { variant, ox, oy, centre, exitOff, doorTiles, swampRoads, extCount: variant.extCount };
    };

    // Build the full tile lists (extensions, roads, exit tiles) for a pod that passed podAt().
    const materialize = pod => {
      const base = idxOf(pod.ox, pod.oy), v = pod.variant;
      const doorSet = new Set(pod.doorTiles);
      pod.ext = []; pod.rd = [];
      for (let k = 0; k < v.n; k++) {
        const i = base + v.off[k];
        if (v.isE[k] && !doorSet.has(i)) pod.ext.push(i);                  // a real extension
        else pod.rd.push(i);                                               // the spine, or a door
      }
      pod.exits = v.ends.map(([dx, dy]) => idxOf(pod.ox + dx, pod.oy + dy)).concat(pod.doorTiles);
      pod.set = new Set(pod.ext.concat(pod.rd));                           // membership test for exitsOf
      return pod;
    };

    // Reach computed with the pod's extensions blocked and its spine NOT usable, so every exit must
    // find its own way out. Returns the outside entry tile per exit (and the parent map), or null.
    const exitsOf = (pod, podSet) => {
      if (!keepsConnected(pod.ext)) return null;
      for (const t of pod.ext.concat(pod.rd)) taken[t] = 1;
      const { r, p } = computeReach();
      for (const t of pod.ext.concat(pod.rd)) taken[t] = 0;
      const outs = [];
      for (const e of pod.exits) {
        const o = neighbors(e).find(n => !podSet.has(n) && r[n]);
        if (o === undefined) return null;
        let len = 0;
        for (let cur = o; cur !== -1 && !roads.has(cur); cur = p[cur]) len++;
        if (len > POD_LINK_MAX) return null;
        outs.push(o);
      }
      return new Set(outs).size === outs.length ? { outs, p } : null;   // exits must not funnel into one tile
    };

    // linkMap(): for every tile, how many NEW road tiles it would take to join the road network.
    //   - Roads already planned (and the anchor itself) count as 0.
    //   - The free odd-parity lattice tiles around them are the "future roads" a link can travel
    //     through, each costing 1 more. -1 means "cannot be connected".
    // One breadth-first search gives us this for ALL candidates at once, which is much cheaper than
    // running the full reach test on each candidate.
    const linkMap = () => {
      const d = new Int32Array(N).fill(INF);
      const heap = new MinHeap();
      for (const r of roads) { d[r] = 0; heap.push(0, r); }
      d[anchor] = 0; heap.push(0, anchor);
      while (heap.size) {
        const u = heap.pop();
        const k = heap.lastKey;
        if (k > d[u]) continue;
        for (const v of neighbors(u)) {
          // same "passable" rule computeReach() uses: free, odd parity, inside the field
          if (!(walkable[v] && !taken[v] && !isEven(v) && inField(v))) continue;
          const nd = k + (isSwamp(v) ? SWAMP_ROAD_COST : 1);   // swamp link tiles cost extra
          if (nd < d[v]) { d[v] = nd; heap.push(nd, v); }
        }
      }
      for (let i = 0; i < N; i++) if (d[i] >= INF) d[i] = -1;  // -1 = cannot be connected
      return d;
    };

    // Estimated number of new road tiles this pod needs: for each of its two exits, the cheapest
    // neighbouring tile (outside the pod) that can join the network; the two are added together.
    // Returns -1 if either exit has no way out. This is only an ESTIMATE (it ignores the pod
    // blocking its own surroundings); exitsOf() below confirms the winners properly.
    const estimateLinks = (pod, lm) => {
      const base = idxOf(pod.ox, pod.oy);
      let total = 0;
      for (const [ex, ey] of pod.exitOff) {
        const offs = outsideOffsets(pod.variant, ex, ey);          // this exit's neighbours outside the pod
        let best = -1;
        for (let k = 0; k < offs.length; k++) {
          const d = lm[base + offs[k]];
          if (d >= 0 && (best < 0 || d < best)) best = d;
        }
        if (best < 0) return -1;                                   // this exit can never reach the network
        total += best;
      }
      return total;
    };

    while (placed + CLUSTER_SIZE <= extCap) {
      const lm = linkMap();                       // refreshed after every pod (roads changed)
      okTile = new Uint8Array(N);                 // refreshed too: which tiles could a pod occupy right now?
      for (let i = 0; i < N; i++) okTile[i] = (isFree(i) && inField(i) && (POD_ALLOW_WALL || !nearWall(i))) ? 1 : 0;
      const cands = [];
      for (const variant of POD_VARIANTS) {
        // No distance limit from the anchor: the whole field is searched. Closeness is a SCORE, not a rule.
        for (let oy = FIELD_MIN; oy <= FIELD_MAX - (variant.L - 1); oy++) {
          for (let ox = FIELD_MIN; ox <= FIELD_MAX - (variant.L - 1); ox++) {
            const pod = podAt(variant, ox, oy);
            if (!pod || pod.extCount > extCap - placed) continue;       // a pod must not overshoot the extension cap
            if (!centres.every(c => cheb(c, pod.centre) >= spacing)) continue;
            pod.links = estimateLinks(pod, lm);
            if (pod.links < 0) continue;          // cannot reach the network at all: skip cheaply
            cands.push(pod);
          }
        }
      }
      // Lower score = better: near the anchor, away from exits, and few extra roads needed.
      // Distance (in tiles) from a pod to the closest pod already placed; 0 for the very first pod, so the
      // first one is chosen purely by the anchor/exit/link terms and the rest gather around it.
      const nearestPod = p => {
        let best = 0;
        for (let k = 0; k < centres.length; k++) {
          const d = cheb(centres[k], p.centre);
          if (k === 0 || d < best) best = d;
        }
        return best;
      };
      const podScore = p => dA[p.centre]
        + POD_CLUSTER_WEIGHT * nearestPod(p)       // stay close to the other pods
        - POD_EXIT_WEIGHT * Math.min(dExit[p.centre], ANCHOR_EXIT_CAP)
        + POD_LINK_WEIGHT * p.links                 // (link cost already includes swamp penalties)
        + SWAMP_ROAD_COST * p.swampRoads            // pods whose own spine is on swamp lose to dry ones
        - POD_SIZE_BONUS * p.extCount;             // bigger pods = fewer roads and exits per extension
      for (const c of cands) c.score = podScore(c);   // score each candidate ONCE (the sort would call it many times)
      cands.sort((a, b) => a.score - b.score || a.centre - b.centre);

      let done = false;
      // Full (expensive) check on the best few. Because the cheap estimate already filtered out
      // hopeless candidates, the first or second one normally passes.
      for (const pod of cands.slice(0, POD_VERIFY_MAX)) {
        materialize(pod);                            // full tile lists are only needed for the few we verify
        const res = exitsOf(pod, pod.set);
        if (!res) continue;
        for (const t of pod.ext) add(STRUCTURE_EXTENSION, t, true);
        for (const t of pod.rd) addRoad(t);
        for (const o of res.outs) for (let cur = o; cur !== -1 && !roads.has(cur); cur = res.p[cur]) addRoad(cur);
        centres.push(pod.centre);
        podExt.push(...pod.ext);                  // remembered so step 10 doesn't wrap pods in extra roads
        placed += pod.ext.length;
        ({ r: reach, p: par } = computeReach());
        done = true;
        break;
      }
      // Nothing fit at this spacing: allow pods to sit closer together and try again. At spacing 0
      // there is nothing left to relax, so stop; the remainder goes to the checkerboard below.
      if (!done) { if (spacing === 0) break; spacing--; }
    }
    for (; placed < extCap; placed++) if (claim(STRUCTURE_EXTENSION) < 0) break;
  }
  claim(STRUCTURE_OBSERVER);
  claim(STRUCTURE_NUKER);

  // 10) road lattice: odd-parity tiles touching a base structure, plus the chain back to the core.
  //     Pod extensions are skipped: each pod already carries its own road spine, so wrapping it in
  //     more lattice roads would just waste build cost and space that leftover extensions could use.
  const inPod = new Uint8Array(N);
  for (const i of podExt) inPod[i] = 1;
  for (let y = FIELD_MIN; y <= FIELD_MAX; y++) {
    for (let x = FIELD_MIN; x <= FIELD_MAX; x++) {
      const i = idxOf(x, y);
      if (!reach[i] || taken[i] || isSwamp(i) || !neighbors(i).some(n => base[n] && !inPod[n])) continue;   // never START a lattice road on swamp
      for (let cur = i; cur !== -1 && !roads.has(cur); cur = par[cur]) addRoad(cur);
    }
  }

  // --- assemble
  plan[STRUCTURE_ROAD] = Array.from(roads).sort((a, b) => (dA[a] - dA[b]) || (a - b));
  const trunk = Array.from(trunkSet).sort((a, b) => (dA[a] - dA[b]) || (a - b));
  const short = {};
  for (const t of [STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_LAB]) {   // towers: see WallPlanner
    const got = (plan[t] || []).length;
    if (got < cap8(t)) short[t] = cap8(t) - got;
  }

  // Links are built in plan order, limited by what the RCL allows (2 at RCL5, 3 at RCL6, ...).
  // Priority for this bot: 1) core/storage link, 2) controller link (so LinkUp becomes true as
  // early as possible), 3) source links. Anything else that was planned goes last.
  const linkOrder = [];
  const pushLink = i => { if (i >= 0 && linkOrder.indexOf(i) === -1) linkOrder.push(i); };
  pushLink(roles.coreLink);
  if (roles.controller) pushLink(roles.controller.link);
  for (const r of roles.sources) pushLink(r.link);
  for (const i of plan[STRUCTURE_LINK] || []) pushLink(i);
  plan[STRUCTURE_LINK] = linkOrder;

  return { v: PLAN_VERSION, a: anchor, s: plan, short, deferredUntilRcl, roles, trunk, temp: tempStorage, pods: podCentres, podExtCount: podExt.length,
           towersByWallPlanner: true };   // marker: this layout leaves the towers to WallPlanner (older layouts don't have it)
}

// ---------------------------------------------------------------- game glue
function generatePlan(room) {
  const flag = Game.flags[`C.${room.name}`];
  const spawns = room.find(FIND_MY_SPAWNS);
  let anchor;
  if (flag && flag.pos.roomName === room.name) anchor = { x: flag.pos.x, y: flag.pos.y };
  else if (room.storage) anchor = { x: room.storage.pos.x, y: room.storage.pos.y };
  else if (ANCHOR_ON_SPAWN && spawns.length) anchor = { x: spawns[0].pos.x + 1, y: spawns[0].pos.y + 1 };

  // Containers and links that are already BUILT. planRoom adopts the ones that sit in a sensible
  // place (next to a source, near the controller, near storage) instead of planning duplicates.
  const existing = room.find(FIND_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_LINK || s.structureType === STRUCTURE_CONTAINER
  }).map(s => ({ x: s.pos.x, y: s.pos.y, type: s.structureType }));

  const mineral = room.find(FIND_MINERALS)[0];
  const plan = planRoom({
    terrain: room.getTerrain(),
    sources: room.find(FIND_SOURCES).map(s => ({ x: s.pos.x, y: s.pos.y })),
    controller: { x: room.controller.pos.x, y: room.controller.pos.y },
    mineral: mineral ? { x: mineral.pos.x, y: mineral.pos.y } : null,
    anchor,
    fixed: spawns.map(s => ({ x: s.pos.x, y: s.pos.y, type: STRUCTURE_SPAWN })),
    existing
  });
  if (!plan) { console.log(`[RoomPlanner] ${room.name}: could not find a valid anchor`); return null; }
  if (Object.keys(plan.short).length) console.log(`[RoomPlanner] ${room.name}: not enough space for`, JSON.stringify(plan.short));
  return plan;
}

// Order matters: earlier types claim the site budget first. Roads/ramparts are handled after.
const BUILD_ORDER = [
  STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER, STRUCTURE_TOWER, STRUCTURE_STORAGE,
  STRUCTURE_LINK, STRUCTURE_EXTRACTOR, STRUCTURE_TERMINAL, STRUCTURE_LAB, STRUCTURE_FACTORY,
  STRUCTURE_POWER_SPAWN, STRUCTURE_OBSERVER, STRUCTURE_NUKER
];
const RAMPART_TYPES = [
  STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_TOWER, STRUCTURE_LAB,
  STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN, STRUCTURE_NUKER, STRUCTURE_OBSERVER
];

// ---------------------------------------------------------------- planner memory (ONE folder per room)
/**
 * plannerMem(roomName, create) -> Memory.rooms[roomName].planner
 *
 * Everything the planners keep for a room lives in this one object (see the header comment). Rooms planned
 * by an older version stored `plan` and `planLastRun` directly on the room's memory; this moves them into
 * the folder the first time it is touched, so nothing is lost and no stray keys are left behind.
 * With create=false it never creates empty memory, so read-only callers (getInfra, drawPlan) stay cheap.
 */
function plannerMem(roomName, create) {
  const rooms = Memory.rooms;
  let mem = rooms && rooms[roomName];
  if (!mem) {
    if (!create) return undefined;
    Memory.rooms = Memory.rooms || {};
    mem = Memory.rooms[roomName] = {};
  }
  let pm = mem[PLANNER_KEY];
  if (mem.plan !== undefined || mem.planLastRun !== undefined) {          // legacy keys: move them in
    pm = pm || (mem[PLANNER_KEY] = {});
    if (mem.plan !== undefined && !pm.plan) { pm.plan = mem.plan; pm.planTick = pm.planTick || 0; }
    if (mem.planLastRun !== undefined && pm.lastRun === undefined) pm.lastRun = mem.planLastRun;
    delete mem.plan;
    delete mem.planLastRun;
  }
  if (!pm && create) pm = mem[PLANNER_KEY] = {};
  return pm;
}

/** The defence plan (walls / gates / towers) if WallPlanner has finished it for the CURRENT building plan. */
function defenseFor(pm) {
  const d = pm && pm.defense;
  return (d && d.done && d.planTick === pm.planTick) ? d : null;
}

/**
 * Tiles to build for a structure type: the building plan, plus what WallPlanner added.
 *   tower      -> only from WallPlanner (so none are built until its plan exists)
 *   container  -> the plan's containers, then the tower cluster's container
 *   link       -> the plan's links, then the tower cluster's link (last = lowest priority)
 */
function plannedTiles(pm, type) {
  const base = (pm.plan.s && pm.plan.s[type]) || [];
  const d = defenseFor(pm);
  if (type === STRUCTURE_TOWER) return d ? d.towers : [];
  if (!d) return base;
  if (type === STRUCTURE_CONTAINER && d.container >= 0 && base.indexOf(d.container) === -1) return base.concat([d.container]);
  if (type === STRUCTURE_LINK && d.link >= 0 && base.indexOf(d.link) === -1) return base.concat([d.link]);
  return base;
}

/**
 * Console helper: where is the wall line? e.g.  RoomPlanner.defenceStatus('E47N39')
 * Shows what is planned vs built vs queued and, if nothing is happening, the most likely reason why.
 */
function defenceStatus(roomName) {
  const room = Game.rooms[roomName], pm = plannerMem(roomName, false);
  if (!room || !pm || !pm.plan) return `${roomName}: no building plan`;
  const rcl = room.controller ? room.controller.level : 0;
  const d = pm.defense;
  if (!pm.plan.towersByWallPlanner) return `${roomName}: building plan is an old layout; it will be replanned`;
  if (!d) return `${roomName}: WallPlanner has not planned this room yet - make sure WallPlanner.run('${roomName}') runs every tick`;
  if (d.error) return `${roomName}: WallPlanner failed: ${d.error}`;
  if (!d.done || d.planTick !== pm.planTick) return `${roomName}: WallPlanner is still working or its plan is stale - run WallPlanner.status('${roomName}') for details`;
  const at = (list, type) => list.map(i => ({ i, here: room.lookForAt(LOOK_STRUCTURES, xOf(i), yOf(i)).some(s => s.structureType === type),
    site: room.lookForAt(LOOK_CONSTRUCTION_SITES, xOf(i), yOf(i)).some(s => s.structureType === type) }));
  const gates = at(d.gates, STRUCTURE_RAMPART), walls = d.walls.map(i => ({ i,
    here: room.lookForAt(LOOK_STRUCTURES, xOf(i), yOf(i)).some(s => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART),
    site: room.lookForAt(LOOK_CONSTRUCTION_SITES, xOf(i), yOf(i)).length > 0 }));
  const n = a => `${a.filter(x => x.here).length}/${a.length} built, ${a.filter(x => !x.here && x.site).length} queued`;
  const sites = room.find(FIND_CONSTRUCTION_SITES);
  let why = '';
  if (rcl < DEFENSE_LINE_MIN_RCL) why = ` | not started: controller level ${rcl} < ${DEFENSE_LINE_MIN_RCL}`;
  else if (walls.concat(gates).every(x => x.here)) why = ' | complete';
  else if (!walls.concat(gates).some(x => x.site)) why = ` | nothing queued: ${sites.length} site(s) alive in the room, empire has ${Object.keys(Game.constructionSites).length} (limit 100)`;
  return `${roomName}: gates ${n(gates)}; walls ${n(walls)}${why}`;
}

/**
 * Road tiles joining every gate (from WallPlanner) back to the anchor, listed anchor -> gate.
 * Uses the trunk's costs (existing/planned road 1, plain 2, swamp penalised) and each finished route becomes
 * cheap for the next, so routes merge into the existing road network.
 */
function planGateRoads(room, plan, defense) {
  const terrain = room.getTerrain();
  const walkable = new Uint8Array(N), cost = new Uint8Array(N), roadSet = new Set(plan.s[STRUCTURE_ROAD] || []);
  for (let y = 1; y < 49; y++) {
    for (let x = 1; x < 49; x++) {
      const t = terrain.get(x, y), i = idxOf(x, y);
      walkable[i] = (t & TERRAIN_MASK_WALL) ? 0 : 1;
      cost[i] = roadSet.has(i) ? 1 : ((t & TERRAIN_MASK_SWAMP) ? 2 * SWAMP_ROAD_COST : 2);
    }
  }
  const block = i => { if (i !== undefined && i >= 0) walkable[i] = 0; };
  for (const type in plan.s) if (type !== STRUCTURE_ROAD) plan.s[type].forEach(block);
  defense.walls.forEach(block);
  defense.towers.forEach(block);
  block(defense.container); block(defense.link); block(plan.temp);
  for (const o of room.find(FIND_SOURCES).concat(room.find(FIND_MINERALS), [room.controller])) block(idxOf(o.pos.x, o.pos.y));

  const out = [], seen = new Set();
  for (const g of defense.gates) {
    walkable[g] = 1;                                   // the gate is the destination, even if a rampart is planned there
    const { prev } = dijkstra([plan.a], walkable, cost);
    if (prev[g] === -1) continue;                      // no way back to the anchor
    const route = [];
    for (let cur = g; cur !== -1 && cur !== plan.a; cur = prev[cur]) route.push(cur);
    for (const i of route) cost[i] = 1;
    for (const i of route.reverse()) if (!seen.has(i)) { seen.add(i); out.push(i); }
  }
  return out;
}

let lastReplanTick = -1;            // at most one room replans per tick

function buildRoom(roomName) {
  if (!roomName) return;
  const room = Game.rooms[roomName];
  if (!room || !room.controller || !room.controller.my) return;
  if (Game.time % TICK_INTERVAL !== 0) return;

  const pm = plannerMem(room.name, true);                // the one folder for everything planner-related
  const mem = Memory.rooms[room.name];                     // the room's own memory (remote mining data lives here, untouched)
  if (!pm.plan || pm.plan.v !== PLAN_VERSION) {
    if (Game.cpu.bucket < REPLAN_MIN_BUCKET || lastReplanTick === Game.time) {
      console.log(`[RoomPlanner] ${room.name}: replan deferred (plan v${pm.plan ? pm.plan.v : 'none'} -> v${PLAN_VERSION}), bucket ${Game.cpu.bucket}/${REPLAN_MIN_BUCKET}`);
      if (!pm.plan) return;            // an older plan keeps being used until the bucket recovers
    } else {
      lastReplanTick = Game.time;
      const t0 = Game.cpu.getUsed();
      const newPlan = generatePlan(room);
      const buildingsCpu = Game.cpu.getUsed() - t0;
      if (!newPlan) return;
      console.log(`[RoomPlanner] Replanned room (${room.name}) buildings cpu used ${buildingsCpu.toFixed(2)}; walls and towers are planned next by WallPlanner on a later tick`);
      pm.plan = newPlan;
      pm.planTick = Game.time;         // WallPlanner waits for a LATER tick, and uses this to tell its plan is current
      delete pm.defense;               // the old defence belonged to the old layout
    }
  }
  const plan = pm.plan;
  const rcl = room.controller.level;

  // snapshot of what exists / is queued
  const built = new Set(), queued = new Set(), count = {};
  for (const s of room.find(FIND_STRUCTURES)) {
    built.add(`${idxOf(s.pos.x, s.pos.y)}:${s.structureType}`);
    count[s.structureType] = (count[s.structureType] || 0) + 1;
  }
  const sites = room.find(FIND_CONSTRUCTION_SITES);
  for (const cs of sites) {
    queued.add(`${idxOf(cs.pos.x, cs.pos.y)}:${cs.structureType}`);
    count[cs.structureType] = (count[cs.structureType] || 0) + 1;
  }

  let slots = Math.min(MAX_SITES_PER_RUN - sites.length, MAX_GAME_SITES - Object.keys(Game.constructionSites).length);
  // Wall and rampart sites belong to the DEFENCE and are throttled separately (DEFENSE_SITE_CAP). They must not
  // count as "something else is still being built": that used to freeze the wall line (and the ramparts over
  // structures) whenever ANY site, even a stuck one, existed in the room.
  const isDefenceType = type => type === STRUCTURE_WALL || type === STRUCTURE_RAMPART;
  let defenceSites = sites.filter(cs => isDefenceType(cs.structureType)).length;   // wall/rampart sites alive right now
  let nonRoadPending = sites.some(s => s.structureType !== STRUCTURE_ROAD && !isDefenceType(s.structureType));

  // quiet = true for the long wall line: it must not hold roads back (nonRoadPending) while it is built.
  let lastRc = OK;                                      // result code of the most recent createConstructionSite call
  const tryCreate = (i, type, quiet) => {
    const rc = room.createConstructionSite(xOf(i), yOf(i), type);
    lastRc = rc;
    if (rc === OK) {
      slots--;
      queued.add(`${i}:${type}`);
      count[type] = (count[type] || 0) + 1;
      if (isDefenceType(type)) defenceSites++;
      else if (type !== STRUCTURE_ROAD && !quiet) nonRoadPending = true;
      return true;
    }
    if (rc === ERR_FULL) slots = 0;       // global site limit hit
    return false;                          // tile blocked etc. - try the next planned tile
  };

  // temporary storage container: build it until the real storage exists, then remove it
  if (plan.temp !== undefined && plan.temp >= 0) {
    const tx = xOf(plan.temp), ty = yOf(plan.temp);
    const tempContainer = room.lookForAt(LOOK_STRUCTURES, tx, ty).find(s => s.structureType === STRUCTURE_CONTAINER);
    if (room.storage) {
      if (tempContainer && room.find(FIND_HOSTILE_CREEPS).length === 0) tempContainer.destroy();
    } else if (rcl >= 2 && slots > 0 && !tempContainer && !queued.has(`${plan.temp}:${STRUCTURE_CONTAINER}`)) {
      tryCreate(plan.temp, STRUCTURE_CONTAINER);
    }
  }

  // structures in priority order, limited by what this RCL allows
  for (const type of BUILD_ORDER) {
    if (rcl < 2 && type !== STRUCTURE_SPAWN) continue;
    const tiles = plannedTiles(pm, type);              // plan + WallPlanner additions (towers, tower container/link)
    const limit = (CONTROLLER_STRUCTURES[type] || {})[rcl] || 0;
    if (!tiles.length || !limit) continue;
    for (const i of tiles) {
      if (slots <= 0 || (count[type] || 0) >= limit) break;
      if (plan.deferredUntilRcl && plan.deferredUntilRcl[i] > rcl) continue;
      if (built.has(`${i}:${type}`) || queued.has(`${i}:${type}`)) continue;
      tryCreate(i, type);
    }
  }

  // ramparts over critical structures that already exist (needs the structure finished first)
  const defense = defenseFor(pm);
  if (slots > 0 && rcl >= RAMPART_MIN_RCL && defenceSites < DEFENSE_SITE_CAP) {
    const targets = [];                                // [{ type, i }] every structure that deserves a rampart on top
    for (const type of RAMPART_TYPES) for (const i of plannedTiles(pm, type)) targets.push({ type, i });
    if (defense) {                                     // the tower cluster's container and link are protected too
      if (defense.container >= 0) targets.push({ type: STRUCTURE_CONTAINER, i: defense.container });
      if (defense.link >= 0) targets.push({ type: STRUCTURE_LINK, i: defense.link });
    }
    for (const { type, i } of targets) {
      if (slots <= 0 || defenceSites >= DEFENSE_SITE_CAP) break;
      if (!built.has(`${i}:${type}`)) continue;
      if (built.has(`${i}:${STRUCTURE_RAMPART}`) || queued.has(`${i}:${STRUCTURE_RAMPART}`)) continue;
      tryCreate(i, STRUCTURE_RAMPART);
    }
  }

  // the wall line planned by WallPlanner: gates (ramparts our creeps can walk through) first, then walls.
  // It only uses leftover slots (structures above are placed first) and keeps at most DEFENSE_SITE_CAP sites alive.
  // It deliberately does NOT wait for other sites to finish: one stuck site must never freeze the whole line.
  if (defense && slots > 0 && rcl >= DEFENSE_LINE_MIN_RCL && defenceSites < DEFENSE_SITE_CAP) {
    // Tiles our creeps are known to walk through (saved remote-mining routes in this room): a wall there
    // would trap them, so those tiles get a rampart instead.
    const walkedByUs = new Set();
    for (const remoteName in (mem.remoterooms || {})) {
      for (const src of (mem.remoterooms[remoteName].Sources || [])) {
        for (const p of (src.pathToHome || [])) if (p.roomName === room.name) walkedByUs.add(idxOf(p.x, p.y));
      }
    }
    const refused = [];                                // defence tiles the game itself refused (should never happen)
    for (const i of defense.gates) {
      if (slots <= 0 || defenceSites >= DEFENSE_SITE_CAP) break;
      if (built.has(`${i}:${STRUCTURE_RAMPART}`) || queued.has(`${i}:${STRUCTURE_RAMPART}`)) continue;
      if (!tryCreate(i, STRUCTURE_RAMPART, true) && lastRc === ERR_INVALID_TARGET) refused.push(i);
    }
    for (const i of defense.walls) {
      if (slots <= 0 || defenceSites >= DEFENSE_SITE_CAP) break;
      if (built.has(`${i}:${STRUCTURE_WALL}`) || queued.has(`${i}:${STRUCTURE_WALL}`)) continue;
      if (built.has(`${i}:${STRUCTURE_RAMPART}`) || queued.has(`${i}:${STRUCTURE_RAMPART}`)) continue;
      const roadHere = built.has(`${i}:${STRUCTURE_ROAD}`) || queued.has(`${i}:${STRUCTURE_ROAD}`);
      if (!tryCreate(i, (roadHere || walkedByUs.has(i)) ? STRUCTURE_RAMPART : STRUCTURE_WALL, true) && lastRc === ERR_INVALID_TARGET) refused.push(i);
    }
    // A tile the planner chose but the game won't build on (e.g. too close to an exit) leaves a hole in the line,
    // so say so loudly instead of skipping it silently. WallPlanner.redo(room) recomputes the defence.
    if (refused.length) console.log(`[RoomPlanner] ${room.name}: ${refused.length} defence tile(s) refused by the game: ${refused.map(t => `(${xOf(t)},${yOf(t)})`).join(' ')}`);
  }

  // Say WHY nothing is happening when the wall line should be going (throttled: once every 5 build runs).
  if (rcl >= DEFENSE_LINE_MIN_RCL && Game.time % (TICK_INTERVAL * 5) < 1) {
    if (!defense) {
      const d = pm.defense;
      console.log(`[RoomPlanner] ${room.name}: wall line is waiting for WallPlanner - ` +
        (!d ? 'no defence plan yet (is WallPlanner.run(roomName) called every tick?)'
            : d.error ? `WallPlanner failed: ${d.error}` : 'its plan belongs to an older layout'));
    } else if (slots <= 0 && defenceSites < DEFENSE_SITE_CAP) {
      console.log(`[RoomPlanner] ${room.name}: wall line has no free construction-site slots (${sites.length} sites alive, ${Object.keys(Game.constructionSites).length} in the whole empire)`);
    }
  }

  // towers that exist but are not in the defence plan (e.g. built by an older version): they keep working,
  // but they use up the tower limit, so the planned cluster can't be finished until they are removed.
  if (defense && Game.time % (TICK_INTERVAL * 10) < 1) {
    const planned = new Set(defense.towers);
    const stray = room.find(FIND_MY_STRUCTURES, { filter: st => st.structureType === STRUCTURE_TOWER && !planned.has(idxOf(st.pos.x, st.pos.y)) });
    if (stray.length) console.log(`[RoomPlanner] ${room.name}: ${stray.length} tower(s) are not in the defence plan: ${stray.map(t => `(${t.pos.x},${t.pos.y})`).join(' ')}`);
  }

  // roads last, and only once nothing else is waiting to be built; each group is built center-out
  if (slots > 0 && rcl >= TRUNK_ROAD_MIN_RCL && !nonRoadPending) {
    const buildRoads = tiles => {
      for (const i of tiles) {
        if (slots <= 0) break;
        if (built.has(`${i}:${STRUCTURE_ROAD}`) || queued.has(`${i}:${STRUCTURE_ROAD}`)) continue;
        tryCreate(i, STRUCTURE_ROAD);
      }
    };

    // 1) main roads: every source, the controller and the mineral to the core
    const trunk = plan.trunk || [];
    buildRoads(trunk);

    // gate roads: each gate joined back to the anchor, treated as part of the main road
    if (defense && rcl >= DEFENSE_LINE_MIN_RCL) {
      if (!defense.gateRoads) defense.gateRoads = planGateRoads(room, plan, defense);
      buildRoads(defense.gateRoads);
    }

    // Remote and remaining roads wait for ROAD_MIN_RCL
    if (rcl >= ROAD_MIN_RCL) {
      // 2) remote mines, from the home room outward (saved paths run source -> home, so reverse them)
      const remotes = (mem.remoterooms) || {};
      for (const remoteName in remotes) {
        const remote = remotes[remoteName];
        if (!remote.Sources || remote.isSafe !== true || remote.isOwned) continue;
        for (const src of remote.Sources) {
          if (!src.pathToHome) continue;
          for (let k = src.pathToHome.length - 1; k >= 0 && slots > 0; k--) {
            const p = src.pathToHome[k];
            const pRoom = Game.rooms[p.roomName];
            if (!pRoom || p.x < 1 || p.y < 1 || p.x > 48 || p.y > 48) continue;   // no vision / exit tile
            if (pRoom.lookForAt(LOOK_STRUCTURES, p.x, p.y).some(s => s.structureType === STRUCTURE_ROAD)) continue;
            if (pRoom.lookForAt(LOOK_CONSTRUCTION_SITES, p.x, p.y).length) continue;
            if (pRoom.createConstructionSite(p.x, p.y, STRUCTURE_ROAD) === OK) slots--;
          }
        }
      }

      // 3) everything else (lattice, lab ring)
      const trunkSet = new Set(trunk.concat((defense && defense.gateRoads) || []));
      buildRoads((plan.s[STRUCTURE_ROAD] || []).filter(i => !trunkSet.has(i)));
    }
  }

  pm.lastRun = Game.time;
}

// ---------------------------------------------------------------- infrastructure lookup (used by CondensedMain)
/**
 * getInfra(room) - "which BUILT container/link plays which role?"
 *
 * The plan only stores tile indices. This helper turns them into live game objects so other
 * modules never have to search the room themselves. Anything not built yet is null.
 *
 *   {
 *     coreLink, controllerLink, controllerContainer, mineralContainer,   // Structure | null
 *     towerContainer, towerLink,                                         // Structure | null (the prime tower cluster)
 *     towers: [Structure]                                                // built towers from the defence plan
 *     sources: [{ sourceId, container, link }]                           // one entry per source
 *   }
 *
 * Returns null when the room has no plan yet (the planner creates it on its first run).
 */
function getInfra(room) {
  const pm = plannerMem(room.name, false);
  const plan = pm && pm.plan;
  if (!plan || !plan.roles) return null;
  const roles = plan.roles;

  // Find a built structure of `type` on planned tile `i` (null if the tile is unset or still empty).
  const builtAt = (i, type) => {
    if (i === undefined || i === null || i < 0) return null;
    const here = room.lookForAt(LOOK_STRUCTURES, xOf(i), yOf(i));
    return here.find(st => st.structureType === type) || null;
  };
  // Source objects have ids; the plan only knows their tile, so look the id up.
  const sourceIdAt = i => {
    const found = room.lookForAt(LOOK_SOURCES, xOf(i), yOf(i))[0];
    return found ? found.id : undefined;
  };

  const defense = defenseFor(pm);
  return {
    // tower cluster from WallPlanner: the container a hauler stands on, the link beside it, and the towers
    towerContainer: defense ? builtAt(defense.container, STRUCTURE_CONTAINER) : null,
    towerLink: defense ? builtAt(defense.link, STRUCTURE_LINK) : null,
    towers: defense ? defense.towers.map(i => builtAt(i, STRUCTURE_TOWER)).filter(Boolean) : [],
    coreLink: builtAt(roles.coreLink, STRUCTURE_LINK),
    controllerLink: roles.controller ? builtAt(roles.controller.link, STRUCTURE_LINK) : null,
    controllerContainer: roles.controller ? builtAt(roles.controller.container, STRUCTURE_CONTAINER) : null,
    mineralContainer: roles.mineral ? builtAt(roles.mineral.container, STRUCTURE_CONTAINER) : null,
    sources: roles.sources.map(r => ({
      sourceId: sourceIdAt(r.source),
      container: builtAt(r.container, STRUCTURE_CONTAINER),
      link: builtAt(r.link, STRUCTURE_LINK)
    }))
  };
}

// ---------------------------------------------------------------- debugging helpers
function replan(roomName) {
  const pm = plannerMem(roomName, false);
  if (pm) { delete pm.plan; delete pm.planTick; delete pm.defense; }   // defence belongs to the layout, so it goes too
  return `plan for ${roomName} cleared; it will be regenerated on the next run`;
}

function drawPlan(roomName) {
  const pm = plannerMem(roomName, false);
  if (!pm || !pm.plan) return;
  const symbols = {
    [STRUCTURE_SPAWN]: 'S', [STRUCTURE_EXTENSION]: 'e', [STRUCTURE_TOWER]: 'T', [STRUCTURE_STORAGE]: 'W',
    [STRUCTURE_LINK]: 'l', [STRUCTURE_LAB]: 'L', [STRUCTURE_TERMINAL]: 't', [STRUCTURE_FACTORY]: 'F',
    [STRUCTURE_POWER_SPAWN]: 'P', [STRUCTURE_OBSERVER]: 'o', [STRUCTURE_NUKER]: 'N',
    [STRUCTURE_CONTAINER]: 'c', [STRUCTURE_EXTRACTOR]: 'X', [STRUCTURE_ROAD]: '·'
  };
  const vis = new RoomVisual(roomName);
  for (const type in pm.plan.s) {
    for (const i of pm.plan.s[type]) {
      vis.text(symbols[type] || '?', xOf(i), yOf(i) + 0.2, { font: 0.5, opacity: type === STRUCTURE_ROAD ? 0.4 : 0.9 });
    }
  }
}

module.exports = { buildRoom, buildBunker: buildRoom, planRoom, generatePlan, getInfra, replan, drawPlan, plannerMem, defenceStatus };


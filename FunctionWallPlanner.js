// progressiveWallBuilder_patched.js
// Call progressiveWallBuilder_patched.run(roomName) each tick
// This version includes the "stuck" detection + PathFinder escalation patch.

var CPU_BUCKET_MIN = 2000;
var MIN_ROOM_COVERAGE = 0.30;
var MAX_RADIUS = 20;
var RADIAL_STEPS = 48;
var MAX_GAP_FILL = 6;
var MAX_FILL_PER_TICK = 2;
var POOL_MAX = 50;
var EXTRA_MUTATIONS = 20;
var VIS_CANDIDATE = "#ff8800";
var VIS_BEST = "#44aaff";
var VIS_FINAL = "#ff2244";
var VIS_CENTER = "#ffff00";

function run(roomName) {
    var room = Game.rooms[roomName];
    if (!room) return;
    if (Game.cpu.bucket < CPU_BUCKET_MIN) return;

    if (!Memory.rooms) Memory.rooms = {};
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
    var roomMem = Memory.rooms[roomName];
    if (!roomMem.walls) roomMem.walls = {};
    var mem = roomMem.walls;

    var terrain = room.getTerrain();

    // init center if missing
    if (!mem.center) {
        var centerInfo = findBestCenter(room, terrain);
        if (!centerInfo) { mem.center = null; return; }
        mem.center = { x: centerInfo.x, y: centerInfo.y, dist: centerInfo.dist };
        mem.state = { nextRadius: 4, lastCandidate: [], done: false, tryingExtra: false, extraRounds: 0, stuckTicks: 0, lastLargestGapKey: null };
        mem.pool = [];
        mem.best = null;
        mem.saved = [];
    }

    var center = mem.center;
    var state = mem.state;
    var totalPassable = countPassable(terrain);
    var requiredCoverage = Math.ceil(MIN_ROOM_COVERAGE * totalPassable);

    if (!mem.pool || !mem.pool.length) {
        mem.pool = [];
        var seed = radialCandidate(center, terrain, 6);
        if (seed && seed.length) {
            var evalSeed = evaluateBlocked(terrain, seed);
            var scoreSeed = evalSeed.rampCount > 0 ? (evalSeed.enclosed / evalSeed.rampCount) : 0;
            mem.pool.push({ tiles: seed, score: scoreSeed, enclosed: evalSeed.enclosed });
            mem.pool.sort(comparePool);
        }
    }

    // --- Grow existing candidate branch with stuck handling (patched) ---
    if (state.lastCandidate && state.lastCandidate.length) {
        // CONFIG for stuck handling
        var STUCK_THRESHOLD = 8;
        var PATHFILL_MAX_STEPS = 4;
        if (typeof state.stuckTicks !== "number") state.stuckTicks = 0;
        if (typeof state.lastLargestGapKey === "undefined") state.lastLargestGapKey = null;

        var ordered = orderByAngle(state.lastCandidate, center);
        var gaps = findGaps(ordered, MAX_GAP_FILL * 4);
        if (!gaps.length) {
            evaluateAndMaybeAccept(room, mem, ordered, terrain, requiredCoverage);
            if (mem.best && state.tryingExtra) {
                runExtraMutations(room, mem, terrain, requiredCoverage);
            } else {
                state.nextRadius = Math.min(state.nextRadius + 1, MAX_RADIUS + 1);
                state.lastCandidate = [];
                state.stuckTicks = 0;
                state.lastLargestGapKey = null;
            }
        } else {
            var largest = gaps[0];
            var gapKey = largest.a.x + "," + largest.a.y + "|" + largest.b.x + "," + largest.b.y;

            if (state.lastLargestGapKey === gapKey) state.stuckTicks++;
            else { state.lastLargestGapKey = gapKey; state.stuckTicks = 0; }

            var fillCount = Math.min(MAX_FILL_PER_TICK, largest.gap);
            var fillTiles = tilesBetweenLimited(largest.a, largest.b, fillCount);

            var usedFill = [];
            var present = {};
            for (var i = 0; i < ordered.length; i++) present[ordered[i].x + "," + ordered[i].y] = true;

            for (var j = 0; j < fillTiles.length; j++) {
                var p = fillTiles[j];
                if (p.x < 0 || p.x > 49 || p.y < 0 || p.y > 49) continue;
                if (terrain.get(p.x, p.y) === TERRAIN_MASK_WALL) continue;
                var k = p.x + "," + p.y;
                if (present[k]) continue;
                present[k] = true;
                usedFill.push({ x: p.x, y: p.y });
            }

            // PathFinder escalation if stuck mid-way
            if (!usedFill.length && state.stuckTicks >= Math.floor(STUCK_THRESHOLD / 2)) {
                try {
                    var pathRes = PathFinder.search(
                        { pos: largest.a, range: 0 },
                        { pos: largest.b, range: 0 },
                        {
                            plainCost: 1, swampCost: 1,
                            maxOps: 5000,
                            roomCallback: function(rn) {
                                var robj = Game.rooms[rn];
                                if (!robj) return;
                                var terr = robj.getTerrain();
                                // return cost matrix callback (we keep default costs; PathFinder requires numeric map)
                                return;
                            }
                        }
                    );
                    if (pathRes && pathRes.path && pathRes.path.length) {
                        var steps = Math.min(PATHFILL_MAX_STEPS, pathRes.path.length - 1);
                        for (var si = 1; si <= steps; si++) {
                            var node = pathRes.path[si];
                            if (!node) continue;
                            var kk = node.x + "," + node.y;
                            if (present[kk]) continue;
                            if (terrain.get(node.x, node.y) === TERRAIN_MASK_WALL) continue;
                            present[kk] = true;
                            usedFill.push({ x: node.x, y: node.y });
                        }
                    }
                } catch (e) {
                    // PathFinder may throw if room callback returned undefined; ignore and proceed to escalation fill
                }
            }

            // escalation partial fill if still stuck
            if (!usedFill.length && state.stuckTicks >= STUCK_THRESHOLD) {
                var extraFillCount = Math.min(MAX_FILL_PER_TICK * 2, largest.gap);
                var partial = tilesBetweenLimited(largest.a, largest.b, extraFillCount);
                for (var pj = 0; pj < partial.length; pj++) {
                    var q = partial[pj];
                    if (q.x < 0 || q.x > 49 || q.y < 0 || q.y > 49) continue;
                    if (terrain.get(q.x, q.y) === TERRAIN_MASK_WALL) continue;
                    var kk2 = q.x + "," + q.y;
                    if (present[kk2]) continue;
                    present[kk2] = true;
                    usedFill.push({ x: q.x, y: q.y });
                }
            }

            // If still nothing after escalation, advance radius to avoid stall
            if (!usedFill.length && state.stuckTicks >= STUCK_THRESHOLD) {
                state.nextRadius = Math.min(state.nextRadius + 1, MAX_RADIUS + 1);
                state.lastCandidate = [];
                state.stuckTicks = 0;
                state.lastLargestGapKey = null;
            } else {
                var newSet = [];
                for (var k2 in present) {
                    var sp2 = k2.split(",");
                    newSet.push({ x: Number(sp2[0]), y: Number(sp2[1]) });
                }
                newSet = orderByAngle(newSet, center);
                state.lastCandidate = newSet.slice();

                if (usedFill.length) {
                    state.stuckTicks = 0;
                    state.lastLargestGapKey = null;
                }

                var evalNow = evaluateBlocked(terrain, newSet);
                if (evalNow.enclosed >= requiredCoverage && controllerAndSpawnsInside(room, evalNow.outside)) {
                    var score = evalNow.rampCount > 0 ? (evalNow.enclosed / evalNow.rampCount) : 0;
                    var straight = straightenOrdered(orderByAngle(newSet, center), terrain);
                    mem.best = { score: score, enclosed: evalNow.enclosed, rampCount: evalNow.rampCount, tiles: straight };
                    mem.saved = [];
                    for (var s = 0; s < straight.length; s++) mem.saved.push({ x: straight[s].x, y: straight[s].y });
                    if (!mem.pool) mem.pool = [];
                    mem.pool.unshift({ tiles: newSet.slice(), score: score, enclosed: evalNow.enclosed });
                    mem.pool.sort(comparePool);
                    if (mem.pool.length > POOL_MAX) mem.pool.length = POOL_MAX;
                    state.tryingExtra = true;
                    state.extraRounds = 0;
                }
            }
        }
    } else {
        // sample new perimeter candidate at state.nextRadius
        if (state.nextRadius > MAX_RADIUS) {
            state.done = true;
            if (mem.best && !state.tryingExtra) state.tryingExtra = true;
        } else {
            var ring = radialCandidate(center, terrain, state.nextRadius);
            state.nextRadius++;
            if (ring && ring.length) {
                ring = orderByAngle(ring, center);
                ring = smallGapFill(ring, terrain, MAX_GAP_FILL);
                state.lastCandidate = ring.slice();
            }
        }
    }

    // tryingExtra bounded extra mutations
    if (state.tryingExtra && mem.best) {
        var didImprove = runExtraMutations(room, mem, terrain, requiredCoverage);
        if (!didImprove) {
            state.extraRounds = (state.extraRounds || 0) + 1;
            if (state.extraRounds > 5) {
                state.tryingExtra = false;
                state.extraRounds = 0;
                state.lastCandidate = [];
            }
        } else {
            state.extraRounds = 0;
        }
    }

    drawVisuals(roomName, mem);
}

/* ===== Helpers (including findBestCenter) ===== */

function findBestCenter(room, terrain) {
    var WALL_MIN_SIZE = 5;
    var half = Math.floor(WALL_MIN_SIZE / 2);
    var dist = [];
    for (var y = 0; y < 50; y++) { dist[y] = new Array(50); for (var x = 0; x < 50; x++) dist[y][x] = -1; }
    var q = [];
    for (var x = 0; x < 50; x++) {
        if (terrain.get(x, 0) !== TERRAIN_MASK_WALL) { dist[0][x] = 0; q.push({ x: x, y: 0 }); }
        if (terrain.get(x, 49) !== TERRAIN_MASK_WALL) { dist[49][x] = 0; q.push({ x: x, y: 49 }); }
    }
    for (var y2 = 0; y2 < 50; y2++) {
        if (terrain.get(0, y2) !== TERRAIN_MASK_WALL) { dist[y2][0] = 0; q.push({ x: 0, y: y2 }); }
        if (terrain.get(49, y2) !== TERRAIN_MASK_WALL) { dist[y2][49] = 0; q.push({ x: 49, y: y2 }); }
    }
    var dirs4 = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    while (q.length) {
        var n = q.shift();
        var cx = n.x, cy = n.y;
        for (var di = 0; di < dirs4.length; di++) {
            var nx = cx + dirs4[di].dx, ny = cy + dirs4[di].dy;
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            if (dist[ny][nx] !== -1) continue;
            dist[ny][nx] = dist[cy][cx] + 1;
            q.push({ x: nx, y: ny });
        }
    }
    var best = null, bestDist = -1;
    for (var yy = half; yy <= 49 - half; yy++) {
        for (var xx = half; xx <= 49 - half; xx++) {
            var ok = true;
            for (var ay = yy - half; ay <= yy + half && ok; ay++) {
                for (var ax = xx - half; ax <= xx + half; ax++) {
                    if (terrain.get(ax, ay) === TERRAIN_MASK_WALL) { ok = false; break; }
                }
            }
            if (!ok) continue;
            var d = dist[yy][xx];
            if (d === -1) continue;
            if (d > bestDist) { bestDist = d; best = { x: xx, y: yy, dist: d }; }
        }
    }
    return best;
}

function countPassable(terrain){ var t=0; for(var y=0;y<50;y++) for(var x=0;x<50;x++) if(terrain.get(x,y)!==TERRAIN_MASK_WALL) t++; return t; }

function radialCandidate(center, terrain, radius) {
    var steps = Math.max(12, Math.ceil(2 * Math.PI * radius * 1.2));
    var map = {}, list = [];
    for (var s = 0; s < steps; s++) {
        var theta = (2 * Math.PI * s) / steps;
        var ix = Math.round(center.x + radius * Math.cos(theta));
        var iy = Math.round(center.y + radius * Math.sin(theta));
        if (ix < 0 || ix > 49 || iy < 0 || iy > 49) continue;
        if (terrain.get(ix, iy) === TERRAIN_MASK_WALL) continue;
        var k = ix + "," + iy;
        if (!map[k]) { map[k] = true; list.push({ x: ix, y: iy }); }
    }
    return orderByAngle(list, center);
}

function orderByAngle(arr, center) {
    var list = arr.slice();
    list.sort(function(a,b){ return Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x); });
    return list;
}

function smallGapFill(list, terrain, maxGap) {
    if (!list || !list.length) return list;
    var present = {};
    for (var i = 0; i < list.length; i++) present[list[i].x + "," + list[i].y] = true;
    var out = list.slice();
    for (var i2 = 0; i2 < list.length; i2++) {
        var a = list[i2];
        var b = list[(i2 + 1) % list.length];
        var dx = b.x - a.x, dy = b.y - a.y;
        var gap = Math.max(Math.abs(dx), Math.abs(dy));
        if (gap > 1 && gap <= maxGap) {
            var steps = gap;
            for (var t = 1; t < steps; t++) {
                var fx = Math.round(a.x + (dx * t) / steps);
                var fy = Math.round(a.y + (dy * t) / steps);
                var k = fx + "," + fy;
                if (fx < 0 || fx > 49 || fy < 0 || fy > 49) continue;
                if (terrain.get(fx, fy) === TERRAIN_MASK_WALL) continue;
                if (!present[k]) { present[k] = true; out.push({ x: fx, y: fy }); }
            }
        }
    }
    return orderByAngle(out, { x: Math.round(sum(out,"x")/Math.max(1,out.length)), y: Math.round(sum(out,"y")/Math.max(1,out.length)) });
}

function tilesBetweenLimited(a, b, maxTiles) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var gap = Math.max(Math.abs(dx), Math.abs(dy));
    var steps = Math.min(gap, Math.max(1, maxTiles + 1));
    var out = [];
    for (var t = 1; t < steps; t++) {
        var fx = Math.round(a.x + (dx * t) / steps);
        var fy = Math.round(a.y + (dy * t) / steps);
        out.push({ x: fx, y: fy });
    }
    return out;
}

function evaluateAndMaybeAccept(room, mem, candidateOrdered, terrain, requiredCoverage) {
    if (!candidateOrdered || !candidateOrdered.length) return false;
    var evalR = evaluateBlocked(terrain, candidateOrdered);
    if (evalR.enclosed >= requiredCoverage && controllerAndSpawnsInside(room, evalR.outside)) {
        var score = evalR.rampCount > 0 ? (evalR.enclosed / evalR.rampCount) : 0;
        var straight = straightenOrdered(orderByAngle(candidateOrdered, mem.center), terrain);
        mem.best = { score: score, enclosed: evalR.enclosed, rampCount: evalR.rampCount, tiles: straight };
        mem.saved = [];
        for (var si = 0; si < straight.length; si++) mem.saved.push({ x: straight[si].x, y: straight[si].y });
        mem.pool.unshift({ tiles: candidateOrdered.slice(), score: score, enclosed: evalR.enclosed });
        mem.pool.sort(comparePool);
        if (mem.pool.length > POOL_MAX) mem.pool.length = POOL_MAX;
        mem.state.tryingExtra = true;
        mem.state.extraRounds = 0;
        return true;
    }
    return false;
}

function runExtraMutations(room, mem, terrain, requiredCoverage) {
    var improvedAny = false;
    var base = mem.best ? mem.best.tiles : (mem.pool && mem.pool[0] ? mem.pool[0].tiles : null);
    if (!base) return false;
    for (var e = 0; e < Math.min(EXTRA_MUTATIONS, 8); e++) {
        var proposal = randomMutation(base, mem.center, terrain);
        var prop = normalizeTilesArray(proposal);
        if (!prop.length) continue;
        var evalP = evaluateBlocked(terrain, prop);
        if (evalP.enclosed < requiredCoverage) continue;
        if (!controllerAndSpawnsInside(room, evalP.outside)) continue;
        var scoreP = evalP.rampCount > 0 ? (evalP.enclosed / evalP.rampCount) : 0;
        if (!mem.best || scoreP > mem.best.score || (scoreP === mem.best.score && evalP.enclosed > mem.best.enclosed)) {
            var straight = straightenOrdered(orderByAngle(prop, mem.center), terrain);
            mem.best = { score: scoreP, enclosed: evalP.enclosed, rampCount: evalP.rampCount, tiles: straight };
            mem.saved = [];
            for (var si = 0; si < straight.length; si++) mem.saved.push({ x: straight[si].x, y: straight[si].y });
            mem.pool.unshift({ tiles: prop.slice(), score: scoreP, enclosed: evalP.enclosed });
            mem.pool.sort(comparePool);
            if (mem.pool.length > POOL_MAX) mem.pool.length = POOL_MAX;
            improvedAny = true;
            break;
        }
    }
    return improvedAny;
}

function randomMutation(baseTiles, center, terrain) {
    var set = {};
    for (var i = 0; i < baseTiles.length; i++) set[baseTiles[i].x + "," + baseTiles[i].y] = true;
    var arr = [];
    for (var k in set) { var p = k.split(","); arr.push({ x: Number(p[0]), y: Number(p[1]) }); }
    if (!arr.length) return [];
    var removeCount = Math.random() < 0.7 ? 1 : 2;
    for (var r = 0; r < removeCount; r++) {
        var idx = Math.floor(Math.random()*arr.length);
        arr.splice(idx, 1);
    }
    var added = 0;
    for (var radius = 1; radius <= 6 && added < removeCount; radius++) {
        for (var dx = -radius; dx <= radius && added < removeCount; dx++) {
            for (var dy = -radius; dy <= radius && added < removeCount; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                var x = center.x + dx, y = center.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x,y) === TERRAIN_MASK_WALL) continue;
                var present = false;
                for (var ai = 0; ai < arr.length; ai++) if (arr[ai].x === x && arr[ai].y === y) { present = true; break; }
                if (present) continue;
                arr.push({ x: x, y: y });
                added++;
            }
        }
    }
    return arr;
}

function normalizeTilesArray(arr) {
    var map = {};
    for (var i = 0; i < arr.length; i++) {
        var p = arr[i];
        if (!p || typeof p.x !== "number") continue;
        map[p.x + "," + p.y] = true;
    }
    var out = [];
    for (var k in map) { var sp = k.split(","); out.push({ x: Number(sp[0]), y: Number(sp[1]) }); }
    return out;
}

function evaluateBlocked(terrain, blockedTiles){
    var blocked = {};
    for (var i = 0; i < blockedTiles.length; i++) blocked[blockedTiles[i].x + "," + blockedTiles[i].y] = true;
    var outside = [];
    for (var y = 0; y < 50; y++) { outside[y] = new Array(50); for (var x = 0; x < 50; x++) outside[y][x] = false; }
    var q = [];
    for (var x = 0; x < 50; x++) {
        if (terrain.get(x, 0) !== TERRAIN_MASK_WALL && !blocked[x + ",0"]) { outside[0][x] = true; q.push({ x: x, y: 0 }); }
        if (terrain.get(x, 49) !== TERRAIN_MASK_WALL && !blocked[x + ",49"]) { outside[49][x] = true; q.push({ x: x, y: 49 }); }
    }
    for (var y = 0; y < 50; y++) {
        if (terrain.get(0, y) !== TERRAIN_MASK_WALL && !blocked["0," + y]) { outside[y][0] = true; q.push({ x: 0, y: y }); }
        if (terrain.get(49, y) !== TERRAIN_MASK_WALL && !blocked["49," + y]) { outside[y][49] = true; q.push({ x: 49, y: y }); }
    }
    var dirs8 = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:-1,dy:-1}];
    while (q.length) {
        var n = q.shift();
        var cx = n.x, cy = n.y;
        for (var i = 0; i < dirs8.length; i++) {
            var nx = cx + dirs8[i].dx, ny = cy + dirs8[i].dy;
            if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
            if (outside[ny][nx]) continue;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            if (blocked[nx + "," + ny]) continue;
            outside[ny][nx] = true;
            q.push({ x: nx, y: ny });
        }
    }
    var enclosed = 0;
    for (var yy = 0; yy < 50; yy++) {
        for (var xx = 0; xx < 50; xx++) {
            if (terrain.get(xx, yy) === TERRAIN_MASK_WALL) continue;
            if (!outside[yy][xx]) enclosed++;
        }
    }
    return { outside: outside, enclosed: enclosed, rampCount: blockedTiles.length };
}

function controllerAndSpawnsInside(room, outsideMask){
    var ctrl = room.controller; if (ctrl && ctrl.pos) { if (outsideMask[ctrl.pos.y][ctrl.pos.x]) return false; }
    var spawns = room.find(FIND_MY_SPAWNS); for (var i = 0; i < spawns.length; i++) { var sp = spawns[i]; if (outsideMask[sp.pos.y][sp.pos.x]) return false; } return true;
}

function findGaps(ordered, maxGap) {
    var gaps = [];
    if (!ordered || !ordered.length) return gaps;
    for (var i = 0; i < ordered.length; i++) {
        var a = ordered[i];
        var b = ordered[(i + 1) % ordered.length];
        var dx = b.x - a.x, dy = b.y - a.y;
        var gap = Math.max(Math.abs(dx), Math.abs(dy));
        if (gap > 1) gaps.push({ a: a, b: b, gap: gap, dx: dx, dy: dy });
    }
    gaps.sort(function(x,y){ return y.gap - x.gap; });
    return gaps;
}

function straightenOrdered(ordered, terrain) {
    if (!ordered || ordered.length < 3) return ordered.slice();
    var keys = [];
    var prevDir = null;
    for (var i = 0; i < ordered.length; i++) {
        var a = ordered[i];
        var b = ordered[(i + 1) % ordered.length];
        var dx = b.x - a.x, dy = b.y - a.y;
        var dir = [Math.sign(dx), Math.sign(dy)].join(",");
        if (i === 0 || dir !== prevDir) { keys.push(a); prevDir = dir; }
    }
    if (keys.length < 3) keys = ordered.slice(0, Math.min(ordered.length, 8));
    var map = {};
    for (var ki = 0; ki < keys.length; ki++) {
        var a = keys[ki], b = keys[(ki + 1) % keys.length];
        var seg = bresenhamLine(a.x, a.y, b.x, b.y);
        for (var si = 0; si < seg.length; si++) {
            var p = seg[si];
            if (p.x < 0 || p.x > 49 || p.y < 0 || p.y > 49) continue;
            if (terrain.get(p.x, p.y) === TERRAIN_MASK_WALL) continue;
            map[p.x + "," + p.y] = true;
        }
    }
    var out = [];
    for (var k in map) { var sp = k.split(","); out.push({ x: Number(sp[0]), y: Number(sp[1]) }); }
    return orderByAngle(out, { x: Math.round(sum(out,"x")/Math.max(1,out.length)), y: Math.round(sum(out,"y")/Math.max(1,out.length)) });
}

function bresenhamLine(x0,y0,x1,y1) {
    var pts = [];
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy, e2;
    var x = x0, y = y0;
    while (true) {
        pts.push({ x: x, y: y });
        if (x === x1 && y === y1) break;
        e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
    }
    return pts;
}

function sum(arr,key){ var s=0; for(var i=0;i<arr.length;i++) s+=arr[i][key]||0; return s; }

function comparePool(a,b){ if(b.score!==a.score) return b.score-a.score; return b.enclosed-a.enclosed; }

function drawVisuals(roomName, mem){
    var vis = new RoomVisual(roomName);
    if (!mem.center) return;
    var center = mem.center;
    vis.circle(center.x, center.y, { radius: 0.6, stroke: VIS_CENTER, fill: "transparent" });
    vis.text("center", center.x, center.y - 1, { color: VIS_CENTER, font: 0.6 });

    if (mem.state && mem.state.lastCandidate && mem.state.lastCandidate.length) {
        var list = mem.state.lastCandidate;
        for (var i=0;i<list.length;i++){
            vis.circle(list[i].x, list[i].y, { radius: 0.35, stroke: VIS_CANDIDATE, fill: "transparent" });
            vis.text(String(i+1), list[i].x, list[i].y - 0.5, { color: VIS_CANDIDATE, font: 0.45, align: "center" });
        }
    }

    if (mem.best && mem.best.tiles && mem.best.tiles.length) {
        for (var bi=0; bi<mem.best.tiles.length; bi++){
            var bt = mem.best.tiles[bi];
            vis.circle(bt.x, bt.y, { radius: 0.45, stroke: VIS_BEST, fill: "transparent" });
            vis.text(String(bi+1), bt.x, bt.y - 0.6, { color: VIS_BEST, font: 0.45, align: "center" });
        }
    }

    if (mem.saved && mem.saved.length) {
        for (var fi=0; fi<mem.saved.length; fi++){
            var f = mem.saved[fi];
            vis.circle(f.x, f.y, { radius: 0.5, stroke: VIS_FINAL, fill: "transparent", lineStyle: "dashed" });
            vis.text(String(fi+1), f.x, f.y - 0.7, { color: VIS_FINAL, font: 0.45, align: "center" });
        }
    }
}

module.exports = { run: run };
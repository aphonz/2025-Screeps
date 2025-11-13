// simpleStamper.js
function placeStampedFlags(roomName, opts) {
  opts = opts || {};
  var EDGE_BUFFER = opts.edgeBuffer !== undefined ? opts.edgeBuffer : 1;
  var EXIT_BUFFER = opts.exitBuffer !== undefined ? opts.exitBuffer : 3;
  var PADDING = opts.pad !== undefined ? opts.pad : 1;
  var CPU_BUCKET_MIN = opts.cpuBucketMin !== undefined ? opts.cpuBucketMin : 500;

  var room = Game.rooms[roomName];
  if (!room) return;

  if (Game.cpu.bucket < CPU_BUCKET_MIN) {
    ensureMem(roomName);
    Memory.rooms[roomName].stampy = { fits: false, reason: "cpu_bucket_low" };
    return;
  }

  var terrain = room.getTerrain();
  var exits = room.find(FIND_EXIT);
  if (!exits || exits.length === 0) {
    ensureMem(roomName);
    Memory.rooms[roomName].stampy = { fits: false, reason: "no_exits_found" };
    return;
  }

  var boxes = [
    { name: "home", size: 7 },
    { name: "extender1", size: 7 },
    { name: "extender2", size: 7 },
    { name: "lab", size: 4 }
  ];

  ensureMem(roomName);
  var mem = Memory.rooms[roomName].stampy;
  mem.fits = false;
  mem.reason = null;

  var anchor = findSafestAnchor(roomName, terrain, exits, EDGE_BUFFER);
  if (!anchor) {
    mem.fits = false;
    mem.reason = "no_valid_anchor";
    return;
  }

  var sizes = unique(boxes.map(function(b){ return b.size; }));
  var candidatesBySize = {};
  for (var i = 0; i < sizes.length; i++) {
    var size = sizes[i];
    candidatesBySize[size] = collectCandidates(roomName, terrain, exits, size, PADDING, EDGE_BUFFER, EXIT_BUFFER);
    if (!candidatesBySize[size] || candidatesBySize[size].length === 0) {
      mem.fits = false;
      mem.reason = "no_candidates_for_size_" + size;
      mem._debug = mem._debug || {};
      mem._debug.candidates = candidatesBySize;
      return;
    }
  }

  var placedRects = [];
  var plan = [];
  for (var bi = 0; bi < boxes.length; bi++) {
    var box = boxes[bi];
    var candList = candidatesBySize[box.size].slice();
    candList.sort(function(a,b){
      var da = squaredDist(a.x, a.y, anchor.x, anchor.y);
      var db = squaredDist(b.x, b.y, anchor.x, anchor.y);
      return da - db;
    });

    var placed = false;
    for (var ci = 0; ci < candList.length; ci++) {
      var top = candList[ci];
      var rect = { x1: top.x - PADDING, y1: top.y - PADDING, x2: top.x + box.size - 1 + PADDING, y2: top.y + box.size - 1 + PADDING };
      if (rectOverlapsAny(rect, placedRects)) continue;
      placedRects.push(rect);
      plan.push({ name: box.name, size: box.size, topLeft: { x: top.x, y: top.y } });
      placed = true;
      break;
    }
    if (!placed) {
      mem.fits = false;
      mem.reason = "could_not_place_" + box.name;
      mem._debug = mem._debug || {};
      mem._debug.failedBox = box.name;
      return;
    }
  }

  for (var p = 0; p < plan.length; p++) {
    var item = plan[p];
    var flagName = item.name + "_" + roomName;
    if (!Game.flags[flagName]) {
      room.createFlag(item.topLeft.x, item.topLeft.y, flagName);
    }
    mem[item.name] = { x: item.topLeft.x, y: item.topLeft.y, size: item.size, pad: PADDING };
  }
  mem.fits = true;
  mem.anchor = { x: anchor.x, y: anchor.y };
  mem.pad = PADDING;
}

// ---- helpers (same as minimal stamper) ----

function ensureMem(roomName) {
  Memory.rooms = Memory.rooms || {};
  Memory.rooms[roomName] = Memory.rooms[roomName] || {};
  Memory.rooms[roomName].stampy = Memory.rooms[roomName].stampy || {};
}

function unique(arr) {
  var out = [];
  for (var i = 0; i < arr.length; i++) if (out.indexOf(arr[i]) === -1) out.push(arr[i]);
  return out;
}

function squaredDist(x1,y1,x2,y2) {
  var dx = x1 - x2; var dy = y1 - y2; return dx*dx + dy*dy;
}

function rectOverlapsAny(r, rects) {
  for (var i = 0; i < rects.length; i++) {
    var o = rects[i];
    var disjoint = r.x2 < o.x1 || r.x1 > o.x2 || r.y2 < o.y1 || r.y1 > o.y2;
    if (!disjoint) return true;
  }
  return false;
}

function findSafestAnchor(roomName, terrain, exits, EDGE_BUFFER) {
  var best = null;
  var bestDist = -1;
  for (var x = EDGE_BUFFER + 1; x <= 48 - EDGE_BUFFER - 1; x++) {
    for (var y = EDGE_BUFFER + 1; y <= 48 - EDGE_BUFFER - 1; y++) {
      if (terrain.get(x,y) === TERRAIN_MASK_WALL) continue;
      var pos = new RoomPosition(x,y,roomName);
      var d = minRangeToExits(pos, exits);
      if (d > bestDist) { bestDist = d; best = pos; }
    }
  }
  return best;
}

function minRangeToExits(pos, exits) {
  var min = Infinity;
  for (var i = 0; i < exits.length; i++) {
    var r = pos.getRangeTo(exits[i]);
    if (r < min) min = r;
  }
  return min;
}

function collectCandidates(roomName, terrain, exits, size, pad, edgeBuf, exitBuf) {
  edgeBuf = edgeBuf || 1;
  exitBuf = exitBuf || 3;
  var out = [];
  var minX = edgeBuf + pad;
  var minY = edgeBuf + pad;
  var maxX = 49 - edgeBuf - pad - size + 1;
  var maxY = 49 - edgeBuf - pad - size + 1;
  for (var x = minX; x <= maxX; x++) {
    for (var y = minY; y <= maxY; y++) {
      var ok = true;
      var x1 = x - pad, y1 = y - pad, x2 = x + size - 1 + pad, y2 = y + size - 1 + pad;
      for (var tx = x1; tx <= x2 && ok; tx++) {
        for (var ty = y1; ty <= y2; ty++) {
          if (terrain.get(tx,ty) === TERRAIN_MASK_WALL) { ok = false; break; }
          var pos = new RoomPosition(tx, ty, roomName);
          if (minRangeToExits(pos, exits) < exitBuf) { ok = false; break; }
        }
      }
      if (ok) out.push({ x: x, y: y });
    }
  }
  return out;
}

module.exports = placeStampedFlags;
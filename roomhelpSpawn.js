// spawnHaulerManager.js
const RoomHelp = require('roomhelp');

const SpawnHelperHaulerManager = {
  cfg: {
    maxCarryParts: 12,
    energyPerCarry: 50,
    carryToMoveRatio: 1,
    defaultDesiredCount: 2 // how many helpers to send per request by default
  },

  spawnFromRequests: function () {
    if (!Memory.helperHaulerRequests) return;

    // Clean up spawnedCreeps lists and compute alive counts
    for (const [roomName, req] of Object.entries(Memory.helperHaulerRequests)) {
      // Skip invalid entries
      if (!req || typeof req !== 'object') {
        delete Memory.helperHaulerRequests[roomName];
        continue;
      }
      
      req.spawnedCreeps = req.spawnedCreeps || [];
      // remove names that no longer exist
      req.spawnedCreeps = req.spawnedCreeps.filter(n => !!Game.creeps[n]);
      req.desiredCount = typeof req.desiredCount === 'number' ? req.desiredCount : this.cfg.defaultDesiredCount;
      // ensure status consistency
      if (!req.status) req.status = 'pending';
    }

    // Build flat pending list: each entry is a request object with roomName
    const pending = Object.keys(Memory.helperHaulerRequests)
      .map(rn => Object.assign({ roomName: rn }, Memory.helperHaulerRequests[rn]))
      .filter(r => r.status === 'pending' || r.status === 'active' || r.status === 'spawning');

    if (pending.length === 0) return;

    // sort by priority then oldest (if you use priority/requestedAt)
    pending.sort((a, b) => {
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      return (a.requestedAt || 0) - (b.requestedAt || 0);
    });

    // iterate requests and try to spawn up to desiredCount
    for (const req of pending) {
      const roomName = req.roomName;

      // how many more creeps do we need for this request?
      const aliveCount = (req.spawnedCreeps || []).length;
      const need = Math.max(0, (req.desiredCount || this.cfg.defaultDesiredCount) - aliveCount);
      if (need === 0) continue;

      // Calculate body BEFORE selecting spawns
      const energyNeeded = req.energyNeeded || 500;
      const carryParts = Math.min(this.cfg.maxCarryParts, Math.ceil(energyNeeded / this.cfg.energyPerCarry));
      const moveParts = Math.ceil(carryParts * this.cfg.carryToMoveRatio);

      const body = [];
      for (let i = 0; i < carryParts; i++) body.push(CARRY);
      for (let i = 0; i < moveParts; i++) body.push(MOVE);

      const cost = this.bodyCost(body);

      // Sort spawns by distance to target room (closest first)
      const sortedSpawns = _.sortBy(Game.spawns, s =>
        Game.map.getRoomLinearDistance(s.room.name, roomName)
      );

      // Try to spawn up to `need` creeps, selecting a spawn that:
      // - is not currently spawning
      // - has enough energy
      // - is NOT located in the target room (sourceRoom must differ)
      let spawnedThisReq = 0;
      for (const s of sortedSpawns) {
        if (spawnedThisReq >= need) break;
        if (!s || s.spawning) continue;
        if (s.room.energyAvailable < cost) continue;
        if (s.room.name === roomName) continue; // do not spawn from the same room you're helping

        // unique name with tick to avoid conflicts
        const name = `helperHauler_${roomName}_${Game.time}_${Math.floor(Math.random()*9999)}`;

        const res = s.spawnCreep(body, name, {
          memory: {
            role: 'helperHauler',
            targetRoom: roomName,
            requestOrigin: roomName,
            sourceRoom: s.room.name
          }
        });

        if (res === OK) {
          // Ensure request object exists and fields present
          const memReq = Memory.helperHaulerRequests[roomName] = Memory.helperHaulerRequests[roomName] || {};
          memReq.spawnedCreeps = memReq.spawnedCreeps || [];
          memReq.spawnedCreeps.push(name);
          memReq.status = 'active'; // Active means creeps are working
          memReq.lastSpawnTime = Game.time;
          memReq.lastSpawnedFrom = s.name;
          spawnedThisReq++;
        } else {
          // optional debug; leave in for diagnostics
          console.log(`[HelperHauler] spawnCreep returned ${res} for ${name} at ${s.name}`);
        }
      }

      // Status is managed by cleanupRequests() in RoomHelp
      // Active = creeps alive, pending = need more creeps
    }
  },

  bodyCost: function (body) {
    return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
  }
};

module.exports = SpawnHelperHaulerManager;
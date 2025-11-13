const RoomHelp = {
  defaultCfg: {
    createRequests: true,
    minEnergyThreshold: 1000,
    maxRequestsPerTick: 5,
    energyPerCarry: 50,
    requestTTL: 1000 // how long requests live in ticks
  },

  scanRoomsForHelp: function(options = {}) {
    const cfg = Object.assign({}, this.defaultCfg, options);
    if (!Memory.helperHaulerRequests) Memory.helperHaulerRequests = {};

    // 🔹 Clean up completed/expired requests before scanning
    this.cleanupRequests();

    const tasks = [];
    let newRequests = 0;

    // Validate Memory.spawnRooms exists
    if (!Memory.spawnRooms || !Array.isArray(Memory.spawnRooms)) {
      console.log('[RoomHelp] Memory.spawnRooms is not valid, skipping scan');
      return tasks;
    }

    for (const roomName of Memory.spawnRooms) {
      // Validate room name is a string
      if (typeof roomName !== 'string') {
        console.log('[RoomHelp] Skipping invalid room entry in Memory.spawnRooms:', roomName);
        continue;
      }

      // Get room object if visible
      const roomObj = Game.rooms[roomName];
      if (!roomObj) {
        // Room not visible, skip it
        continue;
      }

      const energyAvailable = roomObj.energyAvailable || 0;
      const hasTerminal = !!roomObj.terminal;

      if (!hasTerminal && energyAvailable < cfg.minEnergyThreshold) {
        const energyNeeded = Math.max(0, cfg.minEnergyThreshold - energyAvailable);
        const already = Memory.helperHaulerRequests[roomName];

        const task = {
          roomName: roomName,
          reason: 'noTerminal_lowEnergy',
          recommendedRole: 'helperHauler',
          priority: 10,
          energyAvailable,
          energyNeeded
        };
        tasks.push(task);

        // Only create new request if one doesn't exist (not just pending, but any active request)
        if (cfg.createRequests && !already && newRequests < cfg.maxRequestsPerTick) {
          Memory.helperHaulerRequests[roomName] = {
            status: 'pending',
            requestedAt: Game.time,
            energyNeeded,
            priority: 10,
            spawnedCreeps: []
          };
          newRequests++;
        } else if (already && typeof already === 'object' && already.status === 'active') {
          // Request exists and is active - update energy needed for existing request
          already.energyNeeded = energyNeeded;
          already.priority = 10;
        }
      } else if (hasTerminal) {
        tasks.push({
          roomName: roomName,
          reason: 'hasTerminal_considerCombat',
          recommendedRole: 'combat',
          priority: 3,
          energyAvailable
        });
      }
    }

    return tasks;
  },

  clearRequest: function(roomName) {
    if (Memory.helperHaulerRequests && Memory.helperHaulerRequests[roomName]) {
      delete Memory.helperHaulerRequests[roomName];
    }
  },

  clearExpiredRequests: function(ttl = 1000) {
    if (!Memory.helperHaulerRequests) return;
    for (const roomName in Memory.helperHaulerRequests) {
      const req = Memory.helperHaulerRequests[roomName];
      if (!req || typeof req !== 'object') {
        delete Memory.helperHaulerRequests[roomName];
        continue;
      }
      if (req.requestedAt && Game.time - req.requestedAt >= ttl) {
        delete Memory.helperHaulerRequests[roomName];
      }
    }
  },

  cleanupRequests: function() {
    if (!Memory.helperHaulerRequests) return;
    
    for (const roomName in Memory.helperHaulerRequests) {
      const req = Memory.helperHaulerRequests[roomName];
      
      // Skip if request is invalid - shouldn't happen but safety check
      if (!req || typeof req !== 'object') {
        delete Memory.helperHaulerRequests[roomName];
        continue;
      }
      
      // Check if roomName is still in our spawn rooms list
      const stillInSpawnRooms = Memory.spawnRooms && Memory.spawnRooms.includes(roomName);
      if (!stillInSpawnRooms) {
        // Room is no longer in our control or spawn list, remove request
        delete Memory.helperHaulerRequests[roomName];
        continue;
      }
      
      // Clean up dead creeps from tracking list
      req.spawnedCreeps = (req.spawnedCreeps || []).filter(name => Game.creeps[name]);
      
      // Check if room is healthy now (only if room is visible)
      const roomObj = Game.rooms[roomName];
      if (roomObj) {
        const energyAvailable = roomObj.energyAvailable || 0;
        const hasTerminal = !!roomObj.terminal;
        
        const isHealthy = hasTerminal || energyAvailable >= this.defaultCfg.minEnergyThreshold;
        const noCreepsAlive = req.spawnedCreeps.length === 0;
        const veryOld = req.requestedAt && (Game.time - req.requestedAt) > 2000;
        
        // Remove request if: room is healthy AND (no creeps alive OR very old)
        if (isHealthy && (noCreepsAlive || veryOld)) {
          delete Memory.helperHaulerRequests[roomName];
          continue;
        }
      }
      
      // Also remove if request is ancient (>5000 ticks) regardless of status
      if (req.requestedAt && (Game.time - req.requestedAt) > 5000) {
        delete Memory.helperHaulerRequests[roomName];
        continue;
      }
      
      // Update status based on current state
      if (req.spawnedCreeps.length > 0) {
        req.status = 'active';
      } else if (req.status === 'active' || req.status === 'spawning') {
        // Had creeps but now they're all dead - revert to pending
        req.status = 'pending';
      }
    }
  },

  // Manual cleanup - call from console if needed: RoomHelp.forceCleanupAll()
  forceCleanupAll: function() {
    if (!Memory.helperHaulerRequests) {
      console.log('[RoomHelp] No requests to clean');
      return;
    }
    
    const count = Object.keys(Memory.helperHaulerRequests).length;
    Memory.helperHaulerRequests = {};
    console.log(`[RoomHelp] Force deleted ${count} requests`);
  },

  // Debug function - call from console: RoomHelp.listRequests()
  listRequests: function() {
    if (!Memory.helperHaulerRequests) {
      console.log('[RoomHelp] No requests');
      return;
    }
    
    console.log('=== Helper Hauler Requests ===');
    for (const roomName in Memory.helperHaulerRequests) {
      const req = Memory.helperHaulerRequests[roomName];
      const creeps = (req.spawnedCreeps || []).filter(n => Game.creeps[n]);
      const age = req.requestedAt ? Game.time - req.requestedAt : 'unknown';
      console.log(`${roomName}: status=${req.status}, creeps=${creeps.length}/${req.desiredCount || 2}, age=${age}`);
    }
  }
};

module.exports = RoomHelp;
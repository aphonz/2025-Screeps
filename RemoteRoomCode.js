var FunctionsSpawningCode = require('SpawningCode');

var RemoteRoomCode = {
// part 1 Analysis 
// part 2 spawn
// Part 3 Scout
// part 3 Defence 


//TODO
// Haulers insteal of all in ones? containers 



analyzeOwnedRooms: function analyzeOwnedRooms() {
    // Toggle logging on/off
    const ENABLE_LOGGING = true;
    if (!Memory.spawnRooms || Memory.spawnRooms.length === 0) {
        if (ENABLE_LOGGING) {
            console.log("⚠️ No spawn rooms defined in Memory.spawnRooms.");
        }
        return;
    }

    let startCPU;
    if (ENABLE_LOGGING) {
        startCPU = Game.cpu.getUsed();
        console.log("========================================");
        console.log("🏠 Starting Owned Room Analysis");
        console.log("========================================");
    }

    let checkedRooms = 0;
    for (const ownedRoom of Memory.spawnRooms) {
        this.RemoteanalyzeRoom(ownedRoom);
        checkedRooms++;
    }

    if (ENABLE_LOGGING) {
        const endCPU = Game.cpu.getUsed();
        const usedCPU = (endCPU - startCPU).toFixed(2);

        // Initialize CPU stats namespace if missing
        if (!Memory.cpuStats) Memory.cpuStats = {};
        if (!Memory.cpuStats.analyzeOwnedRooms) {
            Memory.cpuStats.analyzeOwnedRooms = { total: 0, runs: 0, average: 0 };
        }

        // Update stats for this function
        const stats = Memory.cpuStats.analyzeOwnedRooms;
        stats.total += parseFloat(usedCPU);
        stats.runs += 1;
        stats.average = (stats.total / stats.runs).toFixed(2);

        // Pretty summary log
        console.log(`✅ Finished analyzing owned rooms`);
        console.log(`   • Rooms checked: ${checkedRooms}`);
        console.log(`   • CPU used: ${usedCPU}`);
        console.log(`   • Average CPU (analyzeOwnedRooms): ${stats.average}`);
        console.log("========================================\n");
    }
},


RemoteanalyzeRoom: function RemoteanalyzeRoom(roomName) {
    const room = Game.rooms[roomName];
    if (!room) {
        console.log(`Room ${roomName} not visible.`);
        return;
    }

    // Ensure memory path exists
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = { remoterooms: {} };
    if (!Memory.rooms[roomName].remoterooms) Memory.rooms[roomName].remoterooms = {};

    // --- AUTOPOPULATE remoterooms FROM EXITS (layer=1) and THEIR EXITS (layer=2) ---
    // Only populate when remoterooms is empty (prevents overwriting manual edits).
    // Avoid duplicates by using object keys. Do not add the home room itself.
    const homeRemotes = Memory.rooms[roomName].remoterooms;
    if (Object.keys(homeRemotes).length === 0) {
        const addRemote = (rname, layer) => {
            if (!rname || rname === roomName) return;
            if (!homeRemotes[rname]) {
                homeRemotes[rname] = {
                    layer: layer,
                    Ignore: false,
                    LastSeen: 1,
                    isSafe: true,
                    isOwned: false,
                    ownerName: null,
                    ownerType: "neutral",
                    Sources: []
                };
            } else {
                // ensure we keep the lowest layer if it already exists
                homeRemotes[rname].layer = Math.min(homeRemotes[rname].layer || Infinity, layer);
            }
        };

        const exits = Game.map.describeExits(roomName) || {};
        // Layer 1: direct exits
        for (const neighbor of Object.values(exits)) {
            addRemote(neighbor, 1);
        }

        // Layer 2: exits of each layer1 room
        const layer1Rooms = Object.keys(homeRemotes).filter(r => homeRemotes[r].layer === 1);
        for (const L1 of layer1Rooms) {
            const exits1 = Game.map.describeExits(L1) || {};
            for (const n2 of Object.values(exits1)) {
                addRemote(n2, 2);
            }
        }
        // optional: log how many were added
        console.log(`Initialized ${Object.keys(homeRemotes).length} remote rooms for ${roomName} (layers 1 & 2).`);
    }
    // --- end autopopulate ---

    // ✅ Pre-filter creeps belonging to this homeroom
    const creepsInHome = _.filter(Game.creeps, c => c.memory.homeRoom === roomName);

    // Build stats for each remote room in one pass
    const remoteStats = {};
    for (const creep of creepsInHome) {
        const targetRoom = creep.memory.harvestRoom || creep.memory.targetRoom;
        if (!targetRoom) continue;

        if (!remoteStats[targetRoom]) {
            remoteStats[targetRoom] = {
                harvesters: 0,
                reservers: 0,
                sources: {}
            };
        }

        if (creep.memory.role === 'remoteHarvester' && creep.ticksToLive > 200) {
            remoteStats[targetRoom].harvesters++;
            if (creep.memory.source) {
                if (!remoteStats[targetRoom].sources[creep.memory.source]) {
                    remoteStats[targetRoom].sources[creep.memory.source] = 0;
                }
                remoteStats[targetRoom].sources[creep.memory.source]++;
            }
        }

        if (creep.memory.role === 'reserver') {
            remoteStats[targetRoom].reservers++;
        }
    }

    // ✅ Only analyze rooms already in remoterooms memory
    const remoteRooms = Object.keys(Memory.rooms[roomName].remoterooms || {});

    remoteRooms.forEach(remoteRoom => {
        if (!Memory.rooms[roomName].remoterooms[remoteRoom]) {
            Memory.rooms[roomName].remoterooms[remoteRoom] = {
                Ignore: false,
                LastSeen: 1,              // 👈 default to tick 1
                isSafe: true,
                isOwned: false,
                ownerName: null,
                ownerType: "neutral",
                Sources: []
            };
            console.log(`Initialized memory for remote room: ${remoteRoom}`);
        }

        const remoteMemory = Memory.rooms[roomName].remoterooms[remoteRoom];
        if (remoteMemory.Ignore) return;

        // Update LastSeen if visible
        if (Game.rooms[remoteRoom]) {
            remoteMemory.LastSeen = Game.time;
        }

        // Apply combined creep stats
        const stats = remoteStats[remoteRoom];
        if (stats) {
            remoteMemory.actualHarvesters = stats.harvesters;
            remoteMemory.hasReserver = stats.reservers > 0;
        } else {
            remoteMemory.actualHarvesters = 0;
            remoteMemory.hasReserver = false;
        }

        // ✅ Hybrid source tracking
        if (Game.rooms[remoteRoom]) {
            const sources = Game.rooms[remoteRoom].find(FIND_SOURCES);

            if (!remoteMemory.Sources) remoteMemory.Sources = [];

            sources.forEach(source => {
                let existing = remoteMemory.Sources.find(s => s.id === source.id);
                const assigned = stats && stats.sources[source.id] ? stats.sources[source.id] : 0;

                if (existing) {
                    existing.assignedCreeps = assigned;
                } else {
                    remoteMemory.Sources.push({ id: source.id, assignedCreeps: assigned });
                }
            });
        } else {
            // No vision: keep existing Sources intact, optionally reset assignedCreeps
            if (remoteMemory.Sources) {
                remoteMemory.Sources.forEach(s => s.assignedCreeps = 0);
            }
        }

        // Safety check
        if (Game.rooms[remoteRoom]) {
            const hostiles = Game.rooms[remoteRoom].find(FIND_HOSTILE_CREEPS);
            const room = Game.rooms[remoteRoom];
let hostileStructures = [];

if (room.controller && room.controller.owner) {
    // Controller exists and is owned: check for hostile towers
    hostileStructures = room.find(FIND_HOSTILE_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_TOWER && !s.my
    });
}

            //const hostileStructures = Game.rooms[remoteRoom].find(FIND_HOSTILE_STRUCTURES);

            if (hostiles.length > 0 || hostileStructures.length > 0) {
                remoteMemory.isSafe = false;
                remoteMemory.unsafeUntil = Game.time + 1000;
            } else if (!remoteMemory.unsafeUntil || Game.time >= remoteMemory.unsafeUntil) {
                remoteMemory.isSafe = true;
                delete remoteMemory.unsafeUntil;
            }
        }

        // Ownership check
        if (Game.rooms[remoteRoom] && Game.rooms[remoteRoom].controller) {
            const controller = Game.rooms[remoteRoom].controller;

            if (controller.owner) {
                remoteMemory.isOwned = true;
                remoteMemory.ownerName = controller.owner.username;

                if (controller.owner.username === Game.spawns[Object.keys(Game.spawns)[0]].owner.username) {
                    remoteMemory.ownerType = "self";
                } else if (Memory.allies && Memory.allies.includes(controller.owner.username)) {
                    remoteMemory.ownerType = "ally";
                } else if (controller.owner.username === "Invader") {
                    remoteMemory.ownerType = "invader";
                } else {
                    remoteMemory.ownerType = "other";
                }

            } else if (controller.reservation) {
                remoteMemory.isOwned = true;
                remoteMemory.ownerName = controller.reservation.username;
                remoteMemory.reservationTicks = controller.reservation.ticksToEnd;

                if (Memory.allies && Memory.allies.includes(controller.reservation.username)) {
                    remoteMemory.ownerType = "ally";
                } else if (controller.reservation.username === "Invader") {
                    remoteMemory.ownerType = "invader";
                } else if (controller.reservation.username === Game.spawns[Object.keys(Game.spawns)[0]].owner.username) {
                    remoteMemory.ownerType = "self";
                } else {
                    remoteMemory.ownerType = "other";
                }

            } else {
                remoteMemory.isOwned = false;
                remoteMemory.ownerName = null;
                remoteMemory.ownerType = "neutral";
                delete remoteMemory.reservationTicks;
            }
        }

        // Harvester target logic
        if (remoteMemory.Sources && remoteMemory.isSafe && !remoteMemory.isOwned) {
            remoteMemory.harvestersTarget = remoteMemory.Sources.length * 2;
        } else {
            remoteMemory.harvestersTarget = 0;
        }
    });

    console.log(`Analysis completed for ${roomName}, tracking ${remoteRooms.length} remote rooms.`);
},

//Part 2
refreshUnexploredRooms: function refreshUnexploredRooms() {
    if (!Memory.unexploredRooms) Memory.unexploredRooms = [];

    // Only run once per tick, and only every 200 ticks
    if (Memory.lastUnexploredUpdate === Game.time) return;
    if (Game.time % 200 !== 0) return;

    const knownRooms = new Set(Object.keys(Memory.rooms));
    for (const roomName of knownRooms) {
        const exits = Game.map.describeExits(roomName);
        if (!exits) continue;
        for (const adj of Object.values(exits)) {
            if (!knownRooms.has(adj) && !Memory.unexploredRooms.includes(adj)) {
                Memory.unexploredRooms.push(adj);
            }
        }
    }

    Memory.lastUnexploredUpdate = Game.time;
},
   
manageSpawning: function(spawn) {
  const WorkerParts = [WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
  const MinerParts = [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];

  let mainRoom = spawn.room.name;

  // If no remote rooms configured, nothing to do
  if (!Memory.rooms[mainRoom] || !Memory.rooms[mainRoom].remoterooms) return false;

  // --- RemoteGuardian: spawn scaled guardians for unsafe remotes (runs before scout spawning) ---
  const partCost = part => {
    switch (part) {
      case MOVE: return 50;
      case WORK: return 100;
      case CARRY: return 50;
      case ATTACK: return 80;
      case RANGED_ATTACK: return 150;
      case HEAL: return 250;
      case TOUGH: return 10;
      case CLAIM: return 600;
      default: return 0;
    }
  };

  const baseGuardianBody = [TOUGH, MOVE, MOVE, RANGED_ATTACK, ATTACK, MOVE];
  const baseGuardianCost = baseGuardianBody.reduce((s, p) => s + partCost(p), 0);

  const remoteKeysForGuardian = Object.keys(Memory.rooms[mainRoom].remoterooms || {})
    .filter(remoteRoom => Memory.rooms[mainRoom].remoterooms[remoteRoom].layer !== undefined)
    .sort((a, b) => Memory.rooms[mainRoom].remoterooms[a].layer - Memory.rooms[mainRoom].remoterooms[b].layer);

  for (let remoteRoom of remoteKeysForGuardian) {
    const remoteMemory = Memory.rooms[mainRoom].remoterooms[remoteRoom];

    // Spawn guardian when remote is explicitly not safe and not ignored
    if (remoteMemory && remoteMemory.isSafe === false && !remoteMemory.Ignore) {
      // Count guardians for this home (no targetRoom filter as requested)
      const assignedGuardians = _.filter(Game.creeps, c =>
        c.memory.role === 'RemoteGuardian' && c.memory.home === mainRoom
      ).length;

      const desiredGuardians = remoteMemory.desiredGuardians || 1;
      if (assignedGuardians >= desiredGuardians) continue;
      if (spawn.spawning) continue;

      // Use spawn.room.energyAvailable to scale body
      let availableEnergy = spawn.room.energyAvailable;
      if (availableEnergy < baseGuardianCost) {
        // not enough energy for even base guardian; skip this remote
        continue;
      }

      // Build starting body
      let body = [...baseGuardianBody];
      availableEnergy -= baseGuardianCost;

      // Add up to 3 extra copies of the base body while energy and part limit allow
      for (let i = 0; i < 3; i++) {
        if (availableEnergy >= baseGuardianCost && (body.length + baseGuardianBody.length) <= 50) {
          body.push(...baseGuardianBody);
          availableEnergy -= baseGuardianCost;
        } else {
          break;
        }
      }

      // Add extra HEAL + MOVE if energy remains and parts allow
      const healMoveCost = partCost(HEAL) + partCost(MOVE);
      if (availableEnergy >= healMoveCost && body.length + 2 <= 50) {
        body.push(HEAL, MOVE);
        availableEnergy -= healMoveCost;
      }

      // Ensure max 50 parts
      if (body.length > 50) body = body.slice(0, 50);

      const guardianName = `RemoteGuardian_${remoteRoom}_${Game.time}`;
      const result = spawn.spawnCreep(body, guardianName, {
        memory: { role: 'RemoteGuardian', home: mainRoom }
      });

      if (result === OK) {
        console.log(`Spawning RemoteGuardian ${guardianName} for ${remoteRoom} (home ${mainRoom})`);
        return true;
      } else {
        // spawn failed; log and continue checking other remotes
        console.log(`Failed to spawn RemoteGuardian ${guardianName}: ${result}`);
        continue;
      }
    }
  }
  // --- end RemoteGuardian block ---

  // Spawn a scout if none exists
  let existingCreep = _.find(Game.creeps, creep => creep.memory.role === 'RemoteRoomScout' && creep.memory.home === mainRoom);

  if (!existingCreep) {
    let creepName = `RemoteScout_${Game.time}`;
    let result = spawn.spawnCreep([MOVE], creepName, {
      memory: { role: 'RemoteRoomScout', home: mainRoom }
    });

    if (result === OK) {
      //console.log(`Spawned new scout creep: ${creepName} for home room ${mainRoom}`);
      return true;
    } else {
      return false;
    }
  }

  // If a scout already exists, proceed with remote spawning logic
  const remoteKeys = Object.keys(Memory.rooms[mainRoom].remoterooms || {})
    .filter(remoteRoom => Memory.rooms[mainRoom].remoterooms[remoteRoom].layer !== undefined)
    .sort((a, b) => Memory.rooms[mainRoom].remoterooms[a].layer - Memory.rooms[mainRoom].remoterooms[b].layer);

  for (let remoteRoom of remoteKeys) {
    let remoteMemory = Memory.rooms[mainRoom].remoterooms[remoteRoom];

    if ((remoteMemory.isOwned == Memory.username && !remoteMemory.Ignore) ||
      (!remoteMemory.isOwned && remoteMemory.isSafe && !remoteMemory.Ignore)) {

      if (remoteMemory.Sources) {
        for (let source of remoteMemory.Sources) {
          // Check for RemoteMiner first (priority)
          let assignedMiners = _.filter(Game.creeps, creep => 
            creep.memory.role === 'RemoteMiner' && 
            creep.memory.source === source.id && 
            creep.memory.harvestRoom === remoteRoom
          ).length;

          // Spawn RemoteMiner if none assigned (1 per source)
          if (assignedMiners === 0) {
            let bodyConfig = FunctionsSpawningCode.BuildBody(mainRoom, 1, MinerParts);
            let creepName = `RemoteMiner_${remoteRoom}_${Game.time}`;
            let result = spawn.spawnCreep(bodyConfig, creepName, {
              memory: { 
                role: 'RemoteMiner', 
                source: source.id, 
                harvestRoom: remoteRoom,
                homeRoom: mainRoom
              }
            });

            if (result === OK) {
              console.log(`Spawning RemoteMiner for ${remoteRoom} targeting source ${source.id}`);
              return true;
            } else {
              continue;
            }
          }

          // Then check for RemoteHarvesters
          let assignedHarvesters = _.filter(Game.creeps, creep => 
            creep.memory.role === 'remoteHarvester' && 
            creep.memory.source === source.id && 
            creep.memory.harvestRoom === remoteRoom
          ).length;
          
          let maxHarvesters = remoteMemory.isOwned === Memory.username ? 3 : 2;
          let assignedReserver = _.some(Game.creeps, creep => 
            creep.memory.role === 'reserver' && 
            creep.memory.harvestRoom === remoteRoom
          );

          if (!assignedReserver &&
            spawn.room.energyCapacityAvailable > 1500 &&
            remoteMemory.actualHarvesters > 1 &&
            (!remoteMemory.ReserverValue || remoteMemory.ReserverValue < 800)
          ) {
            let reserverParts = [CLAIM, CLAIM, MOVE];
            let creepName = `Reserver_${remoteRoom}_${Game.time}`;
            let result = spawn.spawnCreep(reserverParts, creepName, {
              memory: { role: 'reserver', harvestRoom: remoteRoom }
            });

            if (result === OK) {
              console.log(`Spawning reserver for ${remoteRoom}`);
              return true;
            } else {
              continue;
            }
          } else if (assignedHarvesters < maxHarvesters) {
            let bodyConfig = FunctionsSpawningCode.BuildBody(mainRoom, maxHarvesters, WorkerParts);
            let creepName = `RemoteHarvester_${remoteRoom}_${Game.time}`;
            let result = spawn.spawnCreep(bodyConfig, creepName, {
              memory: { role: 'remoteHarvester', source: source.id, harvestRoom: remoteRoom }
            });

            if (result === OK) {
              console.log(`Spawning remote harvester for ${remoteRoom} targeting source ${source.id}`);
              return true;
            } else {
              continue;
            }
          }
        }
      }
    }
  }

  // Nothing spawned by this function this tick
  return false;
}, // end of function


selectTargetRoom: function selectTargetRoom(creep) {
	let homeRoom = creep.memory.home;
	if (!Memory.rooms[homeRoom] || !Memory.rooms[homeRoom].remoterooms) {
		console.log(`No remote rooms found for home: ${homeRoom}`);
		return null;
	}
	//console.log("Hi MOM");

	let targetRoom = null;
	let oldestLastSeen = Game.time; // Track the room unseen for the longest time

	for (let remoteRoom in Memory.rooms[homeRoom].remoterooms) {
		let roomMemory = Memory.rooms[homeRoom].remoterooms[remoteRoom];

		// Skip ignored rooms ( unsafe rooms unsafe removed due to startup issue)
		if (roomMemory.Ignore) continue;

		// Check last seen time
		let lastSeen = roomMemory.LastSeen || 0;
		if (Game.time - lastSeen > 1000 && lastSeen < oldestLastSeen) {
			targetRoom = remoteRoom;
			oldestLastSeen = lastSeen;
		}
	}

	if (targetRoom) {
		//console.log(`Scout creep selected target room: ${targetRoom}`);
		creep.memory.targetRoom = targetRoom; // ✅ **Assign target room to creep's memory**
		return targetRoom;
	} else {
		console.log(`No valid scout target found for ${creep.name}`);
		return null;
	}
},// FUNCTION END






};

module.exports = RemoteRoomCode;
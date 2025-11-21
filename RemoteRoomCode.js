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
    const ENABLE_LOGGING = false;
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
    Memory.MainRoomStatus = Game.map.getRoomStatus(Memory.MainRoom).status;
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
        Memory.cpuStats.analyzeOwnedRooms = {
          total: 0,
          runs: 0,
          average: 0
        };
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
    if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {
      remoterooms: {}
    };
    if (!Memory.rooms[roomName].remoterooms) Memory.rooms[roomName].remoterooms = {};

    // --- AUTOPOPULATE remoterooms FROM EXITS (layer=1) and THEIR EXITS (layer=2) ---
    const homeRemotes = Memory.rooms[roomName].remoterooms;
    if (Object.keys(homeRemotes).length === 0) {
      const addRemote = (rname, layer) => {
        if (!rname || rname === roomName) return;
        if (Game.map.getRoomStatus(rname).status != Memory.MainRoomStatus) return;
        if (!homeRemotes[rname]) {
          homeRemotes[rname] = {
            layer: layer,
            Ignore: false,
            LastSeen: 1,
            isSafe: true,
            isOwned: false,
            ownerName: null,
            ownerType: "neutral",
            RoomType: "normal",
            Sources: [],
            lastCacheUpdate: 0 // Track when cache was last updated
          };
        } else {
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
          sources: {},
          totalCarryParts: 0
        };
      }

      if (creep.memory.role === 'remoteHarvester' && creep.ticksToLive > 200) {
        remoteStats[targetRoom].harvesters++;
        if (creep.memory.source) {
          if (!remoteStats[targetRoom].sources[creep.memory.source]) {
            remoteStats[targetRoom].sources[creep.memory.source] = {
              count: 0,
              carryParts: 0
            };
          }
          remoteStats[targetRoom].sources[creep.memory.source].count++;

          const carryParts = creep.body.filter(p => p.type === CARRY).length;
          remoteStats[targetRoom].sources[creep.memory.source].carryParts += carryParts;
          remoteStats[targetRoom].totalCarryParts += carryParts;
        }
      }

      if (creep.memory.role === 'reserver') {
        remoteStats[targetRoom].reservers++;
      }

      // Track miner templates
      if (creep.memory.role === 'RemoteMiner' && creep.ticksToLive > 200) {
        if (creep.memory.source) {
          if (!remoteStats[targetRoom].sources[creep.memory.source]) {
            remoteStats[targetRoom].sources[creep.memory.source] = {
              count: 0,
              carryParts: 0
            };
          }
          // Cache the miner body template if it's working
          if (!remoteStats[targetRoom].sources[creep.memory.source].minerTemplate) {
            remoteStats[targetRoom].sources[creep.memory.source].minerTemplate = creep.body.map(p => p.type);
          }
        }
      }
    }

    // ✅ Only analyze rooms already in remoterooms memory
    const remoteRooms = Object.keys(Memory.rooms[roomName].remoterooms || {});

    remoteRooms.forEach(remoteRoom => {
      const roomMem = Memory.rooms[roomName].remoterooms[remoteRoom];
    
      // Check if we have vision of the room
      const roomObj = Game.rooms[remoteRoom];
      //remove rooms of diffrent types .eg resawn newbie normal closed
      /*if (Game.map.getRoomStatus(remoteRoom).status != Memory.MainRoomStatus) {
          //delete Memory.rooms[roomName].remoterooms[remoteRoom];
          //continue;
      }else */ if (roomObj && roomObj.controller && roomObj.controller.level >= 1) {
        // Remove the room if controller level is 1 or higher
        delete Memory.rooms[roomName].remoterooms[remoteRoom];
        console.log(`Removed remote room ${remoteRoom} due to controller level ${roomObj.controller.level}`);
        
      } else {
        // Initialize memory if not already present
        if (!roomMem) {
          Memory.rooms[roomName].remoterooms[remoteRoom] = {
            Ignore: false,
            LastSeen: Game.time,
            isSafe: true,
            isOwned: false,
            ownerName: null,
            ownerType: "neutral",
            Sources: [],
            lastCacheUpdate: 0
          };
          console.log(`Initialized memory for remote room: ${remoteRoom}`);
        }
      }

      const remoteMemory = Memory.rooms[roomName].remoterooms[remoteRoom];
      //if (remoteMemory.Ignore) return;

      // Update LastSeen if visible
      if (Game.rooms[remoteRoom]) {
        remoteMemory.LastSeen = Game.time;
      }

      // Apply combined creep stats
      const stats = remoteStats[remoteRoom];
      if (stats) {
        remoteMemory.actualHarvesters = stats.harvesters;
        remoteMemory.hasReserver = stats.reservers > 0;
        remoteMemory.totalCarryParts = stats.totalCarryParts;
      } else {
        remoteMemory.actualHarvesters = 0;
        remoteMemory.hasReserver = false;
        remoteMemory.totalCarryParts = 0;
      }

      // Check if cache needs updating (every 1000 ticks or if never updated)
      const needsCacheUpdate = !remoteMemory.lastCacheUpdate || (Game.time - remoteMemory.lastCacheUpdate) >=
        1000;

      // ✅ Hybrid source tracking with caching
      if (Game.rooms[remoteRoom] && !remoteMemory.Ignore) { // IF IT EXITSS AND NOT IGNORED 
        const sources = Game.rooms[remoteRoom].find(FIND_SOURCES);

        if (!remoteMemory.Sources) remoteMemory.Sources = [];

        sources.forEach(source => {
          let existing = remoteMemory.Sources.find(s => s.id === source.id);
          const assigned = stats && stats.sources[source.id] ? stats.sources[source.id].count : 0;
          const currentCarryParts = stats && stats.sources[source.id] ? stats.sources[source.id]
            .carryParts : 0;
          const minerTemplate = stats && stats.sources[source.id] ? stats.sources[source.id].minerTemplate :
            null;

          // Initialize source data if it doesn't exist
          if (!existing) {
            existing = {
              id: source.id,
              assignedCreeps: assigned,
              currentCarryParts: currentCarryParts,
              pathDistance: null,
              requiredCarryParts: 5, // Default
              minerTemplate: null,
              minerSufficient: false
            };
            remoteMemory.Sources.push(existing);
          }

          // Update current stats every tick
          existing.assignedCreeps = assigned;
          existing.currentCarryParts = currentCarryParts;

          // Cache miner template if we have one
          if (minerTemplate && !existing.minerTemplate) {
            existing.minerTemplate = minerTemplate;
            existing.minerSufficient = true;
            console.log(
              `Cached miner template for ${remoteRoom} source ${source.id}: ${minerTemplate.length} parts`
              );
          }

          // Calculate/update cached values every 1000 ticks
          if (needsCacheUpdate) {
            const homeSpawn = Game.rooms[roomName].find(FIND_MY_SPAWNS)[0];
            if (homeSpawn) {
              // Calculate path distance using PathFinder
              const path = PathFinder.search(homeSpawn.pos, {
                pos: source.pos,
                range: 1
              }, {
                maxRooms: 16,
                plainCost: 2,
                swampCost: 10,
                roomCallback: function(roomName) {
                  let room = Game.rooms[roomName];
                  if (!room) return;

                  let costs = new PathFinder.CostMatrix;

                  // Mark roads with lower cost
                  room.find(FIND_STRUCTURES).forEach(function(struct) {
                    if (struct.structureType === STRUCTURE_ROAD) {
                      costs.set(struct.pos.x, struct.pos.y, 1);
                    }
                  });

                  return costs;
                }
              });

              if (!path.incomplete) {
                existing.pathDistance = path.path.length;

                // Calculate required carry parts based on path distance
                const isReserved = remoteMemory.ownerType === "self" || remoteMemory.hasReserver;
                const multiplier = isReserved ? 4 : 2;
                existing.requiredCarryParts = Math.max(3, Math.ceil((existing.pathDistance / 10) * multiplier));

                console.log(
                  `Updated cache for ${remoteRoom} source ${source.id}: path=${existing.pathDistance}, carry=${existing.requiredCarryParts}`
                  );
              }
            }
          }
        });

        // Mark cache as updated for this room
        if (needsCacheUpdate) {
          remoteMemory.lastCacheUpdate = Game.time;
        }
      } else {
        // No vision: keep existing Sources intact
        if (remoteMemory.Sources) {
          remoteMemory.Sources.forEach(s => {
            s.assignedCreeps = 0;
            s.currentCarryParts = 0;
          });
        }
      }

      // Safety check
      if (Game.rooms[remoteRoom]) {
        const hostiles = Game.rooms[remoteRoom].find(FIND_HOSTILE_CREEPS);
        const room = Game.rooms[remoteRoom];
        let hostileStructures = [];

        if (room.controller && room.controller.owner) {
          hostileStructures = room.find(FIND_HOSTILE_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER && !s.my
          });
        }

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
          } else if (controller.reservation.username === Game.spawns[Object.keys(Game.spawns)[0]].owner
            .username) {
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
      if (remoteMemory.Sources && remoteMemory.isSafe && !remoteMemory.isOwned && !remoteMemory.ownerName === Memory.username) {
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
    const MinworkerParts = [WORK, CARRY, MOVE];
    const WorkerParts = [WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
    const MinerParts = [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];
    const baseGuardianBody = [TOUGH, MOVE, MOVE, RANGED_ATTACK, ATTACK, MOVE];
    let mainRoom = spawn.room.name;

    // If no remote rooms configured, nothing to do
    if (!Memory.rooms[mainRoom] || !Memory.rooms[mainRoom].remoterooms) return false;

    // Helper function to calculate body cost
    const partCost = part => {
      switch (part) {
        case MOVE:
          return 50;
        case WORK:
          return 100;
        case CARRY:
          return 50;
        case ATTACK:
          return 80;
        case RANGED_ATTACK:
          return 150;
        case HEAL:
          return 250;
        case TOUGH:
          return 10;
        case CLAIM:
          return 600;
        default:
          return 0;
      }
    };

    // Helper function to build scaled miner body
    const buildMinerBody = (availableEnergy, cachedTemplate) => {
      const bodyCost = (body) => body.reduce((sum, part) => sum + partCost(part), 0);

      // If we have a cached template that works, try to use it
      if (cachedTemplate && bodyCost(cachedTemplate) <= availableEnergy) {
        return cachedTemplate;
      }

      // Try full MinerParts first
      if (availableEnergy >= bodyCost(MinerParts)) {
        return MinerParts;
      }

      // Build up from MinworkerParts
      let body = [...MinworkerParts];
      let currentCost = bodyCost(body);

      // Add WORK parts while we can afford them (priority for mining)
      while (currentCost + partCost(WORK) <= availableEnergy && body.length < 50) {
        body.unshift(WORK);
        currentCost += partCost(WORK);
      }

      // Add MOVE parts to balance
      const workParts = body.filter(p => p === WORK).length;
      const moveParts = body.filter(p => p === MOVE).length;
      while (moveParts < Math.ceil(workParts / 2) && currentCost + partCost(MOVE) <= availableEnergy && body
        .length < 50) {
        body.push(MOVE);
        currentCost += partCost(MOVE);
      }

      return body;
    };
// Build the biggest harvester body possible
const buildHarvesterBody = (requiredCarryParts, availableEnergy) => {
  const bodyCost = body => body.reduce((sum, part) => sum + partCost(part), 0);

  let body = [...MinworkerParts];
  let currentCost = bodyCost(body);
  let currentCarryParts = body.filter(p => p === CARRY).length;

  // Keep adding until we hit energy or 50 parts
  while (
    currentCarryParts < requiredCarryParts &&
    body.length + 3 <= 50
  ) {
    const addCost = partCost(CARRY) * 2 + partCost(MOVE); // 150
    if (currentCost + addCost > availableEnergy) break;

    body.push(CARRY, CARRY, MOVE);
    currentCost += addCost;
    currentCarryParts += 2;
  }

  return body;
};

    

    const baseGuardianCost = baseGuardianBody.reduce((s, p) => s + partCost(p), 0);

    // --- RemoteGuardian spawning (existing code) ---
    const remoteKeysForGuardian = Object.keys(Memory.rooms[mainRoom].remoterooms || {})
      .filter(remoteRoom => Memory.rooms[mainRoom].remoterooms[remoteRoom].layer !== undefined)
      .sort((a, b) => Memory.rooms[mainRoom].remoterooms[a].layer - Memory.rooms[mainRoom].remoterooms[b].layer);

    for (let remoteRoom of remoteKeysForGuardian) {
      const remoteMemory = Memory.rooms[mainRoom].remoterooms[remoteRoom];

      if (remoteMemory && remoteMemory.isSafe === false && !remoteMemory.Ignore) {
        const assignedGuardians = _.filter(Game.creeps, c =>
          c.memory.role === 'RemoteGuardian' && c.memory.home === mainRoom
        ).length;

        const desiredGuardians = remoteMemory.desiredGuardians || 1;
        if (assignedGuardians >= desiredGuardians) continue;
        if (spawn.spawning) continue;
        
        let availableEnergy = spawn.room.energyAvailable * 0.9;
        if (availableEnergy < baseGuardianCost) continue;

        let body = [...baseGuardianBody];
        availableEnergy -= baseGuardianCost;

        for (let i = 0; i < 3; i++) {
          if (availableEnergy >= baseGuardianCost && (body.length + baseGuardianBody.length) <= 50) {
            body.push(...baseGuardianBody);
            availableEnergy -= baseGuardianCost;
          } else {
            break;
          }
        }

        const healMoveCost = partCost(HEAL) + partCost(MOVE);
        if (availableEnergy >= healMoveCost && body.length + 2 <= 50) {
          body.push(HEAL, MOVE);
          availableEnergy -= healMoveCost;
        }

        if (body.length > 50) body = body.slice(0, 50);

        const guardianName = `RemoteGuardian_${remoteRoom}_${Game.time}`;
        const result = spawn.spawnCreep(body, guardianName, {
          memory: {
            role: 'RemoteGuardian',
            home: mainRoom
          }
        });

        if (result === OK) {
          console.log(`Spawning RemoteGuardian ${guardianName} for ${remoteRoom} (home ${mainRoom})`);
          return true;
        } else {
          continue;
        }
      }
    }

    // --- Scout spawning ---
    let existingCreep = _.find(Game.creeps, creep => creep.memory.role === 'RemoteRoomScout' && creep.memory
      .home === mainRoom);

    if (!existingCreep) {
      let creepName = `RemoteScout_${Game.time}`;
      let result = spawn.spawnCreep([MOVE], creepName, {
        memory: {
          role: 'RemoteRoomScout',
          home: mainRoom
        }
      });

      if (result === OK) {
        return true;
      } else {
        return false;
      }
    }

    // --- Remote room spawning logic ---
    const remoteKeys = Object.keys(Memory.rooms[mainRoom].remoterooms || {})
      .filter(remoteRoom => Memory.rooms[mainRoom].remoterooms[remoteRoom].layer !== undefined)
      .sort((a, b) => Memory.rooms[mainRoom].remoterooms[a].layer - Memory.rooms[mainRoom].remoterooms[b].layer);

    for (let remoteRoom of remoteKeys) {
      let remoteMemory = Memory.rooms[mainRoom].remoterooms[remoteRoom];

      if ((remoteMemory.ownerName == Memory.username && !remoteMemory.Ignore) ||
        (!remoteMemory.isOwned && remoteMemory.isSafe && !remoteMemory.Ignore)) {



        // --- Spawn per source: Remote hauler/harvest then miner then reserver ---
        if (remoteMemory.Sources) {
          for (let source of remoteMemory.Sources) {
            // Check for RemoteMiner first (priority) - 1 per source
            let assignedMiners = _.filter(Game.creeps, creep =>
              creep.memory.role === 'RemoteMiner' &&
              creep.memory.source === source.id &&
              creep.memory.harvestRoom === remoteRoom &&
              creep.memory.homeRoom === mainRoom
            ).length;

            // Then check for RemoteHarvesters based on cached required carry parts
            const requiredCarryParts = source.requiredCarryParts || 5;
            const currentCarryParts = source.currentCarryParts || 0;

            if (currentCarryParts < requiredCarryParts) {
              const availableEnergy = spawn.room.energyAvailable * 0.8;

              const neededCarryParts = requiredCarryParts - currentCarryParts;
              const harvesterBody = buildHarvesterBody(neededCarryParts, availableEnergy);

              const minCost = MinworkerParts.reduce((sum, part) => sum + partCost(part), 0);
              if (availableEnergy < minCost) continue;

              let creepName = `RemoteHarvester_${remoteRoom}_${Game.time}`;
              let result = spawn.spawnCreep(harvesterBody, creepName, {
                memory: {
                  role: 'remoteHarvester',
                  source: source.id,
                  harvestRoom: remoteRoom,
                  homeRoom: mainRoom
                }
              });

              if (result === OK) {
                const carryParts = harvesterBody.filter(p => p === CARRY).length;
                console.log(
                  `Spawning RemoteHarvester for ${remoteRoom} source ${source.id} with ${carryParts}/${requiredCarryParts} CARRY parts`
                  );
                return true;
              } else if (result === ERR_NOT_ENOUGH_ENERGY) {
                continue;
              } else {
                continue;
              }
            }

            // Spawn RemoteMiner if none assigned
            if (assignedMiners === 0) {
              const availableEnergy = spawn.room.energyAvailable * 0.9;
              const cachedTemplate = source.minerTemplate || null;
              const minerBody = buildMinerBody(availableEnergy, cachedTemplate);

              let creepName = `RemoteMiner_${remoteRoom}_${Game.time}`;
              let result = spawn.spawnCreep(minerBody, creepName, {
                memory: {
                  role: 'RemoteMiner',
                  source: source.id,
                  harvestRoom: remoteRoom,
                  homeRoom: mainRoom
                }
              });

              if (result === OK) {
                console.log(
                  `Spawning RemoteMiner for ${remoteRoom} source ${source.id} with ${minerBody.length} parts${cachedTemplate ? ' (using cached template)' : ''}`
                  );
                return true;
              } else if (result === ERR_NOT_ENOUGH_ENERGY) {
                continue;
              } else {
                continue;
              }
            }
            // --- Spawn Reserver first (1 per room, not per source) ---
            if (!remoteMemory.isOwned || (remoteMemory.ownerName == Memory.username)) {
              let assignedReserver = _.find(Game.creeps, creep =>
                creep.memory.role === 'reserver' &&
                creep.memory.harvestRoom === remoteRoom &&
                creep.memory.homeRoom === mainRoom
              );

              // Only spawn Reserver if no reserver exists and conditions are met
              if (!assignedReserver &&
                spawn.room.energyCapacityAvailable > 1300 &&
                remoteMemory.actualHarvesters > 0 &&
                (!remoteMemory.reservationTicks || remoteMemory.reservationTicks < 3000)
              ) {
                let reserverParts = [CLAIM, CLAIM, MOVE, MOVE];
                let creepName = `Reserver_${remoteRoom}_${Game.time}`;
                let result = spawn.spawnCreep(reserverParts, creepName, {
                  memory: {
                    role: 'reserver',
                    harvestRoom: remoteRoom,
                    homeRoom: mainRoom
                  }
                });

                if (result === OK) {
                  console.log(`Spawning reserver for ${remoteRoom}`);
                  return true;
                } else if (result !== ERR_NOT_ENOUGH_ENERGY) {
                  console.log(`Failed to spawn reserver for ${remoteRoom}: ${result}`);
                }
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
  }, // FUNCTION END

  resolveRemoteRoomConflicts: function resolveRemoteRoomConflicts() {
    var claims = {};
    var self = this;

    // Step 1: Collect claims
    for (var spawnRoom of Memory.spawnRooms) {
      console.log("Checking spawn room for conflicts: " + spawnRoom);

      var roomData = Memory.rooms[spawnRoom];
      if (!roomData || !roomData.remoterooms) continue;

      var remoteRooms = roomData.remoterooms;
      for (var remoteRoom in remoteRooms) {
        if (!claims[remoteRoom]) claims[remoteRoom] = [];
        claims[remoteRoom].push({
          spawnRoom: spawnRoom,
          layer: remoteRooms[remoteRoom].layer,
          sources: remoteRooms[remoteRoom].Sources || [],
          ignore: remoteRooms[remoteRoom].Ignore || false
        });
      }
    }

    // Step 2: Resolve conflicts
    for (var remoteRoom in claims) {
      var contenders = claims[remoteRoom];
      if (contenders.length <= 1) continue; // no conflict

      // If all contenders already ignore, skip (strategic choice)
      var allIgnored = true;
      for (var i = 0; i < contenders.length; i++) {
        if (!contenders[i].ignore) {
          allIgnored = false;
          break;
        }
      }
      if (allIgnored) continue;

      // Sort by layer first, then by active sources count
      contenders.sort(function(a, b) {
        if (a.layer !== b.layer) return a.layer - b.layer;

        var aSources = self.countActiveSources(a.spawnRoom);
        var bSources = self.countActiveSources(b.spawnRoom);
        return aSources - bSources;
      });

      // Winner is first in sorted list
      var winner = contenders[0];

      // Log conflict resolution
      console.log("[Conflict] Remote room " + remoteRoom +
        " resolved: " + winner.spawnRoom + " wins (layer=" + winner.layer +
        ", activeSources=" + self.countActiveSources(winner.spawnRoom) + ").");

      // Mark losers as Ignore
      for (var j = 1; j < contenders.length; j++) {
        var loser = contenders[j];
        Memory.rooms[loser.spawnRoom].remoterooms[remoteRoom].Ignore = true;
        console.log("   -> " + loser.spawnRoom + " set to Ignore (layer=" + loser.layer +
          ", activeSources=" + countActiveSources(loser.spawnRoom) + ")");
      }

      // Ensure winner is not ignored
      Memory.rooms[winner.spawnRoom].remoterooms[remoteRoom].Ignore = false;
    }
  },

  // Helper: count active sources for a spawnRoom
  countActiveSources: function countActiveSources(spawnRoom) {
    var roomData = Memory.rooms[spawnRoom];
    if (!roomData || !roomData.remoterooms) return 0;

    var total = 0;
    for (var r in roomData.remoterooms) {
      var remote = roomData.remoterooms[r];
      if (!remote.Ignore) {
        total += (remote.Sources ? remote.Sources.length : 0);
      }
    }
    return total;
  },
  // Extra rule: SourceKeeper centers always ignored
  ignoreSourceKeeperCenters: function ignoreSourceKeeperCenters() {
    var self = this;
    for (var spawnRoom of Memory.spawnRooms) {
      var roomData = Memory.rooms[spawnRoom];
      if (!roomData || !roomData.remoterooms) continue;

      for (var remoteRoom in roomData.remoterooms) {
        if (self.isSourceKeeperCenter(remoteRoom)) {
          roomData.remoterooms[remoteRoom].Ignore = true;
          console.log("[SourceKeeper] Remote room " + remoteRoom + " set to Ignore.");
        }
      }
    }
  },

  // Detect SourceKeeper centers
  isSourceKeeperCenter: function isSourceKeeperCenter(roomName) {
    // Screeps API: works without vision
    var status = Game.map.getRoomStatus(roomName);
    return status.roomType === 'source_keeper';
  }




};

function isSourceKeeperCenter(roomName) {
  // Screeps API: works without vision
  var status = Game.map.getRoomStatus(roomName);
  return status.roomType === 'source_keeper';
}

function countActiveSources(spawnRoom) {
  var roomData = Memory.rooms[spawnRoom];
  if (!roomData || !roomData.remoterooms) return 0;

  var total = 0;
  for (var r in roomData.remoterooms) {
    var remote = roomData.remoterooms[r];
    if (!remote.Ignore) {
      total += (remote.Sources ? remote.Sources.length : 0);
    }
  }
  return total;
}

module.exports = RemoteRoomCode;
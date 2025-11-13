var FunctionsSpawningCode = require('SpawningCode');

var FunctionRoomClaiming = {
    
//to claim a room all we need is a claimer to spawn and a remote harvester and send a guardian


    
manageRoomClaiming: function manageRoomClaiming() {
    if (!Memory.roomToClaim || !Memory.roomToClaim.length) return;

    // Filter out rooms only if visible and owned by someone
    Memory.roomToClaim = Memory.roomToClaim.filter(roomName => {
        const room = Game.rooms[roomName];
        return !room || !room.controller || !room.controller.owner;
    });

    if (!Memory.roomToClaim.length) return;

    const targetRoom = Memory.roomToClaim[0];
    if (!Memory.Claiming) Memory.Claiming = {};
    Memory.Claiming[targetRoom] = Memory.Claiming[targetRoom] || {};

    // Find closest owned room that isn't already assigned
    const ownedRooms = _.filter(Game.rooms, room => room.controller && room.controller.my && room.controller.level > 4);
    const assignedRooms = new Set(Object.values(Memory.Claiming).map(c => c.assignedRoom));

    let closestRoom = null;
    let closestDist = Infinity;
    for (const room of ownedRooms) {
        if (assignedRooms.has(room.name)) continue;
        const dist = Game.map.getRoomLinearDistance(room.name, targetRoom);
        if (dist < closestDist) {
            closestDist = dist;
            closestRoom = room.name;
        }
    }

    if (closestRoom) {
        Memory.Claiming[targetRoom].assignedRoom = closestRoom;
        Memory.Claiming[targetRoom].claimerSent = false;
        Memory.Claiming[targetRoom].successfulClaim = false;
        Memory.Claiming[targetRoom].rclLevel = 0;

        // Link assignedRoom memory to the claiming target
        if (!Memory.rooms[closestRoom]) Memory.rooms[closestRoom] = {};
        Memory.rooms[closestRoom].claimingTarget = targetRoom;
    }


    // Update room status if visible
   for (const targetRoom in Memory.Claiming) {
    const claimedRoom = Game.rooms[targetRoom];

    // Only check if we have vision of the room
    if (claimedRoom && claimedRoom.controller && claimedRoom.controller.my) {
        // Update memory
        Memory.Claiming[targetRoom].claimerSent = true;
        Memory.Claiming[targetRoom].successfulClaim = true;
        Memory.Claiming[targetRoom].rclLevel = claimedRoom.controller.level;

        // If the room has reached level 4, remove it from claiming memory
        if (claimedRoom.controller.level >= 4) {
            delete Memory.Claiming[targetRoom];
        }
    }
}

}, //end of function 

spawnClaimingUnits: function spawnClaimingUnits(spawn) {
    if (!spawn || !spawn.room) return; // Ensure valid spawn
    const roomMemory = Memory.rooms[spawn.room.name];
    const StartRoomName = spawn.room.name
    if (!roomMemory || !roomMemory.claimingTarget) return;

    const targetRoom = roomMemory.claimingTarget;
    const claimData = Memory.Claiming[targetRoom];

    // If claiming target is no longer tracked, remove it from room memory
    if (!claimData) {
        delete roomMemory.claimingTarget;
        return;
    }

   // if (claimData.successfulClaim || claimData.failedClaim) return; // Stop if claimed or failed   <<<< WTF IS THIS 

    const spawnRoomMemory = Memory.rooms[spawn.room.name];
    const activeCreeps = spawnRoomMemory && spawnRoomMemory.activeScreeps ? spawnRoomMemory.activeScreeps : {};

    // Spawn a claimer if needed
    if (!claimData.claimerSent === true ) {
        const result = spawn.spawnCreep([CLAIM, MOVE, MOVE], `Claimer_${Game.time}`, {
            memory: { role: "claim", home: targetRoom, target: targetRoom, expiresAt: Game.time + 600 }
        });
        if (result === OK) {
            claimData.claimerSent = true;
            claimData.expiresAt = Game.time + 600; // Set expiration time
        }

    }

   // Prevent premature failure before any claimer has been spawned
    if (claimData.claimerSent && Game.time >= (claimData.expiresAt || 0) && !claimData.successfulClaim) {
        claimData.failedClaim = true;
        return; // Stop spawning new units
    }


    // Only proceed with builders and miners if claiming is successful
    if ( claimData.successfulClaim) {
        console.log("got to here " + StartRoomName );
        if (( Memory.rooms[targetRoom].ActiveScreeps.builder < 2)) {
            console.log("lets spawn a builder for " + targetRoom);
            var newName = "builder" + Game.time;
            let WorkerParts = [WORK, CARRY, MOVE, MOVE];

            spawn.spawnCreep(
                FunctionsSpawningCode.BuildBody(StartRoomName, 6, WorkerParts), // Spawning body config
                newName,
                { memory: { role: "builder", home: targetRoom, target: targetRoom } } // Home is targetRoom
            );
            return true;
        }

        else if (Memory.rooms[targetRoom].ActiveScreeps.upgrader < 1) {
            var newName = "upgrader" + Game.time;
            let MinerParts = [WORK, WORK, CARRY, CARRY, MOVE, MOVE];

            spawn.spawnCreep(
                FunctionsSpawningCode.BuildBody(StartRoomName, 6, MinerParts), // Spawning body config
                newName,
                { memory: { role: "upgrader", home: targetRoom, target: targetRoom } } // Home is targetRoom
            );
            return true;
        }
        
        else 
        //console.log(targetRoom);
        FunctionRoomClaiming.placeSpawn(targetRoom);
    }
  },
  
 placeSpawn: function placeSpawn(roomName) {
    //console.log(roomName);
    const flagName = `C.${roomName}`;
    const flag = Game.flags[flagName];

    if (!flag) {
        console.log(`Flag ${flagName} not found in room ${roomName}`);
        return;
    }

    const room = Game.rooms[roomName];
    if (!room) {
        console.log(`Room ${roomName} not visible`);
        return;
    }

    const spawnExists = room.find(FIND_MY_SPAWNS).length > 0;

    if (!spawnExists) {
        if (!flag.pos || typeof flag.pos.x !== 'number' || typeof flag.pos.y !== 'number') {
            console.log(`Flag ${flagName} has no valid position`);
            return;
        }

        const x = flag.pos.x;
        const y = Math.min(49, Math.max(0, flag.pos.y + 2)); // clamp to room bounds
        const spawnPos = new RoomPosition(x, y, roomName);
        const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, spawnPos);

        if (constructionSites.length === 0) {
            room.createConstructionSite(spawnPos, STRUCTURE_SPAWN);
        } else {
            console.log(`Spawn construction site already exists at ${x},${y} in ${roomName}`);
        }
    } else {
        console.log(`Spawn already exists in ${roomName}`);
    }
}

  
  
  
// EXAMPLE OF WORKING  SWPAN 
 //var newName = 'Harvester' + Game.time;
 //       let WorkerParts = [WORK,CARRY,MOVE];
 //       console.log('Spawning new harvester: ' + newName);
 //      Game.spawns['Spawn1'].spawnCreep(FunctionsSpawningCode.BuildBody(MainRoom,2,WorkerParts), newName, 
 //           {memory: {role: 'harvester', TargetSource: R1S2 }});

};


module.exports = FunctionRoomClaiming ;
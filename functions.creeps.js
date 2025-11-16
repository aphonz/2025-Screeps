
var funtionsCreeps = {


harvest: function(creep) {
    // Retire creeps with low lifespan
    if (creep.ticksToLive < 70) return creep.suicide();

    const roomMemory = Memory.rooms[creep.room.name];
    const source = Game.getObjectById(creep.memory.TargetSource);

    // ✅ If we already have a cached container, use it
    if (creep.memory.cachedSourceId) {
        const cachedContainer = Game.getObjectById(creep.memory.cachedSourceId);

        if (cachedContainer) {
            // If container energy is too low, clear cache
            if (cachedContainer.store[RESOURCE_ENERGY] < 400) {
                delete creep.memory.cachedSourceId;
            } else {
                // Otherwise, keep withdrawing from cached container
                if (creep.withdraw(cachedContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(cachedContainer);
                }
                return; // ✅ Exit early since we handled cached source
            }
        } else {
            // Container no longer exists → clear cache
            delete creep.memory.cachedSourceId;
        }
    }

    // 🔄 If no cached container, proceed with normal logic
    const sourceContainers = Object.values(roomMemory.sources)
        .map(s => Game.getObjectById(s.containerId))
        .filter(c => c && c.store[RESOURCE_ENERGY] > 600);

    if (sourceContainers.length > 0) {
        const closest = creep.pos.findClosestByRange(sourceContainers);
        creep.memory.cachedSourceId = closest.id;

        if (creep.withdraw(closest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.travelTo(closest);
        }
    } else {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE || creep.harvest(source) === ERR_NOT_ENOUGH_RESOURCES) {
            creep.travelTo(source);
        }
    }

    // Clear cache once creep is empty (after delivering energy)
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
        delete creep.memory.cachedSourceId;
    }
},
// Core Harvest code with storage 
harvestWithStoreage: function harvestWithStorage(creep){
    if (creep.ticksToLive < 70) {
        creep.suicide()
    }
    if (!creep.memory.StorageId) {
        if (creep.room.storage == undefined){
            creep.memory.StorageId = "NoValue";
        }
        else{
           creep.memory.StorageId = creep.room.storage.id; 
        }
        
    }
    if (!creep.memory.TargetSource) {
        let TTTT111 = creep.pos.findClosestByRange(FIND_SOURCES);
        creep.memory.TargetSource = TTTT111.id;
        
    }
    if (!creep.memory.minLevel) {
        creep.memory.minLevel = 30000 ;//100k Min storage by default 
    }
    //Harvest
var source = null; // Ensure 'source' is always declared

if (creep.memory.TargetSource) {
    source = Game.getObjectById(creep.memory.TargetSource);
} else {
    var sources = creep.room.find(FIND_SOURCES);
    if (sources.length > 0) {
        var index = Game.time % sources.length; // Dynamically selects a source
        source = sources[index];
        creep.memory.TargetSource = source.id; // Store it for future use
    }
}

if (source) {
    // Proceed with actions, like moving to or harvesting
    creep.moveTo(source);
}




    var minLevel = (creep.memory.minLevel);
    //creep.say(creep.room.storage.store[RESOURCE_ENERGY]);
    if (creep.memory.StorageId == "NoValue") {
        creep.say('NO STOREAGE')
        var nearbyContainer = (creep.pos.findInRange(FIND_STRUCTURES, 3,{
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_CONTAINER ) && 
                            structure.store.energy > 300;    }
            }))  ;
            //console.log(nearbyContainer)
            //console.log(nearbyContainer.length)
        if (nearbyContainer.length == 1){
            source2 = (creep.pos.findClosestByRange(nearbyContainer))
            if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.travelTo(source2);
            if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                //try again
                }
            }
        }
        else if (creep.harvest(source) == ERR_NOT_IN_RANGE||ERR_NOT_ENOUGH_RESOURCES) {
            creep.travelTo(source);
            if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                //try again
            }
        }/*
       // Ensure room and sources exist in memory
if (Memory.rooms[roomName] && Memory.rooms[roomName].sources) {
    // Retrieve all containers linked to sources in the room
    const sourceContainers = Object.values(Memory.rooms[roomName].sources)
        .map(source => Game.getObjectById(source.containerId))
        .filter(container => container && container.store.energy > 600);

    let target = null;

    if (sourceContainers.length > 0) {
        // Select the closest available container
        target = creep.pos.findClosestByRange(sourceContainers);

        if (target) {
            creep.memory.cachedSource = target.id; // Cache container

            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(target);
            }
        }
    }



    // Final fallback: Harvest directly from the source if no containers are available
    if (!target) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE || creep.harvest(source) === ERR_NOT_ENOUGH_RESOURCES) {
            creep.travelTo(source);
        }
    }
}

// Clear cache once energy is withdrawn
if (creep.memory.cachedSource && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    delete creep.memory.cachedSource;
}*/


    }
    
    else if(creep.room.storage.store[RESOURCE_ENERGY] < minLevel && creep.room.storage ) {
        creep.say('Storage LOW')
        var nearbyContainer = (creep.pos.findInRange(FIND_STRUCTURES, 4,{
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_CONTAINER || structure.structureType == STRUCTURE_LINK) && 
                            structure.store.energy > 300;    }
            }))  ;
            //console.log(nearbyContainer)
            //console.log(nearbyContainer.length)
        if (nearbyContainer.length > 0){
            source2 = (creep.pos.findClosestByRange(nearbyContainer))
            if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.travelTo(source2);
            if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                //try again
                }
            }
        }
        else if (creep.harvest(source) == ERR_NOT_IN_RANGE||ERR_NOT_ENOUGH_RESOURCES) {
            creep.travelTo(source);
            if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
                //try again
            }
        }
    }
    else {
                var nearbyContainer = (creep.pos.findInRange(FIND_STRUCTURES, 4,{
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_CONTAINER || structure.structureType == STRUCTURE_LINK) && 
                            structure.store.energy > 300;    }
            }))  ;
            //console.log(nearbyContainer)
            //console.log(nearbyContainer.length)
        if (nearbyContainer.length > 0){
            source2 = (creep.pos.findClosestByRange(nearbyContainer))
            if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.travelTo(source2);
            if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                //try again
                }
            }
        }
        else{
            var source2 = Game.getObjectById(creep.memory.StorageId);
            creep.say('TO Storage')
            if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.travelTo(source2);
                if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    //try again
                }
            }
        }
        
    }
},

shareEnergy: function shareEnergy(creep) {
    // Only run every 4 ticks to reduce CPU usage
    if (Game.time % 4 !== 0) return;
    if (! creep.memory.energySharer) creep.memory.energySharer = true;
    // Find nearby creeps of the same role (range 1)
    const nearby = creep.pos.findInRange(FIND_MY_CREEPS, 1)
        .filter(c => c.memory.energySharer && c.id !== creep.id);

    for (const mate of nearby) {
        const freeCapacity = mate.store.getFreeCapacity(RESOURCE_ENERGY);
        const maxCapacity = mate.store.getCapacity(RESOURCE_ENERGY);

        // Check if mate is under half full
        if (freeCapacity > maxCapacity / 2) {
            // Calculate half of our energy to donate
            const amount = Math.floor(creep.store[RESOURCE_ENERGY] / 2);

            if (amount > 0) {
                creep.transfer(mate, RESOURCE_ENERGY, amount);
                creep.say('⚡ share');
            }
        }
    }
},

BetterCreepTransferEnergy: function BetterCreepTransferEnergy(creep,target){
    if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        creep.travelTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
        if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
            //try and transfer again once moved
        }
    }
},

BetterCreepWithdrawEnergy: function BetterCreepWithdrawEnergy(creep){
    if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
             creep.travelTo(storage, {visualizePathStyle: {stroke: '#ffffff'}});
        if (creep.withdraw(storage) == ERR_NOT_IN_RANGE){
            //try and transfer again once moved
        }
    }
},

findValidContainer: function findValidContainer(creep) {
    const containers = creep.room.find(FIND_STRUCTURES, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });

    // Only consider containers within a reasonable range (e.g., 5 tiles)
    const nearbyContainers = containers.filter(container => creep.pos.inRangeTo(container, 5));

    // Select the closest valid container
    if (nearbyContainers.length > 0) {
        const targetContainer = creep.pos.findClosestByPath(nearbyContainers);
        creep.memory.TargetContainer = targetContainer.id;
        return targetContainer;
    }

    // Check if a container construction site already exists before making a new one
    const existingSite = creep.room.find(FIND_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_CONTAINER && creep.pos.inRangeTo(site, 5)
    });

    if (existingSite.length === 0) { // Ensure no duplicate container builds
        if (creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER) === OK) {
            console.log(`Creep ${creep.name} placed a container construction site at ${creep.pos}`);
        }
    }

    return null;
},
updateSourceRoads: function updateSourceRoads(creep) {
    if (!creep.memory.source) return;

    // Ensure the creep's assigned room is visible before proceeding
    const targetRoom = creep.memory.harvestRoom || creep.memory.home;
    if (!Game.rooms[targetRoom]) return; // If room isn't visible, skip processing
    console.log("part11")
    // Retrieve the source object safely
    const source = Game.getObjectById(creep.memory.source);
    if (!source) return; // Ensure source exists before proceeding
    console.log("part12")
    const homeRoom = creep.memory.home;
    const room = Game.rooms[homeRoom];
    if (!room) return;
console.log("part13")
    const spawns = room.find(FIND_MY_SPAWNS);
    if (!spawns.length) return;
    const spawn = spawns[0];
     console.log("part1")
    // Ensure pathfinding won't fail
    if (!spawn.pos || !source.pos) return;
    const path = spawn.pos.findPathTo(source.pos, { ignoreCreeps: true });
    if (!path.length) return; // Check if path was found

    let lastRoomName = homeRoom;

    // Initialize Memory.rooms if it doesn't exist
    if (!Memory.rooms) Memory.rooms = {};
    console.log("lets build some roads")
    path.forEach(pos => {
        if (pos.roomName) lastRoomName = pos.roomName; // Update room tracking safely

        if (!Memory.rooms[lastRoomName]) Memory.rooms[lastRoomName] = { sourceroads: {} };
        if (!Memory.rooms[lastRoomName].sourceroads[creep.memory.source]) {
            Memory.rooms[lastRoomName].sourceroads[creep.memory.source] = [];
        }

        Memory.rooms[lastRoomName].sourceroads[creep.memory.source].push({ x: pos.x, y: pos.y, roomName: lastRoomName });

        if (Game.rooms[lastRoomName]) {
            const result = Game.rooms[lastRoomName].createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
            if (result !== OK) {
                console.log(`Failed to create road at (${pos.x}, ${pos.y}) in ${lastRoomName}, error code: ${result}`);
            }
        }
    });

    console.log(`Source roads updated for creep: ${creep.name}`);
},


assignSupplyContainer: function assignSupplyContainers() {
    let haulerGroups = {};

    // Group haulers by their home room
    _.forEach(Game.creeps, creep => {
        if (creep.memory.role === "hauler" && creep.memory.home) {
            if (!haulerGroups[creep.memory.home]) {
                haulerGroups[creep.memory.home] = [];
            }

            haulerGroups[creep.memory.home].push(creep);
        }
    });

    // Iterate through each room's haulers
    _.forEach(haulerGroups, (creeps, roomName) => {
        const homeRoom = Memory.rooms[roomName];
        if (!homeRoom || !homeRoom.sources) return;

        const totalHaulers = creeps.length;
        const sources = Object.values(homeRoom.sources);
        const totalNeeded = sources.reduce((sum, source) => sum + source.HaulerCarry2Needed, 0);

        let assignedCounts = {};
        sources.forEach(source => {
            assignedCounts[source.containerId] = Math.round((source.HaulerCarry2Needed / totalNeeded) * totalHaulers);
        });

        let creepIndex = 0;
        for (const containerId in assignedCounts) {
            for (let i = 0; i < assignedCounts[containerId] && creepIndex < totalHaulers; i++) {
                creeps[creepIndex].memory.SupplyContainer1 = containerId;
                creepIndex++;
            }
        }
    });
},
opportunisticRepair: function opportunisticRepair(creep) {
    // Throttle to every 4 ticks for efficiency
    if (Game.time % 4 !== 0) return;

    // Scan nearby structures within range 2
    const targets = creep.pos.findInRange(FIND_STRUCTURES, 2, {
        filter: s => s.hits < s.hitsMax * 0.95
    });

    // If any structure qualifies, repair the first one and stop
    if (targets.length > 0) {
        creep.repair(targets[0]);  // no sorting, just grab the first
        //creep.say('🛠️');
    }
}


    
    
    
    /**else if(target = creep.pos.findClosestByRange(RUIN);
        creep.travelTo(target);) {
        if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
            creep.travelTo(source);
        }
    } **/
            
};

module.exports = funtionsCreeps;
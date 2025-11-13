var roleBuilder = require('role.builder');
var sharedFuntionsCreeps = require('functions.creeps');
var roleRemoteHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {
        // end of the world spell 
        //creep.suicide()
        // source hunter AI
        // Setup and hold
        //set check target room
        //setup home 
        // check where should be 
        // travel to target room REQUIRES "creep.memory.harvestRoom"
        //creep.say('starting'); // CHECK IF STARTING THIS CODE
        if (!creep.memory.setup) {
            if (!creep.memory.home) {
                creep.memory.home = creep.room.name;
            }

            if (!creep.memory.harvestRoom) {
                creep.say('I DONT HAVE A TARGET ROOM');
            }

            if (!creep.memory.storageContainer) {
                let target = creep.room.find(FIND_STRUCTURES, {
                    filter: structure => structure.structureType === STRUCTURE_STORAGE
                });
                creep.memory.storageContainer = target.length > 0 ? creep.room.storage.id : 'undefined';
            }
        
            if (!creep.memory.targetRoom) {
                creep.memory.targetRoom = creep.memory.home;
            }

            // Once all conditions are checked, mark setup as complete
            creep.memory.setup = true;
        }

        // Ensure creep moves to safety if injured
        if (creep.hits !== creep.hitsMax) {
            creep.moveTo(new RoomPosition(25, 35, creep.memory.home));        
            return;
        }
        // harvest or deliver
        if(creep.carry.energy == 0) {
            creep.memory.harvesting = false;
            creep.memory.skiptobuild = false;
            creep.memory.targetRoom = creep.memory.harvestRoom;
        }
        if(!creep.memory.harvesting && creep.carry.energy== creep.carryCapacity) {
            creep.memory.harvesting = true;
            creep.memory.targetRoom = creep.memory.home;
        }
        //Repair/build structures nearby
        if (creep.memory.harvesting == true && (Game.time % 3 == 0)) {
       // Search once for both structures and construction sites
let nearbyObjects = creep.pos.findInRange(FIND_STRUCTURES, 1)
    .concat(creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 1));

// First filter for repair targets
let repairTarget = nearbyObjects.find(obj =>
    obj.structureType && obj.hits < Math.min(obj.hitsMax, 30000) &&
    obj.structureType !== STRUCTURE_WALL
);

if (repairTarget) {
    creep.repair(repairTarget);
} else {
    // If no repair target, look for construction sites in the same list
    let site = nearbyObjects.find(obj => obj.progress !== undefined);
    if (site) creep.build(site);
}

}
 
        // go home
        if (creep.room.name != creep.memory.targetRoom){
            creep.memory.flag = creep.memory.targetRoom;
            var flag = Game.flags[creep.memory.flag];
            // travel to flag
            var pos1 = creep.pos
            var pos2 = flag.pos
            if (!pos1.isEqualTo(pos2)) {
                creep.moveTo(flag.pos);
            }
        }
       
        
        else if (creep.memory.harvesting === true) {
            
            if (creep.memory.storageContainer == "undefined") {
                roomName = creep.room.name;
            // Check if storageLink exists once
            const storageLink = Memory.rooms[roomName].storageLink;
            if (creep.memory.skiptobuild === true ){ // stops remotes all stopping building if at one point all the containers was full this harvest cycle
                roleBuilder.run(creep)
                return;
            }
            // If targets are not cached or cache is outdated (older than 100 ticks), refresh them
            if (!Memory.rooms[roomName].BalancercachedTargets || Memory.rooms[roomName].BalancercachedTargets.tick + 100 < Game.time) {
                let targets = Game.rooms[roomName].find(FIND_STRUCTURES, {
                    filter: structure =>
                        (structure.structureType === STRUCTURE_EXTENSION ||
                         structure.structureType === STRUCTURE_SPAWN ||
                         structure.structureType === STRUCTURE_TOWER)
                    });
                    // Add storageLink if it exists
                    if (storageLink) {
                        const link = Game.getObjectById(storageLink);
                        if (link) targets.push(link);
                    }
                    // Cache targets list
                    Memory.rooms[roomName].BalancercachedTargets = {
                        tick: Game.time,
                        structures: targets.map(s => s.id) // Store only structure IDs for efficiency
                    };
                }

                if (!Memory.rooms[roomName] || !Memory.rooms[roomName].BalancercachedTargets) return [];

                // Retrieve cached structures and check their energy capacity every tick
                targets = Memory.rooms[roomName].BalancercachedTargets.structures
                    .map(id => Game.getObjectById(id))
                    .filter(structure => structure && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
    
                    if (targets.length > 0) {
                        focusedtarget = creep.pos.findClosestByRange(targets)
                        if (creep.transfer(focusedtarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(focusedtarget);
                        }
                    }
                    else{
                    creep.memory.skiptobuild = true ;
                    //roleBuilder.run(creep);
                    return
                }

            }
            else {
                var target = Game.getObjectById(creep.memory.storageContainer);
                if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target);
                }
            }
	    }
        // Kill the Useless FUCKS
	    else if (creep.ticksToLive < 50){
	        //creep.say("Bai Bai " + creep.ticksToLive)
	        creep.suicide()
	    }
		else if(creep.memory.harvesting === false ) {
		    if (!creep.memory.source) {
                var sourceFind = creep.pos.findClosestByRange(FIND_SOURCES);
			    creep.memory.source = sourceFind.id;
            }
			var source = Game.getObjectById(creep.memory.source);
			if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
					creep.moveTo(source);
			}

		}
        
	}
};

module.exports = roleRemoteHarvester;
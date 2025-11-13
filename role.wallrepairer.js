var roleBuilder = require('role.builder');
var sharedFuntionsCreeps = require('functions.creeps');
module.exports = {
    // a function to run the logic for this role
    run: function(creep) {
        const rampartMaxHitsByLevel = {
        1: 100000,
        2: 300000,
        3: 1000000,
        4: 3000000,
        5: 10000000,
        6: 30000000,
        7: 100000000,
        8: 300000000
        };

        if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
        // Go home
        if (creep.room.name != creep.memory.home){
            creep.memory.role1 = creep.memory.role;
            creep.memory.role = "moveFlag"
        }
        // if creep is trying to repair something but has no energy left
        if (creep.memory.working == true && creep.carry.energy == 0) {
            // switch state
            creep.memory.working = false;
            delete creep.memory.repairTarget;
        }
        if (!creep.memory.minLevel) {
		    creep.memory.minLevel = 3000
		}
		if (!creep.memory.source){
		    var FullSource = creep.pos.findClosestByRange(FIND_SOURCES);
		    creep.memory.source = FullSource.id
		}
        else if (!creep.memory.storageContainer) {
            var target = creep.room.find(FIND_STRUCTURES, {
                filter:  structure =>{
                    return (structure.structureType == STRUCTURE_STORAGE );
                }
            });
            if (target.length == 0) {
                creep.memory.storageContainer = 'undefined';
                creep.memory.StorageId = 'undefined';
            }
            else {
                creep.memory.storageContainer = creep.room.storage.id;
                creep.memory.StorageId = creep.room.storage.id;
            }
        }
		// if creep is harvesting energy but is full
        else if (creep.memory.working == false && creep.carry.energy == creep.carryCapacity) {
            // switch state
            creep.memory.working = true;
        }
        else if (creep.memory.working != true || false) {
            // switch state
            creep.memory.working = false;
        }
        
        // if creep is supposed to repair something
if (creep.memory.working === true) {
    // **Cache wall & rampart IDs every 100 ticks to reduce CPU usage**
    if (!creep.memory.repairTargetIDs || Game.time % 100 === 0) {
        let structures = creep.room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART
        });

        // Store only IDs instead of full game objects
        creep.memory.repairTargetIDs = structures.map(s => s.id);
    }

    // **Retrieve actual objects from IDs**
    let structures = creep.memory.repairTargetIDs.map(id => Game.getObjectById(id)).filter(s => s);

    // **Check if there are no walls/ramparts before proceeding**
    if (!structures.length) return;

    // **Determine max HP based on room's controller level**
    let controller = creep.room.controller;
    let rampartMaxHits = controller ? rampartMaxHitsByLevel[controller.level] : 1000000; // Fallback default

    //let target = undefined;

    // **Prioritize ramparts under 300 HP immediately**
// Track the currently targeted structure
if (!creep.memory.repairTarget ) {
    // Prioritize ramparts under 300 HP immediately

let lowestWall = structures.reduce((lowest, s) => {
    let maxHits = rampartMaxHits; // Walls are compared against rampart limits
    let healthRatio = s.hits / maxHits;

    return (!lowest || healthRatio < lowest.hits / maxHits) ? s : lowest;
}, null);

creep.memory.repairTarget = lowestWall ? lowestWall.id : null;

}
// Prioritize critical ramparts first
let criticalRamparts = structures.filter(s => s.structureType === STRUCTURE_RAMPART && s.hits < 500);
if (criticalRamparts.length > 0) {
    creep.say("low WALL")
     target = creep.pos.findClosestByPath(criticalRamparts);
}
else{
    target = Game.getObjectById(creep.memory.repairTarget) 
}

// Log repair status periodically to reduce CPU usage
if (target && Game.time % 10 === 0) {
    creep.say(`${((target.hits / (target.structureType === STRUCTURE_WALL ? rampartMaxHits : target.hitsMax)) * 100).toFixed(2)}%`);
}

// Repair selected structure until out of energy
if (target) {
    if (creep.repair(target) === ERR_NOT_IN_RANGE && !creep.pos.inRangeTo(target, 1)) {
        creep.moveTo(target);
    }
}







            // if we can't fine one
            else {
                // look for construction sites
                roleBuilder.run(creep);
            }
        }
        // if creep is supposed to harvest energy from source
        // Get resources + suicide
        else {
            if(creep.memory.storageContainer == "undefined" ){
                //console.log('harvest with no container')
                sharedFuntionsCreeps.harvest(creep);
            }
            else {
                //creep.say('help')
                sharedFuntionsCreeps.harvestWithStoreage(creep);
            }
        }
    }
};
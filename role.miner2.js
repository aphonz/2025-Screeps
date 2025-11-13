var sharedFuntionsCreeps = require('functions.creeps');

var roleMiner = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
        if(!creep.memory.TargetSource){
            creep.memory.TargetSource = creep.pos.findClosestByRange(FIND_SOURCES).id;
        }
        
	    if(creep.store.getFreeCapacity() > 11) {
	        if(creep.ticksToLive < 30){
	            creep.suicide();
	        }
	        
            var source = Game.getObjectById(creep.memory.TargetSource);
            if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.travelTo(source, {visualizePathStyle: {stroke: '#ffac02'}});
            }
        }
        else {
            sharedFuntionsCreeps.findValidContainer(creep);
            let target = Game.getObjectById(creep.memory.TargetContainer);

            // If no container is assigned, find or build one
            if (!target) {
                // Repair structures if needed
                let RepairStructure = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: s => {
                        const MaxStructureLimit = 30000;
                        const maxHits = s.hitsMax > MaxStructureLimit ? MaxStructureLimit : s.hitsMax;
                        return s.hits + 1000 < maxHits && s.structureType !== STRUCTURE_WALL;
                    }
                }); 
                if (RepairStructure && creep.repair(RepairStructure) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(RepairStructure);
                }

                // Handle construction tasks
                let BuildTargets = creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
                if (BuildTargets && creep.build(BuildTargets) === OK) {
                    creep.cancelOrder('move');
                }
            }
            else {
                // Transfer energy if in range
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(target, { reusePath: 10, visualizePathStyle: { stroke: '#ffffff' } });
                }
            }
        }
	}
};

module.exports = roleMiner;
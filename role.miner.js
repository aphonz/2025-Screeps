var sharedFuntionsCreeps = require('functions.creeps');

var roleMiner = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
        else if (creep.room.name != creep.memory.home){
            creep.memory.flag = creep.memory.home;
        }
        
        if (creep.room.name != creep.memory.home){
            creep.memory.flag = creep.memory.home;
            var flag = Game.flags[creep.memory.flag];
            // travel to flag
            var pos1 = creep.pos
            var pos2 = flag.pos
            if (!pos1.isEqualTo(pos2)) {
                creep.moveTo(flag.pos);
            }
            return;
        }
        if(!creep.memory.TargetSource){
           const sourcesMemory = Memory.rooms[creep.room.name] && Memory.rooms[creep.room.name].sources ? Memory.rooms[creep.room.name].sources : {};

const sourceCounts = {};
Object.keys(sourcesMemory).forEach(source => {
    sourceCounts[source] = 0;
});

// Count assignments
const creepsWithSameRole = _.filter(Game.creeps, c => c.memory.role === creep.memory.role && c.room.name === creep.room.name);
creepsWithSameRole.forEach(c => {
    if (c.memory.TargetSource) {
        sourceCounts[c.memory.TargetSource] = (sourceCounts[c.memory.TargetSource] || 0) + 1;
    }
});

// Assign the least-used source
const leastUsedSource = _.min(Object.keys(sourceCounts), source => sourceCounts[source]);
creep.memory.TargetSource = leastUsedSource;

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
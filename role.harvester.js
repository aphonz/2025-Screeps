var roleBuilder = require('role.builder');
var roleHarvester = {

    /** @param {Creep} creep **/
    run: function(creep) {
        //creep.suicide();
        if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
        if(!creep.memory.TargetSource){
            creep.memory.TargetSource = (creep.pos.findClosestByRange(FIND_SOURCES)).id;
        }
        
        if(creep.memory.Supplying && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.Supplying = false;
            creep.say('🔄 Demanding');
	    }
	    if(!creep.memory.Supplying && creep.store.getFreeCapacity() == 0) {
	        creep.memory.Supplying = true;
	        creep.say('🚧 Supplying');
	    }

        
	    if(!creep.memory.Supplying) {
	        
	        if(creep.ticksToLive < 70){
	            creep.suicide();
	        }
	        var source = Game.getObjectById(creep.memory.TargetSource);
	        var nearbyContainer = (creep.pos.findInRange(FIND_STRUCTURES, 3,{
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_CONTAINER) && 
                            structure.store.energy > 300;    }
            }))  ;
            
            if (nearbyContainer.length == 1){
                source2 = (creep.pos.findClosestByRange(nearbyContainer))
                if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.travelTo(source2);
                if (creep.withdraw(source2, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    //try again
                    }
                }
            }
            
            else if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.travelTo(source, {visualizePathStyle: {stroke: '#ffac02'}});
            }
	    }
        else { //If Yes to supplying
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                // Check if the structure is an extension or spawn with free capacity
                if ((structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        return true;
                        creep.say('TOWER TIME');
                    }
                return false;
                }
    
            });
            
	    
	    
        // If no extensions or spawns are found, check for towers with free capacity
            if (targets.length === 0) {
               targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.structureType == STRUCTURE_TOWER || structure.structureType == STRUCTURE_STORAGE) && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
            }
            if(targets.length > 0) {
                var target = creep.pos.findClosestByRange(targets)
                 if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.travelTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                    if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE){
                        //try and transfer again once moved
                    }
                }
            }
            else{
                roleBuilder.run(creep);
            }
	    }
        
	}
};

module.exports = roleHarvester;
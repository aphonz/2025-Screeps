var functionsCondensedMain = require('CondensedMain');
var roleBuilder = require('role.builder');
var roleFatUpgrader = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
        const roomName = creep.memory.home;
        if(!creep.memory.TargetSource){
            creep.memory.TargetSource = creep.pos.findClosestByRange(FIND_SOURCES);
        }
        if(!creep.memory.TargetLink){
            functionsCondensedMain.validateAndTransferEnergy(roomName);
            creep.memory.TargetLink = Memory.rooms[roomName].controllerLink ;
        }
        // If still no link build
        if(!creep.memory.TargetLink){
            roleBuilder.run(creep);
            return;
        }
        

        if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.upgrading = false;
            creep.say('🔄 harvest');
	    }
	    if(!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
	        creep.memory.upgrading = true;
	        creep.say('⚡ upgrade');
	    }

	    if(creep.memory.upgrading) {
            if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.travelTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else {
	        if(creep.ticksToLive < 50){
	            creep.suicide();
	            return;
	        }
	        var TargetLink = Game.getObjectById(creep.memory.TargetLink);
	        
	        functionsCondensedMain.validateAndTransferEnergy(roomName);
	        if(creep.withdraw(TargetLink, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                 creep.travelTo(TargetLink);
           }
	        
            /*var source = Game.getObjectById(creep.memory.TargetSource);
            if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.travelTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
            }*/
	    }
	}
};

module.exports = roleFatUpgrader;

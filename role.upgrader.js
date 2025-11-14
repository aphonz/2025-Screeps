

var sharedFuntionsCreeps = require('functions.creeps');
var functionsCondensedMain = require('CondensedMain');
const { get } = require('lodash');
var roleUpgrader = {

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
            creep.memory.TargetSource = (creep.pos.findClosestByRange(FIND_SOURCES).id);
        }
        if(!creep.memory.LinkCheck){
            functionsCondensedMain.findLinks(creep.room.name) ;
            creep.memory.LinkCheck = "true";
        }

        //if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {
        //    creep.memory.upgrading = false;
        //    creep.say('🔄 harvest');
	    //}
	    if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
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
            }else{
                sharedFuntionsCreeps.shareEnergy(creep)
            }
        }
        else {
            // check memory for controller container id
            if (Memory.rooms[creep.room.name].tempControllerContainer
                && Memory.rooms[creep.room.name].tempControllerContainer.id) {
                var ControlerConatiner = Game.getObjectById(Memory.rooms[creep.room.name].tempControllerContainer.id);
            } else  {
                var ControlerConatiner = "NoValue";
            }
            //var tempControllerContainer = _.get(Memory, ['Rooms', creep.room.name, 'tempControllerContainer']);
            //console.log(ControlerConatiner);
            //console.log(ControlerConatiner);
            if (ControlerConatiner !== "NoValue" ) {
                if (ControlerConatiner &&  ControlerConatiner.store[RESOURCE_ENERGY] >= creep.store.getFreeCapacity()) {
                    // move to and withdraw enough to fill the creep
                    if (creep.withdraw(ControlerConatiner, RESOURCE_ENERGY, creep.store.getFreeCapacity()) === ERR_NOT_IN_RANGE) {
                        creep.travelTo(ControlerConatiner, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                    return;
                }
            }    /* if(creep.ticksToLive < 70){
	            creep.suicide();
	        }
            var source = Game.getObjectById(creep.memory.TargetSource);
            if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
                creep.travelTo(source, {visualizePathStyle: {stroke: '#ffaa00'}});
            }*/
            if (creep.memory.StorageId == "NoValue") {
                sharedFuntionsCreeps.harvest(creep);
            }
            else {
                sharedFuntionsCreeps.harvestWithStoreage(creep);
            }
	    }
	}
};

module.exports = roleUpgrader;

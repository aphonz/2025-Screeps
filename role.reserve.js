var FunctionsRemoteRoomCode = require('RemoteRoomCode')
var roleClaim = {

    /** @param {Creep} creep **/
    run: function(creep) {
        //creep.say("hi")
       
        if (creep.room.name !== creep.memory.harvestRoom) {
    creep.memory.flag = creep.memory.harvestRoom;
    var flag = Game.flags[creep.memory.flag];
    
    if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }


    if (flag) {
        // Travel to flag
        var pos1 = creep.pos;
        var pos2 = flag.pos;
        if (!pos1.isEqualTo(pos2)) {
            creep.moveTo(flag.pos);
        }
    } else {
        // No flag found, move to the remote room's center
        let exitDir = creep.room.findExitTo(creep.memory.harvestRoom);
        let exitPos = creep.pos.findClosestByPath(exitDir);
        if (exitPos) {
            creep.moveTo(exitPos);
        } else {
            console.log(`Creep ${creep.name} could not find a path to ${creep.memory.harvestRoom}`);
        }
    }
}

        else {
            
            
            
            
    
            if(creep.room.controller && !creep.room.controller.my) {
                if(creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller);
                    if(creep.attackController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        //Heart
                    }
                }
            }
            else if(creep.room.controller ){
                if(creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE){
                    creep.moveTo(creep.room.controller);
                    if(creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE){
                        
                        //Mine
                    }
                }
            }
        }
       
	}
};

module.exports = roleClaim;
/*
 * +--------------------------------------------------------------+
 * | ROLE     : Flag Mover                 (memory.role='moveFlag')
 * |
 * |       ______________
 * |  ____/ [##]  ___   \____
 * | O--[____________]=======|
 * |     O              O
 * |
 * | TYPE     : Utility
 * | BODY     : Inherited from the creep's original role
 * | MOVEMENT : INHERITED (depends on the original body)
 * +--------------------------------------------------------------+
 * | JOB      : Temporary role that walks a creep to memory.flag, then
 * |            restores its original role from memory.role1.
 * | NEEDS    : A flag matching memory.flag (defaults to home).
 * | FALLBACK : None.
 * +--------------------------------------------------------------+
 */
var roleFlagMove = {

    /** @param {Creep} creep **/
    run: function(creep) {
        // Add flag Location to memory
		if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
		if (creep.memory.home !== 'undefined' && !creep.memory.flag){
		    creep.memory.flag = creep.memory.home
		}
		
		var flag = Game.flags[creep.memory.flag];
		
		// travel to flag
		
		
		if (creep.room.name != creep.memory.flag) {
			creep.moveTo(flag.pos);
		}			
        else {
			(creep.memory.role = creep.memory.role1 ) ;
		}           
	}
};

module.exports = roleFlagMove;
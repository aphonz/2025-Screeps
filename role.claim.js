/*
 * +--------------------------------------------------------------+
 * | ROLE     : Claimer                    (memory.role='claim')
 * |
 * |        __________
 * |   ____/ [##]  ___\___
 * | O-[_____________]-----|
 * |     O            O
 * |
 * | TYPE     : Expansion
 * | BODY     : [CLAIM, MOVE, MOVE]
 * | MOVEMENT : NORMAL
 * +--------------------------------------------------------------+
 * | JOB      : Walks to its target room's flag and claims the controller.
 * | NEEDS    : memory.home = target room, and a flag named after it.
 * | FALLBACK : None; expires if the claim has not happened in 600 ticks.
 * +--------------------------------------------------------------+
 */
var roleClaim = {
    /** @param {Creep} creep **/
    run: function (creep) {
        //creep.say("hi")
        if (!creep.memory.home) {
            var home = creep.room.name
            creep.memory.home = home
        } else if (creep.room.name != creep.memory.home) {
            creep.memory.flag = creep.memory.home
        }

        if (creep.room.name != creep.memory.home) {
            creep.memory.flag = creep.memory.home
            var flag = Game.flags[creep.memory.flag]
            // travel to flag
            var pos1 = creep.pos
            var pos2 = flag.pos
            if (!pos1.isEqualTo(pos2)) {
                creep.moveTo(flag.pos)
            }
            return
        } else {
            /*
            if(creep.room.controller && !creep.room.controller.my) {
                if(creep.attackController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller);
                    if(creep.attackController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        //Heart
                    }
                }
            }
            else */ if (creep.room.controller) {
                if (creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller)
                    if (creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        //Mine
                    }
                }
            }
        }
    },
}

module.exports = roleClaim

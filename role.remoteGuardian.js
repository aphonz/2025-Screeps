var roleRemoteGuardian = {

    /** @param {Creep} creep **/
    run: function(creep) {
        // --- init home in creep memory if missing (cheap) ---
        if (!creep.memory.home) {
            creep.memory.home = creep.room.name;
        }
        const home = creep.memory.home;

        // --- cheap cached references and rest timer ---
        //const remotes = (Memory.rooms && Memory.rooms[home] && Memory.rooms[home].remoterooms) || {};
        creep.memory.watchRooms = [home].concat(
    (Memory.rooms && Memory.rooms[home] && Object.keys(Memory.rooms[home].remoterooms || {}))
);
        if (!creep.memory.restTimer) creep.memory.restTimer = 0;
        if (creep.memory.restTimer > 0) creep.memory.restTimer--;
        
        if (creep.memory.restTimer > 0) {
    // If creep is on the edge of the room, move it inward first
    if (creep.pos.x === 0) {
        creep.move(RIGHT);
    } else if (creep.pos.x === 49) {
        creep.move(LEFT);
    } else if (creep.pos.y === 0) {
        creep.move(BOTTOM);
    } else if (creep.pos.y === 49) {
        creep.move(TOP);
    }

    // After nudging off the edge, stop further actions
    return;
}
  
        
        // --- combat-first: detect hostiles and perform attacks before healing ---
        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            // Priority: healer first, then highest threat (attack/ranged parts + hits)
            let priority = hostiles[0];
            for (let h of hostiles) {
                if (h.getActiveBodyparts(HEAL) > 0) {
                    priority = h;
                    break;
                }
            }
            if (hostiles.length > 1 && priority.getActiveBodyparts(HEAL) === 0) {
                hostiles.sort((a, b) => {
                    const scoreA = a.getActiveBodyparts(ATTACK) * 100 + a.getActiveBodyparts(RANGED_ATTACK) * 50 + a.hits;
                    const scoreB = b.getActiveBodyparts(ATTACK) * 100 + b.getActiveBodyparts(RANGED_ATTACK) * 50 + b.hits;
                    return scoreB - scoreA;
                });
                priority = hostiles[0];
            }

            const enemyHasMeleeOnly = priority.getActiveBodyparts(ATTACK) > 0 && priority.getActiveBodyparts(RANGED_ATTACK) === 0;
            const weHaveRanged = creep.getActiveBodyparts(RANGED_ATTACK) > 0;
            const weHaveMelee = creep.getActiveBodyparts(ATTACK) > 0;

            // Engage: keep range if enemy is melee-only and we have ranged; otherwise close when needed
            if (enemyHasMeleeOnly && weHaveRanged) {
                const dist = creep.pos.getRangeTo(priority.pos);
                if (dist <= 1) {
                    creep.moveTo(new RoomPosition(25, 25, creep.room.name), { range: 8, reusePath: 5 });
                } else if (dist > 3) {
                    creep.moveTo(priority.pos, { range: 3, reusePath: 5 });
                }
                const closeTargets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
                if (closeTargets.length >= 2) creep.rangedMassAttack();
                else creep.rangedAttack(priority);
            } else {
                // Mixed or enemy has ranged: prefer ranged if we have it, else close for melee
                if (weHaveRanged) {
                    const dist = creep.pos.getRangeTo(priority.pos);
                    if (dist > 3) creep.moveTo(priority.pos, { range: 3, reusePath: 5 });
                    const closeTargets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
                    if (closeTargets.length >= 2) creep.rangedMassAttack();
                    else creep.rangedAttack(priority);
                    if (weHaveMelee && creep.pos.inRangeTo(priority.pos, 1)) creep.attack(priority);
                } else if (weHaveMelee) {
                    if (!creep.pos.inRangeTo(priority.pos, 1)) creep.moveTo(priority.pos, { reusePath: 5 });
                    if (creep.pos.inRangeTo(priority.pos, 1)) creep.attack(priority);
                }
            }

            // HEAL after attack actions
            if (creep.getActiveBodyparts(HEAL) > 0) {
                if (creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                } else {
                    const ally = creep.pos.findInRange(FIND_MY_CREEPS, 3, {
                        filter: c => c.memory && c.memory.role === 'remoteGuardian' && c.hits < c.hitsMax
                    })[0];
                    if (ally) {
                        if (creep.pos.inRangeTo(ally.pos, 1)) creep.heal(ally);
                        else creep.rangedHeal(ally);
                    }
                }
            }

            // Combat occurred: short restTimer to reduce expensive checks next ticks
            creep.memory.restTimer = 2;
            return;
        }

        // --- no hostiles visible: invader core handling, then mark room safe ---
        if (creep.room.name !== home) {
            const invaderCores = creep.room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_INVADER_CORE
            });
            if (invaderCores.length > 0) {
    const core = invaderCores[0];

               // If creep has melee parts, try melee first
               if (creep.getActiveBodyparts(ATTACK) > 0) {
                   if (creep.pos.inRangeTo(core.pos, 1)) {
                       creep.attack(core);
                   } else {
                       creep.moveTo(core.pos, { range: 1, reusePath: 10 });
                   }
               }
               // If melee not possible, fall back to ranged
               else if (creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
                   const d = creep.pos.getRangeTo(core.pos);
           
                   if (d > 1) {
                       // Move closer, ideally to range 1
                       creep.moveTo(core.pos, { range: 1, reusePath: 10 });
                   }
           
                   // Attack if in range (<=3 for rangedAttack)
                   if (d <= 3) {
                       creep.rangedAttack(core);
                   }
               }
           
               creep.memory.restTimer = 2;
               return;
           }


            // mark remote safe and clear invader ownership flag if present
            const rmem = Memory.rooms[creep.room.name] || {};
            rmem.isSafe = true;
            if (rmem.isOwned === 'Invader') delete rmem.isOwned;
            if (Memory.rooms && Memory.rooms[home] && Memory.rooms[home].remoterooms) {
                Memory.rooms[home].remoterooms[creep.room.name] = rmem;
            }
        }

        // --- target selection and validation ---
        let targetRoom = creep.memory.targetRoom;

        // Validate stored target: only clear if it's marked safe or missing
       /* if (targetRoom) {
            //const tr = Memory.rooms[targetRoom];
            //if (!tr || (tr.isSafe !== false && tr.ownerType !== 'invader')) {
                delete creep.memory.targetRoom;
                targetRoom = undefined;
            }
        }*/

        // Only select a new target when none stored and not in a short rest period
        if (!targetRoom) {
            const watchRooms = creep.memory.watchRooms || [];
            for (const name of watchRooms) {
                var rm = Memory.rooms[home].remoterooms[name] ;
                if (!rm) continue;

                // Prefer any room explicitly marked unsafe, regardless of ownerType
                if (rm.isSafe === false) {
                    creep.memory.targetRoom = name;
                    creep.say(name);
                    targetRoom = name;
                    break;
                }

                // Fallback: if ownerType explicitly indicates invaders, consider it too
                const ownerType = rm.ownerType; // "neutral", "self", "invader", "ally", "other"
                if (ownerType === 'invader') {
                    creep.memory.targetRoom = name;
                    creep.say(name);
                    targetRoom = name;
                    break;
                }
            }
        }

        // --- resting behavior when no target ---
        if (!targetRoom) {
            if (creep.room.name !== home) {
                creep.moveTo(new RoomPosition(25, 25, home), { range: 20, reusePath: 20 });
                return;
            }
            const homeFlag = Game.flags && Game.flags[home];
            if (homeFlag) {
                if (!creep.pos.inRangeTo(homeFlag.pos, 3)) creep.moveTo(homeFlag.pos, { range: 3, reusePath: 20 });
            } else {
                const homeRoom = Game.rooms[home];
                const anchor = homeRoom && (Object.values(homeRoom.spawns)[0] || homeRoom.controller);
                if (anchor) {
                    if (!creep.pos.inRangeTo(anchor.pos, 3)) creep.moveTo(anchor.pos, { range: 3, reusePath: 20 });
                } else {
                    if (!creep.pos.inRangeTo(new RoomPosition(25, 25, home), 10)) creep.moveTo(new RoomPosition(25, 25, home), { range: 10, reusePath: 20 });
                }
            }
            creep.memory.restTimer = 10;
            return;
        }

        // --- travel to stored targetRoom (do not change target until reached or marked safe) ---
        if (creep.room.name !== targetRoom) {
            creep.moveTo(new RoomPosition(25, 25, targetRoom), { range: 20, reusePath: 20 });
            return;
        }

        // If in target room and it's marked safe, clear target and rest next tick
        if (creep.room.name === targetRoom) {
            const tr = Memory.rooms[targetRoom];
            if (!tr || tr.isSafe === true) {
                delete creep.memory.targetRoom;
                creep.memory.restTimer = 5;
                return;
            }
        }

        // Fallback idle
        creep.moveTo(new RoomPosition(25, 25, creep.room.name), { range: 12, reusePath: 20 });
    }
};

module.exports = roleRemoteGuardian;
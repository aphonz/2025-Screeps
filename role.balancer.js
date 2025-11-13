var roleHauler = require('role.hauler');
var sharedFuntionsCreeps = require('functions.creeps');
var roleBalancer = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
        
       if (!creep.memory.Storage) {
           // Always try to record the terminal at the same time
           if (creep.room.terminal) {
               creep.memory.Terminal = creep.room.terminal.id;
           }
       
           // Your existing storage logic
           if (creep.room.storage) {
               creep.memory.Storage = creep.room.storage.id;
           } else {
               const container = creep.room.find(FIND_STRUCTURES, {
                   filter: s => s.structureType === STRUCTURE_CONTAINER
               })[0];
       
               if (container) {
                   creep.memory.Storage = container.id;
               } else {
                   creep.memory.AlwaysHaul = true;
               }
           }
       }
        
        // If creep is flagged to always haul, run hauler logic
        if (creep.memory.AlwaysHaul) {
            roleHauler.run(creep);
            return;
        }

        
        if(creep.memory.Supplying && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.Supplying = false;
            creep.say('🔄 Demanding');
	    }
	    if(!creep.memory.Supplying && creep.store.getFreeCapacity() == 0) {
	        creep.memory.Supplying = true;
	        creep.say('🚧 Supplying');
	    }
        
        
	    if (!creep.memory.Supplying) {
	        //creep.say("DUK")
            // **Check if the creep is close to dying—suicide early to prevent wasted actions**
            if (creep.ticksToLive < 40) {
                creep.suicide();
            }       
            // **Retrieve storage object efficiently**
            // inside role.balancer.run(creep)
            const room = creep.room;
            const rn = room.name;
            
            Memory.rooms = Memory.rooms || {};
            Memory.rooms[rn] = Memory.rooms[rn] || {};
            const cache = Memory.rooms[rn].BalancercachedTargets = Memory.rooms[rn].BalancercachedTargets || {};
            
            // If no nextUpdate set, schedule immediate update
            if (cache.nextUpdate === undefined) cache.nextUpdate = Game.time;
            
            // Only recalc when it's time. The first balancer that reaches this check will update and set nextUpdate forward.
            if (Game.time >= cache.nextUpdate) {
                // Recalculate targets once for the room
                const storage = room.storage || null;
                const terminal = room.terminal || null;
                let container = null;
                if (!storage) {
                    const conts = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER });
                    container = conts.length ? conts[0] : null;
                }
            
                let chosen = null;
                if (terminal && terminal.store[RESOURCE_ENERGY] > 50000) {
                    chosen = terminal;
                } else if (storage && terminal) {
                    chosen = (storage.store[RESOURCE_ENERGY] >= terminal.store[RESOURCE_ENERGY]) ? storage : terminal;
                } else {
                    chosen = storage || terminal || container || null;
                }
            
                cache.EnergySource = chosen ? chosen.id : null;
                cache.ts = Game.time;
                // schedule next update 10 ticks later
                cache.nextUpdate = Game.time + 10;
            }
            
            // Use the cached target
            const targetId = cache.EnergySource;
            const target = targetId ? Game.getObjectById(targetId) : null;
            if (target && target.store[RESOURCE_ENERGY] > 0) {
    const range = creep.pos.getRangeTo(target);

    if (range === 1) {
        // Already next to target, just withdraw
        creep.withdraw(target, RESOURCE_ENERGY);
    } else {
        // Move closer
        creep.moveTo(target);

        // Try again if we ended up adjacent (rare, but safe to check)
        if (creep.pos.isNearTo(target)) {
            creep.withdraw(target, RESOURCE_ENERGY);
        } else {
            // --- NEW: fallback steal from nearby creeps every 4 ticks ---
            if (Game.time % 4 === 0) {
                const nearby = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
                    filter: c =>
                        c.id !== creep.id &&                // not self
                        c.memory.role !== 'balancer' &&     // not another balancer
                        c.store[RESOURCE_ENERGY] > 0        // has energy to give
                });

                if (nearby.length) {
                    creep.withdraw(nearby[0], RESOURCE_ENERGY);
                }
            }
        }
    }
}

            

            
            
        } else {
            //creep.say("FUK")
            // **Find valid energy transfer targets**
            /*
            let targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) =>
                    (structure.structureType === STRUCTURE_EXTENSION ||
                     structure.structureType === STRUCTURE_SPAWN ||
                     structure.structureType === STRUCTURE_TOWER) &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                    
                    OLD storage reteval 
                    
                    if (storage && storage.store[RESOURCE_ENERGY] > 0) {
                let withdrawResult = creep.withdraw(storage, RESOURCE_ENERGY);
                if (withdrawResult === ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage);
                }
            }
            
            
            }); 
            */
            roomName = creep.room.name;
            // Check if storageLink exists once
            const storageLink = Memory.rooms[roomName].storageLink;
    
            // If targets are not cached or cache is outdated (older than 100 ticks), refresh them
            if (!Memory.rooms[roomName].BalancercachedTargets || Memory.rooms[roomName].BalancercachedTargets.tick + 100 < Game.time) {
                let targets = Game.rooms[roomName].find(FIND_STRUCTURES, {
                    filter: structure =>
                        (structure.structureType === STRUCTURE_EXTENSION ||
                         structure.structureType === STRUCTURE_SPAWN ||
                         structure.structureType === STRUCTURE_TOWER)
                });
                // Add storageLink if it exists
                if (storageLink) {
                    const link = Game.getObjectById(storageLink);
                    if (link) targets.push(link);
                }
                // Cache targets list
                Memory.rooms[roomName].BalancercachedTargets = {
                    tick: Game.time,
                    structures: targets.map(s => s.id) // Store only structure IDs for efficiency
                };
            }

            if (!Memory.rooms[roomName] || !Memory.rooms[roomName].BalancercachedTargets) return [];

            // Retrieve cached structures and check their energy capacity every tick
            targets = Memory.rooms[roomName].BalancercachedTargets.structures
                .map(id => Game.getObjectById(id))
                .filter(structure => structure && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        

            
            if (targets.length > 0) {
                // **Select the closest target efficiently**
                let target = creep.pos.findClosestByRange(targets);
                sharedFuntionsCreeps.BetterCreepTransferEnergy(creep, target);
            } else {
            // **Only check TERMINAL when no other targets exist**  
                const terminal = creep.room.terminal;
                const storage = creep.room.storage;

                if (!terminal || !storage) return;

                const terminalEnergy = terminal.store[RESOURCE_ENERGY] || 0;
                const storageEnergy = storage.store[RESOURCE_ENERGY] || 0;

                if (terminalEnergy < 50000) {
                    let transferAmount = 10000;
                
                    // If storage has 19x more energy than terminal, allow up to 50k transfer
                    if (storageEnergy >= terminalEnergy * 19) {
                        transferAmount = Math.min(50000 - terminalEnergy, creep.store[RESOURCE_ENERGY]);
                    } else {
                        transferAmount = Math.min(10000, creep.store[RESOURCE_ENERGY]);
                    }

                    creep.say("Time for terminal");

                    if (creep.transfer(terminal, RESOURCE_ENERGY, transferAmount) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(terminal);
                    }
                }else {
                creep.say("Nap Time");
                }
            }
        }
	}
};

module.exports = roleBalancer;
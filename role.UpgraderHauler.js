// role.upgraderHauler.js
module.exports = {
  run: function(creep) {
      if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
      
    

    // State switching
    if (creep.store[RESOURCE_ENERGY] === 0) {
      creep.memory.state = 'collecting';
      delete creep.memory.cachedSourceId;
    }
    if ( creep.store.getFreeCapacity() == 0) {
      creep.memory.state = 'delivering';
    }

    const roomMem = creep.memory.home;
    const controller = creep.room.controller;

    if (creep.memory.state === 'delivering') {
      // Deliver to container near controller
      let target = creep.memory.targetContainerId && Game.getObjectById(creep.memory.targetContainerId);
      if (!target) {
        target = controller.pos.findInRange(FIND_STRUCTURES, 3, {
          filter: s => s.structureType === STRUCTURE_CONTAINER
        })[0];
        if (target) creep.memory.targetContainerId = target.id;
      }
      if (target) {
        if (target.getFreeCapacity != 0 && creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(target, {reusePath: 10});
        }
      } else {
        // No container: just hang near controller
        creep.travelTo(controller, {range: 2, reusePath: 10});
      }
      // Only run every 4 ticks to reduce CPU usage
    //if (Game.time % 2 !== 0) return;
    
    // Find nearby creeps of the same role (range 1)
    const nearby = creep.pos.findInRange(FIND_MY_CREEPS, 1)
        .filter(c => c.memory.energySharer && c.id !== creep.id);

    for (const mate of nearby) {
        const freeCapacity = mate.store.getFreeCapacity(RESOURCE_ENERGY);
        const maxCapacity = mate.store.getCapacity(RESOURCE_ENERGY);

        // Check if mate is under half full
        if (freeCapacity > maxCapacity) {
            // Calculate half of our energy to donate
            const amount = Math.floor(creep.store[RESOURCE_ENERGY] / 2);

            if (amount > 0) {
                creep.transfer(mate, RESOURCE_ENERGY, amount);
              
                creep.say('⚡ share');
            }
        }
    }
    } else {
      // Collecting
      

      // Otherwise use source containers from memory
      // Retire creeps with low lifespan
    if (creep.ticksToLive < 70) return creep.suicide();

    const roomMemory = Memory.rooms[creep.room.name];
    const source = Game.getObjectById(creep.memory.TargetSource);

    // ✅ If we already have a cached container, use it
    if (creep.memory.cachedSourceId) {
        const cachedContainer = Game.getObjectById(creep.memory.cachedSourceId);

        if (cachedContainer) {
            // If container energy is too low, clear cache
            if (cachedContainer.store[RESOURCE_ENERGY] < 400) {
                delete creep.memory.cachedSourceId;
            } else {
                // Otherwise, keep withdrawing from cached container
                if (creep.withdraw(cachedContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(cachedContainer);
                }
                return; // ✅ Exit early since we handled cached source
            }
        } else {
            // Container no longer exists → clear cache
            delete creep.memory.cachedSourceId;
            return;
        }
    }

    // 🔄 If no cached container, proceed with normal logic
    const sourceContainers = Object.values(roomMemory.sources)
        .map(s => Game.getObjectById(s.containerId))
        .filter(c => c && c.store[RESOURCE_ENERGY] > 600);

    if (sourceContainers.length > 0) {
        const closest = creep.pos.findClosestByRange(sourceContainers);
        creep.memory.cachedSourceId = closest.id;

        if (creep.withdraw(closest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.travelTo(closest);
        }
    } else {
        // fallback: any container/storage
        const cont = creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: s => ( s.structureType === STRUCTURE_STORAGE) &&
                       s.store[RESOURCE_ENERGY] > 0
        });
        if (cont && creep.withdraw(cont, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.travelTo(cont, {reusePath: 10});
        }
      }
    }
  }
};
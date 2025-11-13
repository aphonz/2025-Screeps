
var roleBuilder = require('role.builder');
var sharedFuntionsCreeps = require('functions.creeps');
var roleRepairer = {
    run: function(creep) {
        // Initialize once
        if (!creep.memory.home) {
            creep.memory.home = creep.room.name;
        }
        if (!creep.memory.Roomlevel) {
            creep.memory.Roomlevel = creep.room.controller.level;
            // creep.say(creep.memory.Roomlevel); // comment out for CPU savings
        }
        if (!creep.memory.TargetSource) {
            let source = creep.pos.findClosestByRange(FIND_SOURCES);
            if (source) creep.memory.TargetSource = source.id;
        }
        if (!creep.memory.minLevel) {
            creep.memory.minLevel = 5000;
        }

        // State switching
        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        else if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }
        else if (creep.memory.working === undefined) {
            creep.memory.working = false;
        }

        // Working state: repair or build
        if (creep.memory.working) {
            // Cache repair target
            if (!creep.memory.repairTarget) {
                let target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: (s) => {
                        // Precompute max limit once per creep
                        if (!creep.memory.MaxStructureLimit) {
                            creep.memory.MaxStructureLimit =
                                (((creep.memory.Roomlevel ** 3) * 6.5 + 248) * 1000);
                        }
                        const maxHits = Math.min(s.hitsMax, creep.memory.MaxStructureLimit);
                        return s.hits < maxHits && s.structureType !== STRUCTURE_WALL;
                    }
                });
                if (target) creep.memory.repairTarget = target.id;
            }

            let target = Game.getObjectById(creep.memory.repairTarget);
            if (target && target.hits < target.hitsMax) {
                if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {reusePath: 10});
                }
            } else {
                creep.memory.repairTarget = undefined; // reset if done
                roleBuilder.run(creep); // fallback to building
            }
        }
        // Harvesting state
        else {
            sharedFuntionsCreeps.harvestWithStoreage(creep);
        }
    }
};
module.exports = roleRepairer ;
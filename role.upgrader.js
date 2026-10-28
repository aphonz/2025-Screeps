/*
 * +--------------------------------------------------------------+
 * | ROLE     : Upgrader                   (memory.role='upgrader')
 * |
 * |       ______________
 * |  ____/ [##]  ___   \____
 * | O--[____________]=======|
 * |     O              O
 * |
 * | TYPE     : Economy
 * | BODY     : [WORK, CARRY, MOVE] (RCL1-2) / [WORK, WORK, CARRY, MOVE] x size
 * | MOVEMENT : SLOW
 * +--------------------------------------------------------------+
 * | JOB      : Fills up, then upgrades the controller. Refuels from the
 * |            controller link/container (cached id), else storage/source.
 * | NEEDS    : Controller link or container within 3 tiles (optional).
 * | FALLBACK : Mines or uses storage when the link/container is empty.
 * +--------------------------------------------------------------+
 */
var sharedFuntionsCreeps = require('functions.creeps');
var functionsCondensedMain = require('CondensedMain');

// Ticks between link/temp-container re-checks per room
const LINK_CHECK_INTERVAL = 100;

// Ticks between searches when no controller link/container is known
const STORE_SEARCH_INTERVAL = 25;

// Returns the cached controller link or container, searching only when the cache is invalid
function getControllerStore(creep) {
    var cached = Game.getObjectById(creep.memory.ControllerStoreId);
    if (cached) return cached;

    if (creep.memory.StoreSearchTick && Game.time - creep.memory.StoreSearchTick < STORE_SEARCH_INTERVAL) {
        return null;
    }
    creep.memory.StoreSearchTick = Game.time;

    var roomMem = Memory.rooms[creep.room.name] || {};
    var found = Game.getObjectById(roomMem.controllerLink);

    // Fall back to the temp container position recorded by findLinks, then any container near the controller
    if (!found && roomMem.tempControllerContainer && roomMem.tempControllerContainer.pos) {
        var p = roomMem.tempControllerContainer.pos;
        found = new RoomPosition(p.x, p.y, creep.room.name)
            .lookFor(LOOK_STRUCTURES)
            .find(s => s.structureType === STRUCTURE_CONTAINER);
    }
    if (!found) {
        found = creep.room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        })[0];
    }

    creep.memory.ControllerStoreId = found ? found.id : null;
    return found || null;
}

var roleUpgrader = {

    /** @param {Creep} creep **/
    run: function (creep) {
        // Remember the room the creep was first seen in as its home
        if (!creep.memory.home) {
            creep.memory.home = creep.room.name;
        }

        // Return to the home room flag if the creep has strayed
        if (creep.room.name != creep.memory.home) {
            creep.memory.flag = creep.memory.home;
            var flag = Game.flags[creep.memory.flag];
            if (flag && !creep.pos.isEqualTo(flag.pos)) {
                creep.moveTo(flag.pos);
            }
            return;
        }

        if (!creep.memory.TargetSource) {
            creep.memory.TargetSource = creep.pos.findClosestByRange(FIND_SOURCES).id;
        }

        // Periodically re-run link/temp container placement so destroyed ones are replaced
        var roomMem = Memory.rooms[creep.room.name];
        if (roomMem && (!roomMem.LinkCheckTick || Game.time - roomMem.LinkCheckTick >= LINK_CHECK_INTERVAL)) {
            roomMem.LinkCheckTick = Game.time;
            functionsCondensedMain.findLinks(creep.room.name);
        }

        // Switch between harvesting and upgrading based on energy level
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
            creep.say('🔄 harvest');
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() == 0) {
            creep.memory.upgrading = true;
            creep.say('⚡ upgrade');
        }

        if (creep.memory.upgrading) {
            if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                creep.travelTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
            } else {
                sharedFuntionsCreeps.shareEnergy(creep);
            }
            return;
        }

        // Prefer the controller link or container (interchangeable) over harvesting
        var controllerContainer = getControllerStore(creep);

        if (controllerContainer) {
            var available = controllerContainer.store[RESOURCE_ENERGY];
            var freeCapacity = creep.store.getFreeCapacity();

            // Withdraw whatever is there once it is worth the trip
            if (available >= Math.min(50, freeCapacity)) {
                if (creep.withdraw(controllerContainer, RESOURCE_ENERGY, Math.min(available, freeCapacity)) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(controllerContainer, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
                return;
            }
        }

        // No usable container: take from storage if the room has one, otherwise harvest
        if (creep.memory.StorageId == "NoValue") {
            sharedFuntionsCreeps.harvest(creep);
        } else {
            sharedFuntionsCreeps.harvestWithStoreage(creep);
        }
    }
};

module.exports = roleUpgrader;

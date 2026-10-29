/*
 * +--------------------------------------------------------------+
 * | ROLE     : Wall Repairer              (memory.role='WallRepairer')
 * |
 * |   _____________________
 * |  | [##]  |_____[W]______\
 * | O========|_______________|____|
 * |    O         O         O
 * |
 * | TYPE     : Economy
 * | BODY     : [WORK, CARRY, MOVE] x size
 * | MOVEMENT : SLOW
 * +--------------------------------------------------------------+
 * | JOB      : Raises walls and ramparts toward an RCL-based hit cap,
 * |            emergency-fixing ramparts under 500 hits first.
 * | NEEDS    : Walls or ramparts in the home room; energy source.
 * | FALLBACK : Switches to the moveFlag role when outside its home room.
 * +--------------------------------------------------------------+
 */
var roleBuilder = require('role.builder')
var sharedFuntionsCreeps = require('functions.creeps')
module.exports = {
    // a function to run the logic for this role
    run: function (creep) {
        const rampartMaxHitsByLevel = {
            1: 100000,
            2: 300000,
            3: 1000000,
            4: 3000000,
            5: 10000000,
            6: 30000000,
            7: 100000000,
            8: 300000000,
        }

        if (!creep.memory.home) {
            var home = creep.room.name
            creep.memory.home = home
        }
        // Go home
        if (creep.room.name != creep.memory.home) {
            creep.memory.role1 = creep.memory.role
            creep.memory.role = 'moveFlag'
        }
        // if creep is trying to repair something but has no energy left
        if (creep.memory.working == true && creep.carry.energy == 0) {
            // switch state
            creep.memory.working = false
            delete creep.memory.repairTarget
        }
        if (!creep.memory.minLevel) {
            creep.memory.minLevel = 3000
        }
        if (!creep.memory.source) {
            var FullSource = creep.pos.findClosestByRange(FIND_SOURCES)
            creep.memory.source = FullSource.id
        } else if (!creep.memory.storageContainer) {
            var target = creep.room.find(FIND_STRUCTURES, {
                filter: structure => {
                    return structure.structureType == STRUCTURE_STORAGE
                },
            })
            if (target.length == 0) {
                creep.memory.storageContainer = 'undefined'
                creep.memory.StorageId = 'undefined'
            } else {
                creep.memory.storageContainer = creep.room.storage.id
                creep.memory.StorageId = creep.room.storage.id
            }
        }
        // if creep is harvesting energy but is full
        else if (creep.memory.working == false && creep.carry.energy == creep.carryCapacity) {
            // switch state
            creep.memory.working = true
        } else if (creep.memory.working != true || false) {
            // switch state
            creep.memory.working = false
        }

        // if creep is supposed to repair something
        if (creep.memory.working === true) {
            // Cache walls and ramparts periodically to keep CPU low while avoiding edge tiles.
            if (!creep.memory.repairTargetIDs || Game.time % 100 === 0) {
                const candidates = creep.room.find(FIND_STRUCTURES, {
                    filter: s =>
                        (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) &&
                        s.pos.x > 0 &&
                        s.pos.x < 49 &&
                        s.pos.y > 0 &&
                        s.pos.y < 49,
                })
                creep.memory.repairTargetIDs = candidates.map(s => s.id)
            }

            const controller = creep.room.controller
            const rampartMaxHits = controller ? rampartMaxHitsByLevel[controller.level] : 1000000
            const repairFloor = Math.max(creep.memory.minLevel || 0, 1)

            const structures = (creep.memory.repairTargetIDs || [])
                .map(id => Game.getObjectById(id))
                .filter(s => {
                    if (!s) return false
                    const cap =
                        s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART
                            ? rampartMaxHits
                            : s.hitsMax
                    return s.hits < Math.min(cap, s.hitsMax)
                })

            if (!structures.length) {
                delete creep.memory.repairTargetIDs
                delete creep.memory.repairTarget
                return
            }

            let target = null

            // Urgently repair critically low ramparts to stop breaches.
            const criticalRampart = structures
                .filter(s => s.structureType === STRUCTURE_RAMPART && s.hits < 500)
                .reduce((lowest, s) => (!lowest || s.hits < lowest.hits ? s : lowest), null)

            if (criticalRampart) {
                target = creep.pos.findClosestByPath([criticalRampart]) || criticalRampart
                creep.say('low WALL')
            }

            if (!target) {
                const underFloor = structures.filter(s => {
                    const maxHits = s.structureType === STRUCTURE_WALL ? rampartMaxHits : rampartMaxHits
                    return s.hits < Math.min(repairFloor, maxHits)
                })

                const pool = underFloor.length ? underFloor : structures

                target = pool.reduce((lowest, s) => {
                    if (!lowest) return s
                    const sMax = s.structureType === STRUCTURE_WALL ? rampartMaxHits : rampartMaxHits
                    const lowestMax = lowest.structureType === STRUCTURE_WALL ? rampartMaxHits : rampartMaxHits
                    const sRatio = s.hits / sMax
                    const lowestRatio = lowest.hits / lowestMax
                    return sRatio < lowestRatio ? s : lowest
                }, null)
            }

            if (!target) {
                delete creep.memory.repairTarget
                roleBuilder.run(creep)
                return
            }

            creep.memory.repairTarget = target.id

            if (Game.time % 10 === 0) {
                const maxHits = target.structureType === STRUCTURE_WALL ? rampartMaxHits : target.hitsMax
                creep.say(`${((target.hits / maxHits) * 100).toFixed(2)}%`)
            }

            const inRange = creep.pos.inRangeTo(target, 3)
            if (!inRange) {
                creep.moveTo(target)
                return
            }

            creep.repair(target)
        }
        // if creep is supposed to harvest energy from source
        // Get resources + suicide
        else {
            if (creep.memory.storageContainer == 'undefined') {
                //console.log('harvest with no container')
                sharedFuntionsCreeps.harvest(creep)
            } else {
                //creep.say('help')
                sharedFuntionsCreeps.harvestWithStoreage(creep)
            }
        }
    },
}

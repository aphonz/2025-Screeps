/*
 * +--------------------------------------------------------------+
 * | ROLE     : Upgrader Hauler            (memory.role='upgraderHauler')
 * |
 * |   _______________________
 * |  | [##]  |_______[E]______\
 * | O=======|_________________|____|
 * |    O          O          O
 * |
 * | TYPE     : Logistics
 * | BODY     : [CARRY, CARRY, MOVE] x size
 * | MOVEMENT : SLOW
 * +--------------------------------------------------------------+
 * | JOB      : Collects energy and drops it in the controller container
 * |            so upgraders stay put.
 * | NEEDS    : A container within 3 tiles of the controller.
 * | FALLBACK : Feeds spawns while no containers exist, then hands energy
 * |            to nearby upgraders/builders that share energy.
 * +--------------------------------------------------------------+
 */
// role.upgraderHauler.js
module.exports = {
    run: function (creep) {
        if (!creep.memory.home) {
            var home = creep.room.name
            creep.memory.home = home
        }
        const hasBuiltContainers =
            creep.room.find(FIND_STRUCTURES, {
                filter: structure => structure.structureType === STRUCTURE_CONTAINER,
            }).length > 0
        const releaseHarvester = () => {
            const harvester = Game.getObjectById(creep.memory.fallbackHarvesterId)
            if (harvester && harvester.memory.upgraderHaulerRequest === creep.id) {
                delete harvester.memory.upgraderHaulerRequest
            }
            delete creep.memory.fallbackHarvesterId
        }

        // State switching
        if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.state = 'collecting'
            delete creep.memory.cachedSourceId
        }
        if (creep.store.getFreeCapacity() == 0) {
            creep.memory.state = 'delivering'
        }
        if (hasBuiltContainers || creep.memory.state === 'delivering') releaseHarvester()

        const roomMem = creep.memory.home
        const controller = creep.room.controller

        if (creep.memory.state === 'delivering') {
            if (!hasBuiltContainers) {
                const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {
                    filter: target => target.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
                })
                if (spawn && creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(spawn, { reusePath: 10 })
                }
                return
            }

            // Deliver to container near controller
            let target = creep.memory.targetContainerId && Game.getObjectById(creep.memory.targetContainerId)
            if (!target) {
                target = controller.pos.findInRange(FIND_STRUCTURES, 3, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER,
                })[0]
                if (target) creep.memory.targetContainerId = target.id
            }
            if (target) {
                const freeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY)

                if (freeCapacity > 0) {
                    // Check if we're in range 1 before calling transfer
                    if (creep.pos.isNearTo(target)) {
                        // Only attempt transfer when adjacent

                        creep.transfer(target, RESOURCE_ENERGY)
                        creep.say('⚡ share')
                    } else {
                        // Otherwise move closer
                        creep.travelTo(target, {
                            reusePath: 10,
                        })
                    }
                }
            } else {
                // --- BT Variables ---
                // BTTarget = creep ID of who we are supplying
                // BTLastScan = Game.time of last scan attempt

                // Ensure BT vars exist
                if (creep.memory.BTTarget === undefined) creep.memory.BTTarget = null
                if (creep.memory.BTLastScan === undefined) creep.memory.BTLastScan = 0

                let target = null

                // ✅ 1. Try to load cached target
                if (creep.memory.BTTarget) {
                    target = Game.getObjectById(creep.memory.BTTarget)

                    // If target died or disappeared → clear cache
                    if (!target) {
                        creep.memory.BTTarget = null
                        target = null
                    }
                }

                // ✅ 2. If no target, only scan every 5 ticks
                if (!target && Game.time - creep.memory.BTLastScan >= 5) {
                    creep.memory.BTLastScan = Game.time

                    const candidates = creep.pos
                        .findInRange(FIND_MY_CREEPS, 15)
                        .filter(c => c.memory.energySharer && c.id !== creep.id)

                    if (candidates.length > 0) {
                        target = creep.pos.findClosestByRange(candidates)
                        creep.memory.BTTarget = target.id
                    }
                }

                // ✅ 3. If STILL no target → go stand near controller
                if (!target) {
                    creep.travelTo(controller, {
                        range: 4,
                        reusePath: 10,
                    })
                    return
                }

                // ✅ 4. Move toward target if not adjacent
                if (!creep.pos.isNearTo(target)) {
                    creep.travelTo(target, {
                        range: 1,
                        reusePath: 5,
                    })
                    return
                }

                // ✅ 5. Transfer ALL energy they can take
                const free = target.store.getFreeCapacity(RESOURCE_ENERGY)

                if (free > 0) {
                    const amount = Math.min(creep.store[RESOURCE_ENERGY], free)
                    creep.transfer(target, RESOURCE_ENERGY, amount)
                    creep.say(`⚡${amount}`)
                } else {
                    // ✅ 6. Target is full → clear cache
                    creep.memory.BTTarget = null
                }
            }
            // Only run every 4 ticks to reduce CPU usage
            //if (Game.time % 2 !== 0) return;

            // Find nearby creeps of the same role (range 1)
            const nearby = creep.pos
                .findInRange(FIND_MY_CREEPS, 1)
                .filter(c => c.memory.energySharer && c.id !== creep.id)

            //creep.say("looking");

            for (const mate of nearby) {
                const freeCapacity = mate.store.getFreeCapacity(RESOURCE_ENERGY)

                // Only share if mate is not full
                if (freeCapacity > 30) {
                    // Calculate half of our energy, rounded up
                    var amount = creep.store[RESOURCE_ENERGY]
                    if (amount > freeCapacity) {
                        amount = freeCapacity
                    }
                    if (amount > 0) {
                        creep.transfer(mate, RESOURCE_ENERGY, amount)
                        creep.say('⚡ share' + amount)
                    }
                }
            }
        } else {
            // Collecting
            if (!hasBuiltContainers) {
                let harvester = Game.getObjectById(creep.memory.fallbackHarvesterId)
                if (
                    !harvester ||
                    harvester.memory.role !== 'harvester' ||
                    harvester.room.name !== creep.room.name ||
                    (harvester.memory.upgraderHaulerRequest && harvester.memory.upgraderHaulerRequest !== creep.id)
                ) {
                    releaseHarvester()
                    const harvesters = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
                        filter: candidate =>
                            candidate.memory.role === 'harvester' &&
                            candidate.store[RESOURCE_ENERGY] > 0 &&
                            (!candidate.memory.upgraderHaulerRequest ||
                                candidate.memory.upgraderHaulerRequest === creep.id),
                    })
                    harvester = harvesters
                }
                if (harvester) {
                    creep.memory.fallbackHarvesterId = harvester.id
                    harvester.memory.upgraderHaulerRequest = creep.id
                    if (!creep.pos.isNearTo(harvester)) {
                        creep.travelTo(harvester, { range: 1, reusePath: 5 })
                    }
                }
                return
            }

            // Otherwise use source containers from memory
            // Retire creeps with low lifespan
            if (creep.ticksToLive < 70) return creep.suicide()

            const roomMemory = Memory.rooms[creep.room.name]
            const source = Game.getObjectById(creep.memory.TargetSource)

            // ✅ If we already have a cached container, use it
            if (creep.memory.cachedSourceId) {
                const cachedContainer = Game.getObjectById(creep.memory.cachedSourceId)

                if (cachedContainer) {
                    // If container energy is too low, clear cache
                    if (cachedContainer.store[RESOURCE_ENERGY] < 400) {
                        delete creep.memory.cachedSourceId
                    } else {
                        // Otherwise, keep withdrawing from cached container
                        if (creep.withdraw(cachedContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            creep.travelTo(cachedContainer)
                        }
                        return // ✅ Exit early since we handled cached source
                    }
                } else {
                    // Container no longer exists → clear cache
                    delete creep.memory.cachedSourceId
                    return
                }
            }

            // 🔄 If no cached container, proceed with normal logic
            const sourceContainers = Object.values(roomMemory.sources)
                .map(s => Game.getObjectById(s.containerId))
                .filter(c => c && c.store[RESOURCE_ENERGY] > 600)

            if (sourceContainers.length > 0) {
                const closest = creep.pos.findClosestByRange(sourceContainers)
                creep.memory.cachedSourceId = closest.id

                if (creep.withdraw(closest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(closest)
                }
            } else {
                // fallback: any container/storage
                const cont = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > 0,
                })
                if (cont && creep.withdraw(cont, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(cont, {
                        reusePath: 10,
                    })
                }
            }
        }
    },
}

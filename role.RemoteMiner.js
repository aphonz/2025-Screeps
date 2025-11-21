var sharedFuntionsCreeps = require('functions.creeps');

var roleRemoteMiner = {

    /** @param {Creep} creep **/
    run: function(creep) {
        // --- ADDED helper: optimized movement ---
        function moveToOptimized(creep, target, opts) {
            if (!target) return;
            const pos = target.pos ? target.pos : (target.x !== undefined ? target : null);
            if (!pos) return;
            if (creep.pos.isNearTo(pos) || creep.pos.isEqualTo(pos)) return;
            
            const travelOpts = Object.assign({
                reusePath: 50,
                ignoreCreeps: true,
                maxRooms: 16
            }, opts || {});
            
            if (typeof creep.travelTo === 'function') {
                creep.travelTo(target, travelOpts);
            } else {
                creep.moveTo(target, {
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            }
        }

        // Initial setup
        if (!creep.memory.setup) {
            if (!creep.memory.homeRoom) {
                creep.memory.homeRoom = creep.room.name;
            }
            if (!creep.memory.harvestRoom) {
                creep.say('NO TARGET!');
                return;
            }
            creep.memory.setup = true;
        }
        sharedFuntionsCreeps.handleRoomEdge(creep);
        // Return home if heavily damaged
        if (creep.hits < creep.hitsMax * 0.5) {
            moveToOptimized(creep, new RoomPosition(25, 25, creep.memory.homeRoom));
            return;
        }

        // Navigate to harvest room if not there
        if (creep.room.name !== creep.memory.harvestRoom) {
            moveToOptimized(creep, new RoomPosition(25, 25, creep.memory.harvestRoom));
            return;
        }

        // Get source
        const source = Game.getObjectById(creep.memory.source);
        if (!source) {
            creep.say('NO SOURCE!');
            return;
        }

        // Check if container exists in memory
        if (!creep.memory.containerPos) {
            // Look for existing container near source
            const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });
            
            if (containers.length > 0) {
                const container = containers[0];
                creep.memory.containerId = container.id;
                creep.memory.containerPos = container.pos;
                
                // Save to remote room memory
                if (!Memory.rooms[creep.memory.homeRoom].remoterooms[creep.memory.harvestRoom].containers) {
                    Memory.rooms[creep.memory.homeRoom].remoterooms[creep.memory.harvestRoom].containers = {};
                }
                Memory.rooms[creep.memory.homeRoom].remoterooms[creep.memory.harvestRoom].containers[creep.memory.source] = {
                    id: container.id,
                    pos: container.pos
                };
            } else {
                // Place construction site for container adjacent to source
                const positions = [
                    [source.pos.x - 1, source.pos.y - 1],
                    [source.pos.x,     source.pos.y - 1],
                    [source.pos.x + 1, source.pos.y - 1],
                    [source.pos.x - 1, source.pos.y    ],
                    [source.pos.x + 1, source.pos.y    ],
                    [source.pos.x - 1, source.pos.y + 1],
                    [source.pos.x,     source.pos.y + 1],
                    [source.pos.x + 1, source.pos.y + 1]
                ];
                
                for (const [x, y] of positions) {
                    const pos = new RoomPosition(x, y, creep.room.name);
                    const terrain = creep.room.getTerrain().get(x, y);
                    if (terrain !== TERRAIN_MASK_WALL) {
                        creep.room.createConstructionSite(x, y, STRUCTURE_CONTAINER);
                        creep.memory.containerPos = pos;
                        break;
                    }
                }
            }
        }

        // Move to container position if not there
        if (creep.memory.containerPos && !creep.pos.isEqualTo(creep.memory.containerPos.x, creep.memory.containerPos.y)) {
            const targetPos = new RoomPosition(
                creep.memory.containerPos.x,
                creep.memory.containerPos.y,
                creep.memory.harvestRoom
            );
            
            // Use moveTo directly since we need exact position, not just "near"
            if (typeof creep.travelTo === 'function') {
                creep.travelTo(targetPos, {
                    reusePath: 50,
                    ignoreCreeps: true,
                    maxRooms: 1,
                    range: 0  // Must reach exact position
                });
            } else {
                creep.moveTo(targetPos, {
                    visualizePathStyle: { stroke: '#ffaa00' },
                    range: 0  // Must reach exact position
                });
            }
            return;
        }

        // Now we're at the container position
        
        // Build container if construction site exists
        const constructionSites = creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        
        if (constructionSites.length > 0) {
            const site = constructionSites[0];
            // Harvest when empty, build when full
            if (creep.store[RESOURCE_ENERGY] === 0) {
                const harvestResult = creep.harvest(source);
                if (harvestResult === ERR_NOT_IN_RANGE) {
                    moveToOptimized(creep, source);
                }
                creep.say('⛏️');
            } else {
                const buildResult = creep.build(site);
                if (buildResult === ERR_NOT_IN_RANGE) {
                    moveToOptimized(creep, site);
                } else if (buildResult === OK) {
                    creep.say('🔨');
                }
            }
            return;
        }
 creep.say('🔨');
        // Get container reference
        let container = Game.getObjectById(creep.memory.containerId);
        if (!container) {
            container = creep.pos.findInRange(FIND_STRUCTURES, 0, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            })[0];
            
            if (container) {
                creep.memory.containerId = container.id;
                
                // Save to remote room memory
                if (!Memory.rooms[creep.memory.homeRoom].remoterooms[creep.memory.harvestRoom].containers) {
                    Memory.rooms[creep.memory.homeRoom].remoterooms[creep.memory.harvestRoom].containers = {};
                }
                Memory.rooms[creep.memory.homeRoom].remoterooms[creep.memory.harvestRoom].containers[creep.memory.source] = {
                    id: container.id,
                    pos: container.pos
                };
            }
        }

        // Repair container if damaged
        if (container && container.hits < container.hitsMax * 0.9) {
            if (creep.store[RESOURCE_ENERGY] === 0) {
                creep.harvest(source);
            } else {
                creep.repair(container);
            }
            return;
        }

        // Harvest to container
        if (container && container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            creep.harvest(source);
        } else {
            creep.say('💤');
        }
    }
};

module.exports = roleRemoteMiner;
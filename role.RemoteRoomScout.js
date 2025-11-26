//var FunctionsRemoteRoomCode = require('RemoteRoomCode')

// roleRemoteRoomScout.js
var FunctionsRemoteRoomCode = require('RemoteRoomCode');

function refreshUnexploredRoomsOncePerTickAndCooldown(cooldownTicks) {
    if (!Memory.unexploredRooms) Memory.unexploredRooms = [];
    if (!Memory._unexploredMeta) Memory._unexploredMeta = {};

    const HomeStatus = Game.map.getRoomStatus(Memory.MainRoom).status;

    // Only run on the global cooldown
    if (Game.time % cooldownTicks !== 0) return;

    const knownRooms = new Set(Object.keys(Memory.rooms || {}).map(normalizeRoom));
    var currentUnexplored = new Set();

    // 1) Start with sanitized existing unexplored rooms
    for (const room of Memory.unexploredRooms) {
        const r = normalizeRoom(room);
        if (isValidRoomName(r) && !knownRooms.has(r)) {
            currentUnexplored.add(r);
        }
    }

    // 2) Add valid adjacent rooms that match HomeStatus
    for (const roomName of knownRooms) {
        const exits = Game.map.describeExits(roomName);
        if (!exits) continue;

        for (const adj of Object.values(exits)) {
            const r = normalizeRoom(adj);
            if (!isValidRoomName(r)) continue;

            const adjStatus = Game.map.getRoomStatus(r).status;
            if (adjStatus === HomeStatus && !knownRooms.has(r)) {
                currentUnexplored.add(r);
            }
        }
    }

    // 3) Merge validated roomToClaim
    if (Array.isArray(Memory.roomToClaim)) {
        for (const claimRoom of Memory.roomToClaim) {
            const r = normalizeRoom(claimRoom);
            if (isValidRoomName(r)) {
                currentUnexplored.add(r);
            }
        }
    }

    // 4) Final write: overwrite with sanitized array
    Memory.unexploredRooms = Array.from(currentUnexplored);
    
    
}
// For testing purposes
// Normalize to a comparable, uppercase string
function normalizeRoom(name) {
    return typeof name === "string" ? name.trim().toUpperCase() : "";
}

// Screeps room name validation (e.g., "E12N34", "W3S7")
function isValidRoomName(name) {
    return typeof name === "string" && /^[WE]\d+[NS]\d+$/.test(name);
}


function optimizedMove(creep, destPos, opts) {
    opts = opts || {};
    const reuse = opts.reusePath || 50;
    const visualize = opts.visualizePathStyle;
    // Accept RoomPosition or flagged target
    const pos = destPos.pos ? destPos.pos : destPos;
    if (!pos) return;
    // If already at or adjacent, skip pathing call
    if (creep.pos.isNearTo(pos) || creep.pos.isEqualTo(pos)) return;

    // If creep.travelTo exists use it (Traveler or travel library). Provide CPU-friendly defaults.
    const travelOpts = {
        reusePath: reuse,
        ignoreCreeps: opts.ignoreCreeps !== undefined ? !!opts.ignoreCreeps : true,
        maxRooms: opts.maxRooms || 16,
        visualizePathStyle: visualize,
        allowIncomplete: opts.allowIncomplete !== undefined ? opts.allowIncomplete : true
    };

    if (typeof creep.travelTo === 'function') {
        creep.travelTo(pos, travelOpts);
    } else {
        // fallback: moveTo with visualize only
        creep.moveTo(pos, { visualizePathStyle: visualize || { stroke: '#ffffff' } });
    }
}

function staggeredMoveTo(creep, destPos, opts) {
    opts = opts || {};
    const recalcInterval = opts.recalcInterval || 3;
    const reusePath = opts.reusePath || 50;

    // cheap spread offset based on id to avoid all creeps recalcing same tick
    const spreadOffset = Math.abs(creep.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % recalcInterval;

    if (!creep.memory._lastMoveTick) creep.memory._lastMoveTick = -9999;
    const ticksSince = Game.time - creep.memory._lastMoveTick;
    const shouldRecalc = (ticksSince >= recalcInterval) && ((Game.time + spreadOffset) % recalcInterval === 0);

    // Always allow a move if entering a different room (prevents stalling on edges)
    const enteringDifferentRoom = creep.room.name !== (destPos.roomName || destPos.pos && destPos.pos.roomName);

    if (shouldRecalc || enteringDifferentRoom) {
        optimizedMove(creep, destPos, Object.assign({}, opts, { reusePath: reusePath }));
        creep.memory._lastMoveTick = Game.time;
    } else {
        // Do nothing this tick to save CPU; creep will continue along existing path
    }
}

var roleRemoteRoomScout = {
    /** @param {Creep} creep **/
    run: function(creep) {
        try {
            if (!creep.memory.home) {
                creep.memory.home = creep.room.name || Memory.MainRoom;
                if (creep.memory.home) {
                    creep.memory.HomeStatus = Game.map.getRoomStatus(creep.memory.home).status;
                }
            }
            
            // Validate home is set before proceeding
            if (!creep.memory.home || !isValidRoomName(creep.memory.home)) {
                console.log(`Scout ${creep.name}: Invalid home room, resetting to current room`);
                creep.memory.home = creep.room.name;
                creep.memory.HomeStatus = Game.map.getRoomStatus(creep.memory.home).status;
            }
            
            // Ensure basic memory
            if (!Memory.unexploredRooms) Memory.unexploredRooms = [];

            // Global update (safe to call from every creep)
            refreshUnexploredRoomsOncePerTickAndCooldown(200);

            // If resting, handle exploration bookkeeping and movement to home
            if (creep.memory.restUntil && Game.time < creep.memory.restUntil) {
                // Ensure unexploredRooms exists (already done above)
                // Assign a nextScoutTarget if not set
                if (!creep.memory.nextScoutTarget && Memory.unexploredRooms.length) {
                    creep.memory.nextScoutTarget = Memory.unexploredRooms.shift();
                }

                if (creep.memory.nextScoutTarget) {
                    if (creep.room.name !== creep.memory.nextScoutTarget) {
                        staggeredMoveTo(creep, new RoomPosition(25, 25, creep.memory.nextScoutTarget), {
                            reusePath: 30,
                            recalcInterval: 4,
                            visualizePathStyle: { stroke: '#ffaa00' }
                        });
                    } else {
                        if (!creep.memory.exploring) creep.memory.exploring = Game.time;
                        if (Game.time - creep.memory.exploring > 5) {
                            // Safely remove from Memory.unexploredRooms if present
                            if (Array.isArray(Memory.unexploredRooms)) {
                                Memory.unexploredRooms = Memory.unexploredRooms.filter(r => r !== creep.memory.nextScoutTarget);
                            }
                            delete creep.memory.nextScoutTarget;
                            delete creep.memory.exploring;
                        }
                    }
                } else {
                    // No target - go home
                    if (creep.memory.home && isValidRoomName(creep.memory.home)) {
                        staggeredMoveTo(creep, new RoomPosition(25, 25, creep.memory.home), {
                            reusePath: 30,
                            recalcInterval: 4,
                            visualizePathStyle: { stroke: '#ffffff' }
                        });
                    }
                }

                return;
            }

            // Not resting: ensure a flag is created once per room visit
            if (!Game.flags[creep.room.name] && !creep.memory.flagPlaced) {
                const f = creep.room.createFlag(25, 25, creep.room.name, COLOR_ORANGE);
                if (f) {
                    creep.memory.flagPlaced = true;
                }
            }

            // Choose a target room using your external selector, but only sometimes (throttle selector)
            if (!creep.memory.targetRoom) {
                // Stagger selector checks so not all creeps run it same tick
                const selectorSpread = 7;
                const offset = Math.abs(creep.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % selectorSpread;
                if ((Game.time + offset) % selectorSpread === 0) {
                    let newTarget = FunctionsRemoteRoomCode.selectTargetRoom(creep);
                    if (newTarget) {
                        creep.memory.targetRoom = newTarget;
                    } else {
                        // No valid rooms -> rest
                        creep.memory.restUntil = Game.time + 100;
                        creep.memory.targetRoom = null;
                        if (creep.memory.home && isValidRoomName(creep.memory.home)) {
                            staggeredMoveTo(creep, new RoomPosition(25, 25, creep.memory.home), { reusePath: 30, recalcInterval: 4 });
                        }
                        return;
                    }
                } else {
                    // Small fallback: try to pick from global unexplored list if present
                    if (Memory.unexploredRooms && Memory.unexploredRooms.length) {
                        creep.memory.targetRoom = Memory.unexploredRooms.shift();
                    }
                }
            }

            const targetRoom = creep.memory.targetRoom;

            if (!targetRoom) {
                // Shouldn't happen often, but move home to avoid idle roaming
                if (creep.memory.home && isValidRoomName(creep.memory.home)) {
                    staggeredMoveTo(creep, new RoomPosition(25, 25, creep.memory.home), {
                        reusePath: 30,
                        recalcInterval: 4
                    });
                }
                return;
            }

            if (creep.room.name !== targetRoom) {
                staggeredMoveTo(creep, new RoomPosition(25, 25, targetRoom), {
                    reusePath: 30,
                    recalcInterval: 4,
                    visualizePathStyle: { stroke: '#ffaa00' }
                });
            } else {
                // Arrived in target room: mark last seen in home memory if available
                if (Memory.rooms && Memory.rooms[creep.memory.home] && Memory.rooms[creep.memory.home].remoterooms) {
                    const rm = Memory.rooms[creep.memory.home].remoterooms[targetRoom];
                    if (rm) rm.LastSeen = Game.time;
                }
                
                // Clear target so a new one is chosen
                creep.memory.targetRoom = null;
            }
        } catch (error) {
            console.log(`Error in RemoteRoomScout ${creep.name}: ${error.message}`);
            console.log(`Stack: ${error.stack}`);
            console.log(`Home: ${creep.memory.home}, Target: ${creep.memory.targetRoom}, Room: ${creep.room.name}`);
            
            // Reset memory to safe state
            creep.memory.home = creep.room.name;
            creep.memory.targetRoom = null;
            delete creep.memory.nextScoutTarget;
        }
    }
};

module.exports = roleRemoteRoomScout;
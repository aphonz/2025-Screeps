var FunctionsRemoteRoomCode = require('RemoteRoomCode')

// roleRemoteRoomScout.js
var FunctionsRemoteRoomCode = require('RemoteRoomCode');

function refreshUnexploredRoomsOncePerTickAndCooldown(cooldownTicks) {
    if (!Memory.unexploredRooms) Memory.unexploredRooms = [];
    if (!Memory._unexploredMeta) Memory._unexploredMeta = {};
    const meta = Memory._unexploredMeta;

    // Only run once per tick
    if (meta.lastTick === Game.time) return;
    meta.lastTick = Game.time;

    // Only run on the global cooldown
    if (Game.time % cooldownTicks !== 0) return;

    const knownRooms = new Set(Object.keys(Memory.rooms || {}));
    // Keep a Set for quick membership checks while building
    const currentUnexplored = new Set(Memory.unexploredRooms);

    for (const roomName of knownRooms) {
        const exits = Game.map.describeExits(roomName);
        if (!exits) continue;
        for (const adj of Object.values(exits)) {
            if (!knownRooms.has(adj) && !currentUnexplored.has(adj)) {
                currentUnexplored.add(adj);
            }
        }
    }

    Memory.unexploredRooms = Array.from(currentUnexplored);
    meta.lastUpdate = Game.time;
}

function staggeredMoveTo(creep, destPos, opts) {
    if (!opts) opts = {};
    const reuse = opts.reusePath || 20;
    const recalcInterval = opts.recalcInterval || 3;

    // Spread recalculations across ticks using creep.id hash (simple)
    const spreadOffset = Math.abs(creep.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % recalcInterval;

    // Decide if this tick should trigger a moveTo call
    if (!creep.memory._lastMoveTick) creep.memory._lastMoveTick = -9999;
    const ticksSince = Game.time - creep.memory._lastMoveTick;
    const shouldRecalc = (ticksSince >= recalcInterval) && ((Game.time + spreadOffset) % recalcInterval === 0);

    // Always allow moveTo when entering a new room (to avoid stalling on edges)
    const inDifferentRoom = creep.room.name !== destPos.roomName;

    if (shouldRecalc || inDifferentRoom) {
        creep.moveTo(destPos, { reusePath: reuse, visualizePathStyle: opts.visualizePathStyle });
        creep.memory._lastMoveTick = Game.time;
    } else {
        // Optionally attempt a very cheap syscall to nudge movement (no path recalc)
        // moveTo without options still may recalc; we avoid calling it here
    }
}

var roleRemoteRoomScout = {
    /** @param {Creep} creep **/
    run: function(creep) {
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
                        reusePath: 20,
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
                staggeredMoveTo(creep, new RoomPosition(25, 25, creep.memory.home), {
                    reusePath: 20,
                    recalcInterval: 4,
                    visualizePathStyle: { stroke: '#ffffff' }
                });
            }

            return;
        }

        // Not resting: ensure a flag is created once per room visit
        if (!Game.flags[creep.room.name] && !creep.memory.flagPlaced) {
            const f = creep.room.createFlag(25, 25, creep.room.name, COLOR_ORANGE);
            if (f) {
                creep.memory.flagPlaced = true;
                // console.log(`Placed orange flag: ${creep.room.name} at (25,25)`);
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
                    staggeredMoveTo(creep, new RoomPosition(25, 25, creep.memory.home), { reusePath: 20, recalcInterval: 4 });
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
            staggeredMoveTo(creep, new RoomPosition(25, 25, creep.memory.home), { reusePath: 20, recalcInterval: 4 });
            return;
        }

        if (creep.room.name !== targetRoom) {
            staggeredMoveTo(creep, new RoomPosition(25, 25, targetRoom), {
                reusePath: 20,
                recalcInterval: 4,
                visualizePathStyle: { stroke: '#ffaa00' }
            });
        } else {
            // Arrived in target room: mark last seen in home memory if available
            if (Memory.rooms && Memory.rooms[creep.memory.home] && Memory.rooms[creep.memory.home].remoterooms) {
                const rm = Memory.rooms[creep.memory.home].remoterooms[targetRoom];
                if (rm) rm.LastSeen = Game.time;
            }

            // Clear target so next tick a new one is chosen
            creep.memory.targetRoom = null;
        }
    }
};

module.exports = roleRemoteRoomScout;
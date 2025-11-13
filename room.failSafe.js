module.exports = {
    saveMyRoom: function(Game) {
        for (const roomNameWithSpawn of Memory.spawnRooms) {
            const room = Game.rooms[roomNameWithSpawn];
            if (!room || !room.controller) continue;
            
            // Check if any spawn is damaged
            const damagedSpawns = room.find(FIND_MY_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax
            });

            // Find hostile creeps that are NOT just MOVE + CARRY
            const hostiles = room.find(FIND_HOSTILE_CREEPS, {
                filter: (creep) => {
                    // Ignore Invaders and allies
                    if (creep.owner && (
                        creep.owner.username === "Invader" ||
                        (Memory.allies && Memory.allies.includes(creep.owner.username))
                    )) {
                        return false;
                    }
                    // Ignore creeps with only MOVE + CARRY
                    return creep.body.some(part =>
                        part.type !== MOVE && part.type !== CARRY
                    );
                }
            });

            

            if (hostiles.length > 0 ) {
                // Check defensive structures
                const weakDefense = room.find(FIND_STRUCTURES, {
                    filter: (s) =>
                        (s.structureType === STRUCTURE_WALL ||
                         s.structureType === STRUCTURE_RAMPART) &&
                        s.hits <= 3000
                });

                if ((weakDefense.length > 0 || damagedSpawns.length > 0) &&
                    room.controller.safeModeAvailable > 0 &&
                    !room.controller.safeMode) {

                    const result = room.controller.activateSafeMode();
                    if (result === OK) {
                        Game.notify(`⚠️ Safe mode activated in ${roomNameWithSpawn} due to hostiles or damaged spawn!`);
                        console.log(`⚠️ Safe mode activated in ${roomNameWithSpawn}`);
                    }
                }
            }
        }
    }
};
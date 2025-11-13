import { cleanMemory, initializeRoomMemory } from './utils/memoryUtils';
import { SpawnManager } from './managers/spawnManager';
import { RoleManager } from './managers/roleManager';

/**
 * Main game loop - executed every tick
 */
export function loop(): void {
  // Clean up memory of dead creeps
  cleanMemory();

  // Initialize and manage each room
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    initializeRoomMemory(room);
  }

  // Manage spawns
  for (const spawnName in Game.spawns) {
    const spawn = Game.spawns[spawnName];
    SpawnManager.run(spawn);
  }

  // Run each creep's role logic
  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName];
    RoleManager.run(creep);
  }

  // Display room statistics
  displayRoomStats();
}

/**
 * Displays statistics for each room
 */
function displayRoomStats(): void {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    const creeps = room.find(FIND_MY_CREEPS);

    // Count by role
    const stats: { [key: string]: number } = {};
    for (const creep of creeps) {
      const role = creep.memory.role;
      stats[role] = (stats[role] || 0) + 1;
    }

    // Display in console periodically
    if (Game.time % 100 === 0) {
      console.log(`Room ${roomName} - Creeps: ${creeps.length}`, stats);
    }
  }
}

/**
 * Memory management utilities
 */

/**
 * Cleans up memory for dead creeps
 * This prevents memory leaks and keeps the memory clean
 */
export function cleanMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      console.log(`Clearing memory for dead creep: ${name}`);
      delete Memory.creeps[name];
    }
  }
}

/**
 * Initializes room memory with default values if not set
 * @param room - The room to initialize memory for
 */
export function initializeRoomMemory(room: Room): void {
  if (!Memory.rooms[room.name]) {
    Memory.rooms[room.name] = {
      minHarvesters: 2,
      minUpgraders: 2,
      minBuilders: 2,
      minRepairers: 1,
    };
  }
}

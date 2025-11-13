/**
 * Type definitions for Screeps roles
 */

/**
 * Available role types for creeps
 */
export enum Role {
  HARVESTER = 'harvester',
  UPGRADER = 'upgrader',
  BUILDER = 'builder',
  REPAIRER = 'repairer',
}

/**
 * Global memory structure extensions
 */
declare global {
  /**
   * Memory structure for individual creeps
   */
  interface CreepMemory {
    role: Role;
    working: boolean;
    sourceId?: Id<Source>;
    targetId?: Id<ConstructionSite | Structure>;
  }

  /**
   * Memory structure for spawns
   */
  interface SpawnMemory {
    spawnQueue?: Role[];
  }

  /**
   * Memory structure for rooms
   */
  interface RoomMemory {
    minHarvesters: number;
    minUpgraders: number;
    minBuilders: number;
    minRepairers: number;
  }
}

export {};

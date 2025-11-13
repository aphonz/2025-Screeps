/**
 * Utility functions for creep operations
 */

/**
 * Finds the closest energy source (container, storage, or source) for a creep
 * @param creep - The creep looking for energy
 * @returns The closest energy source or null if none found
 */
export function findClosestEnergySource(
  creep: Creep
): Source | StructureContainer | StructureStorage | null {
  // Try to find containers or storage first (more efficient)
  const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: (structure) =>
      (structure.structureType === STRUCTURE_CONTAINER ||
        structure.structureType === STRUCTURE_STORAGE) &&
      structure.store[RESOURCE_ENERGY] > 0,
  });

  if (container) {
    return container as StructureContainer | StructureStorage;
  }

  // Fall back to active sources
  return creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
}

/**
 * Withdraws energy from a structure or harvests from a source
 * @param creep - The creep to perform the action
 * @param target - The target structure or source
 * @returns Whether the action was successful
 */
export function getEnergy(
  creep: Creep,
  target: Source | StructureContainer | StructureStorage
): boolean {
  if (target instanceof Source) {
    return creep.harvest(target) === OK;
  } else {
    return creep.withdraw(target, RESOURCE_ENERGY) === OK;
  }
}

/**
 * Checks if a creep's energy is full
 * @param creep - The creep to check
 * @returns True if the creep is at full capacity
 */
export function isEnergyFull(creep: Creep): boolean {
  return creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
}

/**
 * Checks if a creep's energy is empty
 * @param creep - The creep to check
 * @returns True if the creep has no energy
 */
export function isEnergyEmpty(creep: Creep): boolean {
  return creep.store[RESOURCE_ENERGY] === 0;
}

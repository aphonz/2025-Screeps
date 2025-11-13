import {
  findClosestEnergySource,
  getEnergy,
  isEnergyEmpty,
  isEnergyFull,
} from '../utils/creepUtils';

/**
 * Harvester role - collects energy and delivers it to spawns and extensions
 */
export class HarvesterRole {
  /**
   * Runs the harvester logic for a creep
   * @param creep - The creep to run the harvester logic on
   */
  static run(creep: Creep): void {
    // Toggle working state based on energy level
    if (creep.memory.working && isEnergyEmpty(creep)) {
      creep.memory.working = false;
      creep.say('🔄 harvest');
    }
    if (!creep.memory.working && isEnergyFull(creep)) {
      creep.memory.working = true;
      creep.say('🚚 deliver');
    }

    if (creep.memory.working) {
      this.deliverEnergy(creep);
    } else {
      this.harvestEnergy(creep);
    }
  }

  /**
   * Harvests energy from a source
   * @param creep - The creep to harvest with
   */
  private static harvestEnergy(creep: Creep): void {
    const source = findClosestEnergySource(creep);
    if (source) {
      if (creep.pos.isNearTo(source)) {
        getEnergy(creep, source);
      } else {
        creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
      }
    }
  }

  /**
   * Delivers energy to spawns or extensions
   * @param creep - The creep to deliver with
   */
  private static deliverEnergy(creep: Creep): void {
    const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: (structure) =>
        (structure.structureType === STRUCTURE_EXTENSION ||
          structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_TOWER) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });

    if (target) {
      if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
      }
    }
  }
}

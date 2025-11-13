import {
  findClosestEnergySource,
  getEnergy,
  isEnergyEmpty,
  isEnergyFull,
} from '../utils/creepUtils';

/**
 * Repairer role - repairs damaged structures
 */
export class RepairerRole {
  /**
   * Runs the repairer logic for a creep
   * @param creep - The creep to run the repairer logic on
   */
  static run(creep: Creep): void {
    // Toggle working state based on energy level
    if (creep.memory.working && isEnergyEmpty(creep)) {
      creep.memory.working = false;
      creep.say('🔄 harvest');
    }
    if (!creep.memory.working && isEnergyFull(creep)) {
      creep.memory.working = true;
      creep.say('🔧 repair');
    }

    if (creep.memory.working) {
      this.repairStructure(creep);
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
   * Repairs damaged structures
   * @param creep - The creep to repair with
   */
  private static repairStructure(creep: Creep): void {
    const target = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: (structure) =>
        structure.hits < structure.hitsMax &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART,
    });

    if (target) {
      if (creep.repair(target) === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
      }
    } else {
      // If nothing to repair, act as a builder
      const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);
      if (constructionSites.length > 0) {
        if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE) {
          creep.moveTo(constructionSites[0], { visualizePathStyle: { stroke: '#ffffff' } });
        }
      }
    }
  }
}

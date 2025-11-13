import {
  findClosestEnergySource,
  getEnergy,
  isEnergyEmpty,
  isEnergyFull,
} from '../utils/creepUtils';

/**
 * Builder role - constructs buildings and structures
 */
export class BuilderRole {
  /**
   * Runs the builder logic for a creep
   * @param creep - The creep to run the builder logic on
   */
  static run(creep: Creep): void {
    // Toggle working state based on energy level
    if (creep.memory.working && isEnergyEmpty(creep)) {
      creep.memory.working = false;
      creep.say('🔄 harvest');
    }
    if (!creep.memory.working && isEnergyFull(creep)) {
      creep.memory.working = true;
      creep.say('🚧 build');
    }

    if (creep.memory.working) {
      this.buildStructure(creep);
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
   * Builds construction sites
   * @param creep - The creep to build with
   */
  private static buildStructure(creep: Creep): void {
    const targets = creep.room.find(FIND_CONSTRUCTION_SITES);
    if (targets.length > 0) {
      if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
        creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffffff' } });
      }
    } else {
      // If no construction sites, act as an upgrader
      if (creep.room.controller) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
          creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
        }
      }
    }
  }
}

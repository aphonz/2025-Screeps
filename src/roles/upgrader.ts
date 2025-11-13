import {
  findClosestEnergySource,
  getEnergy,
  isEnergyEmpty,
  isEnergyFull,
} from '../utils/creepUtils';

/**
 * Upgrader role - focuses on upgrading the room controller
 */
export class UpgraderRole {
  /**
   * Runs the upgrader logic for a creep
   * @param creep - The creep to run the upgrader logic on
   */
  static run(creep: Creep): void {
    // Toggle working state based on energy level
    if (creep.memory.working && isEnergyEmpty(creep)) {
      creep.memory.working = false;
      creep.say('🔄 harvest');
    }
    if (!creep.memory.working && isEnergyFull(creep)) {
      creep.memory.working = true;
      creep.say('⚡ upgrade');
    }

    if (creep.memory.working) {
      this.upgradeController(creep);
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
   * Upgrades the room controller
   * @param creep - The creep to upgrade with
   */
  private static upgradeController(creep: Creep): void {
    if (creep.room.controller) {
      if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
      }
    }
  }
}

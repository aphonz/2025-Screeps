import { Role } from '../types';
import { HarvesterRole } from '../roles/harvester';
import { UpgraderRole } from '../roles/upgrader';
import { BuilderRole } from '../roles/builder';
import { RepairerRole } from '../roles/repairer';

/**
 * Manages and executes roles for all creeps
 */
export class RoleManager {
  /**
   * Runs the appropriate role logic for a creep
   * @param creep - The creep to run logic for
   */
  static run(creep: Creep): void {
    switch (creep.memory.role) {
      case Role.HARVESTER:
        HarvesterRole.run(creep);
        break;
      case Role.UPGRADER:
        UpgraderRole.run(creep);
        break;
      case Role.BUILDER:
        BuilderRole.run(creep);
        break;
      case Role.REPAIRER:
        RepairerRole.run(creep);
        break;
      default:
        console.log(`Unknown role for creep ${creep.name}: ${creep.memory.role}`);
    }
  }
}

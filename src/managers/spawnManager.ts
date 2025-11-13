import { Role } from '../types';

/**
 * Manages automatic spawning of creeps based on room needs
 */
export class SpawnManager {
  /**
   * Runs the spawn manager for a spawn
   * @param spawn - The spawn to manage
   */
  static run(spawn: StructureSpawn): void {
    if (spawn.spawning) {
      this.visualizeSpawning(spawn);
      return;
    }

    const room = spawn.room;
    const creeps = room.find(FIND_MY_CREEPS);

    // Count creeps by role
    const roleCount = this.countCreepsByRole(creeps);

    // Determine what to spawn based on minimum requirements
    const roleToSpawn = this.determineSpawnRole(room, roleCount);

    if (roleToSpawn) {
      this.spawnCreep(spawn, roleToSpawn);
    }
  }

  /**
   * Counts creeps by their role
   * @param creeps - Array of creeps to count
   * @returns Object mapping roles to counts
   */
  private static countCreepsByRole(creeps: Creep[]): Record<Role, number> {
    const counts: Record<Role, number> = {
      [Role.HARVESTER]: 0,
      [Role.UPGRADER]: 0,
      [Role.BUILDER]: 0,
      [Role.REPAIRER]: 0,
    };

    for (const creep of creeps) {
      const role = creep.memory.role;
      if (role in counts) {
        counts[role]++;
      }
    }

    return counts;
  }

  /**
   * Determines which role should be spawned next
   * @param room - The room to check
   * @param roleCount - Current count of creeps by role
   * @returns The role to spawn, or null if none needed
   */
  private static determineSpawnRole(room: Room, roleCount: Record<Role, number>): Role | null {
    const memory = room.memory;

    // Priority order: harvesters first (critical), then others
    if (roleCount[Role.HARVESTER] < memory.minHarvesters) {
      return Role.HARVESTER;
    }
    if (roleCount[Role.UPGRADER] < memory.minUpgraders) {
      return Role.UPGRADER;
    }
    if (roleCount[Role.BUILDER] < memory.minBuilders) {
      return Role.BUILDER;
    }
    if (roleCount[Role.REPAIRER] < memory.minRepairers) {
      return Role.REPAIRER;
    }

    return null;
  }

  /**
   * Spawns a creep with the given role
   * @param spawn - The spawn to use
   * @param role - The role for the new creep
   */
  private static spawnCreep(spawn: StructureSpawn, role: Role): void {
    const body = this.getBodyForRole(role, spawn.room.energyCapacityAvailable);
    const name = `${role}_${Game.time}`;

    const result = spawn.spawnCreep(body, name, {
      memory: {
        role,
        working: false,
      },
    });

    if (result === OK) {
      console.log(`Spawning new ${role}: ${name}`);
    } else if (result === ERR_NOT_ENOUGH_ENERGY) {
      // Wait for more energy
    } else {
      console.log(`Failed to spawn ${role}: ${result}`);
    }
  }

  /**
   * Gets the appropriate body parts for a role based on available energy
   * @param role - The role to get body parts for
   * @param energy - Available energy capacity
   * @returns Array of body parts
   */
  private static getBodyForRole(role: Role, energy: number): BodyPartConstant[] {
    // Basic body for low energy (300)
    const basicBody: BodyPartConstant[] = [WORK, CARRY, MOVE];

    // Calculate how many parts we can afford
    const maxParts = Math.floor(energy / 200); // Each set of WORK, CARRY, MOVE costs 200

    if (maxParts < 2) {
      return basicBody;
    }

    // Build balanced body based on role
    const body: BodyPartConstant[] = [];
    const sets = Math.min(maxParts, 5); // Cap at 5 sets for early game

    for (let i = 0; i < sets; i++) {
      body.push(WORK);
      body.push(CARRY);
      body.push(MOVE);
    }

    return body;
  }

  /**
   * Visualizes the spawning process
   * @param spawn - The spawn that is spawning
   */
  private static visualizeSpawning(spawn: StructureSpawn): void {
    if (!spawn.spawning) return;

    const spawningCreep = Game.creeps[spawn.spawning.name];
    spawn.room.visual.text('🛠️' + spawningCreep.memory.role, spawn.pos.x + 1, spawn.pos.y, {
      align: 'left',
      opacity: 0.8,
    });
  }
}

const roleTower = {
  run: function(tower) {
    const closestHostile = this.findClosestEnemy(tower);
    const closestDamagedAlly = this.findClosestDamagedAlly(tower);
    const closestDamagedStructure = this.findClosestDamagedStructure(tower);

    if (tower.store.energy > 0) {
      if (closestHostile) {
        tower.attack(closestHostile);
      } else if (tower.store.energy > 300 && closestDamagedAlly) {
        tower.heal(closestDamagedAlly);
      } else if (tower.store.energy > 600 && closestDamagedStructure) {
        tower.repair(closestDamagedStructure);
      }
    } else {
      console.log(`Tower with ID ${tower.id} is low on power.`);
    }
  },

  findClosestEnemy: function(tower) {
    return tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS,{filter:
            function (cr)
                {
                return cr.owner.username!='Jeally_Rabbit' && cr.owner.username != 'insain'
                }
        });
  },

  findClosestDamagedAlly: function(tower) {
    return tower.pos.findClosestByRange(FIND_MY_CREEPS, { filter: (creep) => creep.hits < creep.hitsMax });
  },

  findClosestDamagedStructure: function(tower) {
    const structures = tower.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure) => structure.hits < structure.hitsMax && structure.structureType !== STRUCTURE_WALL && structure.structureType !== STRUCTURE_RAMPART
    });

    if (!structures) {
      return tower.pos.findClosestByRange(FIND_STRUCTURES, { filter: (structure) => structure.hits < 3000 && structure.structureType === STRUCTURE_RAMPART });
    }

    return structures;
  }
};

module.exports = roleTower;
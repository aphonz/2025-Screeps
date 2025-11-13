var sharedFuntionsCreeps = require('functions.creeps');
var roleHauler = {

	/** @param {Creep} creep **/
	run: function(creep) {
		if (!creep.memory.home) {
			var home = creep.room.name;
			creep.memory.home = home;
		}
		if (!creep.memory.TargetDestination) {
			//creep.memory.TargetDestination = creep.room.find(STRUCTURE_STORAGE);
			//creep.memory.TargetDestination = 'f21406154f7e1cd';
			if (!creep.room.storage) {
				if (!creep.memory.idlePosition) {
					// Set an idle position only once, avoiding unnecessary path recalculations
					let spawn = creep.room.find(FIND_MY_SPAWNS)[0];
					if (spawn) {
						creep.memory.idlePosition = {
							x: spawn.pos.x,
							y: spawn.pos.y + 3
						}; // Slightly away from the spawn
					}
				}

				let idlePos = creep.memory.idlePosition;
				if (idlePos) {
					creep.moveTo(new RoomPosition(idlePos.x, idlePos.y, creep.room.name), {
						reusePath: 50
					});
					return;
				}

				creep.say('Waiting...');
			} else {
				creep.memory.TargetDestination = creep.room.storage.id;
				delete creep.memory.idlePosition; // Cleanup once storage exists
			}

			//var TargetDestination = Game.getObjectById(creep.memory.TargetDestination);
		}
		if (!creep.memory.SupplyContainer1 || creep.ticksToLive === 1000) {
			sharedFuntionsCreeps.assignSupplyContainer(creep);
		}

		if (creep.memory.Supplying && creep.store[RESOURCE_ENERGY] == 0) {
			creep.memory.Supplying = false;
			creep.say('🔄 Demanding');
		}
		if (!creep.memory.Supplying && creep.store.getFreeCapacity() == 0) {
			creep.memory.Supplying = true;
			creep.say('🚧 Supplying');
		}

		if (!creep.memory.Supplying) {
			if (creep.ticksToLive < 70) {
				creep.suicide();
			}
			/*
            var storage = Game.getObjectById(creep.memory.SupplyContainer1);
            if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                 creep.travelTo(storage);
                 if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                     // tried again
                 }
           } */

			let storage;
			if (creep.memory.SupplyContainer1) {
				storage = Game.getObjectById(creep.memory.SupplyContainer1);
			} else {
				// Find nearest Harvester creep with full energy
				storage = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
					filter: c => c.memory.role === 'harvester' && c.store[RESOURCE_ENERGY] === c.store
						.getCapacity(RESOURCE_ENERGY)
				});
			}

			if (storage) {
				if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
					creep.travelTo(storage);
					// Optional retry logic
					if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
						// tried again
					}
				}
			} else {
				creep.say('ERROR');
			}
		} else {
			var TargetDestination = Game.getObjectById(creep.memory.TargetDestination);
			if (creep.transfer(TargetDestination, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
				creep.travelTo(TargetDestination, {
					visualizePathStyle: {
						stroke: '#ffffff'
					}
				});
				if (creep.transfer(TargetDestination, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {

					var TargetTraveling = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
						filter: (structure) => {
							return structure.structureType === STRUCTURE_EXTENSION ||
								STRUCTURE_LINK &&
								structure.energy < structure.energyCapacity &&
								creep.pos.getRangeTo(structure) === 1;
						}
					});
					if (creep.transfer(TargetTraveling, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
						//nearby extentions
					}
					// tried again
				}
			}
		}
	}
};

module.exports = roleHauler;
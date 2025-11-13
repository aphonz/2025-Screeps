const roleHelperHauler = {
  run: function (creep) {
    const targetRoom = creep.memory.targetRoom;
    const sourceRoom = creep.memory.sourceRoom || creep.memory.requestOrigin;

    if (!targetRoom || !sourceRoom) {
      creep.say('no route');
      return;
    }

    // Initialize state if missing
    if (!creep.memory.state) {
      creep.memory.state = 'loading';
    }

    // State transitions
    if (creep.memory.state === 'loading' && creep.store.getFreeCapacity() === 0) {
      creep.memory.state = 'unloading';
    } else if (creep.memory.state === 'unloading' && creep.store.getUsedCapacity() === 0) {
      creep.memory.state = 'loading';
    }

    // === LOADING STATE ===
    if (creep.memory.state === 'loading') {
      if (creep.room.name !== sourceRoom) {
        const exit = creep.room.findExitTo(sourceRoom);
        if (exit) creep.moveTo(creep.pos.findClosestByRange(exit), { reusePath: 5 });
        return;
      }

      // In source room: withdraw from storage > terminal > container
      const storage = creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0 ? creep.room.storage : null;
      const terminal = creep.room.terminal && creep.room.terminal.store[RESOURCE_ENERGY] > 0 ? creep.room.terminal : null;
      const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
      });

      const source = storage || terminal || container;
      if (source) {
        if (creep.pos.isNearTo(source)) {
          creep.withdraw(source, RESOURCE_ENERGY);
        } else {
          creep.moveTo(source, { range: 1, reusePath: 5 });
        }
      } else {
        creep.say('no energy');
        creep.moveTo(new RoomPosition(25, 25, sourceRoom), { reusePath: 10 });
      }
      return;
    }

    // === UNLOADING STATE ===
    if (creep.memory.state === 'unloading') {
      if (creep.room.name !== targetRoom) {
        const exit = creep.room.findExitTo(targetRoom);
        if (exit) creep.moveTo(creep.pos.findClosestByRange(exit), { reusePath: 5 });
        return;
      }

      // In target room: deliver to spawns > extensions > storage > containers
      const spawns = creep.room.find(FIND_MY_SPAWNS).filter(s => s.energy < s.energyCapacity);
      if (spawns.length) {
        const s = creep.pos.findClosestByPath(spawns);
        if (creep.pos.isNearTo(s)) creep.transfer(s, RESOURCE_ENERGY);
        else creep.moveTo(s, { reusePath: 5 });
        return;
      }

      const extensions = creep.room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_EXTENSION && s.energy < s.energyCapacity
      });
      if (extensions.length) {
        const e = creep.pos.findClosestByPath(extensions);
        if (creep.pos.isNearTo(e)) creep.transfer(e, RESOURCE_ENERGY);
        else creep.moveTo(e, { reusePath: 5 });
        return;
      }

      const storage = creep.room.storage;
      if (storage && storage.store.getFreeCapacity() > 0) {
        if (creep.pos.isNearTo(storage)) creep.transfer(storage, RESOURCE_ENERGY);
        else creep.moveTo(storage, { reusePath: 5 });
        return;
      }

      const container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity() > 0
      });
      if (container) {
        if (creep.pos.isNearTo(container)) creep.transfer(container, RESOURCE_ENERGY);
        else creep.moveTo(container, { reusePath: 5 });
        return;
      }

      // No valid target: idle in center
      creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 10 });
      return;
    }
  }
};

module.exports = roleHelperHauler;
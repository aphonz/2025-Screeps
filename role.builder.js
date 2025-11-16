var roleUpgrader = require('role.upgrader');
var sharedFuntionsCreeps = require('functions.creeps');
var roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if (!creep.memory.home){
            var home = creep.room.name;
            creep.memory.home = home;
        }
        else if (creep.room.name != creep.memory.home){
            creep.memory.flag = creep.memory.home;
        }
        
        if (creep.room.name != creep.memory.home){
            creep.memory.flag = creep.memory.home;
            var flag = Game.flags[creep.memory.flag];
            // travel to flag
            var pos1 = creep.pos
            var pos2 = flag.pos
            if (!pos1.isEqualTo(pos2)) {
                creep.moveTo(flag.pos);
            }
            return;
        }
        if(!creep.memory.TargetSource){
            var TTT111 =  creep.pos.findClosestByRange(FIND_SOURCES);
            creep.memory.TargetSource = TTT111.id;
        }

	    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say('🔄 harvest');
	    }
	    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
	        creep.memory.building = true;
	        creep.say('🚧 build');
	    }
	   

	if (creep.memory.building) {
    let roomMemory = Memory.rooms[creep.room.name] || {};
    if (!roomMemory.construction) {
        roomMemory.construction = { nonRoadSites: [], roadSites: [], lastChecked: 0 };
    }

    // Room-wide check every 100 ticks (store id, pos and type)
    if (Game.time - roomMemory.construction.lastChecked > 300) {
        const allSites = creep.room.find(FIND_CONSTRUCTION_SITES)
            .map(site => ({ id: site.id, pos: site.pos, type: site.structureType }));
        roomMemory.construction.nonRoadSites = allSites.filter(s => s.type !== STRUCTURE_ROAD);
        roomMemory.construction.roadSites = allSites.filter(s => s.type === STRUCTURE_ROAD);
        roomMemory.construction.lastChecked = Game.time;
        Memory.rooms[creep.room.name] = roomMemory;
    }

    // Build valid target list for this creep and cache it in room memory so all builders share it.
    // Ensure a place in memory to store cached target info
    roomMemory.construction.validTargetIds = roomMemory.construction.validTargetIds || [];
    roomMemory.construction.lastPrunedValidTargets = roomMemory.construction.lastPrunedValidTargets || 0;

    // Rebuild the cached valid target ID list periodically
    if (Game.time - roomMemory.construction.lastPrunedValidTargets > 30){
        roomMemory.construction.lastPrunedValidTargets = Game.time;

        // Prefer non-road sites; fallback to road sites
        let sourceList = roomMemory.construction.nonRoadSites;
        if (sourceList.length === 0) {
            sourceList = roomMemory.construction.roadSites;
        }

        // Build list of valid IDs, pruning dead sites from the source lists
        const newValidIds = [];
        for (let i = sourceList.length - 1; i >= 0; i--) {
            const info = sourceList[i];
            if (!info || !info.id) { sourceList.splice(i, 1); continue; }
            const obj = Game.getObjectById(info.id);
            if (obj) {
                newValidIds.push(info.id);
            } else {
                // Site no longer exists, remove from source list
                sourceList.splice(i, 1);
            }
        }

        roomMemory.construction.validTargetIds = newValidIds;
        Memory.rooms[creep.room.name] = roomMemory;
    }

    // Resolve IDs to live objects every tick
    const targets = (roomMemory.construction.validTargetIds || [])
        .map(id => Game.getObjectById(id))
        .filter(Boolean);

    // If nothing valid, fallback to upgrader
    if (targets.length === 0) {
        roleUpgrader.run(creep);
        return;
    }

    // Find closest site and attempt to build
    const target = creep.pos.findClosestByRange(targets);

    const buildResult = creep.build(target);
    if (buildResult === ERR_NOT_IN_RANGE) {
        creep.travelTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
        sharedFuntionsCreeps.opportunisticRepair(creep);
    } else if (buildResult === OK) {
        sharedFuntionsCreeps.shareEnergy(creep);

        // If site completed, remove from memory lists
        const fresh = Game.getObjectById(target.id);
        if (!fresh || (typeof target.progress !== 'undefined' && typeof target.progressTotal !== 'undefined' && target.progress >= target.progressTotal)) {
            for (let arrName of ['nonRoadSites', 'roadSites']) {
                const arr = roomMemory.construction[arrName];
                for (let i = arr.length - 1; i >= 0; i--) {
                    if (arr[i].id === target.id) {
                        arr.splice(i, 1);
                        break;
                    }
                }
            }
            // Also remove from validTargetIds
            const ids = roomMemory.construction.validTargetIds;
            for (let i = ids.length - 1; i >= 0; i--) {
                if (ids[i] === target.id) {
                    ids.splice(i, 1);
                    break;
                }
            }
            Memory.rooms[creep.room.name] = roomMemory;
        }
    } else {
        Memory.rooms[creep.room.name] = roomMemory;
    }
}
	    
	    else {
            
            sharedFuntionsCreeps.harvestWithStoreage(creep);
           
        
	    }
	}
};

module.exports = roleBuilder;
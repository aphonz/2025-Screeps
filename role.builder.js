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
    if (Game.time - roomMemory.construction.lastChecked > 100) {
        const allSites = creep.room.find(FIND_CONSTRUCTION_SITES)
            .map(site => ({ id: site.id, pos: site.pos, type: site.structureType }));
        roomMemory.construction.nonRoadSites = allSites.filter(s => s.type !== STRUCTURE_ROAD);
        roomMemory.construction.roadSites = allSites.filter(s => s.type === STRUCTURE_ROAD);
        roomMemory.construction.lastChecked = Game.time;
        Memory.rooms[creep.room.name] = roomMemory;
    }

    // Build valid target list for this creep:
    // prefer nonRoadSites if any remain; otherwise use roadSites.
    const useNonRoads = roomMemory.construction.nonRoadSites.length > 0;
    const sourceListName = useNonRoads ? 'nonRoadSites' : 'roadSites';
    const validTargets = [];

    // Prune stale entries while building the validTargets list
    const list = roomMemory.construction[sourceListName];
    for (let i = list.length - 1; i >= 0; i--) {
        const info = list[i];
        const obj = Game.getObjectById(info.id);
        if (obj) {
            validTargets.push(obj);
        } else {
            // site completed/removed — prune from memory
            list.splice(i, 1);
        }
    }

    // If nothing valid, fallback to upgrader
    if (validTargets.length === 0) {
        Memory.rooms[creep.room.name] = roomMemory;
        roleUpgrader.run(creep);
        return;
    }

    // Find closest site object and attempt to build
    const target = creep.pos.findClosestByRange(validTargets);
    

    const buildResult = creep.build(target);
    if (buildResult === ERR_NOT_IN_RANGE) {
        creep.travelTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
        sharedFuntionsCreeps.opportunisticRepair(creep);
    } else if (buildResult === OK) {
        // share energy / bookkeeping
        sharedFuntionsCreeps.shareEnergy(creep);
        // if site completed by this build, remove it from memory lists
        // (constructionSite.progress reaches constructionSite.progressTotal when done)
        const fresh = Game.getObjectById(target.id);
        if (!fresh || (typeof target.progress !== 'undefined' && typeof target.progressTotal !== 'undefined' && target.progress >= target.progressTotal)) {
            // remove from both lists just in case
            for (let arrName of ['nonRoadSites', 'roadSites']) {
                const arr = roomMemory.construction[arrName];
                for (let i = arr.length - 1; i >= 0; i--) {
                    if (arr[i].id === target.id) {
                        arr.splice(i, 1);
                        break;
                    }
                }
            }
            Memory.rooms[creep.room.name] = roomMemory;
        }
    } else {
        // other errors (no energy, busy, etc.) — just update memory
        Memory.rooms[creep.room.name] = roomMemory;
    }
}
	    
	    else {
            
            sharedFuntionsCreeps.harvestWithStoreage(creep);
           
        
	    }
	}
};

module.exports = roleBuilder;
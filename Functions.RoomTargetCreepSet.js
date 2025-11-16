

var FunctionsRoomTargetCreepSet = {
    
    
    adjustCreepMatrix: function adjustCreepMatrix(room) { 
        
    const creepMatrix = {
    0: { // Pre-RCL rooms 5 Containers
        harvester    : { qty: 2, size: 1, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 1, size: 0, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 4, size: 0, template: [WORK, CARRY, MOVE] },
        hauler       : { qty: 0, size: 0, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 0, size: 0, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 0, size: 0, template: [WORK, CARRY, MOVE] },
        miner        : { qty: 1, size: 0, template: [WORK, WORK, CARRY, MOVE] },
        
        WallRepairer : { qty: 0, size: 0, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 1, size: 0, template: [WORK, CARRY, MOVE] },
        upgraderHauler: { qty: 0, size: 2, template: [CARRY, CARRY, MOVE] }
    },
    1: { //300 points Basic startup phase 5 Containers, 1 Spawn
        harvester    : { qty: 2, size: 2, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 2, size: 2, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 2, size: 2, template: [WORK, CARRY, MOVE] },
        hauler       : { qty: 0, size: 1, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 0, size: 0, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 0, size: 0, template: [WORK, CARRY, MOVE] },
        miner        : { qty: 1, size: 2, template: [WORK, WORK, CARRY, MOVE] },
        
        WallRepairer : { qty: 0, size: 0, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 0, size: 0, template: [WORK, CARRY, MOVE] },
        upgraderHauler: { qty: 0, size: 2, template: [CARRY, CARRY, MOVE] }
    },
    2: { // 550 points - 5 Containers, 1 Spawn, 5 Extensions (50 capacity), Ramparts (300K max hits), Walls
        harvester    : { qty: 2, size: 3, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 2, size: 2, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 2, size: 2, template: [WORK,WORK, CARRY, MOVE] },
        hauler       : { qty: 0, size: 1, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 0, size: 2, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 0, size: 0, template: [WORK, CARRY, MOVE] }, // dont build unltill links 
        miner        : { qty: 1, size: 1, template: [WORK, WORK, CARRY, MOVE] },
        
        WallRepairer : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 1, size: 1, template: [WORK, CARRY, MOVE] },
        upgraderHauler: { qty: 0, size: 2, template: [CARRY, CARRY, MOVE] }
    },
    3: { //  800points - 5 Containers, 1 Spawn, 10 Extensions (50 capacity), Ramparts (1M max hits), Walls, 1 Tower
        harvester    : { qty: 2, size: 3, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 2, size: 2, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 2, size: 2, template: [WORK,WORK, CARRY, MOVE] },
        hauler       : { qty: 0, size: 1, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 0, size: 3, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 0, size: 0, template: [WORK, CARRY, MOVE] }, // dont build unltill links 
        miner        : { qty: 2, size: 2, template: [WORK, WORK, WORK, CARRY, MOVE] },
        
        WallRepairer : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 1, size: 1, template: [WORK, CARRY, MOVE] },
        upgraderHauler: { qty: 0, size: 2, template: [CARRY, CARRY, MOVE] }
    },
    4: { // 1,300 points storage  5 Containers, 1 Spawn, 20 Extensions (50 capacity), Ramparts (3M max hits), Walls, 1 Tower, Storage
        harvester    : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 2, size: 3, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 2, size: 2, template: [WORK,WORK, CARRY, MOVE] },
        hauler       : { qty: 2, size: 1, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 1, size: 8, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 0, size: 0, template: [WORK, CARRY, MOVE] }, // dont build unltill links 
        miner        : { qty: 2, size: 1, template: [WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE] },
        
        WallRepairer : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 1, size: 1, template: [WORK, CARRY, MOVE] },
        upgraderHauler: { qty: 0, size: 2, template: [CARRY, CARRY, MOVE] }
    },
    5: { // 1,800 Points links  5 Containers, 1 Spawn, 30 Extensions (50 capacity), Ramparts (10M max hits), Walls, 2 Towers, Storage, 2 Links
        harvester    : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 1, size: 4, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 2, size: 3, template: [WORK,WORK, CARRY, MOVE] },
        hauler       : { qty: 2, size: 1, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 1, size: 8, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 1, size: 2, template: [WORK,WORK,WORK,CARRY,MOVE] }, // dont build unltill links 
        miner        : { qty: 2, size: 1, template: [WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE] },
        
        WallRepairer : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 1, size: 1, template: [WORK, CARRY, MOVE] },
        LabHauler : { qty: 1, size: 4, template: [CARRY, CARRY, MOVE] },
        upgraderHauler: { qty: 0, size: 1, template: [CARRY, CARRY, MOVE] }
    },
    6: { // 2,300 POints Terminal 5 Containers, 1 Spawn, 40 Extensions (50 capacity), Ramparts (30M max hits), Walls, 2 Towers, Storage, 3 Links, Extractor, 3 Labs, Terminal
        harvester    : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 1, size: 4, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 2, size: 2, template: [WORK,WORK, CARRY, MOVE] },
        hauler       : { qty: 2, size: 1, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 2, size: 8, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 1, size: 2, template: [WORK,WORK,WORK,CARRY,MOVE] }, // dont build unltill links 
        miner        : { qty: 2, size: 1, template: [WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE] },
        extractor    : { qty: 1, size: 3, template: [WORK, WORK,WORK, WORK,  MOVE] },
        WallRepairer : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 1, size: 1, template: [WORK, CARRY, MOVE] },
        LabHauler: { qty: 1, size: 4, template: [CARRY, CARRY, MOVE] },
        upgraderHauler: { qty: 0, size: 1, template: [CARRY, CARRY, MOVE] }
    },
    7: { //5,300 Points  2nd spawn  5 Containers, 2 Spawns, 50 Extensions (100 capacity), Ramparts (100M max hits), Walls, 3 Towers, Storage, 4 Links, Extractor, 6 Labs, Terminal, Factory
        harvester    : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 1, size: 3, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 1, size: 1, template: [WORK, CARRY, MOVE] },
        hauler       : { qty: 2, size: 1, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 1, size: 12, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 1, size: 3, template: [WORK,WORK,WORK,CARRY,MOVE] }, // dont build unltill links 
        miner        : { qty: 2, size: 1, template: [WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE] },
        extractor    : { qty: 1, size: 3, template: [WORK, WORK,WORK, WORK,  MOVE] },
        WallRepairer : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 1, size: 1, template: [WORK, CARRY, MOVE] },
        LabHauler: { qty: 1, size: 4, template: [CARRY, CARRY, MOVE] }
    },
    8: { //12,300 Points  3rd spawn nuke   5 Containers, 3 Spawns, 60 Extensions (200 capacity), Ramparts (300M max hits), Walls, 6 Towers, Storage, 6 Links, Extractor, 10 Labs, Terminal, Factory, Observer, Power Spawn, Nuker
        harvester    : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        builder      : { qty: 1, size: 3, template: [WORK, CARRY, MOVE] },
        upgrader     : { qty: 0, size: 1, template: [WORK, CARRY, MOVE] },
        hauler       : { qty: 2, size: 1, template: [CARRY, CARRY, MOVE] },
        balancer     : { qty: 1, size: 15, template: [CARRY, CARRY, MOVE] },
        FatUpgrader  : { qty: 0, size: 1, template: [WORK,CARRY,MOVE] }, // dont build unltill links 
        miner        : { qty: 2, size: 1, template: [WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE] },
        extractor    : { qty: 1, size: 3, template: [WORK, WORK,WORK, WORK,  MOVE] },
        WallRepairer : { qty: 1, size: 3, template: [WORK, CARRY, MOVE] },
        Repairer     : { qty: 1, size: 2, template: [WORK, CARRY, MOVE] },
        LabHauler : { qty: 1, size: 4, template: [CARRY, CARRY, MOVE] }
    }
    
    };


    // Get the base template for the current room level; default to level 0 if undefined
    let baseTemplate = creepMatrix[room.controller.level] || creepMatrix[0];

    // Retrieve current energy storage (if storage doesn't exist, set to undefined)
    let storage = room.storage ? room.storage.store[RESOURCE_ENERGY] : undefined;

    // Retrieve LinkUp flag from room memory without optional chaining
    let linkUp = (Memory.rooms[room.name] && Memory.rooms[room.name].LinkUp) ? Memory.rooms[room.name].LinkUp : false;

    // Determine if the room has very low energy (<10k) and storage exists
    let lowEnergy = (storage !== undefined && storage < 10000);

    // Calculate hauler assignments based on summed `HaulerCarry2Needed` from all sources
    let haulerAssignment = FunctionsRoomTargetCreepSet.calculateHaulerAssignment(room);

    //Miner Qty based on room source count and Template work parts
    let sourcecount = Memory.rooms[room.name].SourceQty || 1;
    let minerWorkParts = baseTemplate.miner.template.filter(part => part === WORK).length;
    let requiredMiners = Math.ceil((sourcecount * 5) / minerWorkParts); // each source ideally needs 5 WORK parts//maths rounds up // over building miners for decay ect
    //console.log(requiredMiners);

    //wall reapirers needs walls/ramparts
    const hasWalls = room.find(FIND_STRUCTURES).some(
        s => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART
    );

    //UpgrderHauler Qty is 2x sources only if linkUp is False
    //let upgraderHaulerQty =  (!LinkUp sourcecount * 2 ;

    // Define role-specific modifiers based on LinkUp status and energy levels
let modifiers = {

    //miners based on required miners
    miner: baseTemplate.miner.qty = requiredMiners,

    upgraderHauler: !linkUp == false ? 0 : baseTemplate.upgraderHauler.qty = 3,
                   
    
    upgrader: linkUp ? 0
            : storage !== undefined && storage > 750000 ? baseTemplate.upgrader.qty + 2
            : storage !== undefined && storage > 100000 ? 0
            : storage !== undefined && storage < 100000 ? Math.max(1, baseTemplate.upgrader.qty - 1)
            : baseTemplate.upgrader.qty,

    FatUpgrader: !linkUp ? 0
               : storage !== undefined && storage > 750000 ? baseTemplate.FatUpgrader.qty + 2
               : storage !== undefined && storage > 100000 ? 0
               : storage !== undefined && storage < 100000 ? Math.max(1, baseTemplate.FatUpgrader.qty - 1)
               : baseTemplate.FatUpgrader.qty,

    builder: storage !== undefined && storage > 750000 ? baseTemplate.builder.qty + 1
           : storage !== undefined && storage > 100000 ? 0
           : storage !== undefined && storage < 100000 ? Math.max(1, baseTemplate.builder.qty - 1)
           : baseTemplate.builder.qty,

// we need to have wall to make a wall repairer and then lets build more if we have more energy
    WallRepairer: !hasWalls ? baseTemplate.WallRepairer.qty = 0
                : storage !== undefined && storage > 750000 ? baseTemplate.WallRepairer.qty + 1
                : storage !== undefined && storage > 100000 ? 0
                : storage !== undefined && storage < 100000 ? Math.max(0, baseTemplate.WallRepairer.qty - 1)
                : baseTemplate.WallRepairer.qty,

    Repairer: storage !== undefined && storage > 750000 ? baseTemplate.Repairer.qty + 1
            : storage !== undefined && storage > 100000 ? 0
            : storage !== undefined && storage < 100000 ? Math.max(0, baseTemplate.Repairer.qty - 1)
            : baseTemplate.Repairer.qty,

    extractor: room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTRACTOR }).length > 0 ? 1 : 0
};

// Create a dynamic creep matrix by applying modifications to the base template
let dynamicMatrix = {};
for (let role in baseTemplate) {
    const qty = role === "hauler" ? haulerAssignment.qty
        : baseTemplate[role].qty === 0 ? 0
        : lowEnergy ? 1
        : (modifiers[role] !== 0 && modifiers[role] !== undefined
            ? modifiers[role]
            : baseTemplate[role].qty); // ignore 0 modifiers, fallback to base

    const size = role === "hauler" ? haulerAssignment.size
        : lowEnergy ? 1
        : baseTemplate[role].size;

    const template = baseTemplate[role].template;

    dynamicMatrix[role] = {
        qty,
        size,
        template,
        MaxParts: size * template.length   // new property
    };
}


    return dynamicMatrix; // Return the adjusted creep matrix
},

updateRoomCreepMatrix: function updateRoomCreepMatrix() {
    if (Game.time % 50 !== 0) return;

    for (let roomName in Game.rooms) { // Use Game.rooms instead of Memory.rooms
        let room = Game.rooms[roomName];
        if (!room) continue; // Skip undefined rooms

        let hasSpawner = room.find(FIND_MY_SPAWNS).length > 0;
        if (!hasSpawner) continue;
        console.log("Updateing room targets " + room)


        // Update the target creep matrix for the room
        Memory.rooms[roomName].TargetScreep = FunctionsRoomTargetCreepSet.adjustCreepMatrix(room);
        
        console.log("updated room " + roomName +"'s target creeps")
        
    }
},
calculateHaulerAssignment: function calculateHaulerAssignment(room) { // need work out how to make this factor in haulers that supply the controler upgrader containers before the links are built and be able to handel no container existing 
    // Ensure the room memory exists and contains sources
    if (!Memory.rooms[room.name] || !Memory.rooms[room.name].sources) return { qty: 0, size: 1 };
    if (Memory.rooms[room.name].RoomLevel <= 3){
        return 0;
    }
    let totalCarryNeeded = 0;
    let smallestSize = Infinity;

    // Loop through all sources in the room memory to determine haul requirements
    for (let sourceID in Memory.rooms[room.name].sources) {
        let sourceData = Memory.rooms[room.name].sources[sourceID];
        if (!sourceData || !sourceData.HaulerCarry2Needed) continue;

        totalCarryNeeded += sourceData.HaulerCarry2Needed;

        // Track the smallest viable hauler size
        if (sourceData.HaulerCarry2Needed < smallestSize) {
            smallestSize = sourceData.HaulerCarry2Needed;
        }
    }

    // Default smallest size to 1 if no valid sources exist
    smallestSize = smallestSize === Infinity ? 1 : smallestSize;

    // Calculate final hauler quantity by dividing total hauling need by smallest viable hauler size
    let haulerQty = Math.ceil(totalCarryNeeded / smallestSize);

    return { qty: haulerQty, size: smallestSize };
}


}


module.exports =  FunctionsRoomTargetCreepSet ; 



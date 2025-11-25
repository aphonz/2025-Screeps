/**
 * Strategic Room Analysis Module
 * Analyzes rooms for strategic value, resources, and threats
 */

const StrategicRoomAnalysis = {

    analyzeRooms: function() {
    Memory.StrategicRoomPlanning = Memory.StrategicRoomPlanning || {};
    Memory.StrategicRoomPlanning.roomChoices = Memory.StrategicRoomPlanning.roomChoices || {};
    
    // Step 1: Filter compatible rooms
    if (Game.time % 10 !== 0) return; // Run every 100 ticks
    
    for (let roomName in Memory.rooms) {
        let room = Memory.rooms[roomName];
        if (room.BaseCompatible !== false) {
            Memory.StrategicRoomPlanning.roomChoices[roomName] = {
                SourceQty: room.SourceQty,
                Mineral: room.Mineral
            };
        }
    }

    // Step 2: Collect all spawn room minerals into a quantity map
Memory.StrategicRoomPlanning.AvalibleMinerals = {};

for (let spawnRoom of Memory.spawnRooms) {
    let room = Memory.rooms[spawnRoom];
    if (room && room.Mineral) {
        let mineral = room.Mineral;

        // If mineral already counted, increment it
        if (Memory.StrategicRoomPlanning.AvalibleMinerals[mineral]) {
            Memory.StrategicRoomPlanning.AvalibleMinerals[mineral]++;
        } else {
            // Otherwise initialize count at 1
            Memory.StrategicRoomPlanning.AvalibleMinerals[mineral] = 1;
        }
    }
}

    // Step 3: Desired minerals already exist, but ensure structure
    // Example default ratios (adjust manually later)
    if(!Memory.StrategicRoomPlanning.desiredMineral) Memory.StrategicRoomPlanning.desiredMineral = {
        H: 1,   // Hydrogen
        O: 1,   // Oxygen
        U: 1,   // Uranium
        L: 1,   // Lemergium
        K: 1,   // Keanium
        Z: 1,   // Zynthium
        X: 1    // Catalyst
    };

    
    // Step 4: For each candidate set, find nearest spawn room distance
for (let roomName in Memory.StrategicRoomPlanning.roomChoices) {
    let choiceObj = Memory.StrategicRoomPlanning.roomChoices[roomName];

    // Skip if already calculated
    if (choiceObj.closestRoom !== undefined) continue;

    let closestDistance = Infinity;

    for (let spawnRoom of Memory.spawnRooms) {
        let dist = Game.map.getRoomLinearDistance(roomName, spawnRoom);
        if (dist < closestDistance) closestDistance = dist;

        if (closestDistance === 1) break; // Break inner loop only
    }

    choiceObj.closestRoom = closestDistance === Infinity ? null : closestDistance;
}

// Step: Build list of rooms to claim
Memory.roomToClaim = [];

// Helper: check if adding this mineral helps reach desired ratio
function helpsMineralRatio(mineral) {
    const desired = Memory.StrategicRoomPlanning.desiredMineral;
    const available = Memory.StrategicRoomPlanning.AvalibleMinerals || {};

    // If mineral is desired and we have less than desired, it helps
    if (desired[mineral] && (!available[mineral] || available[mineral] < desired[mineral])) {
        return true;
    }
    return false;
}

// Pass 1: rooms with 2 sources, closestRoom > 3, and mineral helps ratio
for (let roomName in Memory.StrategicRoomPlanning.roomChoices) {
    const choice = Memory.StrategicRoomPlanning.roomChoices[roomName];
    if (choice.SourceQty === 2 && choice.closestRoom > 3 && helpsMineralRatio(choice.Mineral)) {
        Memory.roomToClaim.push(roomName);
    }
}

// If none found, Pass 2: relax closestRoom to > 2
if (Memory.roomToClaim.length === 0) {
    for (let roomName in Memory.StrategicRoomPlanning.roomChoices) {
        const choice = Memory.StrategicRoomPlanning.roomChoices[roomName];
        if (choice.SourceQty === 2 && choice.closestRoom > 2 && helpsMineralRatio(choice.Mineral)) {
            Memory.roomToClaim.push(roomName);
        }
    }
}

// If still none, Pass 3: ignore mineral factor, require 2 sources and closestRoom > 3
if (Memory.roomToClaim.length === 0) {
    for (let roomName in Memory.StrategicRoomPlanning.roomChoices) {
        const choice = Memory.StrategicRoomPlanning.roomChoices[roomName];
        if (choice.SourceQty === 2 && choice.closestRoom > 3) {
            Memory.roomToClaim.push(roomName);
        }
    }
}

// If still none, Pass 4: allow 1 source, closestRoom > 3, and mineral helps ratio
if (Memory.roomToClaim.length === 0) {
    for (let roomName in Memory.StrategicRoomPlanning.roomChoices) {
        const choice = Memory.StrategicRoomPlanning.roomChoices[roomName];
        if (choice.SourceQty === 1 && choice.closestRoom > 3 && helpsMineralRatio(choice.Mineral)) {
            Memory.roomToClaim.push(roomName);
        }
    }
}

}// functio end analyzeRooms

};  


    



module.exports = StrategicRoomAnalysis;
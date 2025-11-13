var roleExtractor = {

    /** @param {Creep} creep **/
    run: function(creep) {

        // Remember home room
        if (!creep.memory.home) {
            creep.memory.home = creep.room.name;
        }

        // --- Remember mineral source ---
if (!creep.memory.ExtractorSource) {
    let source = creep.pos.findClosestByRange(FIND_MINERALS);
    if (source) {
        creep.memory.ExtractorSource = source.id;
    } else {
        creep.say('No source');
        return;
    }
}

// --- Remember extractor ---
if (!creep.memory.Extractor) {
    let extractor = creep.room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_EXTRACTOR
    })[0];
    
    if (extractor) {
        creep.memory.Extractor = extractor.id;
    } else {
        creep.say('No extractor');
        return;
    }
}

        let source = Game.getObjectById(creep.memory.ExtractorSource);
        let Extractie = Game.getObjectById(creep.memory.Extractor);

        // --- Anchor logic ---
        if (!creep.memory.anchorPos) {
            // Look for an existing container next to the extractor
            let container = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            })[0];

            if (container) {
                // Use container position as anchor
                creep.memory.anchorPos = { x: container.pos.x, y: container.pos.y, roomName: container.pos.roomName };
            } else {
                // Otherwise, move next to extractor and anchor there
                if (!creep.pos.isNearTo(source)) {
                    creep.moveTo(source, { visualizePathStyle: { stroke: '#ffffff' } });
                    return;
                } else {
                    creep.memory.anchorPos = { x: creep.pos.x, y: creep.pos.y, roomName: creep.room.name };
                }
            }
        }

        // If creep is not on its anchor, move back
        let anchor = new RoomPosition(creep.memory.anchorPos.x, creep.memory.anchorPos.y, creep.memory.anchorPos.roomName);
        if (!creep.pos.isEqualTo(anchor)) {
            creep.moveTo(anchor, { visualizePathStyle: { stroke: '#ffaa00' } });
            return;
        }

        // --- Container logic ---
        let container = creep.pos.lookFor(LOOK_STRUCTURES).find(
            s => s.structureType === STRUCTURE_CONTAINER
            
        );

        if (!container) {
            let site = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES).find(
                s => s.structureType === STRUCTURE_CONTAINER
            );
            if (!site) {
                creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);
            }
        } else {
            if (!Memory.rooms[creep.memory.home].ExtractorContainer) Memory.rooms[creep.memory.home].ExtractorContainer = container.id ;
        }
        // --- Harvesting ---
        // --- Mineral Harvesting ---


if (Extractie && Extractie.cooldown === 0 &&
    source.mineralAmount > 0) {
    creep.harvest(source);
}
    }
};

module.exports = roleExtractor;
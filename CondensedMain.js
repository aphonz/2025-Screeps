var functionsCondensedMain = {

    // AssignBots code
    AssignBots: function AssignBots(Game) {
        var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
        var builder = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
        var upgrader = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');
        var miner = _.filter(Game.creeps, (creep) => creep.memory.role == 'miner');

    },
    // --- Generic CPU Tracking Helpers --- --- Generic CPU Tracking Helpers ---
    startTracking: function startTracking(statName) {
        if (!Memory.cpuStats) 
            Memory.cpuStats = {};
        if (!Memory.cpuStats[statName]) {
            Memory.cpuStats[statName] = {
                total: 0,
                runs: 0,
                average: 0
            };
        }
        Memory.cpuStats[statName]._start = Game
            .cpu
            .getUsed(); // temporary marker
    },

    endTracking: function endTracking(statName) {
        const end = Game
            .cpu
            .getUsed();
        const used = end - Memory.cpuStats[statName]._start;

        const stats = Memory.cpuStats[statName];
        stats.total += used;
        stats.runs += 1;
        stats.average = stats.total / stats.runs;

        // Cleanup every 1200 ticks
        if (Game.time % 1200 === 0 && stats.runs > 1000) {
            const reduceBy = stats.runs - 1000;
            stats.runs -= reduceBy;
            stats.total -= reduceBy * stats.average;
            stats.average = stats.total / stats.runs;
        }

        delete stats._start; // remove temp marker
    },

    // Cleaner code
    Clean: function Clean(Game) {
        if (Game.time % 60 === 0) {
            for (var name in Memory.creeps) {
                if (!Game.creeps[name]) {
                    delete Memory.creeps[name];
                    console.log('Getting rid of shit bloke ' + name);
                }
            }
        }
    },

    PixelsGenerate: function PixelsGenerate(Game) {
        // Ensure Memory namespace exists
        if (!Memory.pixelManager) {
            Memory.pixelManager = {
                priceHistory: []
            };
        }

        const maxEntries = 100;

        // --- Pixel generation (MMO only) ---
        if (Game.shard && Game.cpu && typeof Game.cpu.generatePixel === "function") {
            if (Game.cpu.bucket === 10000) {
                console.log("PIXELS");
                Game
                    .cpu
                    .generatePixel();
            }

            // --- Market logic (MMO only) ---
            if (Game.shard && Game.time % 100 === 0) { // every 100 ticks
    const orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: PIXEL});
    if (orders.length > 0) {
        const bestOrder = _.max(orders, "price");
        const currentPrice = bestOrder.price;
        const orderQty = bestOrder.amount;

        // Push into Memory history
        Memory.pixelManager.priceHistory.push(currentPrice);
        if (Memory.pixelManager.priceHistory.length > maxEntries) {
            Memory.pixelManager.priceHistory.shift(); // keep only last 100
        }

        // Only start selling once we have 75 entries
        if (Memory.pixelManager.priceHistory.length === maxEntries * 0.75) {
            const bestInHistory = _.max(Memory.pixelManager.priceHistory);

            // If current price is the best in last 100 entries → sell 10%
            if (currentPrice >= bestInHistory) {
                const myPixels = Game.resources.pixel || 0;
                let amountToSell = Math.floor(myPixels * 0.1);

                if (amountToSell > 0) {
                    // Ensure we don’t sell more than the order can buy
                    amountToSell = Math.min(amountToSell, orderQty);

                    console.log(`Selling ${amountToSell} pixels at ${currentPrice}`);
                    Game.market.deal(bestOrder.id, amountToSell);
                }
            }
        }
    }
}
        }
    },

    displayRoleHistogram: function displayRoleHistogram() {
        const roles = Memory.cpuStats.roles || {};
        const totalStats = Memory.cpuStats.creeps || {
            average: 0
        };

        let output = "\n=== CPU Histogram (last 400 ticks) ===\n";

        // Find max impact to normalize bar lengths
        let maxImpact = 0;
        for (const role in roles) {
            const s = roles[role];
            const impact = s.average * s.unitAvg;
            if (impact > maxImpact) 
                maxImpact = impact;
            }
        if (maxImpact === 0) 
            maxImpact = 1;
        
        for (const role in roles) {
            const s = roles[role];
            const perUnit = s.average;
            const unitCount = s.unitAvg;
            const impact = s.average * unitCount;

            // Normalize: 1 unit represented by ███, remaining units as ---
            const unitBarLen = Math.round((perUnit / maxImpact) * 40);
            const remainingUnits = Math.max(0, unitCount - 1);
            const impactBarLen = Math.round(((perUnit * remainingUnits) / maxImpact) * 40);

            const unitBar = "███".repeat(unitBarLen);
            const impactBar = "-".repeat(impactBarLen);

            const LINE = " | ";

            // Build line: one unit bar, remaining units bar, then per-unit CPU and total
            // impact
            let line = `${role.padEnd(15)} | ${unitBar}${impactBar} ${LINE} ${perUnit.toFixed(2)} ${LINE} ${impact.toFixed(2)}`;

            output += line + "\n";
        }

        // Totals at the end
        const adjustedTotal = totalStats.average;
        output += `\nTotal Creeps Avg: ${adjustedTotal.toFixed(2)} \n`;

        return output;
    },

    //Unit in room check
    /*CreepAliveHomeMemory: function  CreepAliveHomeMemory(Game){
	    // Initialize the rooms object if it doesn't already exist
	    if (!Memory.rooms) {
	        Memory.rooms = {};
	    }

	    // Reset ActiveScreeps counts for each room at the start of the tick
	    Object.keys(Memory.rooms).forEach(roomName => {

	        if (Memory.rooms[roomName].ActiveScreeps) {
	            const roles = Memory.roles
	            roles.forEach(role => {
	            Memory.rooms[roomName].ActiveScreeps[role] = 0; // Reset each role count to zero
	                });
	            }
	        else {
	            Memory.rooms[roomName].ActiveScreeps = {}; // Ensure ActiveScreeps exists
	        }
	    });

	    // Loop through all creeps and populate the data in Memory.rooms
	    Object.values(Game.creeps).forEach(creep => {
	        const roomName = creep.memory.home;
	        if (roomName) {
	            // Ensure the room is initialized in Memory
	            if (!Memory.rooms[roomName]) {
	                Memory.rooms[roomName] = {};
	            }

	            // Ensure ActiveScreeps is initialized as an object
	            if (!Memory.rooms[roomName].ActiveScreeps) {
	                Memory.rooms[roomName].ActiveScreeps = {};
	            }

	            const role = creep.memory.role;
	            // Check if the creep has a role and sufficient ticks to live
	            if (role ) {
	                // Increment the count for this role
	                if (!Memory.rooms[roomName].ActiveScreeps[role]) {
	                    Memory.rooms[roomName].ActiveScreeps[role] = 0;
	                }
	                Memory.rooms[roomName].ActiveScreeps[role]++;
	            }
	        }
	    });
	}, */
    //Function end

    CreepAliveHomeMemory: function (Game) {
        // Ensure Memory.rooms exists
        if (!Memory.rooms) 
            Memory.rooms = {};
        
        // Temporary container for counts
        const roomCounts = {};

        // Loop through all creeps once
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const roomName = creep.memory.home;
            const role = creep.memory.role;

            if (!roomName || !role) 
                continue;
            
            // Initialize room if missing
            if (!roomCounts[roomName]) 
                roomCounts[roomName] = {};
            
            // Increment role count
            roomCounts[roomName][role] = (roomCounts[roomName][role] || 0) + 1;
        }

        // Write results back into Memory.rooms
        for (const roomName in roomCounts) {
            if (!Memory.rooms[roomName]) 
                Memory.rooms[roomName] = {};
            Memory.rooms[roomName].ActiveScreeps = roomCounts[roomName];
        }
        for (const roomName in Memory.rooms) {
            if (!roomCounts[roomName]) {
                Memory.rooms[roomName].ActiveScreeps = {};
            }
        }

    },

    RoomsLevelMemory: function RoomsLevelMemory(Game) {
        Object
            .keys(Game.rooms)
            .forEach(roomName => {
                let room = Game.rooms[roomName];

                // Initialize Memory for the room if it doesn't exist
                if (!Memory.rooms[roomName]) {
                    Memory.rooms[roomName] = {};
                }
                // Check if the room has a controller and store its level
                if (room.controller) {
                    Memory.rooms[roomName].RoomLevel = room.controller.level; // Assign controller level
                } else {
                    Memory.rooms[roomName].RoomLevel = null; // For rooms without a controller
                }
            });

    }, //Function end
    analyzeOwnedRooms: function analyzeOwnedRoom() {
        for (const roomNameWithSpawn of Memory.spawnRooms) {
            this.RemoteanalyzeRoom(roomNameWithSpawn);
        };

        console.log(`Analysis started for ${Memory.spawnRooms.length} owned rooms.`);
    }, // Function end

    RemoteanalyzeRoom: function RemoteanalyzeRoom(roomName) {
        let room = Game.rooms[roomName];
        if (!room) {
            console.log(`Room ${roomName} not visible.`);
            return;
        }

        // Check for an existing flag, create one if missing
        if (!Game.flags[roomName]) {
            room.createFlag(25, 25, roomName);
            console.log(`Created flag: ${roomName} at (25,25)`);
        }

        // Find rooms in range of 2
        let nearbyRooms = [];
        let exits = Game
            .map
            .describeExits(roomName);
        for (let exit in exits) {
            let firstLayerRoom = exits[exit];
            nearbyRooms.push(firstLayerRoom);
            let secondLayerExits = Game
                .map
                .describeExits(firstLayerRoom);
            for (let secondExit in secondLayerExits) {
                let secondLayerRoom = secondLayerExits[secondExit];
                if (!nearbyRooms.includes(secondLayerRoom)) {
                    nearbyRooms.push(secondLayerRoom);
                }
            }
        }

        // Initialize memory structure
        if (!Memory.rooms[roomName]) 
            Memory.rooms[roomName] = {
                remoterooms: {}
            };
        if (!Memory.rooms[roomName].remoterooms) 
            Memory.rooms[roomName].remoterooms = {};
        
        nearbyRooms.forEach(remoteRoom => {
            if (!Memory.rooms[roomName].remoterooms[remoteRoom]) {
                Memory.rooms[roomName].remoterooms[remoteRoom] = {};
                console.log(`Initialized memory for remote room: ${remoteRoom}`);
            }

            let remoteMemory = Memory.rooms[roomName].remoterooms[remoteRoom];

            // Set memory attributes
            remoteMemory.actualHarvesters = _
                .filter(Game.creeps, creep => creep.memory.role == 'remoteHarvester' && creep.memory.harvestRoom == remoteRoom && creep.ticksToLive > 200)
                .length;
            //remoteMemory.isSafe = Game.map.getRoomStatus(remoteRoom).status === 'normal';

            try {
                let hostiles = Game.rooms[remoteRoom]
                    ? Game
                        .rooms[remoteRoom]
                        .find(FIND_HOSTILE_CREEPS)
                    : [];
                let hostileStructures = Game.rooms[remoteRoom]
                    ? Game
                        .rooms[remoteRoom]
                        .find(FIND_HOSTILE_STRUCTURES)
                    : [];

                if (hostiles.length > 0 || hostileStructures.length > 0) {
                    remoteMemory.isSafe = false;
                    remoteMemory.unsafeUntil = Game.time + 1000; // Mark unsafe for 1000 ticks
                    console.log(`Hostile detected in ${remoteRoom}, marking unsafe until tick ${remoteMemory.unsafeUntil}`);
                } else {
                    // Check if the unsafe status should expire
                    if (remoteMemory.unsafeUntil && Game.time >= remoteMemory.unsafeUntil) {
                        remoteMemory.isSafe = true; // Room is safe again
                        delete remoteMemory.unsafeUntil; // Remove expiration marker
                        console.log(`Room ${remoteRoom} is safe again.`);
                    }
                }
            } catch (error) {
                console.log(`Error checking safety for ${remoteRoom}:`, error);
            }

            remoteMemory.isOwned = !!Game.rooms[remoteRoom] && !!Game.rooms[remoteRoom].controller && !!Game.rooms[remoteRoom].controller.owner;
            remoteMemory.hasReserver = _.some(Game.creeps, creep => creep.memory.role === 'reserver' && creep.memory.targetRoom === remoteRoom);

            //if (!remoteMemory.Sources) {
            try {
                let sources = Game.rooms[remoteRoom]
                    ? Game
                        .rooms[remoteRoom]
                        .find(FIND_SOURCES)
                    : [];
                remoteMemory.Sources = sources.map(source => ({
                    id: source.id,
                    assignedCreeps: _
                        .filter(Game.creeps, creep => creep.memory.source === source.id && creep.memory.targetRoom === remoteRoom)
                        .length
                }));
            } catch (error) {
                // console.log(`Error retrieving sources for ${remoteRoom}:`, error);
                // remoteMemory.Sources = []; // Default to an empty array in case of an error
            }
            //}

            if (remoteMemory.Sources && remoteMemory.isSafe === true && remoteMemory.isOwned === false) {
                var targetHarvesters = remoteMemory.Sources.length * 2
                remoteMemory.harvestersTarget = targetHarvesters;
            } else {
                remoteMemory.harvestersTarget = 0;
            }

            console.log(`Updated memory for ${remoteRoom}: Target Harvesters: ${remoteMemory.harvestersTarget}, Actual: ${remoteMemory.actualHarvesters}, Safe: ${remoteMemory.isSafe}, Owned: ${remoteMemory.isOwned}, Reserver Assigned: ${remoteMemory.hasReserver}`);
        });

        console.log(`Analysis completed for ${roomName}, tracking ${nearbyRooms.length} remote rooms.`);

    }, //Function end

    findLinks: function findLinks(roomName) { // Usage findLinks('W8N3');
        const room = Game.rooms[roomName];
        if (!room) 
            return;
        
        const controller = room.controller;
        if (!controller) 
            return;
        
        // only attempt link placement if controller is at RCL 4 or above
        if (controller.level >= 4) {
            const storage = room.storage;
            if (!storage) 
                return;
            
            // Find existing links in the room
            const links = room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_LINK
            });

            // Identify Controller Link (within range 1 of controller)
            let controllerLink = links.find(link => link.pos.inRangeTo(controller.pos, 1));

            // If there's no controller link, check for construction sites and create one if
            // none exists
            if (!controllerLink) {
                // Check for existing construction sites for links within range 1
                const existingSite = room.find(FIND_CONSTRUCTION_SITES, {
                    filter: s => s.structureType === STRUCTURE_LINK && s
                        .pos
                        .inRangeTo(controller.pos, 1)
                })[0];

                if (!existingSite) {
                    // find a free adjacent position (within range 1) to place a link
                    const offsets = [
                        {
                            x: -1,
                            y: -1
                        }, {
                            x: 0,
                            y: -1
                        }, {
                            x: 1,
                            y: -1
                        }, {
                            x: -1,
                            y: 0
                        }, {
                            x: 1,
                            y: 0
                        }, {
                            x: -1,
                            y: 1
                        }, {
                            x: 0,
                            y: 1
                        }, {
                            x: 1,
                            y: 1
                        }
                    ];

                    for (let o of offsets) {
                        const px = controller.pos.x + o.x;
                        const py = controller.pos.y + o.y;
                        // skip out of bounds
                        if (px < 0 || px > 49 || py < 0 || py > 49) 
                            continue;
                        const pos = new RoomPosition(px, py, room.name);

                        // ensure position is walkable, has no structure, no hostile construction, and
                        // not the controller tile
                        const roomTerrain = room
                            .getTerrain()
                            .get(px, py);
                        if (roomTerrain === TERRAIN_MASK_WALL) 
                            continue;
                        
                        const blockingStructures = pos
                            .lookFor(LOOK_STRUCTURES)
                            .filter(s => s.structureType !== STRUCTURE_ROAD);

                        if (blockingStructures.length > 0) 
                            continue;
                        
                        const hasConstruction = pos
                            .lookFor(LOOK_CONSTRUCTION_SITES)
                            .length > 0;
                        if (hasConstruction) 
                            continue;
                        
                        // create construction site for link
                        const res = room.createConstructionSite(pos, STRUCTURE_LINK);
                        // stop after first successful attempt
                        if (res === OK) {
                            // log optionally console.log(`Created link construction site at ${pos} for room
                            // ${roomName}`);
                            break;
                        }
                    }
                }
            }

            // Re-fetch links in case a link exists now or was nearby
            const updatedLinks = room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_LINK
            });

            controllerLink = updatedLinks.find(link => link.pos.inRangeTo(controller.pos, 1));

            // Identify Storage Link (within range 3 of storage)
            const storageLink = updatedLinks.find(link => link.pos.inRangeTo(storage.pos, 3));

            // Save to Memory if they don't exist
            if (!Memory.rooms[roomName]) {
                Memory.rooms[roomName] = {};
            }

            Memory.rooms[roomName].controllerLink = controllerLink
                ? controllerLink.id
                : null;
            Memory.rooms[roomName].storageLink = storageLink
                ? storageLink.id
                : null;
            Memory.rooms[roomName].LinkUp = (Memory.rooms[roomName].storageLink != null) && (Memory.rooms[roomName].controllerLink != null);

            // If links are up and we previously created a temp container, remove it so it
            // can be used elsewhere
            if (Memory.rooms[roomName].LinkUp && Memory.rooms[roomName].tempControllerContainer) {
                const tmp = Memory.rooms[roomName].tempControllerContainer;
                // If we stored a position, remove construction sites there and destroy built
                // container if present
                if (tmp.pos) {
                    const pos = new RoomPosition(tmp.pos.x, tmp.pos.y, roomName);
                    const sites = pos
                        .lookFor(LOOK_CONSTRUCTION_SITES)
                        .filter(s => s.structureType === STRUCTURE_CONTAINER);
                    for (const s of sites) {
                        try {
                            s.remove();
                        } catch (e) {}
                    }
                    const structs = pos
                        .lookFor(LOOK_STRUCTURES)
                        .filter(s => s.structureType === STRUCTURE_CONTAINER);
                    for (const s of structs) {
                        try {
                            s.destroy();
                        } catch (e) {}
                    }
                }
                // clean up flags
                delete Memory.rooms[roomName].tempControllerContainer;
            }

        } else {
            // below RCL4: still populate memory if links already exist, but do not attempt
            // to create one
            const links = room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_LINK
            });

            const controllerLink = links.find(link => link.pos.inRangeTo(controller.pos, 1));
            const storageLink = room.storage
                ? links.find(link => link.pos.inRangeTo(room.storage.pos, 3))
                : null;

            if (!Memory.rooms[roomName]) 
                Memory.rooms[roomName] = {};
            Memory.rooms[roomName].controllerLink = controllerLink
                ? controllerLink.id
                : null;
            Memory.rooms[roomName].storageLink = storageLink
                ? storageLink.id
                : null;
            Memory.rooms[roomName].LinkUp = (Memory.rooms[roomName].storageLink != null) && (Memory.rooms[roomName].controllerLink != null);

            // If links not available, attempt to place a temporary container near the
            // controller (so creeps can drop energy). We'll mark it in memory so it can be
            // removed later when the link is built.
            if (!Memory.rooms[roomName].LinkUp) {
                // Check for an existing container within range 1 of controller
                const existingContainer = room.find(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER && s
                        .pos
                        .inRangeTo(controller.pos, 1)
                })[0];

                // If there's already a container, record it but don't destroy it later unless
                // we created it
                if (existingContainer) {
                    // only record id if we created it earlier (temp flag), otherwise leave it alone
                    if (Memory.rooms[roomName].tempControllerContainer && Memory.rooms[roomName].tempControllerContainer.id === existingContainer.id) {
                        Memory.rooms[roomName].tempControllerContainer.id = existingContainer.id;
                    } else {
                        // leave non-temp containers alone
                    }
                } else {
                    // Check for existing construction site
                    const existingSite = room.find(FIND_CONSTRUCTION_SITES, {
                        filter: s => s.structureType === STRUCTURE_CONTAINER && s
                            .pos
                            .inRangeTo(controller.pos, 1)
                    })[0];

                    if (!existingSite && !Memory.rooms[roomName].tempControllerContainer) {
                        const offsets = [
                            {
                                x: -1,
                                y: -1
                            }, {
                                x: 0,
                                y: -1
                            }, {
                                x: 1,
                                y: -1
                            }, {
                                x: -1,
                                y: 0
                            }, {
                                x: 1,
                                y: 0
                            }, {
                                x: -1,
                                y: 1
                            }, {
                                x: 0,
                                y: 1
                            }, {
                                x: 1,
                                y: 1
                            }
                        ];

                        for (let o of offsets) {
                            const px = controller.pos.x + o.x;
                            const py = controller.pos.y + o.y;
                            if (px < 0 || px > 49 || py < 0 || py > 49) 
                                continue;
                            const pos = new RoomPosition(px, py, room.name);

                            // ensure position is walkable and has no blocking structure
                            const roomTerrain = room
                                .getTerrain()
                                .get(px, py);
                            if (roomTerrain === TERRAIN_MASK_WALL) 
                                continue;
                            
                            const blockingStructures = pos
                                .lookFor(LOOK_STRUCTURES)
                                .filter(s => s.structureType !== STRUCTURE_ROAD);

                            if (blockingStructures.length > 0) 
                                continue;
                            
                            const hasConstruction = pos
                                .lookFor(LOOK_CONSTRUCTION_SITES)
                                .length > 0;
                            if (hasConstruction) 
                                continue;
                            
                            // create construction site for container
                            const res = room.createConstructionSite(pos, STRUCTURE_CONTAINER);
                            if (res === OK) {
                                // mark in memory that we made a temporary controller container and store its
                                // pos
                                Memory.rooms[roomName].tempControllerContainer = {
                                    pos: {
                                        x: px,
                                        y: py
                                    },
                                    createdTick: Game.time
                                };
                                break;
                            }
                        }
                    } else if (existingSite && !Memory.rooms[roomName].tempControllerContainer) {
                        // record that a container site exists (might be ours or someone elses)
                        Memory.rooms[roomName].tempControllerContainer = {
                            pos: {
                                x: existingSite.pos.x,
                                y: existingSite.pos.y
                            },
                            createdTick: Game.time
                        };
                    }
                }
            } else {
                // If LinkUp true but a temp container exists (edge case), remove it so the
                // container can be reused
                if (Memory.rooms[roomName].tempControllerContainer) {
                    const tmp = Memory.rooms[roomName].tempControllerContainer;
                    if (tmp.pos) {
                        const pos = new RoomPosition(tmp.pos.x, tmp.pos.y, roomName);
                        const sites = pos
                            .lookFor(LOOK_CONSTRUCTION_SITES)
                            .filter(s => s.structureType === STRUCTURE_CONTAINER);
                        for (const s of sites) {
                            try {
                                s.remove();
                            } catch (e) {}
                        }
                        const structs = pos
                            .lookFor(LOOK_STRUCTURES)
                            .filter(s => s.structureType === STRUCTURE_CONTAINER);
                        for (const s of structs) {
                            try {
                                s.destroy();
                            } catch (e) {}
                        }
                    }
                    delete Memory.rooms[roomName].tempControllerContainer;
                }
            }
        }
    }, // Function end,//Function end

    validateAndTransferEnergy: function validateAndTransferEnergy(roomName) {
        if (!Memory.rooms[roomName]) 
            return;
        
        let {controllerLink, storageLink} = Memory.rooms[roomName];

        // Validate if both links still exist
        let controller = Game.getObjectById(controllerLink);
        let storage = Game.getObjectById(storageLink);

        if (!controller) {
            delete Memory.rooms[roomName].controllerLink;
        }
        if (!storage) {
            delete Memory.rooms[roomName].storageLink;
        }
        if ((Memory.rooms[roomName].storageLink != null) && (Memory.rooms[roomName].controllerLink != null)) {
            Memory.rooms[roomName].LinkUp = true;
        } else {
            Memory.rooms[roomName].LinkUp = false;
        }

        // If both links are valid, transfer energy when controllerLink has < 200 energy
        if (controller && storage && controller.store[RESOURCE_ENERGY] < 200) {
            let amount = Math.min(storage.store[RESOURCE_ENERGY], controller.store.getFreeCapacity(RESOURCE_ENERGY));
            if (amount > 0) {
                storage.transferEnergy(controller, amount);
            }
        }
    },

    updateRoomSources: function updateRoomSources(spawn) {
        if (!Memory.rooms[spawn.room.name]) {
            Memory.rooms[spawn.room.name] = {};
        }

        const roomMemory = Memory.rooms[spawn.room.name];

        if (!roomMemory.sources) {
            roomMemory.sources = {};
        }

        const sources = spawn
            .room
            .find(FIND_SOURCES);

        sources.forEach(source => {
            if (!roomMemory.sources[source.id]) {
                roomMemory.sources[source.id] = {};
            }

            // Check if previously stored container still exists
            if (roomMemory.sources[source.id].containerId) {
                const existingContainer = Game.getObjectById(roomMemory.sources[source.id].containerId);
                if (!existingContainer) {
                    delete roomMemory.sources[source.id].containerId;
                    delete roomMemory.sources[source.id].pathLength; // Remove invalid path data
                }
            }

            // Find nearest container within range 3
            const containers = source
                .pos
                .findInRange(FIND_STRUCTURES, 3, {
                    filter: structure => structure.structureType === STRUCTURE_CONTAINER
                });

            if (containers.length > 0) {
                const container = containers[0];
                roomMemory.sources[source.id].containerId = container.id;

                // Calculate path length
                const path = PathFinder.search(spawn.pos, {
                    pos: container.pos,
                    range: 1
                });
                roomMemory.sources[source.id].pathLength = path.path.length;
                roomMemory.sources[source.id].HaulerCarry2Needed = (Math.ceil((11 * ((roomMemory.sources[source.id].pathLength) * 2)) / 100));
                const pathControler = PathFinder.search(spawn.room.controller.pos, {
                    pos: container.pos,
                    range: 1
                });
                roomMemory.sources[source.id].pathLengthControler = pathControler.path.length;
                roomMemory.sources[source.id].HaulerCarry2NeededControler = (Math.ceil((11 * ((roomMemory.sources[source.id].pathLength) * 2)) / 100));

            }
        });

    },

    findBaseLocation: function findBaseLocation(room) {
        // If no room object was provided, stop early
        if (!room) 
            return;
        
        // Ensure Memory structures exist so we can store results across ticks
        if (!Memory.rooms) 
            Memory.rooms = {};
        if (!Memory.rooms[room.name]) 
            Memory.rooms[room.name] = {};
        if (!Memory.roomToClaim) 
            Memory.roomToClaim = [];
        if (!Memory.rooms[room.name].Mineral) 
            Memory.rooms[room.name].Mineral = room.find(FIND_MINERALS).length
                ? room.find(FIND_MINERALS)[0].mineralType
                : "NONE";
        
        // If this room was already checked earlier, skip re-checking
        if (Memory.rooms[room.name].BaseChecked) 
            return;
        
        // Find all energy sources in the room and remember how many there are
        const sources = room.find(FIND_SOURCES);
        const sourceQty = sources.length;

        // If there are no sources, mark the room incompatible and stop
        if (sourceQty < 1) {
            Memory.rooms[room.name].BaseChecked = true;
            Memory.rooms[room.name].BaseCompatible = false;
            return;
        }

        // Compute the average position of all sources (used to bias the search)
        let avgX = 0,
            avgY = 0;
        sources.forEach(s => {
            avgX += s.pos.x;
            avgY += s.pos.y;
        });
        avgX /= sourceQty;
        avgY /= sourceQty;

        // Get the terrain accessor for fast terrain queries
        const terrain = room.getTerrain();

        // Size of the base block we want to fit (13x13)
        const size = 13;

        // edgeMargin is how many tiles we want to keep free from each wall Set to 1 so
        // the base will not touch the outer room border or door tiles
        const edgeMargin = 2;

        // top-left of the 13x13 block must be between minTopLeft and maxTopLeft
        // inclusive These values guarantee the entire 13x13 region is inside the room
        // and away from edges
        const minTopLeft = edgeMargin;
        const maxTopLeft = 49 - edgeMargin - (size - 1); // 49 is the max coordinate in a room (0..49)

        // If the margin is too large to fit the block, mark incompatible and return
        if (minTopLeft > maxTopLeft) {
            Memory.rooms[room.name].BaseChecked = true;
            Memory.rooms[room.name].BaseCompatible = false;
            Memory.rooms[room.name].SourceQty = sourceQty;
            return;
        }

        // Derive a starting top-left by centering the 13x13 block around the average
        // source position Clamp the start to the valid top-left range so BFS begins
        // inside the allowed rectangle
        const startTopLeftX = Math.min(Math.max(Math.round(avgX) - Math.floor(size / 2), minTopLeft), maxTopLeft);
        const startTopLeftY = Math.min(Math.max(Math.round(avgY) - Math.floor(size / 2), minTopLeft), maxTopLeft);

        // Breadth-first search (queue) over candidate top-left coordinates
        let queue = [
            [startTopLeftX, startTopLeftY]
        ];
        let visited = new Set(); // track visited top-left positions so we don't repeat work
        let basePosition = null; // will hold the chosen RoomPosition center if found

        while (queue.length > 0) {
            const [x,
                y] = queue.shift(); // pop the next candidate
            const key = `${x},${y}`;

            // Skip if we've already processed this top-left candidate
            if (visited.has(key)) 
                continue;
            visited.add(key);

            // Skip candidates outside the reduced valid rectangle (safety)
            if (x < minTopLeft || x > maxTopLeft || y < minTopLeft || y > maxTopLeft) 
                continue;
            
            // Assume the candidate block is valid until we find a blocking tile
            let isValid = true;

            // Check every tile inside the size x size block terrain.get returns 0 for
            // plain, 1 for wall, 2 for swamp
            for (let ox = 0; ox < size; ox++) {
                for (let oy = 0; oy < size; oy++) {
                    const t = terrain.get(x + ox, y + oy);
                    // Only allow plain (0) and swamp (2). Any other value makes the block invalid.
                    if (t !== 0 && t !== 2) {
                        isValid = false;
                        break;
                    }
                }
                if (!isValid) 
                    break; // stop checking this block early if invalid
                }
            
            // If we found a completely valid block, compute its center and stop searching
            if (isValid) {
                const centerX = x + Math.floor(size / 2);
                const centerY = y + Math.floor(size / 2);
                basePosition = new RoomPosition(centerX, centerY, room.name);
                break;
            }

            // Otherwise enqueue orthogonal neighbors (up/down/left/right) inside the valid
            // rectangle
            const neighbors = [
                [
                    x + 1,
                    y
                ],
                [
                    x - 1,
                    y
                ],
                [
                    x, y + 1
                ],
                [
                    x, y - 1
                ]
            ];
            for (const [nx,
                ny]of neighbors) {
                if (nx >= minTopLeft && nx <= maxTopLeft && ny >= minTopLeft && ny <= maxTopLeft) {
                    const nkey = `${nx},${ny}`;
                    if (!visited.has(nkey)) 
                        queue.push([nx, ny]);
                    }
                }
        }

        // Mark the room as checked and save how many sources it had
        Memory.rooms[room.name].BaseChecked = true;
        Memory.rooms[room.name].SourceQty = sourceQty;

        // If a base center was found, save it in Memory, add to claim list, and place a
        // flag
        if (basePosition) {
            Memory.rooms[room.name].BaseCompatible = basePosition;
            if (!Memory.roomToClaim.includes(room.name)) 
                Memory.roomToClaim.push(room.name);
            room.createFlag(basePosition.x, basePosition.y, `C.${room.name}`);
        } else {
            // Otherwise record that the room has no compatible base placement under these
            // rules
            Memory.rooms[room.name].BaseCompatible = false;
        }
    },

    updateSpawnRoomMemory: function updateSpawnRoomMemory() {
        const roomSet = new Set();

        for (const spawnName in Game.spawns) {
            const spawn = Game.spawns[spawnName];
            if (spawn && spawn.room && spawn.room.name) {
                roomSet.add(spawn.room.name); // Set ensures uniqueness
            }
        }

        const roomList = Array.from(roomSet);
        Memory.spawnRooms = roomList;

        return roomList;
    },

    tagRenewablesForRoom: function tagRenewablesForRoom(room) {
        if (Game.time % 1000 === 0) {

            const roomMem = Memory.rooms[room.name];
            if (!roomMem || !roomMem.TargetScreep) 
                return;
            
            const targetScreep = roomMem.TargetScreep;
            const creeps = room.find(FIND_MY_CREEPS);

            for (let i = 0; i < creeps.length; i++) {
                const creep = creeps[i];
                const role = creep.memory.role;
                if (!role) {
                    creep.memory.renewable = false;
                    continue;
                }

                const roleMem = targetScreep[role];
                const maxParts = roleMem && roleMem.MaxParts;
                if (!maxParts) {
                    creep.memory.renewable = false;
                    continue;
                }

                const body = creep.body;

                // First check size — cheap operation
                if (body.length !== maxParts) {
                    creep.memory.renewable = false;
                    continue;
                }

                // Only if size matches, check for CLAIM or boosted parts
                let invalid = false;
                for (let j = 0; j < body.length; j++) {
                    const part = body[j];
                    if (part.type === CLAIM || part.boost) {
                        invalid = true;
                        break;
                    }
                }

                creep.memory.renewable = !invalid;
            }
        }
    }

};

module.exports = functionsCondensedMain;
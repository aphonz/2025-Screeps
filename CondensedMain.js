// RoomPlanner is the single source of truth for WHERE links/containers go and WHICH one serves which
// source / the controller / storage. We only ever ask it (getInfra) - we never search the room for them.
const RoomPlanner = require('RoomPlanner');

// BaseFinder does the actual base placement maths (exit distance, 5x5 to 10x10 fit, up to 150 tiles).
// Named BaseFinder (not findBaseLocation) so it does not clash with the method below.
const BaseFinder = require('findBaseLocation');

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
        if (Game.time % 30 === 0) {
            for (var name in Memory.creeps) {
                if (!Game.creeps[name]) {
                    delete Memory.creeps[name];
                    //console.log('Getting rid of shit bloke ' + name);
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
                const orders = Game.market.getAllOrders({ type: ORDER_BUY, resourceType: PIXEL });
                if (orders.length > 0) {
                    const bestOrder = _.max(orders, "price");
                    const currentPrice = bestOrder.price;
                    const orderQty = bestOrder.amount;

                    // Determine threshold and previous max BEFORE adding current price
                    const sellThreshold = Math.floor(maxEntries * 0.75);
                    const prevMax = Memory.pixelManager.priceHistory.length > 0 ?
                        _.max(Memory.pixelManager.priceHistory) :
                        -Infinity;

                    // Push into Memory history (keep up to maxEntries)
                    Memory.pixelManager.priceHistory.push(currentPrice);
                    if (Memory.pixelManager.priceHistory.length > maxEntries) {
                        Memory.pixelManager.priceHistory.shift(); // keep only last 100
                    }

                    // Only start selling once we have at least 75 entries
                    if (Memory.pixelManager.priceHistory.length >= sellThreshold) {
                        // Sell when current price is >= historical max
                        if (currentPrice >= prevMax) {
                            const myPixels = (Game.resources && Game.resources.pixel) || 0;
                            let amountToSell = Math.floor(myPixels * 0.1);

                            if (amountToSell > 0 && orderQty > 0) {
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

    CreepAliveHomeMemory: function(Game) {
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

    updateRoomData: function updateRoomData() {
        // Only run every 12 ticks
        if (Game.time % 12 !== 0) return;

        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];

            // Initialize memory if needed
            if (!Memory.rooms[roomName]) {
                Memory.rooms[roomName] = {};
            }

            if (room.controller) {
                // Owned room
                if (room.controller.owner) {
                    Memory.rooms[roomName].owner = room.controller.owner.username;
                    Memory.rooms[roomName].reservation = null;
                }
                // Reserved but not owned
                else if (room.controller.reservation) {
                    Memory.rooms[roomName].owner = null;
                    Memory.rooms[roomName].reservation = {
                        username: room.controller.reservation.username,
                        ticksToEnd: room.controller.reservation.ticksToEnd
                    };
                }
                // Neutral
                else {
                    Memory.rooms[roomName].owner = null;
                    Memory.rooms[roomName].reservation = null;
                }

                // Controller details
                Memory.rooms[roomName].controllerLevel = room.controller.level;
                Memory.rooms[roomName].safeMode = room.controller.safeMode || null;
                Memory.rooms[roomName].safeModeAvailable = room.controller.safeModeAvailable;
                Memory.rooms[roomName].safeModeCooldown = room.controller.safeModeCooldown;
            } else {
                // No controller at all
                Memory.rooms[roomName].owner = null;
                Memory.rooms[roomName].reservation = null;
                Memory.rooms[roomName].controllerLevel = null;
                Memory.rooms[roomName].safeMode = null;
                Memory.rooms[roomName].safeModeAvailable = null;
                Memory.rooms[roomName].safeModeCooldown = null;
            }

            // Track last update time
            Memory.rooms[roomName].lastSeen = Game.time;
        }
    }, //function end


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
                let hostiles = Game.rooms[remoteRoom] ?
                    Game
                    .rooms[remoteRoom]
                    .find(FIND_HOSTILE_CREEPS) : [];
                let hostileStructures = Game.rooms[remoteRoom] ?
                    Game
                    .rooms[remoteRoom]
                    .find(FIND_HOSTILE_STRUCTURES) : [];

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
                let sources = Game.rooms[remoteRoom] ?
                    Game
                    .rooms[remoteRoom]
                    .find(FIND_SOURCES) : [];
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

    // ------------------------------------------------------------------------------------------
    // findLinks(roomName)   Usage: findLinks('W8N3');
    // ------------------------------------------------------------------------------------------
    // BEFORE: this function searched for links by distance and placed link / "temporary container"
    //         construction sites itself.
    // NOW:    RoomPlanner decides where every link and container goes AND builds them. This function
    //         only LOOKS UP which built link plays which role and caches the ids in Memory, using the
    //         same keys as before so the rest of the bot keeps working:
    //           Memory.rooms[roomName].storageLink     id of the core link next to storage (or null)
    //           Memory.rooms[roomName].controllerLink  id of the link at the controller (or null)
    //           Memory.rooms[roomName].LinkUp          true once BOTH of the above are built
    //           Memory.rooms[roomName].sourceLinks     { sourceId: linkId } for built source links
    findLinks: function findLinks(roomName) {
        const room = Game.rooms[roomName];
        if (!room || !room.controller)
            return;

        // Ask the planner which built structure plays which role.
        const infra = RoomPlanner.getInfra(room);
        // null = the planner has not produced a plan for this room yet (it does so on its first
        // run, within TICK_INTERVAL ticks). Keep whatever is in Memory rather than wiping it.
        if (!infra)
            return;

        if (!Memory.rooms)
            Memory.rooms = {};
        if (!Memory.rooms[roomName])
            Memory.rooms[roomName] = {};
        const roomMemory = Memory.rooms[roomName];

        // Core ("storage") link and controller link. getInfra returns null for a link that is
        // planned but not built yet, which is exactly what we want to store as "not there yet".
        roomMemory.storageLink = infra.coreLink ? infra.coreLink.id : null;
        roomMemory.controllerLink = infra.controllerLink ? infra.controllerLink.id : null;
        roomMemory.LinkUp = (roomMemory.storageLink != null) && (roomMemory.controllerLink != null);

        // Links at the sources (built ones only), keyed by source id. Handy for future
        // source-link -> core-link transfers.
        roomMemory.sourceLinks = {};
        for (const entry of infra.sources) {
            if (entry.sourceId && entry.link) {
                roomMemory.sourceLinks[entry.sourceId] = entry.link.id;
            }
        }

        // Legacy cleanup: the old version parked a "temporary" container by the controller and
        // destroyed it once links were up. The planner now owns the controller container (it even
        // adopts the old temporary one), so destroying it would just make the planner rebuild it.
        // We therefore only forget the stale memory record and never destroy anything.
        if (roomMemory.tempControllerContainer) {
            delete roomMemory.tempControllerContainer;
        }
    }, // Function end

    validateAndTransferEnergy: function validateAndTransferEnergy(roomName) {
        if (!Memory.rooms[roomName])
            return;

        let { controllerLink, storageLink } = Memory.rooms[roomName];

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

    // ------------------------------------------------------------------------------------------
    // updateRoomSources(spawn)
    // ------------------------------------------------------------------------------------------
    // Records, for every source in the spawn's room: its container id, the hauling path lengths and
    // how many CARRY parts a hauler needs.
    // BEFORE: "container" = the first container found within range 3 of the source (could be the
    //         wrong one, or one that belongs to the controller / mineral).
    // NOW:    the container is the one the RoomPlanner assigned to THIS source (adjacent to it).
    updateRoomSources: function updateRoomSources(spawn) {
        if (!Memory.rooms[spawn.room.name]) {
            Memory.rooms[spawn.room.name] = {};
        }

        const roomMemory = Memory.rooms[spawn.room.name];

        if (!roomMemory.sources) {
            roomMemory.sources = {};
        }

        // Which built container / link serves which source, according to the planner.
        const infra = RoomPlanner.getInfra(spawn.room);
        // No plan yet -> leave the stored data alone; we will fill it in on a later call.
        if (!infra)
            return;

        const sources = spawn
            .room
            .find(FIND_SOURCES);

        sources.forEach(source => {
            if (!roomMemory.sources[source.id]) {
                roomMemory.sources[source.id] = {};
            }
            const sourceMemory = roomMemory.sources[source.id];

            // Find this source's entry in the planner's list (matched by source id).
            const entry = infra.sources.find(e => e.sourceId === source.id);
            const container = entry ?
                entry.container :
                null;

            // The planned container is not built yet (or was destroyed): forget the old data so
            // nothing keeps pointing at a container that is not there. Same behaviour as before.
            if (!container) {
                delete sourceMemory.containerId;
                delete sourceMemory.pathLength;
                delete sourceMemory.linkId;
                return;
            }

            sourceMemory.containerId = container.id;
            // Link that serves this source (null if none is built yet)
            sourceMemory.linkId = entry.link ?
                entry.link.id :
                null;

            // Calculate path length (spawn -> container); unchanged from the old version
            const path = PathFinder.search(spawn.pos, {
                pos: container.pos,
                range: 1
            });
            sourceMemory.pathLength = path.path.length;
            sourceMemory.HaulerCarry2Needed = (Math.ceil((11 * ((sourceMemory.pathLength) * 2)) / 100));
            const pathControler = PathFinder.search(spawn.room.controller.pos, {
                pos: container.pos,
                range: 1
            });
            sourceMemory.pathLengthControler = pathControler.path.length;
            sourceMemory.HaulerCarry2NeededControler = (Math.ceil((11 * ((sourceMemory.pathLength) * 2)) / 100));
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
            Memory.rooms[room.name].Mineral = room.find(FIND_MINERALS).length ?
            room.find(FIND_MINERALS)[0].mineralType :
            "NONE";

        // Bump this number whenever the placement RULES change. Any room that was
        // checked under an older version will be re-checked once. (2 -> 3 because the
        // placement now comes from the standalone BaseFinder module.)
        const baseLocationVersion = 3;
        if (Memory.rooms[room.name].BaseChecked &&
            Memory.rooms[room.name].BaseLocationVersion === baseLocationVersion)
            return;

        // Find all energy sources in the room and remember how many there are
        const sources = room.find(FIND_SOURCES);
        const sourceQty = sources.length;

        // If there are no sources, mark the room incompatible and stop
        if (sourceQty < 1) {
            Memory.rooms[room.name].BaseChecked = true;
            Memory.rooms[room.name].BaseLocationVersion = baseLocationVersion;
            Memory.rooms[room.name].BaseCompatible = false;
            return;
        }

        // Do the heavy lifting in the separate module. It returns either null (nothing
        // fits) or an object like:
        //   { x, y, topLeft:{x,y}, width, height, tiles:[up to 150 tiles], safety,
        //     nearestSource, averageTarget, score }
        // Rules (5x5 minimum / 10x10 preferred block, up to 150 tiles, exit distance,
        // source distance) live in that file's DEFAULT_OPTIONS - pass an options object as the 2nd argument to
        // override them for a single call.
        const result = BaseFinder(room);

        // Mark the room as checked and save how many sources it had
        Memory.rooms[room.name].BaseChecked = true;
        Memory.rooms[room.name].BaseLocationVersion = baseLocationVersion;
        Memory.rooms[room.name].SourceQty = sourceQty;

        // If a base was found, save it in Memory and place a flag on its center
        if (result) {
            const basePosition = new RoomPosition(result.x, result.y, room.name);

            // BaseCompatible keeps its old meaning (the base center position), so any
            // other code that already reads it keeps working untouched.
            Memory.rooms[room.name].BaseCompatible = basePosition;

            // NEW: the extra data the old code never had. Kept small on purpose - the
            // tile list is NOT stored (it bloats Memory and is re-creatable by
            // calling BaseFinder(room) again whenever you need the exact tiles).
            Memory.rooms[room.name].BasePlan = {
                topLeft: result.topLeft, // corner of the solid square
                width: result.width, // square width  (5 to 10)
                height: result.height, // square height (5 to 10)
                safety: result.safety, // fewest steps from any base tile to an exit
                nearestSource: result.nearestSource, // steps from center to closest source
                score: result.score, // final score (higher is better)
                area: result.tiles.length // how many tiles the base area reached (max 150)
            };

            //if (!Memory.roomToClaim.includes(room.name))
            //    Memory.roomToClaim.push(room.name);

            // Move the existing flag, or create it if it does not exist yet
            const flagName = `C.${room.name}`;
            if (Game.flags[flagName]) Game.flags[flagName].setPosition(basePosition);
            else room.createFlag(basePosition.x, basePosition.y, flagName);
        } else {
            // Nothing fit under the rules: record that, and clear any stale plan
            Memory.rooms[room.name].BaseCompatible = false;
            delete Memory.rooms[room.name].BasePlan;
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
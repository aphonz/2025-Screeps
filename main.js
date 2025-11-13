/*
var STAT_NAME = "TowerStats";
functionsCondensedMain.startTracking(STAT_NAME);
//code here

functionsCondensedMain.endTracking(STAT_NAME);
*/
/// Options
var logCreepActive = true //not working
var remoteCreepHarvest = true //not working
const StatsEnabled = true;
var TargetAttackRoom = "W9S3"
//Memory.rooms.E13S58 = {}
//Memory.rooms.E13S58.avoid = '1';

// do you need to build?
var ToBuild = Game.constructionSites

// functions import
var Traveler = require('Traveler');
var functionsCondensedMain = require('CondensedMain');
var FunctionsSpawningCode = require('SpawningCode');
var FunctionsRoomInitalise = require('RoomInitalise')
var FunctionsRemoteRoomCode = require('RemoteRoomCode')
var FunctionsRoomTargetCreepSet = require('Functions.RoomTargetCreepSet');
var FunctionRoomClaiming = require('FunctionRoomClaiming');
var RoomBunkerBulderFunction = require('RoomBunkerBulderFunction');
var functionTradeManager = require('lib.tradeManager');
const RoomHelp = require('roomhelp');
const SpawnHelperHaulerManager = require('roomhelpSpawn');
//const FunctionRoomStamper = require('FunctionRoomStamper');
//const FunctionWallPlanner = require('FunctionWallPlanner');
const ManagerLabs = require('Manager.Labs');


//var functionTerminalBalancer = require('TerminalBalancer');

//import { updateRoomCreepMatrix } from 'Functions.RoomTargetCreepSet';

require('prototype.spawn')();
//var functionsCommon  = require('functions.common');
var lastResort = require("room.failSafe");
var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
var roleBuilder = require('role.builder');
var roleMiner = require('role.Miner');
var roleMiner2 = require('role.Miner2');
var roleExtractor = require('role.extractor');
var roleHauler = require('role.hauler');
var roleRepairer = require('role.repairer');
var roleWallRepairer = require('role.wallrepairer');
var roleBalancer = require('role.balancer');
var roleFatUpgrader = require('role.fatUpgrader');
var roleAttackCreep = require('role.AttackCreep');
var roleRemoteHarvester = require('role.remoteHarvester');
var roleTower = require('role.tower');
var roleClaim = require('role.claim');
var roleReserve = require('role.Reserve');
var roleRemoteRoomScout = require('role.RemoteRoomScout');
var roleRemoteGuardian = require('role.remoteGuardian');
const roleHelperHauler = require('role.helperhauler');
const roleLabHauler = require('role.LabHauler');
const roleUpgraderHauler = require('role.UpgraderHauler');	



const roleActions = { //DONT FORGET THE FREEKING COMMA
	harvester: roleHarvester.run,
	upgrader: roleUpgrader.run,
	builder: roleBuilder.run,
	miner: roleMiner.run,
	miner2: roleMiner2.run,
	extractor: roleExtractor.run,
	balancer: roleBalancer.run,
	hauler: roleHauler.run,
	FatUpgrader: roleFatUpgrader.run,
	WallRepairer: roleWallRepairer.run,
	Repairer: roleRepairer.run,
	AttackCreep: roleAttackCreep.run,
	remoteHarvester: roleRemoteHarvester.run,
	claim: roleClaim.run,
	reserver: roleReserve.run,
	RemoteRoomScout: roleRemoteRoomScout.run,
	RemoteGuardian: roleRemoteGuardian.run,
	helperHauler: roleHelperHauler.run,
	LabHauler: roleLabHauler.run,
	roleLabHauler: roleLabHauler.run,
	upgraderHauler: roleUpgraderHauler.run

};


module.exports.loop = function() {

      
      
	if (!Memory.username) {
		let spawn = Game.spawns[Object.keys(Game.spawns)[0]];
		if (spawn && spawn.owner) {
			Memory.username = spawn.owner.username;
			console.log(`Set Memory.username to: ${Memory.username}`);
		}
	}


	if (!Memory.MainRoom) {
		Memory.MainRoom = Game.spawns['Spawn1'].room.name;
	} // Assign spawn1's room name to Memory.MainRoom
	var myRoomName = Memory.MainRoom;
	var MainRoom = Memory.MainRoom;



	// Cleaning scripts
	functionsCondensedMain.Clean(Game);
	// Pixel Generation MMO Code
	functionsCondensedMain.PixelsGenrate(Game);
	// Room memory layouts
	if (Memory.Initalised != "10") {
		FunctionsRoomInitalise.Main(Game);
		//Did the room Inialise Fuck up??
		if (Memory.Initalised != "10") {
			console.log("Room Not Initalised")
			return;
		}
	}

	//Wite rooms with spawns to memory 
	functionsCondensedMain.updateSpawnRoomMemory()
	//SafeMode CMD
	lastResort.saveMyRoom(Game);



	if (Game.time % 25 === 0) {
		//let startCPU = Game.cpu.getUsed()
		FunctionsRemoteRoomCode.analyzeOwnedRooms(Game);
		//let usedCPU = (Game.cpu.getUsed() - startCPU)
		//console.log("CPU USED START " + startCPU + " Analysis used " + usedCPU );
	}
	//Rooms LEVEL 
	if (Game.time % 500 === 0) { // 8 times a day update the rooms levels
		functionsCondensedMain.RoomsLevelMemory(Game);
		FunctionRoomClaiming.manageRoomClaiming(Game);
	}

	//creep active in each room based on home and add to room.RoomName.Role
	functionsCondensedMain.CreepAliveHomeMemory(Game);

	//update rooms target screeps 
	FunctionsRoomTargetCreepSet.updateRoomCreepMatrix(Game);

var STAT_NAME = "SpawningStats";
functionsCondensedMain.startTracking(STAT_NAME);
//code here


	// all room spawning 

	for (let spawnName in Game.spawns) {
		const spawn = Game.spawns[spawnName];

		// Skip if no room/controller or controller level < 1
		if (!spawn.room || !spawn.room.controller || spawn.room.controller.level < 1) continue;

		// Derive a stable numeric key: prefer trailing number on spawn name, else room name hash
		let keyNum;
		const m = spawn.name.match(/(\d+)$/);
		if (m) {
			keyNum = Number(m[1]);
		}

		// Compare last digit of Game.time with last digit of keyNum
		if ((keyNum % 10) !== (Game.time % 10)) {
			continue; // not this spawn's turn
		}

		// Run updateRoomSources only when this spawn's slot matches current tick (0..99)
		if ((keyNum % 100) === (Game.time % 100)) {
			functionsCondensedMain.updateRoomSources(spawn);
		}

		// Ensure Memory.rooms and source data exists
		Memory.rooms = Memory.rooms || {};
		Memory.rooms[spawn.room.name] = Memory.rooms[spawn.room.name] || {};
		if (!Memory.rooms[spawn.room.name].Source1) {
			const sources = spawn.room.find(FIND_SOURCES);
			sources.forEach((source, index) => {
				Memory.rooms[spawn.room.name][`Source${index + 1}`] = source.id;
			});
		}

		// Step 1: Urgent spawning
		// if (FunctionsUrgentSpawning.manageSpawning(Game)) continue;

		// Step 2: Role-based spawning
		const targets = Memory.rooms[spawn.room.name].TargetScreep || {};
		for (let role in targets) {
			const target = targets[role];
			if (!target) continue;

			const targetQty = target.qty || 0;
			if (targetQty === 0) continue;

			const activeQty = Memory.rooms[spawn.room.name].ActiveScreeps[role] || 0;
			if (activeQty >= targetQty) continue;

			// If spawn became busy while iterating roles, stop checking roles for this spawn
			if (spawn.spawning) break;

			const newName = `${role}${Game.time}`;
			const WorkerParts = Array.isArray(target.template) ? [...target.template] : [WORK, CARRY, MOVE];
			const SIZE = target.size || 1;
			const creepMemory = target.memory || {
				Importedmemory: "none"
			};
			creepMemory.role = role;

			//console.log(`Spawning new ${role}: ${newName} in room ${spawn.room.name} from ${spawn.name}`);

			const body = FunctionsSpawningCode.BuildBody(spawn.room.name, SIZE, WorkerParts);
			const result = spawn.spawnCreep(body, newName, {
				memory: creepMemory
			});

			if (result === OK) {
				// spawn started successfully; move to the next spawn (don't let this return stop other spawns)
				break; // stop checking further roles for this spawn this tick
			} else {
				// spawn didn't start; log and continue checking other roles for this spawn
				console.log(`spawnCreep failed for ${newName}: ${result}`);
				continue;
			}
		}

		// energy threshold fallback — continue to next spawn rather than returning from whole function
		if ((Game.rooms[spawn.room.name].energyCapacityAvailable * 0.5) >= (Game.rooms[spawn.room.name]
				.energyAvailable)) {
			continue;
		}

		// Step 3: Tactical spawning
		if (FunctionRoomClaiming.spawnClaimingUnits(spawn)) {
			continue;
		}

		// Step 4: Remote room spawning
		if (FunctionsRemoteRoomCode.manageSpawning(spawn)) {
			continue;
		}
	}
functionsCondensedMain.endTracking(STAT_NAME);


	// Iterate over all your spawns
	for (let spawnName in Game.spawns) {
		const spawn = Game.spawns[spawnName];

		// Add visual representation for spawning creeps
		if (spawn.spawning) {
			const spawningCreep = Game.creeps[spawn.spawning.name];
			spawn.room.visual.text(
				'🛠️' + spawningCreep.memory.role,
				spawn.pos.x + 1,
				spawn.pos.y, {
					align: 'left',
					opacity: 0.8
				}
			);
		} else {
			// Renew creeps within range and below 2000 ticks to live
			const creepsNearSpawn = spawn.pos.findInRange(FIND_MY_CREEPS, 1);

			creepsNearSpawn.forEach(creep => {
				if (creep.memory.renewable &&
					creep.ticksToLive && creep.ticksToLive < 1350) {

					const result = spawn.renewCreep(creep);

					if (result === ERR_NOT_ENOUGH_ENERGY) {
						console.log(`${creep.name} needs more energy to renew.`);
					} else if (result === OK) {
						spawn.room.visual.text(
							'🛠️ RENEWING 🛠️',
							spawn.pos.x + 1,
							spawn.pos.y, {
								align: 'left',
								opacity: 0.8
							}
						);
					}
				}
			});
		}
	}


if (!Memory.cpuStats) Memory.cpuStats = {};
if (!Memory.cpuStats.creeps) Memory.cpuStats.creeps = { total: 0, runs: 0, average: 0, lastTick: 0 };
if (!Memory.cpuStats.roles) Memory.cpuStats.roles = {};

const startAll = Game.cpu.getUsed();

for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    creep.suicide;
    const role = creep.memory.role;
    //if (role == "LabHauler"){creep.suicide};
    const action = roleActions[role];
    if (!action) continue;

    const start = Game.cpu.getUsed();
    action(creep);
    const end = Game.cpu.getUsed();
    const used = end - start;

    // Init role stats if missing
    if (!Memory.cpuStats.roles[role]) {
        Memory.cpuStats.roles[role] = { total: 0, runs: 0, average: 0, lastTick: 0, unitTotal: 0, unitAvg: 0 };
    }

    const rStats = Memory.cpuStats.roles[role];
    rStats.total += used;
    rStats.runs += 1;
    rStats.lastTick = used;
    rStats.average = rStats.total / rStats.runs;

    // Track unit count (how many creeps of this role this tick)
    const unitCount = _.filter(Game.creeps, c => c.memory.role === role).length;
    rStats.unitTotal += unitCount;
    rStats.unitAvg = rStats.unitTotal / rStats.runs;

    // Cleanup every 500 ticks
    if (Game.time % 500 === 0 && rStats.runs > 400) {
        const reduceBy = rStats.runs - 400;
        rStats.runs -= reduceBy;
        rStats.total -= reduceBy * rStats.average;
        rStats.unitTotal -= reduceBy * rStats.unitAvg;
        rStats.average = rStats.total / rStats.runs;
        rStats.unitAvg = rStats.unitTotal / rStats.runs;
    }
}

const endAll = Game.cpu.getUsed();
const usedAll = endAll - startAll;

// --- Update total creep stats ---
const cStats = Memory.cpuStats.creeps;
cStats.total += usedAll;
cStats.runs += 1;
cStats.lastTick = usedAll;
cStats.average = cStats.total / cStats.runs;

if (Game.time % 500 === 0 && cStats.runs > 400) {
    const reduceBy = cStats.runs - 400;
    cStats.runs -= reduceBy;
    cStats.total -= reduceBy * cStats.average;
    cStats.average = cStats.total / cStats.runs;
}


var STAT_NAME = "TowerStats";
functionsCondensedMain.startTracking(STAT_NAME);


	const updateTowerRooms = () => {
		// Only update every 500 ticks
		if (Game.time % 500 !== 0) return;

		// Ensure memory exists
		if (!Memory.towerRooms) Memory.towerRooms = [];

		Memory.towerRooms.length = 0; // Properly clear but maintain reference
		Memory.towerCache = {}; // Reset tower cache

		for (const roomName of Object.keys(Game.rooms)) {
			const room = Game.rooms[roomName];
			if (!room) continue; // Skip rooms where we lack visibility

			const towers = room.find(FIND_STRUCTURES, {
				filter: structure => structure.structureType === STRUCTURE_TOWER
			});

			if (towers.length > 0) {
				Memory.towerRooms.push(roomName); // Store the room
				Memory.towerCache[roomName] = towers.map(tower => tower.id); // Cache towers by room
			}
		}
	};



	const runRoomTowers = (roomName) => {
		if (!Memory.towerCache || !Memory.towerCache[roomName]) return;

		const towerIds = Memory.towerCache[roomName];
		if (!towerIds.length) return;

		const room = Game.rooms[roomName];
		if (!room) return;

		try {
			const closestHostile = room.find(FIND_HOSTILE_CREEPS, {
				filter: cr => cr.owner.username !== 'Jeally_Rabbit' && cr.owner.username !== 'insain'
			})[0];

			const closestDamagedAlly = room.find(FIND_MY_CREEPS, {
				filter: creep => creep.hits < creep.hitsMax
			})[0];

			const closestDamagedStructure = room.find(FIND_STRUCTURES, {
				filter: structure =>
					structure.hits < structure.hitsMax &&
					structure.structureType !== STRUCTURE_WALL &&
					structure.structureType !== STRUCTURE_RAMPART
			})[0] || room.find(FIND_STRUCTURES, {
				filter: structure => structure.hits < 3000 && structure.structureType ===
					STRUCTURE_RAMPART
			})[0];

			if (closestHostile) {
				towerIds.forEach(towerId => {
					const tower = Game.getObjectById(towerId);
					if (tower) tower.attack(closestHostile);
				});
			} else if (closestDamagedAlly) {
				towerIds.forEach(towerId => {
					const tower = Game.getObjectById(towerId);
					if (tower) tower.heal(closestDamagedAlly);
				});
			} else if (closestDamagedStructure) {
				towerIds.forEach(towerId => {
					const tower = Game.getObjectById(towerId);
					if (tower) tower.repair(closestDamagedStructure);
				});
			}
		} catch (error) {
			console.log(`Error in tower logic for room ${roomName}:`, error);
		}
	};

	// **Ensure update before running**
	updateTowerRooms();

	if (Array.isArray(Memory.towerRooms)) {
		for (const roomName of Memory.towerRooms) {
			runRoomTowers(roomName);
		}
	} else {
		console.log("Memory.towerRooms is not an array, skipping tower execution.");
	}
	//for all rooms
	for (const roomName in Game.rooms) {
		const room = Game.rooms[roomName];

		//functionsCondensedMain.findBaseLocation(room);

	}
    functionsCondensedMain.endTracking(STAT_NAME);

	
	//for all rooms 1 at a time 
	if (!Memory.slowroomCheck) Memory.slowroomCheck = { list: Object.keys(Game.rooms), i: 0 };
    let sc = Memory.slowroomCheck;
    if (!sc.list.length || sc.i >= sc.list.length) { sc.list = Object.keys(Game.rooms); sc.i = 0; }
    let slowroom = Game.rooms[sc.list[sc.i]];
    //slow funtions here
    if (slowroom) functionsCondensedMain.findBaseLocation(slowroom);

    sc.i++;
    
	//Global funtions
	//FunctionsRemoteRoomCode.refreshUnexploredRooms();

	//for rooms with spwans 
var STAT_NAME = "roomswithSpawns";
    functionsCondensedMain.startTracking(STAT_NAME);//Tracking Start
	for (const roomNameWithSpawn of Memory.spawnRooms) {
	    //console.log(roomNameWithSpawn);
		RoomBunkerBulderFunction.buildBunker(roomNameWithSpawn)
		functionsCondensedMain.tagRenewablesForRoom(roomNameWithSpawn);
		functionsCondensedMain.findLinks(roomNameWithSpawn);
		ManagerLabs.run(roomNameWithSpawn);
	}
	functionsCondensedMain.endTracking(STAT_NAME);//Tracking End
	
    var STAT_NAME = "Trader";
    functionsCondensedMain.startTracking(STAT_NAME);//Tracking Start
    //if((Game.time+6) % 10 == 0){
		functionTradeManager.run()
		//console.log(JSON.stringify(functionTradeManager.getStats(), null, 2));
	//}	
	functionsCondensedMain.endTracking(STAT_NAME);//Tracking End
	
	var STAT_NAME = "Helper";
    functionsCondensedMain.startTracking(STAT_NAME);//Tracking Start 
	RoomHelp.scanRoomsForHelp({
		minEnergyThreshold: 1200,
		maxRequestsPerTick: 8
	});
	SpawnHelperHaulerManager.spawnFromRequests();
	functionsCondensedMain.endTracking(STAT_NAME);//Tracking End
	// FunctionRoomStamper('W12S2');
	//FunctionRoomStamper.placeRoomStampsByName(room.name);
	//FunctionWallPlanner.run('W12S2');
	//console.log('made it to the end');


	if (StatsEnabled == true) {
	    var CreepCount =  Object.keys(Game.creeps).length;
		var totalTime = Game.cpu.getUsed();
		var statsConsole = require("statsConsole");
		// sample data format ["Name for Stat", variableForStat]
		let myStats = [
		    ["Creeps CPU", Memory.cpuStats.creeps.lastTick],
		    ["Creeps AVG", Memory.cpuStats.creeps.average],
		    ["Creeps #", CreepCount],
			["Spawn Calc", Memory.cpuStats.SpawningStats.average],
			["tower Avg", Memory.cpuStats.TowerStats.average],
			["Trader Avg", Memory.cpuStats.Trader.average ],
			["helper avg", Memory.cpuStats.Helper.average ],
			["roomsWithSpawns Stats", Memory.cpuStats.roomswithSpawns.average ]
			/*["Creep Managers", CreepManagersCPUUsage],
        	["Towers", towersCPUUsage],
        	["Links", linksCPUUsage],
        	["Setup Roles", SetupRolesCPUUsage],
        	
        	["Init", initCPUUsage],
        	["Stats", statsCPUUsage],
    	    ["Total", totalCPUUsage] */
		];

		statsConsole.run(myStats); // Run Stats collection
		if (totalTime > Game.cpu.limit) {
			statsConsole.log("Tick: " + Game.time + "  CPU OVERRUN: " + Game.cpu.getUsed().toFixed(2) +
				"  Bucket:" + Game.cpu.bucket, 5);
		}
		if ((Game.time % 50) === 0) {
			console.log(statsConsole.displayHistogram());
			console.log(statsConsole.displayStats());
			console.log(statsConsole.displayLogs());
			totalTime = (Game.cpu.getUsed() - totalTime);
			console.log(functionsCondensedMain.displayRoleHistogram());
			console.log("Time to Draw: " + totalTime.toFixed(2));
		}
	}

};

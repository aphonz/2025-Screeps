module.exports = {
  buildBunker: function buildBunker(roomName) {
    // ### Initialization and Guards
    const TICK_INTERVAL = 73;
    const MAX_SITES_PER_RUN = 10;

    if (!roomName) return;
    const room = Game.rooms[roomName];
    if (!room || !room.controller || !room.controller.my) return;
    if (Game.time % TICK_INTERVAL !== 0) return;

    // ### Memory Normalization
    Memory.rooms = Memory.rooms || {};
    Memory.rooms[room.name] = Memory.rooms[room.name] || {};
    const roomMemory = Memory.rooms[room.name];
    if (!roomMemory.Bunker || typeof roomMemory.Bunker !== 'object') {
      roomMemory.Bunker = { planned: [], built: [], lastRun: 0 };
    } else {
      if (!Array.isArray(roomMemory.Bunker.planned)) roomMemory.Bunker.planned = [];
      if (!Array.isArray(roomMemory.Bunker.built)) roomMemory.Bunker.built = [];
      if (typeof roomMemory.Bunker.lastRun !== 'number') roomMemory.Bunker.lastRun = 0;
    }

    // ### Templates and Configuration
    const maxStructuresPerLevel = {
      [STRUCTURE_EXTENSION]: [0,0,5,10,20,30,40,50,60],
      [STRUCTURE_TOWER]:     [0,0,0,1,1,2,2,3,6],
      [STRUCTURE_STORAGE]:   [0,0,0,0,1,1,1,1,1],
      [STRUCTURE_LINK]:      [0,0,0,0,2,3,4,5,6],
      [STRUCTURE_LAB]:       [0,0,0,0,0,3,3,6,10],
      [STRUCTURE_NUKER]:     [0,0,0,0,0,0,0,0,1],
      [STRUCTURE_TERMINAL]:  [0,0,0,0,0,1,1,1,1],
      [STRUCTURE_POWER_SPAWN]: [0,0,0,0,0,0,1,1,1],
      [STRUCTURE_FACTORY]:   [0,0,0,0,0,0,0,1,1],
      [STRUCTURE_OBSERVER]:  [0,0,0,0,0,0,0,1,1],
      [STRUCTURE_SPAWN]:     [1,1,1,1,1,1,1,2,3]
    };

    const structureMinRCL = {
      [STRUCTURE_SPAWN]: 1, [STRUCTURE_EXTENSION]: 2, [STRUCTURE_ROAD]: 1,
      [STRUCTURE_CONTAINER]: 1, [STRUCTURE_TOWER]: 3, [STRUCTURE_STORAGE]: 4,
      [STRUCTURE_LINK]: 5, [STRUCTURE_WALL]: 2, [STRUCTURE_RAMPART]: 2,
      [STRUCTURE_OBSERVER]: 8, [STRUCTURE_POWER_SPAWN]: 8, [STRUCTURE_EXTRACTOR]: 6,
      [STRUCTURE_LAB]: 6, [STRUCTURE_TERMINAL]: 6, [STRUCTURE_FACTORY]: 7,
      [STRUCTURE_NUKER]: 8
    };

    const bunkerTemplate = [
      ["0","R","R","R","C","R","R","R","C","R","R","R","0"],
      ["R","C","C","C","R","C","C","C","R","C","C","C","R"],
      ["R","C","C","R","C","R","C","R","C","R","C","C","R"],
      ["R","C","R","C","C","C","R","C","C","C","R","C","R"],
      ["C","R","C","C","C","R","S","R","C","C","C","R","C"],
      ["R","C","R","C","R","T","R","T","R","C","R","C","R"],
      ["R","C","C","R","S","T","R","T","P","R","C","C","R"],
      ["R","C","R","C","R","T","R","T","R","N","R","C","R"],
      ["C","R","C","C","C","R","S","R","Tm","Lb","Lb","R","C"],
      ["R","C","R","C","L","R","R","R","Lb","Lb","R","Lb","R"],
      ["R","C","C","R","C","R","St","R","Lb","R","Lb","Lb","R"],
      ["R","C","C","C","R","0","R","0","R","Lb","Lb","0","R"],
      ["0","R","R","R","C","R","R","R","C","R","R","R","O"]
    ];




    const structureMapping = {
      "S":  { type: STRUCTURE_SPAWN,      minRCL: 1 },
      "C":  { type: STRUCTURE_EXTENSION,  minRCL: 2 },
      "R":  { type: STRUCTURE_ROAD,       minRCL: 1, lowPriority: true },
      "CT": { type: STRUCTURE_CONTAINER,  minRCL: 1 },
      "T":  { type: STRUCTURE_TOWER,      minRCL: 3 },
      "St": { type: STRUCTURE_STORAGE,    minRCL: 4 },
      "L":  { type: STRUCTURE_LINK,       minRCL: 5 },
      "W":  { type: STRUCTURE_WALL,       minRCL: 2 },
      "Ra": { type: STRUCTURE_RAMPART,    minRCL: 2 },
      "O":  { type: STRUCTURE_OBSERVER,   minRCL: 8 },
      "P":  { type: STRUCTURE_POWER_SPAWN,minRCL: 8 },
      "Ex": { type: STRUCTURE_EXTRACTOR,  minRCL: 6 },
      "Lb": { type: STRUCTURE_LAB,        minRCL: 6 },
      "Tm": { type: STRUCTURE_TERMINAL,   minRCL: 6 },
      "F":  { type: STRUCTURE_FACTORY,    minRCL: 7 },
      "N":  { type: STRUCTURE_NUKER,      minRCL: 8 }
    };

    // ### Center Flag and Snapshot
    const centerFlag = room.find(FIND_FLAGS, { filter: f => f.name === `C.${room.name}` })[0];
    if (!centerFlag) return;
    const centerX = centerFlag.pos.x;
    const centerY = centerFlag.pos.y;

    const realStructures = room.find(FIND_STRUCTURES);
    const builtSet = new Set();
    const normalizedBuilt = [];
    for (const s of realStructures) {
      const key = `${s.pos.x},${s.pos.y},${s.structureType}`;
      builtSet.add(key);
      normalizedBuilt.push({ x: s.pos.x, y: s.pos.y, type: s.structureType });
    }
    roomMemory.Bunker.built = normalizedBuilt;

    const currentSites = room.find(FIND_CONSTRUCTION_SITES);
    const siteSet = new Set(currentSites.map(cs => `${cs.pos.x},${cs.pos.y},${cs.structureType}`));

    // ### Prune Planned
    const newPlanned = [];
    const plannedSeen = new Set();
    for (const p of roomMemory.Bunker.planned) {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !p.type) continue;
      const key = `${p.x},${p.y},${p.type}`;
      if (plannedSeen.has(key)) continue;
      plannedSeen.add(key);
      if (builtSet.has(key)) continue;
      if (siteSet.has(key)) {
        newPlanned.push(p);
        continue;
      }
    }
    roomMemory.Bunker.planned = newPlanned;

    // ### Build Template Queue
    const existingCounts = {};
    for (const s of realStructures) existingCounts[s.structureType] = (existingCounts[s.structureType] || 0) + 1;
    for (const cs of currentSites) existingCounts[cs.structureType] = (existingCounts[cs.structureType] || 0) + 1;

    const controllerLevel = room.controller.level;
    const queue = [];
    for (let y = bunkerTemplate.length - 1; y >= 0; y--) {
      for (let x = 0; x < bunkerTemplate[y].length; x++) {
        const code = bunkerTemplate[y][x];
        if (code === "0") continue;
        const map = structureMapping[code];
        if (!map) continue;
        if (controllerLevel < map.minRCL) continue;

        const posX = centerX + x - 6;
        const posY = centerY + y - 6;
        const pos = new RoomPosition(posX, posY, room.name);

        const terrain = room.lookForAt(LOOK_TERRAIN, pos)[0];
        if (terrain === 'wall') continue;

        const type = map.type;
        const maxAllowed = (maxStructuresPerLevel[type] && maxStructuresPerLevel[type][controllerLevel]) || Infinity;
        const already = (existingCounts[type] || 0);
        if (already >= maxAllowed) continue;

        const key = `${posX},${posY},${type}`;
        if (builtSet.has(key)) continue;
        if (siteSet.has(key)) continue;
        queue.push({ pos, key, type, priority: map.lowPriority ? 2 : 1 });
      }
    }

    queue.sort((a, b) => a.priority - b.priority);

    let availableSlots = Math.max(0, MAX_SITES_PER_RUN - currentSites.length);
    for (const entry of queue) {
      if (availableSlots <= 0) break;
      const type = entry.type;
      const maxAllowed = (maxStructuresPerLevel[type] && maxStructuresPerLevel[type][controllerLevel]) || Infinity;
      const currentCount = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === type }).length;
      const currentSiteCount = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === type }).length;
      if (currentCount + currentSiteCount >= maxAllowed) continue;

      const createResult = room.createConstructionSite(entry.pos, type);
      if (createResult === OK) {
        roomMemory.Bunker.planned.push({ x: entry.pos.x, y: entry.pos.y, type: entry.type });
        siteSet.add(entry.key);
        availableSlots--;
      } else {
        siteSet.add(entry.key);
      }
    }

    // ### Rampart Blanket
    if (controllerLevel >= 2 && availableSlots > 0) {
      const innerOffsets = [-6, 6];
      for (const offset of innerOffsets) {
        for (let i = -7; i <= 7 && availableSlots > 0; i++) {
          const posA = new RoomPosition(centerX + offset, centerY + i, room.name);
          const posB = new RoomPosition(centerX + i, centerY + offset, room.name);
          for (const pos of [posA, posB]) {
            if (pos.x < 0 || pos.x > 49 || pos.y < 0 || pos.y > 49) continue;
            const terrain = room.lookForAt(LOOK_TERRAIN, pos)[0];
            if (terrain === 'wall') continue;
            const rampKey = `${pos.x},${pos.y},${STRUCTURE_RAMPART}`;
            const simpleKey = `${pos.x},${pos.y}`;
            if (builtSet.has(rampKey) || siteSet.has(rampKey) || roomMemory.Bunker.planned.some(p => `${p.x},${p.y}` === simpleKey)) continue;
            const rc = room.createConstructionSite(pos, STRUCTURE_RAMPART);
            if (rc === OK) {
              roomMemory.Bunker.planned.push({ x: pos.x, y: pos.y, type: STRUCTURE_RAMPART });
              siteSet.add(rampKey);
              availableSlots--;
              if (availableSlots <= 0) break;
            } else {
              siteSet.add(rampKey);
            }
          }
        }
        if (availableSlots <= 0) break;
      }
    }

    // ### Storage Target Selection
    let storageTarget = null;
    if (room.storage && room.storage.pos) {
      storageTarget = room.storage.pos;
    } else {
      for (let y = 0; y < bunkerTemplate.length && !storageTarget; y++) {
        for (let x = 0; x < bunkerTemplate[y].length && !storageTarget; x++) {
          if (bunkerTemplate[y][x] === "St") {
            const absX = centerX + x - 6;
            const absY = centerY + y - 6;
            storageTarget = new RoomPosition(absX, absY, room.name);
          }
        }
      }
      if (!storageTarget) storageTarget = centerFlag.pos;
    }

    // ### Extractor Placement
    const mineral = room.find(FIND_MINERALS)[0];
    if (mineral) {
      const extractorHere = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_EXTRACTOR && s.pos.isEqualTo(mineral.pos)
      })[0];
      if (!extractorHere) {
        const exKey = `${mineral.pos.x},${mineral.pos.y},${STRUCTURE_EXTRACTOR}`;
        if (!siteSet.has(exKey) && availableSlots > 0) {
          const rc = room.createConstructionSite(mineral.pos, STRUCTURE_EXTRACTOR);
          if (rc === OK) {
            roomMemory.Bunker.planned.push({ x: mineral.pos.x, y: mineral.pos.y, type: STRUCTURE_EXTRACTOR });
            siteSet.add(exKey);
            availableSlots = Math.max(0, availableSlots - 1);
          } else {
            siteSet.add(exKey);
          }
        }
      }
    }

    // ### Road planner: sources, controller, mineral -> storageTarget
    (function buildRoadsToStorage(room, roomMemory, bunkerTemplate, centerX, centerY, storageTarget, MAX_SITES_PER_RUN) {
      if (!room || !room.controller || !storageTarget) return;

      // gather origins: all sources, controller pos, mineral (if present)
      const origins = [];
      const sources = room.find(FIND_SOURCES);
      for (const s of sources) origins.push(s.pos);
      if (room.controller && room.controller.pos) origins.push(room.controller.pos);
      const mineralLocal = room.find(FIND_MINERALS)[0];
      if (mineralLocal) origins.push(mineralLocal.pos);

      if (origins.length === 0) return;

      // quick global/site slot checks
      if (Object.keys(Game.constructionSites || {}).length >= 100) return;

      // only place roads while no non-road construction sites exist
      const allSitesStart = room.find(FIND_CONSTRUCTION_SITES);
      if (allSitesStart.some(s => s.structureType !== STRUCTURE_ROAD)) return;

      // helper: check/create minimal slots remaining
      const getAvailableSlots = () => Math.max(0, MAX_SITES_PER_RUN - room.find(FIND_CONSTRUCTION_SITES).length);

      // helper: small bounding box pad
      const PAD = 6;

      // precompute built/planned simple sets for quick avoidance lookups
      const builtSimple = new Set((room.find(FIND_STRUCTURES) || []).map(s => `${s.pos.x},${s.pos.y}`));
      const plannedSimple = new Set((roomMemory.Bunker.planned || []).map(p => `${p.x},${p.y}`));
      const existingSitesSimple = new Set(allSitesStart.map(s => `${s.pos.x},${s.pos.y}`));

      // gather existing road tiles (structures + construction sites + planned) - treat construction sites as roads
      const existingRoads = new Set();
      for (const s of room.find(FIND_STRUCTURES)) {
        if (s.structureType === STRUCTURE_ROAD) existingRoads.add(`${s.pos.x},${s.pos.y}`);
      }
      for (const cs of allSitesStart) {
        if (cs.structureType === STRUCTURE_ROAD) existingRoads.add(`${cs.pos.x},${cs.pos.y}`);
      }
      for (const p of roomMemory.Bunker.planned || []) {
        if (p.type === STRUCTURE_ROAD) existingRoads.add(`${p.x},${p.y}`);
      }

      // iterate deterministically over origins (sort by x then y)
      origins.sort((a, b) => (a.x - b.x) || (a.y - b.y));

      const terrain = room.getTerrain();
      const structures = room.find(FIND_STRUCTURES);
      const creeps = room.find(FIND_CREEPS);

      for (const origin of origins) {
        // recompute available slots and global cap per origin
        let slots = getAvailableSlots();
        if (slots <= 0) break;
        if (Object.keys(Game.constructionSites || {}).length >= 100) break;

        // compute bounding box between origin and storageTarget
        const minX = Math.max(0, Math.min(origin.x, storageTarget.x) - PAD);
        const minY = Math.max(0, Math.min(origin.y, storageTarget.y) - PAD);
        const maxX = Math.min(49, Math.max(origin.x, storageTarget.x) + PAD);
        const maxY = Math.min(49, Math.max(origin.y, storageTarget.y) + PAD);

        // build avoid set limited to bounding box (but allow origin and storageTarget)
        const avoid = new Set();
        for (let y = 0; y < bunkerTemplate.length; y++) {
          for (let x = 0; x < bunkerTemplate[y].length; x++) {
            if (bunkerTemplate[y][x] === "0") continue;
            const ax = centerX + x - 6;
            const ay = centerY + y - 6;
            if (ax < minX || ax > maxX || ay < minY || ay > maxY) continue;
            avoid.add(`${ax},${ay}`);
          }
        }
        for (const b of roomMemory.Bunker.built || []) {
          if (b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY) avoid.add(`${b.x},${b.y}`);
        }
        for (const p of roomMemory.Bunker.planned || []) {
          if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) avoid.add(`${p.x},${p.y}`);
        }
        for (const s of allSitesStart) {
          if (s.pos.x >= minX && s.pos.x <= maxX && s.pos.y >= minY && s.pos.y <= maxY) avoid.add(`${s.pos.x},${s.pos.y}`);
        }
        // ensure origin and storageTarget are allowed for pathing
        avoid.delete(`${origin.x},${origin.y}`);
        avoid.delete(`${storageTarget.x},${storageTarget.y}`);

        // prepare compact CostMatrix for bounding area
        const cm = new PathFinder.CostMatrix();
        for (let yy = minY; yy <= maxY; yy++) {
          for (let xx = minX; xx <= maxX; xx++) {
            if (terrain.get(xx, yy) === TERRAIN_MASK_WALL) {
              cm.set(xx, yy, 255);
              continue;
            }
            if (avoid.has(`${xx},${yy}`)) {
              cm.set(xx, yy, 255);
              continue;
            }
            // default leave as 0
          }
        }

        // favor existing roads (built structures + construction sites) inside bounding box
        for (const s of structures) {
          if (s.structureType === STRUCTURE_ROAD && s.pos.x >= minX && s.pos.x <= maxX && s.pos.y >= minY && s.pos.y <= maxY) {
            try { cm.set(s.pos.x, s.pos.y, 1); } catch(e) {}
          }
        }
        // treat road construction sites as existing roads for cost matrix
        for (const cs of allSitesStart) {
          if (cs.structureType === STRUCTURE_ROAD && cs.pos.x >= minX && cs.pos.x <= maxX && cs.pos.y >= minY && cs.pos.y <= maxY) {
            try { cm.set(cs.pos.x, cs.pos.y, 1); } catch(e) {}
          }
        }
        // also planned roads
        for (const p of roomMemory.Bunker.planned || []) {
          if (p.type === STRUCTURE_ROAD && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
            try { cm.set(p.x, p.y, 1); } catch(e) {}
          }
        }

        // ensure creeps do not block
        for (const c of creeps) {
          if (c.pos.x >= minX && c.pos.x <= maxX && c.pos.y >= minY && c.pos.y <= maxY) {
            try { cm.set(c.pos.x, c.pos.y, 1); } catch(e) {}
          }
        }

        // PathFinder options tuned to favor shorter roads
        const pfOpts = {
          plainCost: 2,
          swampCost: 10,
          maxOps: 4000,
          heuristicWeight: 1.2,
          roomCallback: (rn) => rn === room.name ? cm : undefined
        };

        // run PathFinder from origin to storageTarget (range 1)
        const pathResult = PathFinder.search(origin, { pos: storageTarget, range: 1 }, pfOpts);
        let finalPath = (pathResult && pathResult.path) ? pathResult.path : [];

        if (!finalPath || finalPath.length === 0) continue;

        // place sites along path - don't skip tiles that are part of the actual path
        const seenSites = new Set(room.find(FIND_CONSTRUCTION_SITES).map(s => `${s.pos.x},${s.pos.y}`));
        for (const step of finalPath) {
          if (slots <= 0) break;
          if (Object.keys(Game.constructionSites || {}).length >= 100) break;

          const key = `${step.x},${step.y}`;
          if (seenSites.has(key)) continue;
          if (step.x < 0 || step.x > 49 || step.y < 0 || step.y > 49) continue;
          if (terrain.get(step.x, step.y) === TERRAIN_MASK_WALL) { seenSites.add(key); continue; }

          // check if road already exists (structure or construction site)
          if (existingRoads.has(key)) { seenSites.add(key); continue; }

          const structsHere = room.lookForAt(LOOK_STRUCTURES, step.x, step.y);
          if (structsHere && structsHere.some(s => s.structureType === STRUCTURE_ROAD)) { seenSites.add(key); continue; }
          const sitesHere = room.lookForAt(LOOK_CONSTRUCTION_SITES, step.x, step.y);
          if (sitesHere && sitesHere.some(s => s.structureType === STRUCTURE_ROAD)) { seenSites.add(key); continue; }

          const rc = room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
          if (rc === OK) {
            roomMemory.Bunker.planned = roomMemory.Bunker.planned || [];
            roomMemory.Bunker.planned.push({ x: step.x, y: step.y, type: STRUCTURE_ROAD });
            seenSites.add(key);
            existingRoads.add(key);
            slots--;
          } else {
            seenSites.add(key);
          }
        }
      }
    })(room, roomMemory, bunkerTemplate, centerX, centerY, storageTarget, MAX_SITES_PER_RUN);

    // ### Final Housekeeping
    const finalPlanned = [];
    const seen = new Set();
    const realStructuresFinal = room.find(FIND_STRUCTURES);
    const builtSetFinal = new Set(realStructuresFinal.map(s => `${s.pos.x},${s.pos.y},${s.structureType}`));
    for (const p of roomMemory.Bunker.planned) {
      const key = `${p.x},${p.y},${p.type}`;
      if (seen.has(key)) continue;
      if (builtSetFinal.has(key)) continue;
      seen.add(key);
      finalPlanned.push(p);
    }
    roomMemory.Bunker.planned = finalPlanned;

    roomMemory.Bunker.built = realStructuresFinal.map(s => ({ x: s.pos.x, y: s.pos.y, type: s.structureType }));
    roomMemory.Bunker.lastRun = Game.time;
  }
};
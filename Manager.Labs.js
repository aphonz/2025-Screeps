// Manager.Labs.js
// Manages lab reactions and resource production
//
// Integration with lib.tradeManager:
// - Automatically sells room's harvested mineral when exceeding 11000 (keeps 10000 reserve)
// - Requests resources needed for reactions via purchase system
// - Prioritizes tier 1 (base minerals), then tier 2, then tier 3 compounds
// - Prefers to use room's own harvested mineral in reactions
//
// Config: LAB_CONFIG.mineralReserve (10000) - amount to keep of harvested mineral
//         LAB_CONFIG.mineralSellThreshold (11000) - sell when exceeding this
//         LAB_CONFIG.tier1/2/3MinAmount - minimum amounts to request for each tier
//         LAB_CONFIG.maxPurchasePrice (1.0) - max price to pay for auto-purchases

const REACTIONS = {
      OH: ['O','H'], UH: ['U','H'], UO: ['U','O'], KH: ['K','H'], KO: ['K','O'],
      LH: ['L','H'], LO: ['L','O'], ZH: ['Z','H'], ZO: ['Z','O'], GH: ['G','H'], GO: ['G','O'],
      UH2O: ['UH','O'], UHO2: ['UH','OH'], KH2O: ['KH','O'], KHO2: ['KH','OH'],
      LH2O: ['LH','O'], LHO2: ['LH','OH'], ZH2O: ['ZH','O'], ZHO2: ['ZH','OH'],
      GH2O: ['GH','O'], GHO2: ['GH','OH'],
      XUH2O: ['UH2O','X'], XUHO2: ['UHO2','X'], XKH2O: ['KH2O','X'],
      XLH2O: ['LH2O','X'], XZH2O: ['ZH2O','X'], XGH2O: ['GH2O','X']
    };

const DEFAULT_TARGET = 3000;
const TARGETS = Object.keys(REACTIONS).reduce((acc, out) => { acc[out] = DEFAULT_TARGET; return acc; }, {});
const LAB_CONFIG = {
  inputFill: { min: 1000, max: 5000 },
  outputDrainMin: 50,
  mineralReserve: 10000, // ensure terminal has this amount of Memory.rooms[room].Mineral
  mineralSellThreshold: 11000, // sell harvested mineral when exceeding this
  ignore: new Set(),    // populate with outputs to skip
  idleOutputs: ['GH2O','GHO2'], // fallback choices
  tier1MinAmount: 2000, // minimum amount of tier 1 resources to request
  tier2MinAmount: 1000, // minimum amount of tier 2 resources to request
  tier3MinAmount: 500,  // minimum amount of tier 3 resources to request
  maxPurchasePrice: 3.0 // maximum price to pay for resources
};

// Resource tiers for prioritized purchasing
const RESOURCE_TIERS = {
  tier1: [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM, 
          RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST, RESOURCE_GHODIUM],
  tier2: [RESOURCE_HYDROXIDE, RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_OXIDE, 
          RESOURCE_KEANIUM_HYDRIDE, RESOURCE_KEANIUM_OXIDE, RESOURCE_LEMERGIUM_HYDRIDE,
          RESOURCE_LEMERGIUM_OXIDE, RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_OXIDE,
          RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_OXIDE, RESOURCE_ZYNTHIUM_KEANITE,
          RESOURCE_UTRIUM_LEMERGITE],
  tier3: [RESOURCE_UTRIUM_ACID, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_KEANIUM_ACID,
          RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID, RESOURCE_LEMERGIUM_ALKALIDE,
          RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_GHODIUM_ACID,
          RESOURCE_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
          RESOURCE_CATALYZED_KEANIUM_ACID, RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
          RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
          RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
          RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ALKALIDE]
};

const LABS_DEFAULT = {
    inputs: [],         // Array of input lab IDs
    outputs: [],        // Array of output lab IDs
    boosters: [],       // Array of booster lab IDs (if used)
    tasks: [],          // Array of lab tasks for haulers
    TerminalRequire: {},// Resources needed in terminal
    current: null,      // Current reaction info
    boosterQueue: [],   // Queue for boost requests
};


const LabManager = {
  run: function run(roomName) {
    // Convert roomName (string) to Room object
    if (!roomName) return;
    const room = Game.rooms[roomName];
    if (!room || !room.controller.my || !room.terminal) return;

    //
    const rmem = Memory.rooms[roomName] = Memory.rooms[roomName] || {};
    rmem.LABS = rmem.LABS || JSON.parse(JSON.stringify(LABS_DEFAULT));
    const labsMem = rmem.LABS;

    // DEBUG: Log extractor container status
    if (Game.time % 10 === 0 && rmem.ExtractorContainer) {
      const cont = Game.getObjectById(rmem.ExtractorContainer);
      if (cont) {
        console.log(`[${roomName}] ExtractorContainer has:`, JSON.stringify(cont.store));
        console.log(`[${roomName}] Terminal has:`, JSON.stringify(room.terminal.store));
        console.log(`[${roomName}] Current tasks: ${labsMem.tasks.length}`);
      } else {
        console.log(`[${roomName}] ExtractorContainer ID is set but object not found`);
      }
    }

    // --- ALWAYS queue transfer tasks from extractor container to terminal
    // This ensures hauling occurs to keep terminal stocked with room mineral
    if (rmem.ExtractorContainer) {
      const cont = Game.getObjectById(rmem.ExtractorContainer);
      if (cont && cont.store) {
        // Iterate through all resources in the container using getUsedCapacity
        const resources = Object.keys(cont.store);
        for (const res of resources) {
          if (res === RESOURCE_ENERGY) continue; // skip energy unless you want it moved
          const amt = cont.store[res] || 0;
          if (amt <= 0) continue;
          const terminalHave = (room.terminal && room.terminal.store && (room.terminal.store[res] || 0)) || 0;
          const need = Math.max(0, LAB_CONFIG.mineralReserve - terminalHave);
          if (need > 0) {
            const transferAmount = Math.min(amt, need);
            // create a transfer task (no labId required)
            this.queueTask(labsMem, {
              type: 'transfer',
              labId: null,
              fromStructureId: cont.id,
              toStructureId: room.terminal.id,
              resource: res,
              amount: transferAmount
            });
          }
        }
      }
    }
    // --- end transfer tasks

    // If labs not discovered yet, populate now (don't wait 752 ticks)
    if (!Array.isArray(labsMem.inputs) || labsMem.inputs.length < 2 || !Array.isArray(labsMem.outputs) || labsMem.outputs.length === 0) {
      this.updateLabList(room, rmem);
    }

    if (Game.time % 752 === 0) {
          this.updateLabList(room, rmem);
    }
    
    //console.log(`LabManager running for room ${roomName}`);

    // 1) keep room mineral stocked in terminal and auto-sell excess
    this.ensureRoomMineral(room, rmem);

    // 2) request resources needed for lab reactions (runs every 100 ticks)
    if (Game.time % 100 === 0) {
      this.requestLabResources(room, rmem);
    }

    // 3) booster precedence
    if (this.handleBoosters(room, labsMem)) return;

    // 4) pick demand (skip ignored), if no demand choose idle
    let desired = this.pickDemand(room);
    const tried = new Set();
    labsMem.TerminalRequire = labsMem.TerminalRequire || {};

    while (desired) {
      const inputs = REACTIONS[desired];
      if (!inputs) break;

      const missing = this.checkIngredients(room, inputs);
      if (Object.keys(missing).length === 0) {
        // we have ingredients: assign current and ensure inputs stocked
        labsMem.current = { output: desired, input1: inputs[0], input2: inputs[1] };
        this.prepareInputs(room, labsMem, inputs[0], inputs[1]);
        this.runOutputs(room, labsMem);
        break;
      } else {
        // record missing amounts in TerminalRequire and try another demand
        Object.assign(labsMem.TerminalRequire, missing);
        tried.add(desired);
        desired = this.pickNextDemandExcluding(room, tried);
      }
    }

    // 4) ensure outputs are drained even if not running
    this.ensureOutputsDrained(room, labsMem);
  },

  ensureRoomMineral(room, rmem) {
    const mineralType = rmem.Mineral;
    if (!mineralType) return;
    const terminal = room.terminal;
    const have = terminal.store[mineralType] || 0;
    if (have < LAB_CONFIG.mineralReserve) {
      rmem.LABS = rmem.LABS || JSON.parse(JSON.stringify(LABS_DEFAULT));
      rmem.LABS.TerminalRequire = rmem.LABS.TerminalRequire || {};
      rmem.LABS.TerminalRequire[mineralType] = Math.max((rmem.LABS.TerminalRequire[mineralType]||0), LAB_CONFIG.mineralReserve - have);
    }
    
    // Auto-sell excess harvested mineral when above threshold
    if (have >= LAB_CONFIG.mineralSellThreshold) {
      const tradeManager = require('lib.tradeManager');
      const excess = have - LAB_CONFIG.mineralReserve;
      if (excess > 1000) {
        // Set a sell point to trigger automatic selling
        if (!Memory.Trade || !Memory.Trade.rooms || !Memory.Trade.rooms[room.name]) return;
        const sellPoint = Memory.Trade.rooms[room.name].sellPoint && Memory.Trade.rooms[room.name].sellPoint[mineralType];
        if (!sellPoint) {
          // Set a reasonable sell price if not configured
          Memory.Trade.rooms[room.name].sellPoint = Memory.Trade.rooms[room.name].sellPoint || {};
          Memory.Trade.rooms[room.name].sellPoint[mineralType] = 0.1; // Default sell price
        }
      }
    }
  },

  // Request resources needed for lab reactions via Trade Manager
  requestLabResources(room, rmem) {
    if (!room || !room.terminal) return;
    const tradeManager = require('lib.tradeManager');
    
    const mineralType = rmem.Mineral;
    const terminal = room.terminal;
    const storage = room.storage;
    
    // Helper to get total amount of resource
    const getTotalAmount = (res) => {
      let total = 0;
      if (terminal) total += terminal.store[res] || 0;
      if (storage) total += storage.store[res] || 0;
      return total;
    };
    
    // Get resources needed for current and potential reactions
    const neededResources = new Set();
    
    // Add resources for current reaction
    if (rmem.LABS && rmem.LABS.current) {
      const inputs = REACTIONS[rmem.LABS.current.output];
      if (inputs) {
        for (const res of inputs) {
          neededResources.add(res);
          // Also add ingredients for those inputs if they're compounds
          const subInputs = REACTIONS[res];
          if (subInputs) {
            for (const subRes of subInputs) {
              neededResources.add(subRes);
            }
          }
        }
      }
    }
    
    // Prioritize resources based on tiers, preferring room's own mineral
    const requestResource = (resource, tier, minAmount) => {
      // Skip if this is a compound we can produce
      if (REACTIONS[resource]) {
        const inputs = REACTIONS[resource];
        const canProduce = inputs.every(inp => getTotalAmount(inp) >= LAB_CONFIG.inputFill.min);
        if (canProduce) return; // Don't buy, we can make it
      }
      
      const have = getTotalAmount(resource);
      if (have < minAmount) {
        const needed = minAmount - have;
        tradeManager.setPurchaseRequest(room.name, resource, needed, LAB_CONFIG.maxPurchasePrice);
      }
    };
    
    // Tier 1: Base minerals (prioritize room's own mineral - already handled by mineralReserve)
    for (const res of RESOURCE_TIERS.tier1) {
      if (res === mineralType) continue; // Skip own mineral, handled by ensureRoomMineral
      if (neededResources.has(res) || getTotalAmount(res) < LAB_CONFIG.tier1MinAmount) {
        requestResource(res, 1, LAB_CONFIG.tier1MinAmount);
      }
    }
    
    // Tier 2: First-level compounds
    for (const res of RESOURCE_TIERS.tier2) {
      if (neededResources.has(res) || getTotalAmount(res) < LAB_CONFIG.tier2MinAmount) {
        requestResource(res, 2, LAB_CONFIG.tier2MinAmount);
      }
    }
    
    // Tier 3: Advanced compounds (only request if really needed)
    for (const res of RESOURCE_TIERS.tier3) {
      if (neededResources.has(res)) {
        requestResource(res, 3, LAB_CONFIG.tier3MinAmount);
      }
    }
  },

  pickDemand(room) {
    const desired = { ...TARGETS };
    // apply overrides if needed here
    let chosen = null; let maxGap = 0;
    for (const out of Object.keys(REACTIONS)) {
      if (LAB_CONFIG.ignore.has(out)) continue;
      const goal = desired[out] || 0;
      if (goal <= 0) continue;
      function storeAmount(struct, res) {
  return struct && struct.store && struct.store[res] || 0;
}

const have = storeAmount(room.terminal, out) + storeAmount(room.storage, out);
      const gap = goal - have;
      if (gap > maxGap) { maxGap = gap; chosen = out; }
    }
    if (!chosen) {
      // fallback to idle
      for (const idle of LAB_CONFIG.idleOutputs) if (REACTIONS[idle]) return idle;
    }
    return chosen;
  },

  pickNextDemandExcluding(room, excludeSet) {
    const desired = { ...TARGETS };
    let chosen = null; let maxGap = 0;
    for (const out of Object.keys(REACTIONS)) {
      if (excludeSet.has(out)) continue;
      if (LAB_CONFIG.ignore.has(out)) continue;
      const goal = desired[out] || 0;
      if (goal <= 0) continue;
      const have = ((room.terminal && room.terminal.store && room.terminal.store[out]) || 0) + ((room.storage && room.storage.store && room.storage.store[out]) || 0);
      const gap = goal - have;
      if (gap > maxGap) { maxGap = gap; chosen = out; }
    }
    return chosen;
  },

  checkIngredients(room, inputs) {
    // returns map of missing resource => amount (only for terminal supply check)
    const missing = {};
    for (const res of inputs) {
      const have = room.terminal.store[res] || 0;
      const needed = LAB_CONFIG.inputFill.min; // minimal amount to start running
      if (have < needed) missing[res] = needed - have;
    }
    return missing;
  },

  prepareInputs(room, labsMem, inputA, inputB) {
    const inputIds = labsMem.inputs || [];
    if (inputIds.length < 2) return;
    const labA = Game.getObjectById(inputIds[0]);
    const labB = Game.getObjectById(inputIds[1]);
    // ensure lab mineral types are correct and queue fill tasks
    this.ensureInputLabTask(room, labsMem, labA, inputA);
    this.ensureInputLabTask(room, labsMem, labB, inputB);
  },

  ensureInputLabTask(room, labsMem, lab, resource) {
    if (!lab) return;
    // if lab contains other mineral, queue drain task
    if (lab.mineralType && lab.mineralType !== resource) {
      this.queueTask(labsMem, { type: 'drainLab', labId: lab.id, resource: lab.mineralType, to: 'terminal', minAmount: LAB_CONFIG.outputDrainMin });
      return;
    }
    const have = lab.store.getUsedCapacity(resource);
    if (have < LAB_CONFIG.inputFill.min) {
      // queue a fillInput task to bring it up to max
      const from = this.pickSource(room, resource);
      if (!from) {
        // record missing in TerminalRequire so haulers/spawn can prioritize fetch from other rooms
        labsMem.TerminalRequire = labsMem.TerminalRequire || {};
        labsMem.TerminalRequire[resource] = Math.max(labsMem.TerminalRequire[resource]||0, LAB_CONFIG.inputFill.min - (room.terminal.store[resource]||0));
        return;
      }
      this.queueTask(labsMem, { type: 'fillInput', labId: lab.id, resource, fromStructureId: from.structureId, targetAmount: LAB_CONFIG.inputFill.max });
    }
  },

  pickSource(room, resource) {
    if (((room.terminal && room.terminal.store && room.terminal.store[resource]) || 0) > 0) return { structureId: room.terminal.id };
    if (((room.storage && room.storage.store && room.storage.store[resource]) || 0) > 0) return { structureId: room.storage.id };
    const contId = Memory.rooms[room.name] && Memory.rooms[room.name].ExtractorContainer;
    if (contId) {
      const c = Game.getObjectById(contId);
      if (c && (c.store && c.store[resource] || 0) > 0) return { structureId: c.id };
    }
    return null;
  },

  runOutputs(room, labsMem) {
    const outputs = (labsMem.outputs || []).map(id => Game.getObjectById(id)).filter(Boolean);
    const inputs = (labsMem.inputs || []).slice(0,2).map(id => Game.getObjectById(id)).filter(Boolean);
    if (inputs.length < 2) return;
    for (const lab of outputs) {
      if (!lab || lab.cooldown) continue;
      lab.runReaction(inputs[0], inputs[1]);
    }
  },

  ensureOutputsDrained(room, labsMem) {
    const outputs = (labsMem.outputs || []).map(id => Game.getObjectById(id)).filter(Boolean);
    for (const lab of outputs) {
      if (!lab.mineralType) continue;
      const amt = lab.store.getUsedCapacity(lab.mineralType);
      if (amt >= LAB_CONFIG.outputDrainMin) {
        this.queueTask(labsMem, { type: 'drainLab', labId: lab.id, resource: lab.mineralType, to: 'terminal', minAmount: LAB_CONFIG.outputDrainMin });
      }
    }
  },

  handleBoosters(room, labsMem) {
    if (!labsMem.boosterQueue || labsMem.boosterQueue.length === 0) return false;
    const req = labsMem.boosterQueue[0];
    if (!req || req.expiry < Game.time) { labsMem.boosterQueue.shift(); return false; }
    const boosterIds = labsMem.boosters || [];
    if (boosterIds.length < 3) return false; // need at least 3 for inputs+output
    const labs = boosterIds.map(id => Game.getObjectById(id)).filter(Boolean);
    const inputs = REACTIONS[req.resource];
    if (!inputs) return false;
    // prepare first two as inputs and rest as outputs
    this.ensureInputLabTask(room, labsMem, labs[0], inputs[0]);
    this.ensureInputLabTask(room, labsMem, labs[1], inputs[1]);
    for (let i = 2; i < labs.length; i++) {
      const lab = labs[i];
      if (!lab || lab.cooldown) continue;
      lab.runReaction(labs[0], labs[1]);
      if (lab.mineralType) this.queueTask(labsMem, { type:'drainLab', labId: lab.id, resource: lab.mineralType, to:'terminal', minAmount: LAB_CONFIG.outputDrainMin });
    }
    // if terminal has enough of requested resource, pop queue
    const have = ((room.terminal && room.terminal.store && room.terminal.store[req.resource]) || 0) + ((room.storage && room.storage.store && room.storage.store[req.resource]) || 0);
    if (have >= req.amount) labsMem.boosterQueue.shift();
    return true;
  },
  updateLabList(room, rmem) {
    if (!room || !rmem) return;
    rmem.LABS = rmem.LABS || JSON.parse(JSON.stringify(LABS_DEFAULT));

    // find all labs in the room
    const labs = room.find(FIND_MY_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_LAB
    });
    if (!labs || labs.length === 0) {
      rmem.LABS.inputs = [];
      rmem.LABS.outputs = [];
      return;
    }
    // find labs that are within range 2 of all other labs
    const inputLabs = [];
    for (const lab of labs) {
        let inRangeOfAll = true;
        for (const other of labs) {
            if (lab.id === other.id) continue;
            if (lab.pos.getRangeTo(other.pos) > 2) {
                inRangeOfAll = false;
                break;
            }
        }
        if (inRangeOfAll) inputLabs.push(lab.id);
    }

    // assign to memory
    rmem.LABS.inputs = inputLabs.slice(0, 2); // only keep 2
    rmem.LABS.outputs = labs
        .filter(l => !rmem.LABS.inputs.includes(l.id))
        .map(l => l.id);

    // boosters left untouched (manual assignment if needed)
    console.log(`LabManager: Updated labs for ${room.name}: inputs=${rmem.LABS.inputs}, outputs=${rmem.LABS.outputs}`);
  },

   queueTask(labsMem, task) {
  if (!labsMem) return;
  labsMem.tasks = labsMem.tasks || [];

  // minimal required field: type only (allow tasks w/o labId like transfers)
  if (!task || !task.type) return;

  // normalize resource field for tasks that need it
  task.resource = task.resource || null;

  // create id if missing
  if (!task.id) {
    task.id = `${task.type}-${task.fromStructureId||task.labId||'any'}-${task.resource||'any'}-${Game.time}`;
  }

  // dedupe: match by type + labId OR type + fromStructureId + resource
  const exists = labsMem.tasks.some(t => {
    if (t.type !== task.type) return false;
    if (task.labId && t.labId) return t.labId === task.labId && t.resource === task.resource;
    if (task.fromStructureId) return t.fromStructureId === task.fromStructureId && t.resource === task.resource;
    return false;
  });
  if (exists) return;

  labsMem.tasks.push(task);
  console.log(`LabManager: queued task ${task.id} (${task.type}) resource=${task.resource} from=${task.fromStructureId||task.labId}`);
}
};



module.exports =  LabManager ;

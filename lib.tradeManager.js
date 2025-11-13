/*
Overview
Brief reference for the TradeManager module: how to install it, main commands, Memory layout, logging, and practical examples.

Installation
- Save the module as lib.tradeManager.js in your Screeps repository.
- Call it once per tick from your main loop:
- Example: require('lib.tradeManager').run();

Quick commands
- Run manager (per tick)
- require('lib.tradeManager').run();
- Enable / disable logging
- Enable: require('lib.tradeManager').enableLogging()
- Disable: require('lib.tradeManager').disableLogging()
- Force neighbor cache recompute
- Single room: require('lib.tradeManager').forceRecomputeNeighbors('W1N1')
- All rooms: require('lib.tradeManager').forceRecomputeNeighbors()
- Set room desired resource (want)
- require('lib.tradeManager').setRoomWant('W1N1', RESOURCE_ENERGY, 200000)
- require('lib.tradeManager').setRoomWant('W1N1', RESOURCE_OXYGEN, 1000)
- Set buy/sell price points for a room
- require('lib.tradeManager').setBuySellPoints('W1N1', RESOURCE_ENERGY, 0.01, 0.02)
- (First numeric arg = buyPrice or undefined; second = sellPrice or undefined)
- Set a purchase request (auto-buy from market)
- require('lib.tradeManager').setPurchaseRequest('W1N1', RESOURCE_CATALYST, 5000, 0.5)
- (roomName, resource, amount, maxPrice)
- Clear purchase requests
- Single resource: require('lib.tradeManager').setPurchaseRequest('W1N1', RESOURCE_CATALYST, 0)
- All requests: require('lib.tradeManager').clearPurchaseRequests('W1N1')
- Get trading statistics
- require('lib.tradeManager').getStats()
- Returns: { totalProfit, totalTransactions, profitLast1000Ticks, recentTransactionCount }

Memory layout (notes)
- Root: Memory.Trade
- Memory.Trade.stats
- totalProfit: All-time profit/loss in credits
- totalTransactions: Total number of market deals
- recentProfits: Array tracking last 1000 ticks of transactions
- Memory.Trade.rooms[roomName]
- wants: resource => desired total (storage + terminal)
- e.g. Memory.Trade.rooms['W1N1'].wants[RESOURCE_ENERGY] = 300000
- e.g. Memory.Trade.rooms['W1N1'].wants[RESOURCE_OXYGEN] = 1000
- buyPoint: resource => preferred buy price (market)
- sellPoint: resource => preferred sell price (market)
- e.g. Memory.Trade.rooms['W1N1'].sellPoint[RESOURCE_ENERGY] = 0.02
- purchaseRequests: resource => {amount: number, maxPrice: number}
- e.g. Memory.Trade.rooms['W1N1'].purchaseRequests[RESOURCE_CATALYST] = {amount: 5000, maxPrice: 0.5}
- priority: numeric priority for receivers (higher = favored)
- neighbors: cached array of nearby owned rooms { room: 'W2N3', dist: 2 } (only <= configured max distance)
- neighborsLastComputed: Game.time when neighbors were last calculated
- Logs: Memory.Trade.log is an array of entries { t: Game.time, text: "..." } capped by config.logMaxEntries.

Features
- Automatically balances ALL resources (energy + minerals/compounds) between rooms
- Each room wants 300k energy by default, 1k of each other resource
- CONTINUOUS INCOME STREAM: Sells harvested minerals at 9800 threshold while labs maintain 10k reserve
- Will NOT import a room's own harvested mineral, but WILL continuously sell excess above 9800
- Sells excess resources when amounts exceed thresholds (950k for energy, 1k for others, 9800 for own mineral)
- SMART SELLING: Prioritizes fulfilling buy orders (deals) before creating new sell orders
- PREVENTS DUPLICATE ORDERS: Checks for existing active sell orders before creating new ones
- PURCHASE REQUESTS: Rooms can request resources to be auto-purchased from market
- LAB INTEGRATION: Lab Manager automatically requests needed resources via purchase system
- Tracks profit/loss from all market transactions (last 1000 ticks + all-time total)
- Respects distance when choosing donor rooms (sends from nearest first)
- Configurable price points for buying/selling each resource

Logging examples (what you'll see in Memory.Trade.log)
- Terminal send: send 2000 energy from W1N1 to W2N3 cost 60 energy
- Terminal send of other resource: send 100 GHODIUM from W2N3 to W6N1 cost 80 energy
- Market sell: sold 600 energy W9N1 made points 30000
- Market sell: sold 150 oxygen W1N1 made points 4500
- Market buy: bought 1000 catalyst for W1N1 spent 500 credits @ 0.500
- Order skip: skipped creating sell order for W1N1 - already has 5000 ENERGY in active orders

Practical scenarios
- Balance all resources between rooms automatically: 
  Set Memory.rooms[roomName].Mineral to the mineral type each room harvests
  Run manager each tick - it will auto-configure wants for all resources
- Request automatic purchase of a resource:
- require('lib.tradeManager').setPurchaseRequest('W1N1', RESOURCE_CATALYST, 5000, 0.5)
  This will buy up to 5000 catalyst at max 0.5 credits each for room W1N1
- Force a room to only sell energy at or above 0.02:
- require('lib.tradeManager').setBuySellPoints('W1N1', RESOURCE_ENERGY, undefined, 0.02)
- Check your trading profits:
- require('lib.tradeManager').getStats()
- Temporarily turn off log spam while tuning:
- require('lib.tradeManager').disableLogging()



*/
// lib.tradeManager.js


const TradeManager = {
  config: {
    desiredEnergy: 300000,
    desiredResource: 1000,  // Default desired amount for all non-energy resources
    terminalSendInefficiencyRatio: 2.0,
    terminalSendMaxAbsoluteLoss: 10000,
    sellEnergyGlobalThreshold: 950000,
    sellResourceThreshold: 1000,  // Start selling resources when exceeding this amount
    fallbackSellPrice: 0.001,
    minAcceptableDealPrice: 0.01,  // Minimum price to accept for deals (as ratio of average)
    neighborMaxDistance: 30,
    neighborRefreshInterval: 10000,
    logEnabled: true,
    logMaxEntries: 400,
    skipReceiversWithoutTerminal: true,
    alternateTickMode: true,
    profitTrackingTicks: 1000,  // Track last 1000 ticks of profit/loss
    sellAggressiveness: 0.02,  // Fraction to undercut best buy price when creating sell orders (0.02 = 2% under)
    profitReserveRate: 0.10  // Reserve 10% of all positive income to minCredits buffer
  },

  // All possible mineral and compound resources in Screeps
  TRACKABLE_RESOURCES: [
    RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM, 
    RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST, RESOURCE_GHODIUM,
    RESOURCE_HYDROXIDE, RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE,
    RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_OXIDE, RESOURCE_KEANIUM_HYDRIDE,
    RESOURCE_KEANIUM_OXIDE, RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_LEMERGIUM_OXIDE,
    RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_GHODIUM_HYDRIDE,
    RESOURCE_GHODIUM_OXIDE, RESOURCE_UTRIUM_ACID, RESOURCE_UTRIUM_ALKALIDE,
    RESOURCE_KEANIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID,
    RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ALKALIDE,
    RESOURCE_GHODIUM_ACID, RESOURCE_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_UTRIUM_ACID,
    RESOURCE_CATALYZED_UTRIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ACID,
    RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ACID,
    RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ACID,
    RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ACID,
    RESOURCE_CATALYZED_GHODIUM_ALKALIDE
  ],

  // --- Memory initialization
  ensureMemory() {
    if (!Memory.Trade) Memory.Trade = {};
    if (!Memory.Trade.rooms) Memory.Trade.rooms = {};
    if (!Memory.Trade.log) Memory.Trade.log = [];
    
    // Initialize profit tracking
    if (!Memory.Trade.stats) {
      Memory.Trade.stats = {
        totalProfit: 0,  // All-time total profit (positive) or loss (negative) in credits
        totalTransactions: 0,  // Total number of market transactions
        recentProfits: []  // Array of {tick: Game.time, profit: number} for last 1000 ticks
      };
    }

    // Initialize reserved credits and minimum credits buffer
    if (Memory.Trade.reservedCredits === undefined) Memory.Trade.reservedCredits = 0;
    if (Memory.Trade.minCredits === undefined) Memory.Trade.minCredits = 0;
    
    // Initialize lastCredits for auto-growth tracking
    if (Memory.Trade.lastCredits === undefined) {
      Memory.Trade.lastCredits = (Game.market && Game.market.credits) || 0;
    }

    const keep = {};
    for (const rname in Game.rooms) {
      const room = Game.rooms[rname];
      if (!room || !room.controller || !room.controller.my) continue;
      if (!room.terminal) continue;
      if (!Memory.Trade.rooms[rname]) {
        Memory.Trade.rooms[rname] = {
          wants: {},
          buyPoint: {},
          sellPoint: {},
          priority: 0,
          neighbors: [],
          neighborsLastComputed: 0,
          purchaseRequests: {}  // {resourceType: {amount: number, maxPrice: number}}
        };
      } else {
        const mem = Memory.Trade.rooms[rname];
        if (!mem.wants) mem.wants = {};
        if (!mem.buyPoint) mem.buyPoint = {};
        if (!mem.sellPoint) mem.sellPoint = {};
        if (!mem.neighbors) mem.neighbors = [];
        if (!mem.neighborsLastComputed) mem.neighborsLastComputed = 0;
        if (!mem.purchaseRequests) mem.purchaseRequests = {};
        if (mem.reservedOutgoing) delete mem.reservedOutgoing;
        if (mem.terminalEnergyReserve) delete mem.terminalEnergyReserve;
        if (mem.recentReservationCleared) delete mem.recentReservationCleared;
      }
      keep[rname] = Memory.Trade.rooms[rname];
    }
    Memory.Trade.rooms = keep;
  },

  // --- logging
  logPush(entry) {
    if (!this.config.logEnabled) return;
    if (!Memory.Trade) Memory.Trade = {};
    if (!Memory.Trade.log) Memory.Trade.log = [];
    Memory.Trade.log.push({ t: Game.time, text: entry });
    if (Memory.Trade.log.length > this.config.logMaxEntries) {
      Memory.Trade.log.splice(0, Memory.Trade.log.length - this.config.logMaxEntries);
    }
  },

  // --- profit tracking
  recordProfit(amount, resourceType, quantity, action) {
    if (!Memory.Trade.stats) {
      Memory.Trade.stats = {
        totalProfit: 0,
        totalTransactions: 0,
        recentProfits: []
      };
    }

    // If we're at war, don't record profits (pause trading/stat tracking)
    if (Memory.Trade && Memory.Trade.AtWar) {
      if (this.config.logEnabled) this.logPush(`skipped profit recording for ${action} ${quantity} ${resourceType} due to AtWar flag`);
      return;
    }

    Memory.Trade.stats.totalProfit += amount;
    Memory.Trade.stats.totalTransactions++;

    console.log(`[Trade] recordProfit called: amount=${amount}, resource=${resourceType}, qty=${quantity}, action=${action}`);

    // If positive profit (from selling), reserve a configured fraction for minCredits
    if (amount > 0) {
      const rate = this.config.profitReserveRate;
      console.log(`[Trade] Positive profit! amount=${amount}, reserveRate=${rate}`);
      
      if (rate && rate > 0) {
        const reserve = Math.round(amount * rate);
        const oldReserved = Memory.Trade.reservedCredits || 0;
        const oldMin = Memory.Trade.minCredits || 0;
        
        Memory.Trade.reservedCredits = oldReserved + reserve;
        Memory.Trade.minCredits = oldMin + reserve;
        
        console.log(`[Trade] Reserved ${reserve} credits. Old: reserved=${oldReserved}, min=${oldMin}. New: reserved=${Memory.Trade.reservedCredits}, min=${Memory.Trade.minCredits}`);
        
        if (this.config.logEnabled) {
          this.logPush(`reserved ${reserve} credits (${Math.round(rate*100)}%) from profit ${amount} - new reserved: ${Memory.Trade.reservedCredits}, new min: ${Memory.Trade.minCredits}`);
        }
      } else {
        console.log(`[Trade] WARNING: reserve rate not set or zero: ${rate}`);
      }
    }

    Memory.Trade.stats.recentProfits.push({
      tick: Game.time,
      profit: amount,
      resource: resourceType,
      quantity: quantity,
      action: action  // 'buy' or 'sell'
    });

    // Keep only last N ticks
    const cutoffTick = Game.time - this.config.profitTrackingTicks;
    Memory.Trade.stats.recentProfits = Memory.Trade.stats.recentProfits.filter(p => p.tick > cutoffTick);
  },

  // Auto-grow minCredits when total credits increase (1% of increase)
  updateMinCreditsFromGrowth() {
    const currentCredits = (Game.market && Game.market.credits) || 0;
    
    // Initialize lastCredits if not set
    if (Memory.Trade.lastCredits === undefined) {
      Memory.Trade.lastCredits = currentCredits;
      return;
    }
    
    const lastCredits = Memory.Trade.lastCredits || 0;
    const creditIncrease = currentCredits - lastCredits;
    
    // Only grow minCredits when credits INCREASE (not when they decrease)
    if (creditIncrease > 0) {
      const growthAmount = Math.round(creditIncrease * 0.01); // 1% of increase
      const oldMin = Memory.Trade.minCredits || 0;
      
      Memory.Trade.minCredits = oldMin + growthAmount;
      
      if (this.config.logEnabled && growthAmount > 0) {
        this.logPush(`auto-grew minCredits by ${growthAmount} (1% of ${creditIncrease} credit increase) - new minCredits: ${Memory.Trade.minCredits}`);
      }
      
      console.log(`[Trade] Auto-growth: credits increased by ${creditIncrease}, minCredits grew by ${growthAmount} to ${Memory.Trade.minCredits}`);
    }
    
    // Update lastCredits for next tick
    Memory.Trade.lastCredits = currentCredits;
  },

  // --- market pricing helpers
  // Return highest buy order price for a resource, or null if none
  getMarketBestBuyPrice(resource) {
    if (!Game.market || !Game.market.getAllOrders) return null;
    const buys = Game.market.getAllOrders(o => o.resourceType === resource && o.type === ORDER_BUY) || [];
    if (buys.length === 0) return null;
    buys.sort((a, b) => b.price - a.price);
    return buys[0].price;
  },

  // Return lowest sell order price for a resource, or null if none
  getMarketLowestSellPrice(resource) {
    if (!Game.market || !Game.market.getAllOrders) return null;
    const sells = Game.market.getAllOrders(o => o.resourceType === resource && o.type === ORDER_SELL) || [];
    if (sells.length === 0) return null;
    sells.sort((a, b) => a.price - b.price);
    return sells[0].price;
  },

  // Compute a reasonable sell order price using market data and optional preferredPrice
  computeSellOrderPrice(resource, preferredPrice = null) {
    // If a room-specified sell point exists (preferredPrice), use it
    if (preferredPrice !== null && preferredPrice !== undefined) return preferredPrice;

    // Prefer matching the best buy price (so orders get filled quickly)
    const bestBuy = this.getMarketBestBuyPrice(resource);
    if (bestBuy !== null) {
      // Apply aggressiveness: undercut bestBuy by sellAggressiveness fraction
      const m = this.config.sellAggressiveness || 0;
      let price = bestBuy * (1 - m);
      // Never go below zero or fallback
      if (!isFinite(price) || price <= 0) price = this.config.fallbackSellPrice;
      if (price < this.config.fallbackSellPrice) price = this.config.fallbackSellPrice;
      return price;
    }

    // Otherwise, use the lowest ask (to be competitive)
    const lowestSell = this.getMarketLowestSellPrice(resource);
    if (lowestSell !== null) return lowestSell;

    // Fallback
    return this.config.fallbackSellPrice;
  },

  getRecentProfit() {
    if (!Memory.Trade.stats || !Memory.Trade.stats.recentProfits) return 0;
    return Memory.Trade.stats.recentProfits.reduce((sum, p) => sum + p.profit, 0);
  },

  getTotalProfit() {
    if (!Memory.Trade.stats) return 0;
    return Memory.Trade.stats.totalProfit || 0;
  },

  // --- order management helpers
  getMyActiveOrders(roomName, resourceType) {
    if (!Game.market.orders) return [];
    return _.filter(Game.market.orders, order => 
      order.roomName === roomName && 
      order.resourceType === resourceType && 
      order.active &&
      order.remainingAmount > 0
    );
  },

  hasActiveSellOrder(roomName, resourceType) {
    const orders = this.getMyActiveOrders(roomName, resourceType);
    return orders.some(order => order.type === ORDER_SELL);
  },

  getActiveSellOrderAmount(roomName, resourceType) {
    const orders = this.getMyActiveOrders(roomName, resourceType);
    return orders
      .filter(order => order.type === ORDER_SELL)
      .reduce((sum, order) => sum + order.remainingAmount, 0);
  },

  // --- helpers
  getRoomAmount(room, resource) {
    if (!room) return 0;
    let total = 0;
    const targets = ['storage', 'terminal'];
    for (const s of targets) {
      const str = room[s];
      if (str && str.store) total += str.store[resource] || 0;
    }
    return total;
  },

  getOwnedRoomsWithTerminal() {
    return _.filter(Game.rooms, r => r.controller && r.controller.my && r.terminal);
  },

  estimateSendCost(amount, fromRoomName, toRoomName) {
    if (Game.market && Game.market.calcTransactionCost) {
      try { return Game.market.calcTransactionCost(amount, fromRoomName, toRoomName); }
      catch (e) { return Infinity; }
    }
    return Infinity;
  },

  terminalFreeCapacity(room) {
    if (!room || !room.terminal) return 0;
    return room.terminal.store.getFreeCapacity() || 0;
  },

  // Find largest viable amount <= maxAmount such that:
  // - estimated cost <= maxAbsLoss (if provided) AND
  // - donor terminal has enough energy now to cover amount+cost (for ENERGY) or cost (non-ENERGY).
  findLargestViableAmountForLossAndEnergy(fromRoomName, toRoomName, resource, maxAmount, maxAbsLoss) {
    if (!isFinite(maxAmount) || maxAmount <= 0) return 0;
    const termEnergyNow = (Game.rooms[fromRoomName] && Game.rooms[fromRoomName].terminal && Game.rooms[fromRoomName].terminal.store[RESOURCE_ENERGY]) || 0;

    const ok = (amount) => {
      const c = this.estimateSendCost(amount, fromRoomName, toRoomName);
      if (!isFinite(c)) return false;
      if (typeof maxAbsLoss === 'number' && c > maxAbsLoss) return false;
      if (resource === RESOURCE_ENERGY) {
        return termEnergyNow >= (amount + c);
      } else {
        return termEnergyNow >= c;
      }
    };

    let lo = 1;
    let hi = Math.floor(maxAmount);
    let best = 0;
    const MAX_BS_ITERS = 20;
    let iter = 0;
    while (lo <= hi && iter < MAX_BS_ITERS) {
      const mid = Math.floor((lo + hi) / 2);
      if (ok(mid)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
      iter++;
    }

    if (best <= 0) {
      let fallback = Math.floor(maxAmount / 2);
      while (fallback > 0) {
        if (ok(fallback)) { best = fallback; break; }
        fallback = Math.floor(fallback / 2);
      }
    }

    return best;
  },

  // --- terminal send (no reservations, energy-aware reduction)
  trySendTerminal(fromRoom, toRoomName, resource, requestedAmount) {
    const fromTerm = fromRoom && fromRoom.terminal;
    if (!fromTerm) return false;

    const destRoom = Game.rooms[toRoomName];
    if (!destRoom || !destRoom.terminal) {
      if (this.config.logEnabled) this.logPush(`aborted send ${requestedAmount} ${resource} from ${fromRoom.name} to ${toRoomName} - dest has no terminal`);
      return false;
    }

    if (fromTerm.cooldown) {
      if (this.config.logEnabled) this.logPush(`skipped send ${requestedAmount} ${resource} from ${fromRoom.name} - terminal cooldown ${fromTerm.cooldown}`);
      return false;
    }

    const availableNow = (fromTerm.store[resource]) || 0;
    const destFree = destRoom.terminal.store.getFreeCapacity() || 0;
    if (availableNow <= 0) {
      if (this.config.logEnabled) this.logPush(`skipped send ${requestedAmount} ${resource} from ${fromRoom.name} - terminal has none`);
      return false;
    }
    if (destFree <= 0) {
      if (this.config.logEnabled) this.logPush(`skipped send ${requestedAmount} ${resource} from ${fromRoom.name} - dest terminal full`);
      return false;
    }

    let amount = Math.min(requestedAmount, availableNow, destFree);
    if (amount <= 0) return false;

    const MAX_ADJUST_ITERS = 6;
    let iter = 0;
    while (iter < MAX_ADJUST_ITERS && amount > 0) {
      const estimatedCost = this.estimateSendCost(amount, fromRoom.name, toRoomName);
      if (!isFinite(estimatedCost)) return false;
      const termEnergyNow = fromTerm.store[RESOURCE_ENERGY] || 0;
      const energyNeeded = (resource === RESOURCE_ENERGY) ? (amount + estimatedCost) : estimatedCost;
      if (termEnergyNow >= energyNeeded) break;
      const reduceBy = Math.max(1, Math.ceil(estimatedCost));
      const prev = amount;
      amount = Math.max(0, amount - reduceBy);
      if (this.config.logEnabled) this.logPush(`adjusted send ${fromRoom.name} -> ${toRoomName} ${resource} ${prev} -> ${amount} due to energy shortfall`);
      iter++;
    }

    if (amount <= 0) return false;

    const finalAvailable = (fromTerm.store[resource]) || 0;
    const finalDestFree = destRoom.terminal.store.getFreeCapacity() || 0;
    amount = Math.min(amount, finalAvailable, finalDestFree);
    if (amount <= 0) {
      if (this.config.logEnabled) this.logPush(`aborted send after fresh check ${fromRoom.name} -> ${toRoomName} amount 0`);
      return false;
    }

    if (resource === RESOURCE_ENERGY) {
      let cost = this.estimateSendCost(amount, fromRoom.name, toRoomName);
      const maxAbsLoss = this.config.terminalSendMaxAbsoluteLoss;
      if (typeof maxAbsLoss === 'number' && isFinite(cost) && cost > maxAbsLoss) {
        const best = this.findLargestViableAmountForLossAndEnergy(fromRoom.name, toRoomName, resource, amount, maxAbsLoss);
        if (!best || best <= 0) {
          if (this.config.logEnabled) this.logPush(`skipped send ${amount} ENERGY from ${fromRoom.name} to ${toRoomName} - absolute loss ${cost} > max ${maxAbsLoss} (no viable reduced amount)`);
          return false;
        }
        if (best < amount) {
          if (this.config.logEnabled) this.logPush(`reducing send ${amount} -> ${best} ENERGY from ${fromRoom.name} to ${toRoomName} to meet loss and energy constraints`);
          amount = best;
        }
      }
    }

    const finalCost = this.estimateSendCost(amount, fromRoom.name, toRoomName);
    if (!isFinite(finalCost)) return false;
    const finalTermEnergy = fromTerm.store[RESOURCE_ENERGY] || 0;
    const finalEnergyNeeded = (resource === RESOURCE_ENERGY) ? (amount + finalCost) : finalCost;
    if (finalTermEnergy < finalEnergyNeeded) {
      if (this.config.logEnabled) this.logPush(`aborted send ${amount} ${resource} from ${fromRoom.name} - insufficient energy after final check (${finalTermEnergy} < ${finalEnergyNeeded})`);
      return false;
    }

    const res = fromTerm.send(resource, amount, toRoomName, `auto trade ${resource}`);
    if (res === OK) {
      if (this.config.logEnabled) this.logPush(`send ${amount} ${resource} from ${fromRoom.name} to ${toRoomName} cost ${finalCost}`);
      return true;
    }

    if (this.config.logEnabled) this.logPush(`failed send ${amount} ${resource} from ${fromRoom.name} to ${toRoomName} code ${res}`);
    return false;
  },

  // --- neighbor cache
  computeNeighborsForRoom(roomName, force = false) {
    const mem = Memory.Trade.rooms[roomName];
    if (!mem) return;
    const now = Game.time;
    if (!force && (now - (mem.neighborsLastComputed || 0)) < this.config.neighborRefreshInterval) return;
    const maxDist = this.config.neighborMaxDistance;
    const neighbors = [];
    const candidates = _.filter(Game.rooms, r => r.controller && r.controller.my && r.terminal);
    for (const r of candidates) {
      if (r.name === roomName) continue;
      let dist = Infinity;
      try { dist = Game.map.getRoomLinearDistance(roomName, r.name, true); }
      catch (e) { dist = Infinity; }
      if (!isFinite(dist)) continue;
      if (dist <= maxDist) neighbors.push({ room: r.name, dist });
    }
    neighbors.sort((a, b) => a.dist - b.dist);
    mem.neighbors = neighbors;
    mem.neighborsLastComputed = now;
  },

  getNeighbors(roomName) {
    const mem = Memory.Trade.rooms[roomName];
    if (!mem) return [];
    if (!mem.neighbors || mem.neighbors.length === 0) this.computeNeighborsForRoom(roomName, false);
    return mem.neighbors || [];
  },

  // --- memory defaults
  ensureRoomWants(roomName) {
    const mem = Memory.Trade.rooms[roomName];
    if (!mem) return;
    if (mem.wants === undefined) mem.wants = {};
    
    // Set default energy want
    if (mem.wants[RESOURCE_ENERGY] === undefined) {
      mem.wants[RESOURCE_ENERGY] = this.config.desiredEnergy;
    }
    
    // Get room's harvested mineral (don't want to receive this)
    const roomMineral = Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].Mineral;
    
    // Auto-set wants for all trackable resources (excluding room's own mineral)
    for (const resource of this.TRACKABLE_RESOURCES) {
      if (mem.wants[resource] === undefined) {
        // Don't set a want for the room's own harvested mineral
        if (resource !== roomMineral) {
          mem.wants[resource] = this.config.desiredResource;
        }
      }
    }
    
    // Legacy migration: Convert 'G' to RESOURCE_GHODIUM
    if (mem.wants['G'] !== undefined && mem.wants[RESOURCE_GHODIUM] === undefined) {
      mem.wants[RESOURCE_GHODIUM] = mem.wants['G'];
      delete mem.wants['G'];
    }
  },

  // --- donors / receivers
  findDonors(resource, preferRoomName = null) {
    const donors = [];
    for (const rname in Memory.Trade.rooms) {
      const room = Game.rooms[rname];
      if (!room || !room.terminal) continue;
      
      // Skip if this is the room's own harvested mineral (don't export it)
      const roomMineral = Memory.rooms && Memory.rooms[rname] && Memory.rooms[rname].Mineral;
      if (resource === roomMineral) continue;
      
      const want = Memory.Trade.rooms[rname].wants && Memory.Trade.rooms[rname].wants[resource];
      const have = this.getRoomAmount(room, resource);
      const overflow = want !== undefined ? have - want * 1.1 : have;
      if (overflow > 0) donors.push({ room, have, overflow, want: want || 0 });
    }

    if (preferRoomName) {
      const neighborMap = {};
      const neighbors = this.getNeighbors(preferRoomName);
      for (const n of neighbors) neighborMap[n.room] = n.dist;
      donors.sort((a, b) => {
        const da = neighborMap[a.room.name] !== undefined ? neighborMap[a.room.name] : Infinity;
        const db = neighborMap[b.room.name] !== undefined ? neighborMap[b.room.name] : Infinity;
        if (da !== db) return da - db;
        return b.overflow - a.overflow;
      });
    } else {
      donors.sort((a, b) => b.overflow - a.overflow);
    }
    return donors;
  },

  findReceivers(resource) {
    const receivers = [];
    for (const rname in Memory.Trade.rooms) {
      const room = Game.rooms[rname];
      if (!room) continue;
      if (this.config.skipReceiversWithoutTerminal && !room.terminal) continue;
      
      // Skip if this is the room's own harvested mineral (doesn't need it from others)
      const roomMineral = Memory.rooms && Memory.rooms[rname] && Memory.rooms[rname].Mineral;
      if (resource === roomMineral) continue;
      
      const want = Memory.Trade.rooms[rname].wants && Memory.Trade.rooms[rname].wants[resource];
      if (!want) continue;
      const have = this.getRoomAmount(room, resource);
      const deficit = want - have;
      if (deficit > 0) receivers.push({ room, have, deficit, want });
    }
    return receivers.sort((a, b) => {
      const pa = Memory.Trade.rooms[a.room.name].priority || 0;
      const pb = Memory.Trade.rooms[b.room.name].priority || 0;
      if (pa !== pb) return pb - pa;
      return b.deficit - a.deficit;
    });
  },

  // --- balancing (no reservations; transfers on even ticks if alternateTickMode)
  balanceResource(resource) {
    const receivers = this.findReceivers(resource);
    if (!receivers || receivers.length === 0) return;

    for (const recv of receivers) {
      if (!recv.room || !recv.room.terminal) continue;
    }

    for (const recv of receivers) {
      const donors = this.findDonors(resource, recv.room.name);
      if (!donors || donors.length === 0) continue;

      for (const donor of donors) {
        if (!donor.room || !donor.room.terminal) continue;
        if (donor.room.name === recv.room.name) continue;
        if (recv.deficit <= 0) break;

        const destFree = this.terminalFreeCapacity(recv.room);
        if (destFree <= 0) {
          if (this.config.logEnabled) this.logPush(`skipped send ${resource} to ${recv.room.name} - dest full`);
          break;
        }

        const donorTermAmt = (donor.room.terminal && donor.room.terminal.store[resource]) || 0;
        if (donorTermAmt <= 0) continue;

        const amountWanted = Math.min(Math.floor(donorTermAmt), Math.floor(recv.deficit), destFree);
        if (amountWanted <= 0) continue;

        let cost = this.estimateSendCost(amountWanted, donor.room.name, recv.room.name);
        if (!isFinite(cost)) continue;

        const donorTermEnergy = (donor.room.terminal && donor.room.terminal.store[RESOURCE_ENERGY]) || 0;
        if (donorTermEnergy < cost) {
          if (this.config.logEnabled) this.logPush(`skipped send ${amountWanted} ${resource} from ${donor.room.name} to ${recv.room.name} - insufficient terminal energy for cost (${donorTermEnergy} < ${cost})`);
          continue;
        }

        if (resource === RESOURCE_ENERGY) {
          const netArrival = amountWanted - cost;
          if (netArrival < 0) {
            if (this.config.logEnabled) this.logPush(`skipped send ${amountWanted} ENERGY from ${donor.room.name} to ${recv.room.name} - net negative (cost ${cost})`);
            continue;
          }
          const ratioLimit = this.config.terminalSendInefficiencyRatio || 2.0;
          if (netArrival > 0 && (amountWanted / netArrival) > ratioLimit) {
            if (this.config.logEnabled) this.logPush(`skipped send ${amountWanted} ENERGY from ${donor.room.name} to ${recv.room.name} - inefficient`);
            continue;
          }

          const maxAbsLoss = this.config.terminalSendMaxAbsoluteLoss;
          if (typeof maxAbsLoss === 'number' && cost > maxAbsLoss) {
            const best = this.findLargestViableAmountForLossAndEnergy(donor.room.name, recv.room.name, RESOURCE_ENERGY, amountWanted, maxAbsLoss);
            if (!best || best <= 0) {
              if (this.config.logEnabled) this.logPush(`skipped send ${amountWanted} ENERGY from ${donor.room.name} to ${recv.room.name} - absolute loss ${cost} > max ${maxAbsLoss}`);
              continue;
            }
            if (best < amountWanted) {
              if (this.config.logEnabled) this.logPush(`reducing send ${amountWanted} -> ${best} ENERGY from ${donor.room.name} to ${recv.room.name} to meet loss and energy constraints`);
            }
            const reducedAmount = best;
            const reducedCost = this.estimateSendCost(reducedAmount, donor.room.name, recv.room.name);
            if (!isFinite(reducedCost)) continue;
            const donorTermEnergyNow = (donor.room.terminal && donor.room.terminal.store[RESOURCE_ENERGY]) || 0;
            if (donorTermEnergyNow < (reducedAmount + reducedCost)) {
              if (this.config.logEnabled) this.logPush(`skipped reduced send ${reducedAmount} ENERGY from ${donor.room.name} - insufficient energy for reduced amount+cost (${donorTermEnergyNow} < ${reducedAmount + reducedCost})`);
              continue;
            }
            const reducedNet = reducedAmount - reducedCost;
            if (reducedNet <= 0) {
              if (this.config.logEnabled) this.logPush(`skipped reduced send ${reducedAmount} ENERGY from ${donor.room.name} to ${recv.room.name} - netArrival <= 0 (loss ${reducedCost})`);
              continue;
            }
            const ratioLimitNow = this.config.terminalSendInefficiencyRatio || 2.0;
            if ((reducedAmount / reducedNet) > ratioLimitNow) {
              if (this.config.logEnabled) this.logPush(`skipped reduced send ${reducedAmount} ENERGY from ${donor.room.name} to ${recv.room.name} - inefficient after reduction (loss ${reducedCost})`);
              continue;
            }
            const sentReduced = this.trySendTerminal(donor.room, recv.room.name, RESOURCE_ENERGY, reducedAmount);
            if (sentReduced) recv.deficit -= reducedAmount;
            else if (this.config.logEnabled) this.logPush(`failed send ${reducedAmount} ENERGY from ${donor.room.name} to ${recv.room.name}`);
            continue;
          }
        }

        const sent = this.trySendTerminal(donor.room, recv.room.name, resource, amountWanted);
        if (sent) recv.deficit -= amountWanted;
        else if (this.config.logEnabled) this.logPush(`failed send ${amountWanted} ${resource} from ${donor.room.name} to ${recv.room.name}`);

        if (recv.deficit <= 0) break;
      } // donors
    } // receivers
  },

  // --- market sells (odd ticks)
  totalGlobalEnergy() {
    let total = 0;
    for (const rname in Memory.Trade.rooms) {
      const room = Game.rooms[rname];
      if (!room) continue;
      total += this.getRoomAmount(room, RESOURCE_ENERGY);
    }
    return total;
  },

  tryMarketSellEnergy() {
    const totalEnergy = this.totalGlobalEnergy();
    if (totalEnergy < this.config.sellEnergyGlobalThreshold) return;

    let targetKeep = 0;
    for (const rname in Memory.Trade.rooms) {
      const want = Memory.Trade.rooms[rname].wants && Memory.Trade.rooms[rname].wants[RESOURCE_ENERGY];
      targetKeep += want || this.config.desiredEnergy;
    }

    const globalSurplus = totalEnergy - targetKeep;
    const sellBudget = Math.max(0, Math.min(globalSurplus, totalEnergy - 900000));
    if (sellBudget <= 0) return;

    const candidateRooms = [];
    for (const rname in Memory.Trade.rooms) {
      const room = Game.rooms[rname];
      if (!room || !room.terminal) continue;
      const want = Memory.Trade.rooms[rname].wants && Memory.Trade.rooms[rname].wants[RESOURCE_ENERGY];
      const have = this.getRoomAmount(room, RESOURCE_ENERGY);
      const desired = want || this.config.desiredEnergy;
      const surplus = have - desired;
      if (surplus <= 0) continue;
      const sellPoint = (Memory.Trade.rooms[rname].sellPoint && Memory.Trade.rooms[rname].sellPoint[RESOURCE_ENERGY]) || null;
      candidateRooms.push({ room, have, surplus, sellPoint });
    }
    candidateRooms.sort((a, b) => b.surplus - a.surplus);

    let remainingGlobal = sellBudget;
    const buyOrders = Game.market.getAllOrders(order => order.resourceType === RESOURCE_ENERGY && order.type === ORDER_BUY) || [];
    buyOrders.sort((a, b) => b.price - a.price);

    for (const candidate of candidateRooms) {
      if (remainingGlobal <= 0) break;
      const room = candidate.room;
      let roomSurplus = Math.min(candidate.surplus, remainingGlobal);
      if (roomSurplus <= 0) continue;

      let termAmt = (room.terminal && room.terminal.store[RESOURCE_ENERGY]) || 0;
      roomSurplus = Math.min(roomSurplus, termAmt);
      if (roomSurplus <= 0) continue;

      const roomSellPrice = candidate.sellPoint;
      
      // PRIORITY 1: Fulfill buy orders (deals) first
      for (const order of buyOrders) {
        if (roomSurplus <= 0) break;
        if (roomSellPrice !== null && order.price < roomSellPrice) break;
        const will = Math.min(roomSurplus, order.amount, termAmt);
        if (will <= 0) continue;
        const cost = Game.market.calcTransactionCost(will, room.name, order.roomName);
        const engAvail = (room.terminal && room.terminal.store[RESOURCE_ENERGY]) || 0;
        if (engAvail < cost) {
          if (this.config.logEnabled) this.logPush(`skipped market deal ${will} energy from ${room.name} -> order ${order.id} - insufficient energy for cost`);
          continue;
        }
        const res = Game.market.deal(order.id, will, room.name);
        if (res === OK) {
          roomSurplus -= will;
          remainingGlobal -= will;
          order.amount -= will;
          termAmt -= will;
          const profit = Math.round(will * order.price);
          this.recordProfit(profit, RESOURCE_ENERGY, will, 'sell');
          this.logPush(`sold ${will} ${RESOURCE_ENERGY} ${room.name} made points ${profit}`);
        } else {
          if (this.config.logEnabled) this.logPush(`market.deal failed ${res} for ${will} energy from ${room.name}`);
        }
      }

      // PRIORITY 2: Create sell orders only if there's still surplus AND no active orders exist
      if (roomSurplus > 0) {
        // Check for existing active sell orders
        const existingOrderAmount = this.getActiveSellOrderAmount(room.name, RESOURCE_ENERGY);
        
        if (existingOrderAmount > 0) {
          if (this.config.logEnabled) this.logPush(`skipped creating sell order for ${room.name} - already has ${existingOrderAmount} ENERGY in active orders`);
          continue;
        }
        
        const creatable = Math.min(roomSurplus, termAmt);
        if (creatable > 0) {
          try {
            const sellPrice = this.computeSellOrderPrice(RESOURCE_ENERGY, roomSellPrice);
            Game.market.createOrder({
              type: ORDER_SELL,
              resourceType: RESOURCE_ENERGY,
              price: sellPrice,
              totalAmount: creatable,
              roomName: room.name
            });
            this.logPush(`created sell order ${creatable} energy @ ${sellPrice} from ${room.name} term:${(room.terminal&&room.terminal.store[RESOURCE_ENERGY])||0}`);
            remainingGlobal -= creatable;
            termAmt -= creatable;
            roomSurplus -= creatable;
          } catch (e) {
            if (this.config.logEnabled) this.logPush(`createOrder failed for ${room.name}`);
          }
        }
      }
    }
  },

  // --- market sells for resources (other than energy)
  tryMarketSellResource(resource) {
    if (resource === RESOURCE_ENERGY) return;  // Use tryMarketSellEnergy for energy
    
    const candidateRooms = [];
    for (const rname in Memory.Trade.rooms) {
      const room = Game.rooms[rname];
      if (!room || !room.terminal) continue;
      
      // Special handling for room's own harvested mineral
      const roomMineral = Memory.rooms && Memory.rooms[rname] && Memory.rooms[rname].Mineral;
      const isOwnMineral = (resource === roomMineral);
      
      const want = Memory.Trade.rooms[rname].wants && Memory.Trade.rooms[rname].wants[resource];
      const have = this.getRoomAmount(room, resource);
      
      // For own mineral: sell at 9800 to create constant income stream
      // Lab Manager maintains 10k reserve, so we sell before hitting that limit
      // This creates a sustainable cycle: mine → 9800 → sell → mine → 9800 → sell
      // For other resources, use configured want or default threshold
      let threshold;
      if (isOwnMineral) {
        // Sell at 9800 to maintain continuous income while labs keep their reserve
        threshold = 9800;
      } else {
        threshold = want !== undefined ? want : this.config.sellResourceThreshold;
      }
      
      const surplus = have - threshold;
      
      if (surplus <= 0) continue;
      
      const sellPoint = (Memory.Trade.rooms[rname].sellPoint && Memory.Trade.rooms[rname].sellPoint[resource]) || null;
      candidateRooms.push({ room, have, surplus, sellPoint });
    }
    
    if (candidateRooms.length === 0) return;
    
    candidateRooms.sort((a, b) => b.surplus - a.surplus);
    
    const buyOrders = Game.market.getAllOrders(order => 
      order.resourceType === resource && order.type === ORDER_BUY) || [];
    buyOrders.sort((a, b) => b.price - a.price);
    
    for (const candidate of candidateRooms) {
      const room = candidate.room;
      let roomSurplus = candidate.surplus;
      if (roomSurplus <= 0) continue;
      
      let termAmt = (room.terminal && room.terminal.store[resource]) || 0;
      roomSurplus = Math.min(roomSurplus, termAmt);
      if (roomSurplus <= 0) continue;
      
      const roomSellPrice = candidate.sellPoint;
      
      // PRIORITY 1: Fulfill buy orders (deals) first
      for (const order of buyOrders) {
        if (roomSurplus <= 0) break;
        if (roomSellPrice !== null && order.price < roomSellPrice) break;
        
        const will = Math.min(roomSurplus, order.amount, termAmt);
        if (will <= 0) continue;
        
        const cost = Game.market.calcTransactionCost(will, room.name, order.roomName);
        const engAvail = (room.terminal && room.terminal.store[RESOURCE_ENERGY]) || 0;
        if (engAvail < cost) {
          if (this.config.logEnabled) this.logPush(`skipped market deal ${will} ${resource} from ${room.name} -> order ${order.id} - insufficient energy for cost`);
          continue;
        }
        
        const res = Game.market.deal(order.id, will, room.name);
        if (res === OK) {
          roomSurplus -= will;
          order.amount -= will;
          termAmt -= will;
          const profit = Math.round(will * order.price);
          this.recordProfit(profit, resource, will, 'sell');
          this.logPush(`sold ${will} ${resource} ${room.name} made points ${profit}`);
        } else {
          if (this.config.logEnabled) this.logPush(`market.deal failed ${res} for ${will} ${resource} from ${room.name}`);
        }
      }
      
      // PRIORITY 2: Create sell orders only if there's still surplus AND no active orders exist
      if (roomSurplus > 0) {
        // Check for existing active sell orders
        const existingOrderAmount = this.getActiveSellOrderAmount(room.name, resource);
        
        if (existingOrderAmount > 0) {
          if (this.config.logEnabled) this.logPush(`skipped creating sell order for ${room.name} - already has ${existingOrderAmount} ${resource} in active orders`);
          continue;
        }
        
        const creatable = Math.min(roomSurplus, termAmt);
        if (creatable > 0) {
          try {
            const sellPrice = this.computeSellOrderPrice(resource, roomSellPrice);
            Game.market.createOrder({
              type: ORDER_SELL,
              resourceType: resource,
              price: sellPrice,
              totalAmount: creatable,
              roomName: room.name
            });
            this.logPush(`created sell order ${creatable} ${resource} @ ${sellPrice} from ${room.name}`);
          } catch (e) {
            if (this.config.logEnabled) this.logPush(`createOrder failed for ${resource} in ${room.name}`);
          }
        }
      }
    }
  },

  // --- market buying (purchase requests)
  tryMarketBuyResources() {
    // Process purchase requests from all rooms
    for (const rname in Memory.Trade.rooms) {
      const room = Game.rooms[rname];
      if (!room || !room.terminal) continue;
      
      const purchaseRequests = Memory.Trade.rooms[rname].purchaseRequests || {};
      
      for (const resource in purchaseRequests) {
        const request = purchaseRequests[resource];
        if (!request || !request.amount || request.amount <= 0) continue;
        
        const maxPrice = request.maxPrice || Infinity;
        const currentAmount = this.getRoomAmount(room, resource);
        const needed = request.amount - currentAmount;
        
        if (needed <= 0) {
          // Request fulfilled, remove it
          delete purchaseRequests[resource];
          this.logPush(`purchase request fulfilled for ${resource} in ${room.name}`);
          continue;
        }
        
        // CRITICAL: Don't buy if we would drop below minCredits reserve
        const minCreditsRequired = (Memory.Trade && Memory.Trade.minCredits) || 0;
        const currentCredits = (Game.market && Game.market.credits) || 0;
        
        if (currentCredits <= minCreditsRequired) {
          if (this.config.logEnabled) {
            this.logPush(`BLOCKED purchase for ${resource} in ${room.name} - credits (${currentCredits}) <= minCredits reserve (${minCreditsRequired})`);
          }
          continue;
        }
        
        // Find best sell orders
        const sellOrders = Game.market.getAllOrders(order => 
          order.resourceType === resource && 
          order.type === ORDER_SELL &&
          order.price <= maxPrice
        ) || [];
        
        if (sellOrders.length === 0) {
          if (this.config.logEnabled) this.logPush(`no sell orders found for ${resource} at price <= ${maxPrice}`);
          continue;
        }
        
        // Sort by price (cheapest first)
        sellOrders.sort((a, b) => a.price - b.price);
        
        let remaining = needed;
        const termFree = this.terminalFreeCapacity(room);
        
        for (const order of sellOrders) {
          if (remaining <= 0) break;
          if (termFree <= 0) {
            if (this.config.logEnabled) this.logPush(`skipped buying ${resource} for ${room.name} - terminal full`);
            break;
          }
          
          const buyAmount = Math.min(remaining, order.amount, termFree);
          if (buyAmount <= 0) continue;
          
          const cost = Game.market.calcTransactionCost(buyAmount, room.name, order.roomName);
          const engAvail = (room.terminal && room.terminal.store[RESOURCE_ENERGY]) || 0;
          
          if (engAvail < cost) {
            if (this.config.logEnabled) this.logPush(`skipped buying ${buyAmount} ${resource} for ${room.name} - insufficient energy for transfer cost`);
            continue;
          }
          
          // Check if we have enough credits AND won't drop below minCredits
          const creditCost = buyAmount * order.price;
          const creditsAfterBuy = currentCredits - creditCost;
          const minCreditsHardFloor = (Memory.Trade && Memory.Trade.minCredits) || 0;
          
          if (Game.market.credits < creditCost) {
            if (this.config.logEnabled) this.logPush(`skipped buying ${buyAmount} ${resource} for ${room.name} - insufficient credits (have ${Game.market.credits}, need ${creditCost})`);
            continue;
          }
          
          if (creditsAfterBuy < minCreditsHardFloor) {
            if (this.config.logEnabled) this.logPush(`BLOCKED buying ${buyAmount} ${resource} for ${room.name} - would drop below minCredits (${creditsAfterBuy} < ${minCreditsHardFloor})`);
            continue;
          }
          
          const res = Game.market.deal(order.id, buyAmount, room.name);
          if (res === OK) {
            remaining -= buyAmount;
            const spent = Math.round(buyAmount * order.price);
            this.recordProfit(-spent, resource, buyAmount, 'buy');
            this.logPush(`bought ${buyAmount} ${resource} for ${room.name} spent ${spent} credits @ ${order.price.toFixed(3)}`);
          } else {
            if (this.config.logEnabled) this.logPush(`market.deal failed ${res} for buying ${buyAmount} ${resource}`);
          }
        }
      }
    }
  },

  // --- public API helpers
  setRoomWant(roomName, resource, amount) {
    if (!Memory.Trade) Memory.Trade = { rooms: {} };
    if (!Memory.Trade.rooms[roomName]) Memory.Trade.rooms[roomName] = { wants: {}, buyPoint: {}, sellPoint: {}, priority: 0, neighbors: [], neighborsLastComputed: 0, purchaseRequests: {} };
    Memory.Trade.rooms[roomName].wants[resource] = amount;
  },

  setBuySellPoints(roomName, resource, buyPrice, sellPrice) {
    if (!Memory.Trade) Memory.Trade = { rooms: {} };
    if (!Memory.Trade.rooms[roomName]) Memory.Trade.rooms[roomName] = { wants: {}, buyPoint: {}, sellPoint: {}, priority: 0, neighbors: [], neighborsLastComputed: 0, purchaseRequests: {} };
    if (buyPrice !== undefined) Memory.Trade.rooms[roomName].buyPoint[resource] = buyPrice;
    if (sellPrice !== undefined) Memory.Trade.rooms[roomName].sellPoint[resource] = sellPrice;
  },

  setPurchaseRequest(roomName, resource, amount, maxPrice) {
    if (!Memory.Trade) Memory.Trade = { rooms: {} };
    if (!Memory.Trade.rooms[roomName]) Memory.Trade.rooms[roomName] = { wants: {}, buyPoint: {}, sellPoint: {}, priority: 0, neighbors: [], neighborsLastComputed: 0, purchaseRequests: {} };
    if (!Memory.Trade.rooms[roomName].purchaseRequests) Memory.Trade.rooms[roomName].purchaseRequests = {};
    
    if (amount > 0) {
      Memory.Trade.rooms[roomName].purchaseRequests[resource] = {
        amount: amount,
        maxPrice: maxPrice || Infinity
      };
      return `Set purchase request: ${roomName} wants ${amount} ${resource} at max price ${maxPrice || 'any'}`;
    } else {
      // Remove the request
      delete Memory.Trade.rooms[roomName].purchaseRequests[resource];
      return `Removed purchase request for ${resource} in ${roomName}`;
    }
  },

  clearPurchaseRequests(roomName) {
    if (!Memory.Trade || !Memory.Trade.rooms[roomName]) return 'Room not found';
    Memory.Trade.rooms[roomName].purchaseRequests = {};
    return `Cleared all purchase requests for ${roomName}`;
  },

  enableLogging() {
    this.config.logEnabled = true;
    return 'Trade logging enabled';
  },

  disableLogging() {
    this.config.logEnabled = false;
    return 'Trade logging disabled';
  },

  forceRecomputeNeighbors(roomName) {
    if (roomName) {
      this.computeNeighborsForRoom(roomName, true);
      return `Recomputed neighbors for ${roomName}`;
    } else {
      for (const rname in Memory.Trade.rooms) {
        this.computeNeighborsForRoom(rname, true);
      }
      return 'Recomputed neighbors for all rooms';
    }
  },

  getStats() {
    const stats = Memory.Trade.stats || { totalProfit: 0, totalTransactions: 0, recentProfits: [] };
    const recentProfit = this.getRecentProfit();
    return {
      totalProfit: this.getTotalProfit(),
      totalTransactions: stats.totalTransactions,
      profitLast1000Ticks: recentProfit,
      recentTransactionCount: stats.recentProfits.length,
      reservedCredits: (Memory.Trade && Memory.Trade.reservedCredits) || 0,
      minCredits: (Memory.Trade && Memory.Trade.minCredits) || 0,
      credits: (Game.market && Game.market.credits) || 0,
      atWar: !!(Memory.Trade && Memory.Trade.AtWar),
      sampleMarket: {
        // show a couple of market snapshots for quick diagnostics
        energyBestBuy: this.getMarketBestBuyPrice(RESOURCE_ENERGY),
        energyLowestSell: this.getMarketLowestSellPrice(RESOURCE_ENERGY)
      }
    };
  },

  // --- main run
  run() {
    this.ensureMemory();
    
    // Auto-grow minCredits when credits increase (1% of growth)
    this.updateMinCreditsFromGrowth();
    
    for (const rname in Memory.Trade.rooms) if (Game.rooms[rname]) this.computeNeighborsForRoom(rname, false);
    for (const rname in Memory.Trade.rooms) this.ensureRoomWants(rname);

    const useAlternate = !!this.config.alternateTickMode;
    const isEvenTick = (Game.time % 2) === 0;

    // Collect all resources that need balancing
    const resourcesToBalance = new Set();
    resourcesToBalance.add(RESOURCE_ENERGY);  // Always balance energy
    
    // Add all trackable resources
    for (const res of this.TRACKABLE_RESOURCES) {
      resourcesToBalance.add(res);
    }
    
    // Also add any resources explicitly configured in room wants
    for (const rname in Memory.Trade.rooms) {
      const wants = Memory.Trade.rooms[rname].wants || {};
      for (const res in wants) {
        resourcesToBalance.add(res);
      }
    }

    if (useAlternate) {
      if (isEvenTick) {
        // Balance resources on even ticks
        for (const res of resourcesToBalance) {
          this.balanceResource(res);
        }
      } else {
        // Process purchases first (odd ticks)
        this.tryMarketBuyResources();
        
        // Then sell excess
        this.tryMarketSellEnergy();
        
        // Sell excess of other resources
        for (const res of this.TRACKABLE_RESOURCES) {
          this.tryMarketSellResource(res);
        }
      }
    } else {
      // Do everything every tick (original behavior)
      for (const res of resourcesToBalance) {
        this.balanceResource(res);
      }
      this.tryMarketBuyResources();
      this.tryMarketSellEnergy();
      
      for (const res of this.TRACKABLE_RESOURCES) {
        this.tryMarketSellResource(res);
      }
    }
  }
};

module.exports = TradeManager;
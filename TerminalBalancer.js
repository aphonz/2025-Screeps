

const Trade = {
  config: {
    _interval: 300,
    _maxHistoryPerRoom: 20,
    // resources to prefer balancing first; module will auto-add all seen resources
    trackedResources: ['energy'],
    surplusThreshold: { energy: 10000 },
    deficitThreshold: { energy: 2000 },
    minTransfer: { energy: 500 },
    sellThreshold: { energy: 20000 },
    preferTerminalTransfer: true,
    terminalEnergyReserve: 10000,
    minTerminalSendEnergy: 1000,
    maxOrderAge: 5000,
    priorityPartners: [],
    attemptPartnerSends: true,
    autoDiscoverTradeableRooms: true,
    // Market buy controls
    enableMarketBuys: true,
    // Only auto-buy energy and resources needed to add a safe room
    allowBuyResources: ['energy'],
    // Conservative budget threshold: require globalEnergySurplus >= this before placing buy orders
    globalEnergySurplusRequired: 20000,
    // Minimal buy amount per order
    minBuyAmount: 500,
    // Requirements for considering a room "safe" and which resources to acquire for it
    safeRoomRequirements: {
      // example room role template name: { resources: {RESOURCE: amount}, minTerminalEnergy: 5000 }
      // operator can add entries for rooms intended to be made safe before claiming/expanding
      // module will buy missing resources if global energy surplus exists and allowBuyResources includes those resource keys
    }
  },

  _ensureMemory() {
    if (!Memory.Trade) Memory.Trade = {};
    if (!Memory.Trade.rooms) Memory.Trade.rooms = {};
    if (!Array.isArray(Memory.Trade.trackedRooms)) Memory.Trade.trackedRooms = [];
    if (!Array.isArray(Memory.Trade.internalOrders)) Memory.Trade.internalOrders = [];
    if (!Array.isArray(Memory.Trade.externalOrders)) Memory.Trade.externalOrders = [];
    if (typeof Memory.Trade.lastRecorded !== 'number') Memory.Trade.lastRecorded = 0;
  },

  addRoom(roomName) {
    this._ensureMemory();
    if (!Memory.Trade.trackedRooms.includes(roomName)) Memory.Trade.trackedRooms.push(roomName);
  },

  removeRoom(roomName) {
    this._ensureMemory();
    Memory.Trade.trackedRooms = Memory.Trade.trackedRooms.filter(r => r !== roomName);
    delete Memory.Trade.rooms[roomName];
  },

  getRoomData(roomName) {
    this._ensureMemory();
    const r = Memory.Trade.rooms[roomName];
    if (!r || !Array.isArray(r.history) || r.history.length === 0) return null;
    return r.history[r.history.length - 1];
  },

  _readStore(struct) {
    if (!struct || !struct.store) return {};
    const out = {};
    for (const k in struct.store) {
      const v = struct.store[k];
      if (typeof v === 'number' && v > 0) out[k.toLowerCase()] = v;
    }
    return out;
  },

  // discover owned rooms with terminals and always add them
  _discoverTradeableRooms() {
    if (!this.config.autoDiscoverTradeableRooms) return;
    this._ensureMemory();
    const myRooms = Object.values(Game.rooms).filter(r => r.controller && r.controller.my && r.terminal);
    for (const room of myRooms) {
      if (!Memory.Trade.trackedRooms.includes(room.name)) Memory.Trade.trackedRooms.push(room.name);
    }
  },

  _recordRoom(roomName) {
    const room = Game.rooms[roomName];
    const storage = room && room.storage ? room.storage : null;
    const terminal = room && room.terminal ? room.terminal : null;

    const snapshot = {
      tick: Game.time,
      storage: this._readStore(storage),
      terminal: this._readStore(terminal),
      hasStorage: !!storage,
      hasTerminal: !!terminal,
      visible: !!room
    };

    if (!Memory.Trade.rooms[roomName]) Memory.Trade.rooms[roomName] = { history: [], lastSeenTick: Game.time };
    Memory.Trade.rooms[roomName].history.push(snapshot);
    Memory.Trade.rooms[roomName].lastSeenTick = Game.time;

    const hist = Memory.Trade.rooms[roomName].history;
    if (hist.length > this.config._maxHistoryPerRoom) {
      Memory.Trade.rooms[roomName].history = hist.slice(hist.length - this.config._maxHistoryPerRoom);
    }
  },

  // auto-extend config.trackedResources with any resource seen in snapshots
  _extendTrackedResourcesFromSnapshots() {
    this._ensureMemory();
    const seen = new Set((this.config.trackedResources || []).map(s => s.toLowerCase()));
    for (const rn of Memory.Trade.trackedRooms) {
      const latest = this.getRoomData(rn);
      if (!latest) continue;
      for (const res of Object.keys(latest.storage || {})) seen.add(res.toLowerCase());
      for (const res of Object.keys(latest.terminal || {})) seen.add(res.toLowerCase());
    }
    this.config.trackedResources = Array.from(seen);
  },

  _gatherBalances() {
    const balances = {};
    for (const rn of Memory.Trade.trackedRooms) {
      balances[rn] = {};
      const latest = this.getRoomData(rn);
      for (const res of this.config.trackedResources) {
        const storageAmt = latest && latest.storage && latest.storage[res] ? latest.storage[res] : 0;
        const termAmt = latest && latest.terminal && latest.terminal[res] ? latest.terminal[res] : 0;
        balances[rn][res] = { storage: storageAmt, terminal: termAmt, total: storageAmt + termAmt };
      }
    }
    return balances;
  },

  // check if terminal send is feasible given energy reserve and cooldown
  _canTerminalSend(fromRoom, toRoom, amount, resource) {
    const fromTerm = Game.rooms[fromRoom] && Game.rooms[fromRoom].terminal;
    const toTerm = Game.rooms[toRoom] && Game.rooms[toRoom].terminal;
    if (!fromTerm || !toTerm) return false;
    if (fromTerm.cooldown && fromTerm.cooldown > 0) return false;
    const calc = Game.market && Game.market.calcTransactionCost ? Game.market.calcTransactionCost(amount, fromRoom, toRoom) : 0;
    const fromEnergy = (fromTerm.store && fromTerm.store.energy) || 0;
    if (fromEnergy - calc < this.config.terminalEnergyReserve) return false;
    if (fromEnergy < this.config.minTerminalSendEnergy) return false;
    const available = (fromTerm.store && (fromTerm.store[resource] || 0)) || 0;
    return available >= Math.max((this.config.minTransfer[resource] || 1), 1);
  },

  _attemptTerminalSend(fromRoom, toRoom, resource, amount) {
    const fromTerm = Game.rooms[fromRoom] && Game.rooms[fromRoom].terminal;
    if (!fromTerm) return false;
    const available = (fromTerm.store && (fromTerm.store[resource] || 0)) || 0;
    const sendAmount = Math.min(available, amount);
    if (sendAmount < (this.config.minTransfer[resource] || 1)) return false;
    const code = fromTerm.send(resource.toUpperCase(), Math.floor(sendAmount), toRoom, `trade ${Game.time}`);
    if (code === OK) {
      Memory.Trade.internalOrders.push({
        id: `t:${Game.time}:${resource}:${fromRoom}->${toRoom}:${Math.floor(Math.random()*1e6)}`,
        tick: Game.time,
        from: fromRoom,
        to: toRoom,
        resource,
        amount: Math.floor(sendAmount),
        method: 'terminal.send',
        status: 'sent'
      });
      return true;
    }
    return false;
  },

  _generateInternalSends() {
    const balances = this._gatherBalances();
    const resources = this.config.trackedResources;
    for (const res of resources) {
      const surplusThreshold = (this.config.surplusThreshold && this.config.surplusThreshold[res]) || 0;
      const deficitThreshold = (this.config.deficitThreshold && this.config.deficitThreshold[res]) || 0;
      const minTransfer = (this.config.minTransfer && this.config.minTransfer[res]) || 1;

      const surplusRooms = [];
      const deficitRooms = [];

      for (const rn of Object.keys(balances)) {
        const total = balances[rn][res] ? balances[rn][res].total : 0;
        if (total > surplusThreshold) surplusRooms.push({ room: rn, amount: total - surplusThreshold });
        else if (total < deficitThreshold) deficitRooms.push({ room: rn, amount: deficitThreshold - total });
      }

      if (surplusRooms.length === 0 || deficitRooms.length === 0) continue;

      surplusRooms.sort((a,b) => b.amount - a.amount);
      deficitRooms.sort((a,b) => b.amount - a.amount);

      for (const deficit of deficitRooms) {
        if (deficit.amount < minTransfer) continue;
        for (const surplus of surplusRooms) {
          if (surplus.amount < minTransfer) continue;
          if (deficit.amount <= 0) break;
          if (surplus.amount <= 0) continue;

          const want = Math.min(surplus.amount, deficit.amount);
          if (want < minTransfer) continue;

          if (this.config.preferTerminalTransfer &&
              Game.rooms[surplus.room] && Game.rooms[deficit.room] &&
              this._canTerminalSend(surplus.room, deficit.room, want, res)) {
            const sent = this._attemptTerminalSend(surplus.room, deficit.room, res, want);
            if (sent) {
              surplus.amount -= want;
              deficit.amount -= want;
              continue;
            }
          }

          // try smaller amount limited by terminal availability
          if (this.config.preferTerminalTransfer &&
              Game.rooms[surplus.room] && Game.rooms[deficit.room]) {
            const fromTerm = Game.rooms[surplus.room].terminal;
            const availableTerm = fromTerm && fromTerm.store && (fromTerm.store[res] || 0) ? fromTerm.store[res] : 0;
            const attemptAmount = Math.min(want, availableTerm);
            if (attemptAmount >= minTransfer && this._canTerminalSend(surplus.room, deficit.room, attemptAmount, res)) {
              const sent = this._attemptTerminalSend(surplus.room, deficit.room, res, attemptAmount);
              if (sent) {
                surplus.amount -= attemptAmount;
                deficit.amount -= attemptAmount;
                continue;
              }
            }
          }
        }
      }
    }
  },

  _attemptPartnerSends() {
    if (!this.config.attemptPartnerSends || !Array.isArray(this.config.priorityPartners) || this.config.priorityPartners.length === 0) return;
    const balances = this._gatherBalances();
    const resources = this.config.trackedResources;

    for (const rn of Object.keys(balances)) {
      const roomData = this.getRoomData(rn);
      if (!roomData) continue;
      for (const res of resources) {
        const terminalAmt = (roomData.terminal && roomData.terminal[res]) || 0;
        const sellThresh = (this.config.sellThreshold && this.config.sellThreshold[res]) || Infinity;
        const minTransfer = (this.config.minTransfer && this.config.minTransfer[res]) || 1;
        const surplusThreshold = (this.config.surplusThreshold && this.config.surplusThreshold[res]) || 0;
        if (terminalAmt <= Math.max(sellThresh, surplusThreshold, minTransfer)) continue;

        for (const partner of this.config.priorityPartners) {
          // detect partner rooms in tracked list
          const partnerRooms = [];
          for (const tracked of Memory.Trade.trackedRooms) {
            const gRoom = Game.rooms[tracked];
            if (!gRoom || !gRoom.controller || !gRoom.controller.owner) continue;
            if (gRoom.controller.owner.username === partner && gRoom.terminal) partnerRooms.push(tracked);
          }

          let sentToPartner = false;
          for (const targetRoom of partnerRooms) {
            if (!Game.rooms[targetRoom] || !Game.rooms[targetRoom].terminal) continue;
            const sendAmount = Math.floor(Math.min(terminalAmt - sellThresh, terminalAmt - (this.config.minTransfer[res] || 1)));
            if (sendAmount < minTransfer) continue;
            if (!this._canTerminalSend(rn, targetRoom, sendAmount, res)) continue;
            const ok = this._attemptTerminalSend(rn, targetRoom, res, sendAmount);
            if (ok) {
              Memory.Trade.externalOrders.push({
                id: `p:${Game.time}:${res}:${rn}->${targetRoom}`,
                tick: Game.time,
                from: rn,
                to: targetRoom,
                partner,
                resource: res,
                amount: sendAmount,
                method: 'terminal.send',
                status: 'sent'
              });
              sentToPartner = true;
              break;
            }
          }
          if (sentToPartner) break;
        }
      }
    }
  },

  // compute a conservative global energy surplus across tracked rooms
  _computeGlobalEnergySurplus() {
    let totalEnergy = 0;
    let reserved = 0;
    for (const rn of Memory.Trade.trackedRooms) {
      const latest = this.getRoomData(rn);
      if (!latest) continue;
      const termE = (latest.terminal && latest.terminal.energy) || 0;
      const storE = (latest.storage && latest.storage.energy) || 0;
      totalEnergy += termE + storE;
      reserved += (this.config.terminalEnergyReserve || 0); // simple per-room reservation
    }
    return Math.max(0, totalEnergy - reserved);
  },

  // create market sell orders for terminal excess
  _sellExcessToMarket() {
    const balances = this._gatherBalances();
    for (const rn of Object.keys(balances)) {
      const roomData = this.getRoomData(rn);
      if (!roomData) continue;
      const terminalStore = roomData.terminal || {};
      for (const res of this.config.trackedResources) {
        const sellThresh = (this.config.sellThreshold && this.config.sellThreshold[res]) || Infinity;
        const terminalAmt = terminalStore[res] || 0;
        if (terminalAmt > sellThresh) {
          const sellAmount = Math.floor(terminalAmt - sellThresh);
          if (sellAmount < (this.config.minTransfer[res] || 1)) continue;
          const price = res === 'energy' ? 0.05 : 0.1;
          const code = Game.market.createOrder({
            type: ORDER_SELL,
            resourceType: res.toUpperCase(),
            price,
            totalAmount: sellAmount,
            roomName: rn
          });
          if (code === OK) {
            Memory.Trade.externalOrders.push({
              id: `m:${Game.time}:${res}:${rn}`,
              tick: Game.time,
              from: rn,
              to: 'market',
              resource: res,
              amount: sellAmount,
              method: 'market.createOrder',
              price,
              status: 'created'
            });
          }
        }
      }
    }
  },

  // place market buy orders for energy and for resources needed to make a room safe
  _placeMarketBuysWhenAffordable() {
    if (!this.config.enableMarketBuys) return;
    const globalSurplus = this._computeGlobalEnergySurplus();
    if (globalSurplus < (this.config.globalEnergySurplusRequired || 0)) return;

    // attempt simple buys: ENERGY for rooms with low energy in terminal/storage
    for (const rn of Memory.Trade.trackedRooms) {
      const latest = this.getRoomData(rn);
      if (!latest) continue;
      const terminalAmt = (latest.terminal && latest.terminal.energy) || 0;
      const storageAmt = (latest.storage && latest.storage.energy) || 0;
      const totalEnergy = terminalAmt + storageAmt;

      const deficitThreshold = (this.config.deficitThreshold && this.config.deficitThreshold.energy) || 0;
      const want = Math.max(0, deficitThreshold - totalEnergy);
      const buyAmount = Math.floor(Math.min(want, globalSurplus, this.config.minBuyAmount || 0));
      if (buyAmount >= (this.config.minBuyAmount || 1) && this.config.allowBuyResources.includes('energy')) {
        // place an immediate market.buy order using the cheapest available sell order via market.buy? Use createOrder then leave it for operator or market.fill
        // We'll create a buy order on the room to let others sell into it
        const price = 0.06; // slightly above default sell price to attract sellers
        const code = Game.market.createOrder({
          type: ORDER_BUY,
          resourceType: 'ENERGY',
          price,
          totalAmount: buyAmount,
          roomName: rn
        });
        if (code === OK) {
          Memory.Trade.externalOrders.push({
            id: `b:${Game.time}:energy:${rn}`,
            tick: Game.time,
            from: 'market',
            to: rn,
            resource: 'energy',
            amount: buyAmount,
            method: 'market.createOrder',
            price,
            status: 'created'
          });
        }
      }
    }

    // attempt buys for safe room requirements
    for (const roomTemplate in this.config.safeRoomRequirements) {
      const req = this.config.safeRoomRequirements[roomTemplate];
      if (!req || !req.resources) continue;
      for (const res in req.resources) {
        const resKey = res.toLowerCase();
        if (!this.config.allowBuyResources.includes(resKey)) continue;
        const need = req.resources[res];
        // buy only if globalSurplus remains sufficient
        const buyAmount = Math.floor(Math.min(need, globalSurplus, this.config.minBuyAmount || need));
        if (buyAmount < (this.config.minBuyAmount || 1)) continue;
        const price = resKey === 'energy' ? 0.06 : 0.2;
        const code = Game.market.createOrder({
          type: ORDER_BUY,
          resourceType: res.toUpperCase(),
          price,
          totalAmount: buyAmount,
          roomName: Memory.Trade.trackedRooms[0] || undefined
        });
        if (code === OK) {
          Memory.Trade.externalOrders.push({
            id: `b:${Game.time}:${res}:${roomTemplate}`,
            tick: Game.time,
            from: 'market',
            to: roomTemplate,
            resource: resKey,
            amount: buyAmount,
            method: 'market.createOrder',
            price,
            status: 'created'
          });
        }
      }
    }
  },

  _cleanupOldOrders() {
    if (!Array.isArray(Memory.Trade.internalOrders)) Memory.Trade.internalOrders = [];
    if (!Array.isArray(Memory.Trade.externalOrders)) Memory.Trade.externalOrders = [];
    const maxAge = this.config.maxOrderAge || 5000;
    Memory.Trade.internalOrders = Memory.Trade.internalOrders.filter(o => (Game.time - (o.tick || 0)) <= maxAge);
    Memory.Trade.externalOrders = Memory.Trade.externalOrders.filter(o => (Game.time - (o.tick || 0)) <= maxAge);
  },

  run() {
    this._ensureMemory();

    // always auto-discover rooms with terminals
    this._discoverTradeableRooms();

    if (!Memory.Trade.trackedRooms || Memory.Trade.trackedRooms.length === 0) return;

    const timeToRecord = (Game.time - Memory.Trade.lastRecorded) >= this.config._interval;
    let missingRoom = false;
    for (const rn of Memory.Trade.trackedRooms) {
      if (!Game.rooms[rn]) {
        missingRoom = true;
        break;
      }
    }
    if (!timeToRecord && !missingRoom) return;

    // record snapshots
    for (const roomName of Memory.Trade.trackedRooms) {
      if (!Game.rooms[roomName]) {
        if (!Memory.Trade.rooms[roomName]) Memory.Trade.rooms[roomName] = { history: [], lastSeenTick: Game.time };
        Memory.Trade.rooms[roomName].history.push({
          tick: Game.time, storage: {}, terminal: {}, hasStorage: false, hasTerminal: false, visible: false
        });
        const hist = Memory.Trade.rooms[roomName].history;
        if (hist.length > this.config._maxHistoryPerRoom) Memory.Trade.rooms[roomName].history = hist.slice(hist.length - this.config._maxHistoryPerRoom);
        continue;
      }

      // only record rooms we control (controller.my) and have terminal, otherwise still create entry for visibility
      const spawnerPresent = Game.rooms[roomName].controller && Game.rooms[roomName].controller.my;
      if (!spawnerPresent && !missingRoom) {
        // still record visible snapshot if desired; keep behaviour conservative and record anyway if visible
      }

      this._recordRoom(roomName);
    }

    Memory.Trade.lastRecorded = Game.time;

    // auto-extend tracked resource list to everything observed
    this._extendTrackedResourcesFromSnapshots();

    // internal balancing using terminals only
    this._generateInternalSends();

    // attempt partner sends
    this._attemptPartnerSends();

    // sell market excess
    this._sellExcessToMarket();

    // attempt market buys for energy and safe room needs if global surplus exists
    this._placeMarketBuysWhenAffordable();

    this._cleanupOldOrders();
  }
};

module.exports = Trade;

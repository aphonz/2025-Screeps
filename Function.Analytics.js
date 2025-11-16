module.exports = {
    // Controller level upgrade point table
    RCL_POINTS: {
        0: 0,
        1: 0,
        2: 200,
        3: 45000,
        4: 135000,
        5: 405000,
        6: 1215000,
        7: 3645000,
        8: 10935000
    },

    /**
     * Update memory for a single room's controller stats if due (or forced).
     * Does not print; updates Memory.LongStats.controllers[roomName] and
     * Memory.LongStats.finalOutput[roomName] (and a cached allRooms string).
     *
     * @param {string} roomName
     * @param {object} [opts] optional config: { interval, historyLen, force }
     */
    updateControllerStats: function (roomName, opts = {}) {
        const interval = typeof opts.interval === 'number' ? opts.interval : 2000;
        const historyLen = typeof opts.historyLen === 'number' ? opts.historyLen : 7;
        const force = !!opts.force;
        const due = force || (Game.time % interval === 0);

        // Ensure memory containers exist
        if (!Memory.LongStats) Memory.LongStats = {};
        if (!Memory.LongStats.controllers) Memory.LongStats.controllers = {};
        if (!Memory.LongStats.finalOutput) Memory.LongStats.finalOutput = {};

        if (!due) return; // nothing to update this tick

        const room = Game.rooms[roomName];
        const controller = room && room.controller;

        // If room/controller not available or not owned -> clear cached output and exit
        if (!room || !controller || !controller.my) {
            if (Memory.LongStats.finalOutput[roomName]) delete Memory.LongStats.finalOutput[roomName];
            if (Memory.LongStats.controllers[roomName]) delete Memory.LongStats.controllers[roomName];
            // rebuild global cache after removal
            this._rebuildGlobalCache();
            return;
        }

        if (!Memory.LongStats.controllers[roomName]) {
            Memory.LongStats.controllers[roomName] = { history: [], potential: null };
        }
        const stats = Memory.LongStats.controllers[roomName];

        // Cache potential once (simple heuristic: spawn count * 10000)
        if (stats.potential == null) {
            const spawns = room.find(FIND_MY_SPAWNS).length;
            stats.potential = spawns * 10000;
        }
        const potential = stats.potential || 0;

        const progress = controller.progress || 0;
        const progressTotal = controller.progressTotal || 1; // avoid div-by-zero
        const progressK = Math.round(progress / 1000);
        const maxK = Math.round(progressTotal / 1000);
        const absolutePoints = (this.RCL_POINTS[controller.level] || 0) + progress;

        const entry = {
            tick: Game.time,
            level: controller.level,
            progress,
            progressTotal,
            progressK,
            maxK,
            absolutePoints
        };

        stats.history.push(entry);
        while (stats.history.length > historyLen) stats.history.shift();

        Memory.LongStats.controllers[roomName] = stats;

        // Update the per-room finalOutput line
        Memory.LongStats.finalOutput[roomName] = this._buildLineFromHistory(roomName, stats.history, potential);

        // Rebuild global cache
        this._rebuildGlobalCache();
    },

    /**
     * Print all cached controller charts to console.
     * Simple call to print current Memory.LongStats.finalOutput.allRooms.
     */
    printAllRooms: function () {
        if (!Memory.LongStats || !Memory.LongStats.finalOutput || !Memory.LongStats.finalOutput.allRooms) {
            console.log("=== Controller Progress Chart ===\n<no controller stats cached>");
            return;
        }

        console.log(Memory.LongStats.finalOutput.allRooms);
    },

    /* Internal helpers -------------------------------------------------- */

    // Build one-line chart from history
    _buildLineFromHistory: function (roomName, history, potential) {
        if (!history || history.length === 0) return `${roomName}: <no-history>`;
        let line = `${roomName}: `;
        for (let i = 0; i < history.length; i++) {
            const h = history[i];
            line += `L${h.level}@${h.progressK}k/${h.maxK}k`;
            if (i > 0 && potential > 0) {
                const prev = history[i - 1];
                const deltaPoints = h.absolutePoints - prev.absolutePoints;
                const deltaPct = ((deltaPoints / potential) * 100).toFixed(1);
                line += ` [${deltaPct}%]`;
            }
            if (i < history.length - 1) line += "  ";
        }
        return line;
    },

    // Rebuild cached global string (stored at finalOutput.allRooms)
    _rebuildGlobalCache: function () {
        if (!Memory.LongStats) Memory.LongStats = {};
        if (!Memory.LongStats.finalOutput) Memory.LongStats.finalOutput = {};
        let globalChart = "=== Controller Progress Chart ===\n";
        for (const rName in Memory.LongStats.finalOutput) {
            if (rName === "allRooms") continue;
            globalChart += Memory.LongStats.finalOutput[rName] + "\n";
        }
        Memory.LongStats.finalOutput.allRooms = globalChart.trim();
    }
};

/*
Usage Notes:
------------
1. In your main loop, call updateControllerStats for each room you want to track:
   
   const analytics = require('Function.Analytics');
   for (const roomName in Game.rooms) {
       analytics.updateControllerStats(roomName);
   }

2. To print all cached controller charts to console:
   
   require('Function.Analytics').printAllRooms();

3. Optional: force an immediate update regardless of interval:
   
   analytics.updateControllerStats('W1N1', { force: true });

4. Optional: customize interval (default 2000 ticks) and history length (default 7):
   
   analytics.updateControllerStats('W1N1', { interval: 1000, historyLen: 10 });
*/
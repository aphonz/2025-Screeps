// Hauler role for lab logistics

var LabFunction = require('Manager.Labs');

const getLabCache = {
    _cache: {},
    _tick: 0,
    get(id) {
        if (Game.time !== this._tick) {
            this._tick = Game.time;
            this._cache = {};
        }
        if (!this._cache[id]) {
            this._cache[id] = Game.getObjectById(id);
        }
        return this._cache[id];
    }
};

const roleLabHauler = {
    validateTask(task) {
        if (!task) {
            return false;
        }
        if (!task.id || !task.type) {
            console.log(`Task validation failed: missing id or type`);
            return false;
        }
        // transfer tasks don't need a labId, only lab-specific tasks do
        if (task.type === 'transfer') {
            const from = Game.getObjectById(task.fromStructureId);
            const to = Game.getObjectById(task.toStructureId);
            if (!from || !to) {
                console.log(`Transfer task validation failed: from=${!!from}, to=${!!to}`);
                return false;
            }
            return true;
        }
        if (!task.labId) {
            console.log(`Lab task validation failed: missing labId`);
            return false;
        }
        const lab = Game.getObjectById(task.labId);
        if (!lab) {
            console.log(`Lab task validation failed: lab not found`);
            return false;
        }
        return true;
    },

    run(creep) {
        // If you intended to suicide, call the function; otherwise remove/comment this line.
        // creep.suicide();

        // Establish home room memory
        if (!creep.memory.home) {
            creep.memory.home = creep.room.name;
        } else if (creep.room.name !== creep.memory.home) {
            creep.memory.flag = creep.memory.home;
        }

        // Travel back to home room if away
        if (creep.room.name !== creep.memory.home) {
            const flagName = creep.memory.flag;
            const flag = flagName ? Game.flags[flagName] : null;
            if (flag) {
                if (!creep.pos.isEqualTo(flag.pos)) creep.moveTo(flag.pos);
            } else {
                // Fallback: move to home controller if no flag exists
                const homeRoom = Game.rooms[creep.memory.home];
                if (homeRoom && homeRoom.controller) creep.moveTo(homeRoom.controller);
            }
            return;
        }

        const MAX_TASK_TICKS = 50;
        const roomName = creep.room.name;

        // Ensure LABS memory exists
        let rmem = Memory.rooms[roomName];
        if (!rmem) rmem = Memory.rooms[roomName] = {};
        if (!rmem.LABS) {
            rmem.LABS = {
                inputs: [],
                outputs: [],
                boosters: [],
                tasks: [],
                TerminalRequire: {},
                current: null,
                boosterQueue: []
            };
        }
        if (!Array.isArray(rmem.LABS.tasks)) rmem.LABS.tasks = [];

        // Soft cap tasks length to avoid runaway memory growth
        if (rmem.LABS.tasks.length > MAX_TASK_TICKS) {
            rmem.LABS.tasks.shift();
        }

        // Validate current task
        let task = creep.memory.labTask;
        if (task && !roleLabHauler.validateTask(task)) {
            console.log(`[${creep.name}] Task validation failed for ${task.type}`);
            delete creep.memory.labTask;
            delete creep.memory.taskStartTick;
            task = null;
        }

        // FALLBACK: If carrying resources but no task, dump to terminal
        if (!task && creep.store.getUsedCapacity() > 0) {
            console.log(`[${creep.name}] No task but carrying resources - dumping to terminal`);
            const terminal = creep.room.terminal;
            if (terminal) {
                for (const resourceType in creep.store) {
                    if (creep.store[resourceType] > 0) {
                        const res = creep.transfer(terminal, resourceType);
                        if (res === ERR_NOT_IN_RANGE) {
                            creep.moveTo(terminal);
                        } else if (res === OK) {
                            console.log(`[${creep.name}] Dumped ${creep.store[resourceType]} ${resourceType} to terminal`);
                        }
                        break; // Only transfer one resource type at a time
                    }
                }
            }
            return;
        }

        // If empty, pick a new task that starts with a pickup step
        if (!task && creep.store.getUsedCapacity() === 0) {
            const newTask = roleLabHauler.pickTask(rmem.LABS.tasks, ['fillInput', 'drainLab', 'transfer']);
            if (newTask) {
                creep.memory.labTask = newTask;
                creep.memory.taskStartTick = Game.time;
                task = newTask;
                console.log(`[${creep.name}] Picked task: ${task.type} for ${task.resource} from ${task.fromStructureId}`);
            } else {
                // DEBUG: Log why no task was picked
                if (Game.time % 10 === 0) {
                    console.log(`[${creep.name}] No task available. Tasks in queue: ${rmem.LABS.tasks.length}`);
                    if (rmem.LABS.tasks.length > 0) {
                        console.log(`[${creep.name}] Available tasks:`, JSON.stringify(rmem.LABS.tasks.map(t => ({type: t.type, res: t.resource}))));
                    }
                }
            }
        }

        // No task to run
        if (!task) return;

        // Timeout protection for stuck tasks
        if (creep.memory.taskStartTick && Game.time - creep.memory.taskStartTick > MAX_TASK_TICKS) {
            rmem.LABS.tasks = rmem.LABS.tasks.filter(t => t.id !== task.id);
            delete creep.memory.labTask;
            delete creep.memory.taskStartTick;
            return;
        }

        // Execute task
        if (task.type === 'fillInput') roleLabHauler.handleFillInput(creep, task);
        else if (task.type === 'drainLab') roleLabHauler.handleDrainLab(creep, task);
        else if (task.type === 'transfer') roleLabHauler.handleTransfer(creep, task);

        // Completion check
        if (roleLabHauler.isTaskComplete(creep, task)) {
            rmem.LABS.tasks = rmem.LABS.tasks.filter(t => t.id !== task.id);
            delete creep.memory.labTask;
            delete creep.memory.taskStartTick;
        }
    },

    // Choose the first task matching given types; adjust for prioritization as needed
    pickTask(tasks, types) {
        return tasks.find(t => types.includes(t.type)) || null;
    },

    handleFillInput(creep, task) {
        const lab = Game.getObjectById(task.labId);
        if (!lab) return;

        // If not carrying required resource, fetch it
        if (!creep.store[task.resource]) {
            if (!task.fromStructureId) return;
            const src = Game.getObjectById(task.fromStructureId);
            if (!src) return;
            const res = creep.withdraw(src, task.resource);
            if (res === ERR_NOT_IN_RANGE) creep.moveTo(src);
            return;
        }

        // Deliver to lab
        const res = creep.transfer(lab, task.resource);
        if (res === ERR_NOT_IN_RANGE) creep.moveTo(lab);
    },

    handleDrainLab(creep, task) {
        const lab = Game.getObjectById(task.labId);
        const terminal = creep.room.terminal;
        if (!lab || !terminal) return;

        // If not carrying, withdraw from lab
        if (creep.store.getUsedCapacity() === 0) {
            const available = lab.store.getUsedCapacity(task.resource);
            if (available < (task.minAmount || 1)) return;
            const res = creep.withdraw(lab, task.resource);
            if (res === ERR_NOT_IN_RANGE) creep.moveTo(lab);
            return;
        }

        // Deliver to terminal
        const res = creep.transfer(terminal, task.resource);
        if (res === ERR_NOT_IN_RANGE) creep.moveTo(terminal);
    },

    handleTransfer(creep, task) {
        const fromStructure = Game.getObjectById(task.fromStructureId);
        const toStructure = Game.getObjectById(task.toStructureId);
        if (!fromStructure || !toStructure) {
            console.log(`[${creep.name}] Transfer task failed: fromStructure=${!!fromStructure}, toStructure=${!!toStructure}`);
            return;
        }

        const creepHas = creep.store[task.resource] || 0;
        
        // If not carrying the resource, withdraw from source
        if (creepHas === 0) {
            const available = fromStructure.store.getUsedCapacity(task.resource);
            if (available === 0) {
                console.log(`[${creep.name}] No ${task.resource} available in source`);
                return;
            }
            const withdrawAmount = Math.min(available, task.amount || available, creep.store.getFreeCapacity());
            const res = creep.withdraw(fromStructure, task.resource, withdrawAmount);
            if (res === ERR_NOT_IN_RANGE) {
                creep.moveTo(fromStructure);
            } else if (res === OK) {
                console.log(`[${creep.name}] Withdrew ${withdrawAmount} ${task.resource} from container`);
            } else {
                console.log(`[${creep.name}] Withdraw failed: ${res}`);
            }
            return;
        }

        // Deliver to destination
        const res = creep.transfer(toStructure, task.resource);
        if (res === ERR_NOT_IN_RANGE) {
            creep.moveTo(toStructure);
            console.log(`[${creep.name}] Moving to terminal with ${creepHas} ${task.resource}`);
        } else if (res === OK) {
            console.log(`[${creep.name}] Transferred ${creepHas} ${task.resource} to terminal`);
        } else {
            console.log(`[${creep.name}] Transfer failed: ${res}`);
        }
    },

    isTaskComplete(creep, task) {
        if (task.type === 'transfer') {
            const fromStructure = Game.getObjectById(task.fromStructureId);
            const toStructure = Game.getObjectById(task.toStructureId);
            if (!fromStructure || !toStructure) return true;
            
            const creepCarrying = creep.store[task.resource] || 0;
            const fromAmount = fromStructure.store.getUsedCapacity(task.resource) || 0;
            const toAmount = toStructure.store.getUsedCapacity(task.resource) || 0;
            
            // Complete when: creep is empty AND (source is empty OR target has enough)
            if (creepCarrying === 0) {
                if (fromAmount === 0) return true;
                if (task.amount && toAmount >= task.amount) return true;
            }
            return false;
        }

        const lab = Game.getObjectById(task.labId);
        if (!lab) return true;

        if (task.type === 'fillInput') {
            const target = task.targetAmount ||
                ((global.LAB_CONFIG && global.LAB_CONFIG.inputFill && global.LAB_CONFIG.inputFill.max) ? global.LAB_CONFIG.inputFill.max : 2000);
            const labAmt = lab.store.getUsedCapacity(task.resource);
            const creepAmt = creep.store[task.resource] || 0;
            // Complete when lab is sufficiently filled OR creep has no more of that resource
            return labAmt >= target || creepAmt === 0;
        }

        if (task.type === 'drainLab') {
            const min = (task.minAmount || 1);
            const labAmt = lab.store.getUsedCapacity(task.resource);
            // Complete when lab is drained below min and the creep is empty
            return labAmt < min && creep.store.getUsedCapacity() === 0;
        }

        return true;
    }
};

module.exports = roleLabHauler;
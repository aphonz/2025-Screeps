var FunctionsSpawningCode = {
    
    BuildBody: function(room, MAX, parts) {
    // Check the spawn mode in the room's memory
        //return Build(Game.rooms[room].energyCapacityAvailable);//High ECO
        return Build(Game.rooms[room].energyAvailable);//Low ECO
    // Function to build the body parts array
    function Build(Bugit) {
        // Get the cost per element of the parts
        let cost_per_eliment = GET_COST(parts);
        let size = 0;

        // Calculate the maximum size of the body parts array within the budget
        if (MAX < 1){
            MAX = 1
        }
        while (Bugit >= cost_per_eliment && size <= (MAX-1)) {
            size++;
            Bugit -= cost_per_eliment;
        }
        // Create the body parts array
        let ar = [];
        for (let k = 0; parts.length > k; k++) {
            for (let i = 0; size > i; i++) {
                ar.push(parts[k]);
            }
        }
        return ar;
            }
        }
    };
    // Function to get the cost of the parts
    function GET_COST(Parts) {
        let cost = 0;
        for (let i = 0; Parts.length > i; i++) {
            // Add the cost based on the part type
            if (Parts[i] == MOVE) { cost += 50; }
            if (Parts[i] == WORK) { cost += 100; }
            if (Parts[i] == CARRY) { cost += 50; }
            if (Parts[i] == ATTACK) { cost += 80; }
            if (Parts[i] == RANGED_ATTACK) { cost += 150; }
            if (Parts[i] == HEAL) { cost += 250; }
            if (Parts[i] == CLAIM) { cost += 600; }
            if (Parts[i] == TOUGH) { cost += 10; }
        }
        return cost;
    }
    
module.exports = FunctionsSpawningCode;  
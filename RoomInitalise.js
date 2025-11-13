var RoomInitalise = {
    
    
    
    //Main
    Main: function Main(Game){
        let SetupState = Memory.Initalised;
        if (SetupState == undefined){
            Memory.Initalised = "1";
            SetupState = "1";
        }
        
        console.log('Inital Code at State : ' + SetupState)
        if (SetupState == "1"){
            MemoryStructure(Game);
        }
        if (SetupState == "2"){
            MemoryStructureRooms(Game);
        }
        if (SetupState == "3"){
            MemoryTargetRoles(Game);
        }
        //if (SetupState == "4"){
        //   RemoteanalyzeRoom(Game);
        //}
        //Rooms Memory template
        //Units Roles
        //Sources
        //role assignment
        //remote mines
        
        //Memory.Initalised = "1"
    }
};    

    // Memory Template
    function MemoryTemplate(Game){
        if (Memory.Template == undefined){ //check if this exists, otherwise create/update it 
           Memory.Template = Value
           
        }
        Memory.Initalised = "2"; // NEXT setp
        SetupState = "2";
        console.log('Template Set');
    }

    
    
    // Memory Structure BASE
   function MemoryStructure(Game){
       //if (Memory.rooms == undefined){
           Memory.rooms = {} ;
           Memory.roles = ['harvester',  'builder',  'upgrader',  'hauler',  'balancer',  'FatUpgrader', 'miner',  'miner2', 'WallRepairer' , 'AttackCreep', 'Repairer', 'remoteHarvester' , 'extractor','claim',"Reserve","RemoteRoomScout"]
           Memory.allies = ["Jeally_Rabbit" , "insain"]
           
       //}
        Memory.Initalised = "2";
        SetupState = "2";
        console.log('Memory Set');
    }
    
    
    // Memory Structure Rooms
   function MemoryStructureRooms(Game){
        for (var name in Game.rooms){
            if (Memory.rooms.name == undefined) {
                Memory.rooms.name = {} ;
            }
        }
        Memory.Initalised = "3";
        SetupState = "3";
        console.log('Rooms Set');
    }
    
    function MemoryTargetRoles(Game){
        // Iterate over all active rooms
        Object.keys(Game.rooms).forEach(roomName => {
            let room = Game.rooms[roomName]; // Get the room object
      
              // Initialize TargetScreep for the room if not already present
            if (!Memory.rooms[roomName]) {
                Memory.rooms[roomName] = {};
            }
           if (!Memory.rooms[roomName].TargetScreep) {
                Memory.rooms[roomName].TargetScreep = {};
            }


                // Iterate over each role in Memory.roles (array values instead of indices)
          if (Array.isArray(Memory.roles)) {
                Memory.roles.forEach(role => {
                if (!Memory.rooms[roomName].TargetScreep[role]) {
                    Memory.rooms[roomName].TargetScreep[role] = {
                            roleName: role,
                            qty: 0,
                            size: 1,
                            Template: [WORK, CARRY, MOVE]
                        };
                    }
                });
            } else {
                console.log('Memory.roles is undefined or not an array');
            }

        });

        Memory.Initalised = "10";
        SetupState = "10";
        console.log('Role sizes Set');
    }  ;
    
    
    
    


    
    /*
    // Cleaner code
    Clean: function Clean(Game){
        if (Game.time % 100 === 0) {
        for(var name in Memory.creeps) {
            if(!Game.creeps[name]){
                delete Memory.creeps[name];
                console.log('Getting rid of shit bloke ' + name);
                }
            }
        }
    },
    
    //Pixel Code
    PixelsGenrate: function PixelsGenrate(Game){
        //Check if can make a Pixel (might be a MMO only Feature)
         if(Game.cpu.bucket == 10000){
        console.log("PIXELS");
        Game.cpu.generatePixel();
        }
    }
    */


module.exports = RoomInitalise;    
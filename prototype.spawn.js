var FunctionsSpawningCode = require('SpawningCode');

module.exports = function () {
    StructureSpawn.prototype.CreateCustomWorkerCreep = 
    function(Parts, MaxSize, roleName, homeName, TargetSourceName , harvestRoomName,SpawnRoom){     //this will work for 'harvester',  'builder',  'upgrader  'balancer',  'FatUpgrader', 'miner',  'miner2', 'WallRepairer' , 'AttackCreep', 'Repairer', 'remoteHarvester' , 
                                                                                                    // will now work for 'extractor'   ',  'hauler',     
        body = FunctionsSpawningCode.BuildBody( SpawnRoom,MaxSize,Parts )
        return this.createCreep((body), undefined, {role: roleName, home: homeName, TargetSource : TargetSourceName , harvestRoom : harvestRoomName});
        
    };
};
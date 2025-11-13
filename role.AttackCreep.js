var roleAttackCreep = {

    /** @param {Creep} creep **/
    run: function(creep) {
        // source hunter AI
        
        //Cordination attack code - some kind of check for enough of unit X in stage area then send it could be sweet
        //var AttackInRoom = (Game.creeps(creep,{filter: (creep) => {
        //                return (creep.memory.role = 'AttackCreep')     }
        //}));
        //creep.say(AttackInRoom.length);
        //if (creep.room.find)
        
        //creep.memory.home = "W14S58"; //Manual room set
       // if (Game.time % 900){ //set attack room on a tick
            //creep.memory.home = "W9S2";
    //    }
        /*creep.room.find(FIND_HOSTILE_CREEPS,{filter:
           // function (cr)
             //   {
               // return cr.owner.username!='Jeally_Rabbit'|| cr.owner.username != 'insain'
                //}
        //});
        */
        // if can heal -> check if worth healing -> heal nearby else  rest of code
        var targetScreeps = creep.room.find(FIND_HOSTILE_CREEPS, {
            filter: function (enemy) {
                return !Memory.allies.includes(enemy.owner.username) 
                    }
            })
        console.log("target screeps number " + targetScreeps.length)
        
        if (!creep.memory.healer) {
            // Filter body parts to find HEAL parts
            const BodyPartsHeal = creep.body.filter((body) => body.type === HEAL);
    
            // Check if there is at least one HEAL part
            if (BodyPartsHeal.length >= 1) {
                creep.memory.healer = "TRUE"; // Use boolean true instead of string "TRUE"
            } else {
                creep.memory.healer = 'FALSE'; // Use boolean false instead of string "FALSE"
            }
        }

        if (creep.memory.healer == "TRUE"){
            if (creep.hits < (creep.hitsMax*0.9)){
                creep.heal(creep);
            }
            else {
               //creep.attack(focusedtarget) == ERR_NOT_IN_RANGE|| ERR_NO_BODYPART
                var MyAllies = creep.room.find(FIND_HOSTILE_CREEPS, {
                    filter: function (enemy) {
                        return Memory.allies.includes(enemy.owner.username) 
                    }
                })
                
                var closestDammagedAlly = creep.pos.findClosestByRange(FIND_MY_CREEPS , {
                    filter: function(object) {
                        return object.hits < object.hitsMax*0.99;
                        }
                });

                console.log("me -  " + closestDammagedAlly );
                if(creep.attack(focusedtarget) == ERR_NOT_IN_RANGE|| ERR_NO_BODYPART) {
                    if(creep.heal(closestDammagedAlly)== ERR_NOT_IN_RANGE) {
                         creep.travelTo(closestDammagedAlly);
                         if(creep.heal(closestDammagedAlly)== ERR_NOT_IN_RANGE) {
                             creep.rangedHeal(closestDammagedAlly);
                             creep.travelTo(closestDammagedAlly);
                         }
                    }
                }
            }    
        }
         /*
                var target_creep = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS,{filter:
                    function (cr)
                        {
                        return cr.owner.username!='Jeally_Rabbit'
                    }
                });
                */

         console.log(targetScreeps.length)
        if (creep.pos.room == "E14S58"  ){//|| creep.memory.healer != "TRUE"
         var focusedtarget = Game.getObjectById('680b1c8759c9d176bc9241d4')
            if (focusedtarget == null){
                
                focusedtarget = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {
                    filter: function (enemy) {
                        return !Memory.allies.includes(enemy.owner.username) 
                    }
                });
            
            
                console.log("B55555")
                //console.log(focusedtarget + "1223")
                if(creep.attack(focusedtarget) == ERR_NOT_IN_RANGE) {
                    creep.travelTo(focusedtarget);
                        if(creep.attack(focusedtarget) == ERR_NOT_IN_RANGE) {
                        // soon
                        }
                }
            
            
            }
        }
        if ((creep.pos.findClosestByPath(targetScreeps)) != null )
            {
            
            console.log("inroom")
            var focusedtargetcreep = creep.pos.findClosestByPath(targetScreeps);
            if (focusedtargetcreep == null ){
                 console.log("a")
                var targetStructure = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.structureType != STRUCTURE_CONTROLLER || structure.owner.username != 'Jeally_Rabbit'|| structure.owner.username != 'insain' );
                    }
                });        
            var focusedtarget = creep.pos.findClosestByPath(targetStructure)
            var focusedtarget = Game.getObjectById('680b1c8759c9d176bc9241d4')
            if (focusedtarget != null ){
                console.log("B")
                console.log(focusedtarget + "1223")
                if(creep.attack(focusedtarget) == ERR_NOT_IN_RANGE) {
                    creep.travelTo(focusedtarget);
                        if(creep.attack(focusedtarget) == ERR_NOT_IN_RANGE) {
                        // soon
                        }
                }
            }
            }
            var focusedtargetcreep = "680b1c8759c9d176bc9241d4"
            if (creep.pos.room == "E14S58"){
                var targetStructure = creep.room.find(FIND_STRUCTURES)
            }
            //console.log(focusedtargetcreep + "5465");
            if(creep.attack(focusedtargetcreep) == ERR_NOT_IN_RANGE) {
                creep.travelTo(focusedtargetcreep);
                if(creep.attack(focusedtargetcreep) == ERR_NOT_IN_RANGE) {
                    creep.attack(targetStructure);
                    // soon
                    
                }
            }
        }
        else if (creep.pos.room == "E14S5899999"){
            creep.say("yo")
            var targetStructure = creep.room.find(FIND_STRUCTURES)
            if(creep.attack(targetStructure) == ERR_NOT_IN_RANGE) {
                creep.travelTo(targetStructure);
                if(creep.attack(targetStructure) == ERR_NOT_IN_RANGE) {
                    
                    // soon
                }
            }    
        }
        
        

        else{
            if (!creep.memory.home){
                var home = creep.room.name;
                creep.memory.home = home;
            }
            
                //creep.say('Smash')
            var targetStructure = creep.room.find(FIND_HOSTILE_STRUCTURES,{filter:
                    function (cr)
                    {
                    return cr.owner.username!='Jeally_Rabbit' && cr.owner.username != 'insain'
                    
                    //filter: (structure) => {
                        //return (structure.structureType != STRUCTURE_CONTROLLER || structure.owner.username != 'Jeally_Rabbit'|| structure.owner.username != 'insain');
                        //return (structure.structureType != STRUCTURE_CONTROLLER || (!Memory.allies.includes(structure.owner.username))
                   }
               });        
            //var focusedtarget = creep.pos.findClosestByPath(targetStructure)
             //var focusedtarget = Game.getObjectById('680b1c8759c9d176bc9241d4')
            if (focusedtarget != null){
                creep.say("Hi");
                if(creep.attack(focusedtarget) == ERR_NOT_IN_RANGE) {
                    creep.travelTo(focusedtarget);
                        if(creep.attack(focusedtarget) == ERR_NOT_IN_RANGE) {
                        // soon
                        }
                }
            }
            else if (creep.room.name != creep.memory.home){
                creep.say("Traveling to " + creep.memory.home );
            creep.memory.flag = creep.memory.home;
            //console.log(creep.memory.flag);
            //if(creep.memory.flag == "undefined"){
            //    console.log(creep.room);
            //    creep.suicide;
            //}
            var flag = Game.flags[creep.memory.flag];
            // travel to flag
            var pos1 = creep.pos
            var pos2 = flag.pos
            if (!pos1.isEqualTo(pos2)) {
                creep.moveTo(flag.pos);
                }
            }
            
        
        }
    }
}

module.exports = roleAttackCreep;

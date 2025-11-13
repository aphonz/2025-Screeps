# Screeps AI Architecture Documentation

## Overview

This Screeps AI is designed with automation and readability as core principles. The codebase uses TypeScript for type safety and is organized into a clear, modular structure.

## Core Concepts

### Main Loop
The main game loop (`src/main.ts`) executes every tick and handles:
1. Memory cleanup for dead creeps
2. Room memory initialization
3. Spawn management
4. Role execution for all creeps
5. Statistics display

### Memory Management
- **Automatic Cleanup**: Dead creeps are automatically removed from memory to prevent memory leaks
- **Room Configuration**: Each room stores its minimum creep requirements
- **Creep Memory**: Each creep stores its role and working state

### Role System

#### Harvester
**Purpose**: Collect energy and deliver it to spawns and extensions  
**Priority**: Highest (critical for colony survival)  
**Behavior**:
- Collects energy from sources or containers
- Delivers to spawns, extensions, or towers
- Switches between harvesting and delivering based on energy level

#### Upgrader
**Purpose**: Upgrade the room controller  
**Priority**: High  
**Behavior**:
- Collects energy from sources or containers
- Upgrades the room controller
- Provides steady room control level progression

#### Builder
**Purpose**: Construct buildings and structures  
**Priority**: Medium  
**Behavior**:
- Collects energy from sources or containers
- Builds construction sites
- Falls back to upgrading if no construction sites exist

#### Repairer
**Purpose**: Repair damaged structures  
**Priority**: Medium  
**Behavior**:
- Collects energy from sources or containers
- Repairs damaged structures (excluding walls and ramparts)
- Falls back to building if nothing needs repair

## Automation Features

### Automatic Spawning
The spawn manager automatically creates new creeps based on:
- Current creep count by role
- Minimum requirements set in room memory
- Available energy capacity
- Priority order (Harvesters → Upgraders → Builders → Repairers)

### Dynamic Body Parts
Creep body parts are automatically calculated based on:
- Available energy capacity in the room
- Role requirements
- Balanced ratio of WORK, CARRY, and MOVE parts

### Energy Optimization
The AI automatically:
- Prefers containers and storage over direct harvesting
- Finds the closest energy source
- Manages energy distribution based on priorities

## Code Organization

```
src/
├── main.ts                   # Main game loop and entry point
├── types.ts                  # TypeScript type definitions
├── global.d.ts              # Global type declarations
├── roles/                    # Role implementations
│   ├── harvester.ts         # Energy collection and delivery
│   ├── upgrader.ts          # Controller upgrading
│   ├── builder.ts           # Construction
│   └── repairer.ts          # Structure repair
├── managers/                 # Game managers
│   ├── spawnManager.ts      # Automatic creep spawning
│   └── roleManager.ts       # Role execution coordinator
└── utils/                    # Utility functions
    ├── creepUtils.ts        # Creep-related helpers
    └── memoryUtils.ts       # Memory management
```

## Customization

### Adjusting Creep Counts
Modify the minimum creep counts in memory:

```javascript
Memory.rooms['W1N1'].minHarvesters = 3;  // Default: 2
Memory.rooms['W1N1'].minUpgraders = 4;   // Default: 2
Memory.rooms['W1N1'].minBuilders = 3;    // Default: 2
Memory.rooms['W1N1'].minRepairers = 2;   // Default: 1
```

### Adding New Roles
To add a new role:

1. Add the role to the `Role` enum in `src/types.ts`
2. Create a new role file in `src/roles/`
3. Add the role to the switch statement in `src/managers/roleManager.ts`
4. Add spawning logic in `src/managers/spawnManager.ts`

### Customizing Body Parts
Modify the `getBodyForRole()` method in `src/managers/spawnManager.ts` to customize body parts for different roles or energy levels.

## Best Practices

### Code Quality
- All code is linted with ESLint
- Formatted with Prettier
- Type-checked with TypeScript
- Documented with JSDoc comments

### Performance
- Efficient pathfinding with visualized paths
- Memory cleanup every tick
- Cached expensive operations where possible
- Minimal CPU usage per creep

### Maintainability
- Clear separation of concerns
- Single responsibility principle
- DRY (Don't Repeat Yourself)
- Self-documenting code with descriptive names

## Development Workflow

1. **Make Changes**: Edit files in `src/`
2. **Watch Mode**: Run `npm run watch` for auto-rebuild
3. **Lint**: Run `npm run lint` to check code quality
4. **Format**: Run `npm run format` to auto-format
5. **Build**: Run `npm run build` for production
6. **Deploy**: Run `npm run push` to deploy to Screeps

## Troubleshooting

### Build Errors
- Check TypeScript version compatibility
- Ensure all dependencies are installed: `npm install`
- Clear dist folder and rebuild: `rm -rf dist && npm run build`

### Runtime Errors
- Check console logs in Screeps for error messages
- Verify memory structure matches type definitions
- Ensure creeps have the required memory properties

### Performance Issues
- Reduce creep counts in room memory
- Optimize pathfinding with cached paths
- Use `Game.cpu.getUsed()` to identify bottlenecks

## Future Enhancements

Potential improvements to consider:
- Remote mining operations
- Defense and military units
- Market and economy management
- Multi-room coordination
- Advanced pathfinding with cached routes
- Power creep management
- Factory automation

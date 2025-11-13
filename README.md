# 2025-Screeps

My 2025 Screeps AI - Automated and Easy to Read

## Overview

This is a well-structured, automated Screeps AI written in TypeScript with a focus on readability and maintainability. The codebase follows modern best practices with comprehensive JSDoc comments, modular architecture, and automated tooling.

## Features

- ✨ **TypeScript** - Full type safety and better IDE support
- 🔄 **Automated Build** - Rollup bundler with watch mode
- 📋 **ESLint & Prettier** - Consistent code style and quality
- 🏗️ **Modular Architecture** - Clear separation of roles, managers, and utilities
- 📚 **Well-Documented** - Comprehensive JSDoc comments throughout
- 🤖 **Automated Spawning** - Smart creep management based on room needs
- 🎯 **Role-Based System** - Harvesters, Upgraders, Builders, and Repairers

## Project Structure

```
src/
├── main.ts                 # Main game loop
├── types.ts               # Type definitions
├── roles/                 # Creep role implementations
│   ├── harvester.ts      # Energy collection and delivery
│   ├── upgrader.ts       # Controller upgrading
│   ├── builder.ts        # Construction
│   └── repairer.ts       # Structure repair
├── managers/              # Game managers
│   ├── spawnManager.ts   # Automatic creep spawning
│   └── roleManager.ts    # Role execution coordinator
└── utils/                 # Utility functions
    ├── creepUtils.ts     # Creep-related helpers
    └── memoryUtils.ts    # Memory management
```

## Quick Start

### Installation

```bash
npm install
```

### Development

Build the code once:
```bash
npm run build
```

Watch for changes and rebuild automatically:
```bash
npm run watch
```

### Code Quality

Format code:
```bash
npm run format
```

Lint code:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

### Deployment

1. Build the project:
```bash
npm run build
```

2. Copy the contents of `dist/main.js` to your Screeps account

Or configure automatic deployment:
1. Create a `.screeps.json` file (see example below)
2. Run: `npm run push`

Example `.screeps.json`:
```json
{
  "email": "your-email@example.com",
  "password": "your-password",
  "branch": "default"
}
```

## Architecture

### Roles

- **Harvester**: Collects energy from sources and delivers to spawns/extensions
- **Upgrader**: Focuses on upgrading the room controller
- **Builder**: Constructs buildings and structures
- **Repairer**: Repairs damaged structures

### Managers

- **SpawnManager**: Automatically spawns creeps based on room requirements
- **RoleManager**: Coordinates role execution for all creeps

### Utilities

- **creepUtils**: Helper functions for energy management and creep operations
- **memoryUtils**: Memory cleanup and initialization

## Configuration

Room-level configuration is stored in memory and can be adjusted:

```typescript
Memory.rooms[roomName] = {
  minHarvesters: 2,  // Minimum harvester count
  minUpgraders: 2,   // Minimum upgrader count
  minBuilders: 2,    // Minimum builder count
  minRepairers: 1    // Minimum repairer count
};
```

## Contributing

This codebase follows strict TypeScript and ESLint rules. Before committing:

1. Run `npm run format` to format your code
2. Run `npm run lint` to check for issues
3. Run `npm run build` to ensure it compiles

## License

MIT 

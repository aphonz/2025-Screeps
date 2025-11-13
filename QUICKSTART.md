# Quick Start Guide

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- A Screeps account (https://screeps.com)

## Installation

```bash
# Clone the repository
git clone https://github.com/aphonz/2025-Screeps.git
cd 2025-Screeps

# Install dependencies
npm install
```

## Development

### Build Once
```bash
npm run build
```

### Watch Mode (Recommended)
```bash
npm run watch
```
This will automatically rebuild when you make changes to the source files.

## Deployment

### Manual Deployment
1. Build the project:
   ```bash
   npm run build
   ```

2. Open `dist/main.js`

3. Copy the entire contents

4. Go to your Screeps account: https://screeps.com/a/#!/sim/custom

5. Paste the code into the main module

6. Click "Save" or "Deploy"

### Automatic Deployment (Optional)
1. Create a `.screeps.json` file in the project root:
   ```json
   {
     "email": "your-email@example.com",
     "password": "your-password",
     "branch": "default"
   }
   ```

2. Install the screeps-api package:
   ```bash
   npm install screeps-api
   ```

3. Deploy with one command:
   ```bash
   npm run push
   ```

**Note**: For security, add `.screeps.json` to `.gitignore` (already done)

## Testing in Simulation

1. Open Screeps Simulation: https://screeps.com/a/#!/sim/custom

2. Paste your built code from `dist/main.js`

3. Click "Save & Run"

4. Watch your creeps work!

## Understanding the Code

### First Tick
When the code starts:
1. Memory is cleaned of dead creeps
2. Room memory is initialized with default values
3. Spawns begin creating harvesters
4. Creeps start executing their roles

### Creep Roles
- **Harvesters**: Collect energy and deliver to spawns/extensions (you'll see 🔄 and 🚚 emojis)
- **Upgraders**: Upgrade the room controller (you'll see 🔄 and ⚡ emojis)
- **Builders**: Build construction sites (you'll see 🔄 and 🚧 emojis)
- **Repairers**: Repair damaged structures (you'll see 🔄 and 🔧 emojis)

### Customization
Edit room settings by modifying memory:
```javascript
// In the Screeps console
Memory.rooms['W1N1'].minHarvesters = 3;
Memory.rooms['W1N1'].minUpgraders = 4;
Memory.rooms['W1N1'].minBuilders = 2;
Memory.rooms['W1N1'].minRepairers = 1;
```

## Code Quality

### Linting
Check for code quality issues:
```bash
npm run lint
```

Auto-fix issues:
```bash
npm run lint:fix
```

### Formatting
Format all code:
```bash
npm run format
```

Check formatting:
```bash
npm run format:check
```

## Project Structure

```
src/
├── main.ts              # Main entry point - start here
├── types.ts             # Type definitions
├── roles/               # Creep behaviors
├── managers/            # Game managers
└── utils/               # Helper functions
```

## Common Issues

### "Cannot find module" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Build errors
```bash
rm -rf dist
npm run build
```

### Creeps not spawning
- Check energy levels in spawns
- Verify room memory is initialized
- Check console for error messages

### Code not updating in Screeps
- Make sure you're building (`npm run build`)
- Copy from `dist/main.js`, not `src/main.ts`
- Clear browser cache and refresh

## Next Steps

1. **Read the Architecture**: Check `ARCHITECTURE.md` for detailed documentation
2. **Customize Roles**: Edit files in `src/roles/` to change creep behavior
3. **Add Features**: Extend the codebase with new roles or managers
4. **Optimize**: Monitor CPU usage and optimize performance

## Getting Help

- Screeps Documentation: https://docs.screeps.com/
- Screeps Slack: https://chat.screeps.com/
- GitHub Issues: https://github.com/aphonz/2025-Screeps/issues

## Tips

- Start with the simulation room to test changes
- Use `console.log()` for debugging
- Monitor CPU usage with `Game.cpu.getUsed()`
- Check memory usage with `RawMemory.get().length`
- Use the game's built-in profiler to find bottlenecks

Happy Screeping! 🎮

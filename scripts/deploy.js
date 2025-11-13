/**
 * Deploy script for Screeps
 * This script can be extended to automatically deploy to the Screeps server
 */

const fs = require('fs');
const path = require('path');

console.log('Build completed successfully!');
console.log('Main file location: dist/main.js');

// Check if credentials file exists
const credsPath = path.join(__dirname, '..', '.screeps.json');
if (fs.existsSync(credsPath)) {
  console.log('\nTo deploy to Screeps:');
  console.log('1. Install screeps-api: npm install screeps-api');
  console.log('2. Configure your .screeps.json with your credentials');
  console.log('3. Run: node scripts/deploy.js');
} else {
  console.log('\nTo enable automatic deployment:');
  console.log('1. Create a .screeps.json file with your credentials');
  console.log('2. Install screeps-api: npm install screeps-api');
  console.log('\nExample .screeps.json:');
  console.log(JSON.stringify({
    email: 'your-email@example.com',
    password: 'your-password',
    branch: 'default'
  }, null, 2));
}

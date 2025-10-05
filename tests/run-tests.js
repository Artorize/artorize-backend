#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

async function runTests() {
  console.log('🧪 Starting Artorize Storage Backend Tests\n');

  // Check if fixtures exist, generate if not
  console.log('📦 Checking test fixtures...');
  await runCommand('npm', ['run', 'test:fixtures']);

  console.log('\n🔧 Installing test dependencies...');
  await runCommand('npm', ['install']);

  console.log('\n🧪 Running unit tests...');
  await runCommand('npm', ['test']);

  console.log('\n✅ All tests completed successfully!');
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

// Run tests
runTests().catch(err => {
  console.error('\n❌ Tests failed:', err.message);
  process.exit(1);
});
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const deployScript = path.join(__dirname, 'deploy.sh');

if (!fs.existsSync(deployScript)) {
  console.error('deploy.sh is missing at', deployScript);
  process.exit(1);
}

const isWindows = process.platform === 'win32';

function resolveBashBinary() {
  if (!isWindows) {
    return 'bash';
  }

  const candidates = [
    process.env.BASH_PATH,
    path.join(process.env.PROGRAMFILES || '', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Git', 'bin', 'bash.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (error) {
      // ignore and continue searching
    }
  }

  return 'bash';
}

const bashBinary = resolveBashBinary();

const child = spawn(bashBinary, [deployScript], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('Failed to launch deploy script:', error);
  process.exit(1);
});

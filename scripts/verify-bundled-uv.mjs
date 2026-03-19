#!/usr/bin/env zx

import 'zx/globals';

const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_ROOT = path.join(ROOT_DIR, 'resources', 'bin');

const PLATFORM_GROUPS = {
  mac: ['darwin-x64', 'darwin-arm64'],
  win: ['win32-x64', 'win32-arm64'],
  linux: ['linux-x64', 'linux-arm64'],
};

const BIN_NAME = {
  darwin: 'uv',
  win32: 'uv.exe',
  linux: 'uv',
};

function currentTargetId() {
  return `${os.platform()}-${os.arch()}`;
}

function targetsToVerify() {
  if (argv.all) {
    return Object.values(PLATFORM_GROUPS).flat();
  }

  if (argv.platform) {
    const targets = PLATFORM_GROUPS[argv.platform];
    if (!targets) {
      throw new Error(`Unknown platform: ${argv.platform}`);
    }
    return targets;
  }

  return [currentTargetId()];
}

const targets = targetsToVerify();
const missing = [];

for (const target of targets) {
  const [platform] = target.split('-');
  const binName = BIN_NAME[platform];
  const binPath = path.join(BIN_ROOT, target, binName);

  if (!(await fs.pathExists(binPath))) {
    missing.push(binPath);
  }
}

if (missing.length > 0) {
  echo(chalk.red('❌ Missing bundled uv binaries:'));
  for (const binPath of missing) {
    echo(`   - ${path.relative(ROOT_DIR, binPath)}`);
  }
  process.exit(1);
}

echo(chalk.green(`✅ Verified bundled uv binaries for ${targets.join(', ')}`));

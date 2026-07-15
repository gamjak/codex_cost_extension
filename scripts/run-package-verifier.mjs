import { spawnSync } from 'node:child_process';

const vsceCommand = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';
const vsceResult = spawnSync(vsceCommand, ['ls', '--tree'], {
  encoding: 'utf8'
});

if (vsceResult.error) {
  console.error(`Unable to run vsce ls --tree: ${vsceResult.error.message}`);
  process.exit(1);
}

if (vsceResult.status !== 0) {
  process.stderr.write(vsceResult.stderr);
  process.exit(vsceResult.status ?? 1);
}

function treeOutputToPaths(treeOutput) {
  const paths = [];
  const segments = [];

  for (const rawLine of treeOutput.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    if (line.startsWith('extension/')) {
      paths.push(line);
      continue;
    }

    if (line === 'extension') {
      continue;
    }

    const markerIndex = line.search(/[├└]/u);
    const nameMatch = line.match(/[├└][─-]+\s*(.+)$/u);
    if (markerIndex === -1 || !nameMatch) {
      continue;
    }

    const depth = Math.floor(markerIndex / 3);
    segments.length = depth;
    segments.push(nameMatch[1]);
    paths.push(['extension', ...segments].join('/'));
  }

  return paths;
}

const verifierResult = spawnSync(process.execPath, ['scripts/verify-package.mjs', '--paths', ...treeOutputToPaths(vsceResult.stdout)], {
  encoding: 'utf8'
});

process.stdout.write(verifierResult.stdout);
process.stderr.write(verifierResult.stderr);
if (verifierResult.status !== 0) {
  process.stderr.write(`VSIX package tree:\n${vsceResult.stdout}`);
}
process.exit(verifierResult.status ?? 1);

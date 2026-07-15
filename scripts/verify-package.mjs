const requiredPaths = [
  'extension/out/src/extension.js',
  'extension/package.json',
  'extension/README.md',
  'extension/LICENSE',
  'extension/l10n/bundle.l10n.de.json'
];

const forbiddenPrefixes = [
  'extension/out/test/',
  'extension/test/',
  'extension/.github/',
  'extension/.vscode/',
  'extension/out/vitest.config.',
  'extension/docs/',
  'extension/work/',
  'extension/.superpowers/'
];

function fail(message) {
  console.error(`Package verification failed: ${message}`);
  process.exitCode = 1;
}

function verify(paths) {
  if (paths.length === 0) {
    fail('no package paths were supplied; pass --paths followed by relative POSIX package paths.');
    return;
  }

  const pathSet = new Set(paths);
  const missingPaths = requiredPaths.filter((requiredPath) => !pathSet.has(requiredPath));
  if (missingPaths.length > 0) {
    fail(`missing required package path(s): ${missingPaths.join(', ')}.`);
    return;
  }

  const forbiddenPath = paths.find((packagePath) =>
    forbiddenPrefixes.some((prefix) => packagePath.startsWith(prefix))
  );
  if (forbiddenPath) {
    fail(`forbidden package path: ${forbiddenPath}. Update .vscodeignore or the build configuration.`);
    return;
  }

  process.stdout.write(`Package verification passed for ${paths.length} path(s).\n`);
}

const argumentsAfterNode = process.argv.slice(2);
const pathsFlagIndex = argumentsAfterNode.indexOf('--paths');

if (pathsFlagIndex === -1) {
  fail('expected a --paths argument followed by relative POSIX package paths.');
} else {
  verify(argumentsAfterNode.slice(pathsFlagIndex + 1));
}

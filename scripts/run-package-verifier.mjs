import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectorySignature = 0x02014b50;

function packagePathFromArguments(argumentsAfterNode) {
  const packagePathIndex = argumentsAfterNode.indexOf('--package-path');
  if (packagePathIndex === -1) {
    return 'codex-cost-extension.vsix';
  }

  const packagePath = argumentsAfterNode[packagePathIndex + 1];
  if (!packagePath) {
    throw new Error('expected a VSIX path after --package-path.');
  }

  return packagePath;
}

function findEndOfCentralDirectory(archive) {
  const searchStart = Math.max(0, archive.length - 0xffff - 22);
  for (let offset = archive.length - 22; offset >= searchStart; offset -= 1) {
    if (archive.readUInt32LE(offset) === endOfCentralDirectorySignature) {
      return offset;
    }
  }

  throw new Error('the file is not a supported ZIP archive.');
}

function readVsixPaths(packagePath) {
  const archive = readFileSync(packagePath);
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const centralDirectoryOffset = archive.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const paths = [];
  let offset = centralDirectoryOffset;

  for (let entry = 0; entry < entryCount; entry += 1) {
    if (archive.readUInt32LE(offset) !== centralDirectorySignature) {
      throw new Error('the ZIP central directory is invalid.');
    }

    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const nameOffset = offset + 46;
    paths.push(archive.toString('utf8', nameOffset, nameOffset + nameLength).replace(/\\/g, '/'));
    offset = nameOffset + nameLength + extraLength + commentLength;
  }

  return paths;
}

try {
  const packagePath = packagePathFromArguments(process.argv.slice(2));
  const packagePaths = readVsixPaths(packagePath);
  const verifierResult = spawnSync(process.execPath, ['scripts/verify-package.mjs', '--paths', ...packagePaths], {
    encoding: 'utf8'
  });

  process.stdout.write(verifierResult.stdout);
  process.stderr.write(verifierResult.stderr);
  process.exit(verifierResult.status ?? 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to verify VSIX package: ${message}`);
  process.exit(1);
}

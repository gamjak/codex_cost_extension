import * as path from 'node:path';

function isWindowsPath(input: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(input) || /^\\\\/.test(input);
}

export function normalizeFsPath(input: string): string {
  if (isWindowsPath(input)) {
    const normalized = path.win32.normalize(input).replace(/\\/g, '/').replace(/\/+$/, '');
    return normalized.toLowerCase();
  }

  return path.posix.normalize(input.replace(/\\/g, '/')).replace(/\/+$/, '');
}

export function matchesWorkspaceRoots(sessionCwd: string | undefined, workspaceRoots: readonly string[]): boolean {
  if (!sessionCwd) {
    return false;
  }

  const normalizedSession = normalizeFsPath(sessionCwd);

  return workspaceRoots.some((workspaceRoot) => {
    const normalizedWorkspace = normalizeFsPath(workspaceRoot);

    return normalizedSession === normalizedWorkspace || normalizedSession.startsWith(`${normalizedWorkspace}/`);
  });
}

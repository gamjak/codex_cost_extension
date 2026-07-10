import * as path from 'node:path';

export function normalizeFsPath(input: string): string {
  const resolved = path.resolve(input);
  const withForwardSlashes = resolved.replace(/\\/g, '/');
  const withoutTrailingSlash = withForwardSlashes.replace(/\/+$/, '');

  return withoutTrailingSlash.toLowerCase();
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

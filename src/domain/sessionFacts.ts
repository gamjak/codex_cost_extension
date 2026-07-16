import * as path from 'node:path';

import type { ParsedSession } from './types';
import { buildSessionUsageDeltas } from './usageTimeline';
import { normalizeFsPath } from './workspaceMatcher';
import type { SessionUsageDelta } from './usageTimeline';

export interface SessionFact {
  key: string;
  sessionId: string;
  label: string;
  source: string;
  projectKey: string;
  projectLabel: string;
  projectPath?: string;
  startedAt: string;
  updatedAt: string;
  durationMs: number;
  models: string[];
  deltas: SessionUsageDelta[];
}

interface ProjectIdentity {
  key: string;
  label: string;
  path?: string;
}

function isWindowsPath(input: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(input) || /^\\\\/.test(input);
}

function pathLabel(input: string): string {
  return isWindowsPath(input) ? path.win32.basename(input) : path.posix.basename(input);
}

function normalizeProjectPath(input: string): string {
  if (isWindowsPath(input)) {
    return path.win32.normalize(input).replace(/\\+$/, '').toLowerCase();
  }

  return normalizeFsPath(input);
}

export function sessionKey(session: ParsedSession): string {
  return `${normalizeFsPath(session.filePath)}::${session.sessionId}`;
}

export function normalizeSessionSource(session: ParsedSession): string {
  const source = (session.source ?? session.originator ?? 'unknown').trim().toLowerCase();
  if (source.includes('vscode')) return 'vscode';
  if (source.includes('cli')) return 'cli';
  if (source.includes('desktop')) return 'desktop';
  return source || 'unknown';
}

export function projectKeyForCwd(cwd: string | undefined, workspaceRoots: readonly string[]): string {
  if (!cwd) {
    return 'no-project';
  }

  const normalizedCwd = normalizeFsPath(cwd);
  const matchingRoot = workspaceRoots
    .filter((root) => {
      const normalizedRoot = normalizeFsPath(root);
      return normalizedCwd === normalizedRoot || normalizedCwd.startsWith(`${normalizedRoot}/`);
    })
    .sort((left, right) => normalizeFsPath(right).length - normalizeFsPath(left).length)[0];

  return normalizeProjectPath(matchingRoot ?? cwd);
}

function resolveProject(
  cwd: string | undefined,
  deltas: readonly SessionUsageDelta[],
  workspaceRoots: readonly string[]
): ProjectIdentity {
  const usableCwd = cwd ?? deltas.find((delta) => delta.cwd)?.cwd;
  if (!usableCwd) {
    return { key: 'no-project', label: 'No project' };
  }

  const key = projectKeyForCwd(usableCwd, workspaceRoots);
  const matchingRoot = workspaceRoots.find((root) => normalizeProjectPath(root) === key);
  const projectPath = matchingRoot ?? usableCwd;

  return { key, label: pathLabel(projectPath) || projectPath, path: projectPath };
}

export function buildSessionFacts(
  sessions: readonly ParsedSession[],
  workspaceRoots: readonly string[]
): SessionFact[] {
  return sessions.map((session) => {
    const deltas = buildSessionUsageDeltas(session);
    const project = resolveProject(session.cwd, deltas, workspaceRoots);
    const startedAt = session.startedAt ?? deltas[0]?.timestamp ?? session.updatedAt;

    return {
      key: sessionKey(session),
      sessionId: session.sessionId,
      label: project.label === 'No project' ? session.sessionId : project.label,
      source: normalizeSessionSource(session),
      projectKey: project.key,
      projectLabel: project.label,
      projectPath: project.path,
      startedAt,
      updatedAt: session.updatedAt,
      durationMs: Math.max(0, Date.parse(session.updatedAt) - Date.parse(startedAt)),
      models: Array.from(new Set(deltas.map((delta) => delta.model).filter((value): value is string => Boolean(value)))),
      deltas
    };
  });
}

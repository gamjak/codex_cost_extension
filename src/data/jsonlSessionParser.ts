import type { ParsedSession } from '../domain/types';
import { parseSessionToCheckpoint } from './sessionParseCheckpoint';
import type { SessionParseDiagnostics } from './sessionParseCheckpoint';

export type { SessionParseDiagnostics } from './sessionParseCheckpoint';

export interface SessionParseResult {
  session: ParsedSession | null;
  diagnostics: SessionParseDiagnostics;
}

export async function parseSessionFileWithDiagnostics(filePath: string): Promise<SessionParseResult> {
  return (await parseSessionToCheckpoint(filePath)).result;
}

export async function parseSessionFile(filePath: string): Promise<ParsedSession | null> {
  return (await parseSessionFileWithDiagnostics(filePath)).session;
}

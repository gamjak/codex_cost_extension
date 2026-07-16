import { rmSync } from 'node:fs';

rmSync('out', { force: true, recursive: true });

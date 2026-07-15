# Vitest 4 und Vite 6 – Design

## Ziel

Die fehlende Peer-Kompatibilität in Dependabot-PR #6 beheben, ohne Produktcode oder Testverhalten zu ändern.

## Ursache

Vitest 4.1.10 verlangt Vite 6, 7 oder 8. Die Dependabot-PR aktualisiert nur Vitest; pnpm löst dadurch weiterhin Vite 5.4.21 auf. Beim Start importiert Vitest einen von Vite 5 nicht exportierten Pfad und alle Test- sowie Paket-Checks schlagen fehl.

## Gewählter Ansatz

`vitest` wird auf `^4.1.10` aktualisiert und `vite` als direkte Entwicklungsabhängigkeit mit dem Bereich `^6.0.0` ergänzt. Anschließend wird `pnpm-lock.yaml` mit pnpm 11 neu erzeugt.

Vite 6 ist der kleinste unterstützte Major-Schritt und erfüllt den von Vitest 4 geforderten Peer-Bereich. Vite 7 oder 8 würden unnötig mehr unabhängige Änderungen einführen.

## Umfang und Abgrenzung

- Geändert werden nur `package.json` und `pnpm-lock.yaml`.
- Es gibt keine Änderungen an Erweiterungscode, Tests oder TypeScript-Konfiguration.
- Der Fix betrifft ausschließlich PR #6. Die TypeScript- und VS-Code-Typ-PRs bleiben getrennte Kompatibilitätsentscheidungen.

## Validierung

1. Die aufgelösten Versionen müssen Vitest 4.1.10 und Vite 6.x enthalten.
2. `pnpm run check` muss erfolgreich sein.
3. `pnpm run package --out codex-cost-extension.vsix` und `pnpm run verify-package` müssen erfolgreich sein.

## Fehlerbehandlung und Risiko

Scheitert die Installation oder einer der Validierungsschritte, werden keine weiteren Abhängigkeiten spekulativ aktualisiert. Die konkrete Fehlermeldung bestimmt den nächsten Schritt.

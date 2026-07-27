# IntelliJ IDEA Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native IntelliJ IDEA Community/Ultimate plugin with complete functional parity to the existing Codex Cost VS Code extension and permanently visible session, project, and budget status-bar costs.

**Architecture:** A Kotlin/Gradle plugin under `intellij/` implements pure domain and data modules behind a project-scoped `CodexCostProjectService`. Immutable snapshots feed three status widgets, a native tool window, Cost Center panels, and notifications. Shared JSON fixtures compare normalized TypeScript and Kotlin results without runtime coupling.

**Tech Stack:** Kotlin, Java 21, Gradle 9 wrapper, IntelliJ Platform Gradle Plugin 2.x, IntelliJ IDEA 2024.2+ Platform APIs, kotlinx.serialization, JUnit 5, IntelliJ Platform Test Framework, Vitest, GitHub Actions.

## Global Constraints

- Support IntelliJ IDEA Community and Ultimate 2024.2 and newer.
- Use only APIs and bundled modules available in both editions.
- Perform file I/O and calculation off the Event Dispatch Thread; update Swing only on the EDT.
- Make no runtime network, billing, authentication, pricing, telemetry, prompt, or response requests.
- Keep TypeScript and Kotlin runtime implementations independent.
- Preserve the VS Code defaults, price-family matching, scope semantics, partial-price behavior, calendar windows, notifications, and copied-summary privacy rules.
- Provide English and German resource bundles.
- Test only temporary log roots; never read the developer's real Codex session directory.

---

## File Map

- `intellij/build.gradle.kts`: plugin dependencies, IDE target, test, verifier, and packaging configuration.
- `intellij/src/main/resources/META-INF/plugin.xml`: services, settings, tool window, actions, notifications, and widget registrations.
- `intellij/src/main/kotlin/com/gamjak/codexcost/domain/`: pure types, pricing, timelines, reports, budgets, and Cost Center analytics.
- `intellij/src/main/kotlin/com/gamjak/codexcost/data/`: JSONL parsing, scanning, checkpoints, and cache.
- `intellij/src/main/kotlin/com/gamjak/codexcost/settings/`: global settings and project view state.
- `intellij/src/main/kotlin/com/gamjak/codexcost/integration/`: project lifecycle, snapshots, refresh coalescing, and scheduling.
- `intellij/src/main/kotlin/com/gamjak/codexcost/statusbar/`: session, project, and budget widgets.
- `intellij/src/main/kotlin/com/gamjak/codexcost/toolwindow/`: sidebar-equivalent model and panel.
- `intellij/src/main/kotlin/com/gamjak/codexcost/costcenter/`: analysis controller and native panels.
- `intellij/src/main/kotlin/com/gamjak/codexcost/notifications/`: threshold keys and IDEA notifications.
- `shared/conformance/`: local JSONL inputs, settings, and normalized expected JSON.

### Task 1: Bootable IntelliJ Plugin

**Files:**
- Create: `intellij/settings.gradle.kts`
- Create: `intellij/build.gradle.kts`
- Create: `intellij/gradle.properties`
- Create: `intellij/gradle/wrapper/gradle-wrapper.properties`
- Create: `intellij/gradlew`, `intellij/gradlew.bat`
- Create: `intellij/src/main/resources/META-INF/plugin.xml`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/PluginMetadataTest.kt`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: no project code.
- Produces: plugin ID `com.gamjak.codexcost`, Gradle tasks `test`, `buildPlugin`, and `verifyPlugin`.

- [ ] **Step 1: Add the failing metadata test**

```kotlin
class PluginMetadataTest {
  @Test fun `plugin declares both IDEA editions through platform module only`() {
    val xml = javaClass.getResource("/META-INF/plugin.xml")!!.readText()
    assertTrue(xml.contains("<id>com.gamjak.codexcost</id>"))
    assertTrue(xml.contains("<depends>com.intellij.modules.platform</depends>"))
    assertFalse(xml.contains("com.intellij.modules.java"))
  }
}
```

- [ ] **Step 2: Run `cd intellij && ./gradlew test --tests '*PluginMetadataTest'` and verify failure because the project and descriptor do not exist.**

- [ ] **Step 3: Add the Gradle 9 wrapper, Kotlin/JVM and IntelliJ Platform 2.x plugins, Java 21 toolchain, IDEA Community 2024.2 dependency, JUnit 5, and a minimal descriptor**

```xml
<idea-plugin>
  <id>com.gamjak.codexcost</id>
  <name>Codex Cost</name>
  <vendor email="gambkej@gmx.net">gamjak</vendor>
  <depends>com.intellij.modules.platform</depends>
</idea-plugin>
```

- [ ] **Step 4: Run `cd intellij && ./gradlew test buildPlugin` and verify PASS plus `build/distributions/codex-cost-*.zip`.**

- [ ] **Step 5: Commit**

```bash
git add .gitignore intellij
git commit -m "build(intellij): scaffold IDEA plugin"
```

### Task 2: Domain Types, Pricing, and Token Timelines

**Files:**
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/domain/Types.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/domain/Pricing.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/domain/UsageTimeline.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/domain/PricingTest.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/domain/UsageTimelineTest.kt`

**Interfaces:**
- Produces: `TokenUsage`, `SessionUsage`, `ParsedSession`, `ModelPricing`, `PricingByModel`; `resolveModelPricing(model, prices)`; `estimateTokenCost(tokens, pricing)`; `buildSessionUsageDeltas(session)`.

- [ ] **Step 1: Write failing tests for longest-family price matching, cached-token subtraction, missing prices, counter resets, and unchanged cumulative records**

```kotlin
@Test fun `longest configured family wins`() {
  val prices = mapOf("gpt-5" to price(1.0), "gpt-5.6" to price(2.0))
  assertEquals(2.0, resolveModelPricing("gpt-5.6-sol-202607", prices)!!.inputPer1M)
}
@Test fun `cost separates cached input`() {
  val usage = TokenUsage(100, 40, 10, 110)
  assertEquals(0.00009, estimateTokenCost(usage, ModelPricing(1.0, .5, 2.0))!!, 1e-12)
}
```

- [ ] **Step 2: Run `./gradlew test --tests '*PricingTest' --tests '*UsageTimelineTest'` and verify unresolved-symbol failures.**

- [ ] **Step 3: Implement immutable data classes and pure functions matching `src/domain/types.ts`, `sessionAggregator.ts`, and `usageTimeline.ts`; include the bundled prices from `package.json` as `DEFAULT_PRICING`.**

- [ ] **Step 4: Run the focused tests and `pnpm test -- test/unit/usageTimeline.test.ts test/unit/sessionAggregator.test.ts`; verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add intellij/src
git commit -m "feat(intellij): add cost domain primitives"
```

### Task 3: JSONL Parser, Scanner, and Incremental Repository

**Files:**
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/data/SessionJsonlParser.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/data/SessionScanner.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/data/SessionCheckpoint.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/data/SessionRepository.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/data/SessionRepositoryTest.kt`
- Copy: `test/fixtures/*.jsonl` to `shared/conformance/sessions/`

**Interfaces:**
- Consumes: `ParsedSession` from Task 2.
- Produces: `SessionRepository.load(roots: List<Path>): LoadSessionsResult`; `LoadSessionsResult(sessions, warnings, filesCount)`; parse diagnostics and checkpoints.

- [ ] **Step 1: Write failing temporary-directory tests for valid fixtures, malformed lines, overlapping roots, unchanged-cache reuse, safe append, truncation, and deletion**

```kotlin
@Test fun `malformed file keeps valid session and warning`() = runTest {
  val root = fixtureRoot("malformed-session.jsonl")
  val result = SessionRepository().load(listOf(root))
  assertEquals(1, result.sessions.size)
  assertTrue(result.warnings.single().contains("malformed JSONL"))
}
```

- [ ] **Step 2: Run `./gradlew test --tests '*SessionRepositoryTest'` and verify failure because `SessionRepository` is missing.**

- [ ] **Step 3: Implement bounded line streaming, Codex event normalization, canonical-path deduplication, concurrent metadata reads, identity/size/mtime checks, prefix validation, and full-read fallback.**

- [ ] **Step 4: Run `./gradlew test --tests '*SessionRepositoryTest'` and `pnpm test -- test/unit/jsonlSessionParser.test.ts test/unit/sessionRepository.test.ts`; verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add shared/conformance intellij/src
git commit -m "feat(intellij): parse and cache Codex sessions"
```

### Task 4: Reports, Time Windows, Budgets, and Cost Center Analytics

**Files:**
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/domain/TimeWindows.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/domain/WorkspaceMatcher.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/domain/SessionAggregator.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/domain/CostControl.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/domain/CostCenterAnalytics.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/domain/ReportParityTest.kt`

**Interfaces:**
- Consumes: domain values from Task 2.
- Produces: `buildUsageReport`, `buildCostControlReport`, `buildCostCenterReport`; `UsageReport`, `CostControlReport`, `CostCenterReport`, `ReportOptions`.

- [ ] **Step 1: Write failing parameterized tests for project/all scope, source filters, `DD.MM.YYYY`, inclusive custom ranges, Monday weeks, local DST days, previous-period comparisons, partial prices, projections, and day/week/month budgets.**

```kotlin
@Test fun `project report excludes sibling cwd`() {
  val report = buildUsageReport(sessions, prices, options(scope = PROJECT, roots = listOf(project)))
  assertEquals(setOf("workspace-session"), report.sessions.map { it.sessionId }.toSet())
}
```

- [ ] **Step 2: Run `./gradlew test --tests '*ReportParityTest'` and verify unresolved report functions.**

- [ ] **Step 3: Port the pure algorithms from `src/domain/` and `src/view/costCenterAnalytics.ts`, using `java.time` with the injected `Clock` and system zone.**

- [ ] **Step 4: Run Kotlin domain tests and all `test/unit/costCenter*.test.ts`, `costControl.test.ts`, `sessionAggregator.test.ts`, and `workspaceMatcher.test.ts`; verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add intellij/src
git commit -m "feat(intellij): calculate reports and budgets"
```

### Task 5: Settings, Project State, and Refresh Service

**Files:**
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/settings/CodexCostSettings.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/settings/CodexCostViewState.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/integration/CostSnapshot.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/integration/CodexCostProjectService.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/integration/RefreshCoordinator.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/integration/ProjectServiceTest.kt`
- Modify: `intellij/src/main/resources/META-INF/plugin.xml`

**Interfaces:**
- Consumes: repository and report functions from Tasks 3–4.
- Produces: `CodexCostProjectService.snapshot: StateFlow<CostSnapshot>`; `refresh()`; `updateSettings(mutator)`; disposable refresh scheduling.

- [ ] **Step 1: Write failing platform tests proving defaults, persistence, coalesced refresh, `0` disabling automatic refresh, settings-triggered publication, and disposal cancelling timers.**

```kotlin
@Test fun `concurrent refresh calls share one scan`() = runTest {
  val service = serviceWithCountingRepository()
  awaitAll(async { service.refresh() }, async { service.refresh() })
  assertEquals(1, service.repositoryLoads)
}
```

- [ ] **Step 2: Run `./gradlew test --tests '*ProjectServiceTest'` and verify missing-service failure.**

- [ ] **Step 3: Implement application-level `PersistentStateComponent` settings, project-level view state, a coroutine-backed project service, immutable snapshots, interval and period-boundary jobs, and EDT delivery.**

- [ ] **Step 4: Run focused tests and `./gradlew test`; verify PASS and no leaked-disposable warnings.**

- [ ] **Step 5: Commit**

```bash
git add intellij/src
git commit -m "feat(intellij): add settings and refresh service"
```

### Task 6: Permanent Status-Bar Widgets

**Files:**
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/statusbar/CostWidget.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/statusbar/SessionCostWidgetFactory.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/statusbar/ProjectCostWidgetFactory.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/statusbar/BudgetCostWidgetFactory.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/statusbar/StatusBarPresentationTest.kt`
- Modify: `intellij/src/main/resources/META-INF/plugin.xml`

**Interfaces:**
- Consumes: `StateFlow<CostSnapshot>` and visibility settings from Task 5.
- Produces: widget IDs `CodexCost.Session`, `CodexCost.Project`, `CodexCost.Budget`; click action `CodexCost.OpenCostCenter`.

- [ ] **Step 1: Write failing presentation tests for complete, partial, hidden, unconfigured-budget, warning, and over-budget snapshots in English and German.**

```kotlin
@Test fun `project widget is always-readable text`() {
  assertEquals("Project \$3.25", projectWidgetText(completeSnapshot(3.25), Locale.US))
}
```

- [ ] **Step 2: Run `./gradlew test --tests '*StatusBarPresentationTest'` and verify missing presentation functions.**

- [ ] **Step 3: Implement three `StatusBarWidgetFactory` registrations, project-bound text widgets, snapshot subscriptions, visibility control, tooltips, click-through, and disposal.**

- [ ] **Step 4: Run focused tests and `./gradlew runIde`; manually verify all three widgets remain visible with every tool window closed and update after fixture append.**

- [ ] **Step 5: Commit**

```bash
git add intellij/src
git commit -m "feat(intellij): show permanent cost widgets"
```

### Task 7: Tool Window and Core Actions

**Files:**
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/toolwindow/CodexCostToolWindowFactory.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/toolwindow/CodexCostPanel.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/toolwindow/ToolWindowModel.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/actions/CostActions.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/toolwindow/ToolWindowModelTest.kt`
- Modify: `intellij/src/main/resources/META-INF/plugin.xml`

**Interfaces:**
- Consumes: project service from Task 5.
- Produces: `buildToolWindowModel(snapshot, scope, locale)` and actions for refresh, scopes, settings, daily budget, Cost Center, and clipboard summary.

- [ ] **Step 1: Write failing model/action tests for Project/All scope, warning rows, partial labels, positive daily-budget validation, and copied summaries without full paths.**
- [ ] **Step 2: Run `./gradlew test --tests '*ToolWindowModelTest'` and verify unresolved model failure.**
- [ ] **Step 3: Implement native JBList/JBLabel/ActionToolbar UI bound to snapshots and register all actions with stable IDs under `CodexCost.*`.**
- [ ] **Step 4: Run tests and `./gradlew runIde`; manually exercise refresh, both scopes, settings, budget validation, and clipboard copy.**
- [ ] **Step 5: Commit**

```bash
git add intellij/src
git commit -m "feat(intellij): add Codex Cost tool window"
```

### Task 8: Native Cost Center and Guided Settings

**Files:**
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/costcenter/CostCenterController.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/costcenter/CostCenterPanel.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/costcenter/AnalysisTables.kt`
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/settings/CodexCostConfigurable.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/costcenter/CostCenterControllerTest.kt`
- Modify: `intellij/src/main/resources/META-INF/plugin.xml`

**Interfaces:**
- Consumes: Cost Center reports from Task 4 and settings/service from Task 5.
- Produces: overview/sessions/projects/models/settings navigation; `selectRange`, `selectCustomRange`, `setComparison`, `drillIntoProject`, `drillIntoModel`, `clearFilter`, `saveSettings`, `discardSettings`.

- [ ] **Step 1: Write failing controller tests for remembered section/range/comparison, inclusive custom dates, equal-length prior periods, drill-down chips, clearing filters, and save/discard dirty settings.**
- [ ] **Step 2: Run `./gradlew test --tests '*CostCenterControllerTest'` and verify missing controller failure.**
- [ ] **Step 3: Implement controller state and Kotlin UI DSL/Swing panels with CardLayout, JBTable, date controls, filter chips, comparison columns, and the complete guided/advanced settings surface.**
- [ ] **Step 4: Run tests and `./gradlew runIde`; compare every Cost Center workflow in the README against the IDEA UI.**
- [ ] **Step 5: Commit**

```bash
git add intellij/src
git commit -m "feat(intellij): add native Cost Center"
```

### Task 9: Budget Notifications

**Files:**
- Create: `intellij/src/main/kotlin/com/gamjak/codexcost/notifications/BudgetNotificationController.kt`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/notifications/BudgetNotificationControllerTest.kt`
- Modify: `intellij/src/main/resources/META-INF/plugin.xml`
- Modify: `intellij/src/main/kotlin/com/gamjak/codexcost/integration/CodexCostProjectService.kt`

**Interfaces:**
- Consumes: budget snapshots and persisted settings.
- Produces: deterministic notification keys `{periodStart}:{period}:{kind}:{threshold}` and IntelliJ notification group `Codex Cost Budget`.

- [ ] **Step 1: Write failing tests for disabled notifications, once-only warning/exceeded keys, recurring `$5/$10/$15` thresholds, calendar reset, price gaps, and optional threshold summary.**
- [ ] **Step 2: Run `./gradlew test --tests '*BudgetNotificationControllerTest'` and verify missing controller failure.**
- [ ] **Step 3: Implement the pure key/controller logic, persist emitted keys, and map new events to non-modal IntelliJ notifications with Settings and Refresh actions.**
- [ ] **Step 4: Run focused tests and the matching Vitest budget-notification tests; verify identical event sequences.**
- [ ] **Step 5: Commit**

```bash
git add intellij/src
git commit -m "feat(intellij): notify budget thresholds"
```

### Task 10: Cross-Implementation Conformance

**Files:**
- Create: `shared/conformance/cases/*.json`
- Create: `shared/conformance/expected/*.json`
- Create: `src/conformance.ts`
- Create: `test/unit/conformance.test.ts`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/conformance/ConformanceTest.kt`

**Interfaces:**
- Consumes: shared session fixtures and both domain implementations.
- Produces: normalized JSON containing sessions, models, summary, warnings, price-gap state, budget state, Cost Center groups, and notification keys.

- [ ] **Step 1: Add cases for complete pricing, family pricing, missing pricing, source/project/date filters, DST, comparison, malformed records, and all budget periods; write failing readers in both suites.**
- [ ] **Step 2: Run `pnpm test -- test/unit/conformance.test.ts` and `cd intellij && ./gradlew test --tests '*ConformanceTest'`; verify failures because expected results are absent.**
- [ ] **Step 3: Implement deterministic serializers (ISO instants, fixed key order, rounded decimal strings), review generated expectations against existing unit tests, and commit the reviewed expected JSON.**
- [ ] **Step 4: Run both conformance suites twice and verify byte-identical results.**
- [ ] **Step 5: Commit**

```bash
git add shared src/conformance.ts test/unit/conformance.test.ts intellij/src/test
git commit -m "test: enforce VS Code and IntelliJ parity"
```

### Task 11: Localization, Documentation, CI, and Package Verification

**Files:**
- Create: `intellij/src/main/resources/messages/CodexCostBundle.properties`
- Create: `intellij/src/main/resources/messages/CodexCostBundle_de.properties`
- Create: `.github/workflows/intellij.yml`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `intellij/build.gradle.kts`
- Create: `intellij/src/test/kotlin/com/gamjak/codexcost/LocalizationTest.kt`

**Interfaces:**
- Consumes: all plugin extension/action IDs.
- Produces: localized UI, install instructions, CI artifacts, compatibility report, installable ZIP.

- [ ] **Step 1: Write a failing localization test that extracts every `%bundle.key` and `CodexCostBundle.message("key")` reference and asserts presence in both bundles.**
- [ ] **Step 2: Run `./gradlew test --tests '*LocalizationTest'` and verify missing-key failures.**
- [ ] **Step 3: Add complete English/German bundles; document ZIP installation, compatibility, settings, privacy, and parity; configure CI for `pnpm check`, Gradle tests, conformance, `buildPlugin`, and `verifyPlugin` against oldest/current Community and Ultimate.**
- [ ] **Step 4: Run final verification**

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm compile
pnpm package
cd intellij
./gradlew clean test buildPlugin verifyPlugin
```

Expected: every command exits `0`; VSIX and IntelliJ ZIP exist; Plugin Verifier reports no compatibility problems, internal API usage, or missing classes.

- [ ] **Step 5: Install the generated ZIP into sandbox IDE with `./gradlew runIde`, load only copied fixtures, and verify the acceptance checklist in the design specification.**

- [ ] **Step 6: Commit**

```bash
git add .github README.md CHANGELOG.md intellij
git commit -m "release: package IntelliJ Codex Cost plugin"
```

## Completion Review

- Confirm every requirement in `docs/superpowers/specs/2026-07-26-intellij-idea-plugin-design.md` maps to Tasks 1–11.
- Repeat the writing-plans placeholder scan and require no matches.
- Verify the names `CodexCostProjectService`, `CostSnapshot`, `UsageReport`, `CostControlReport`, `CostCenterReport`, and the three widget IDs are consistent across all tasks.
- Use `superpowers:verification-before-completion` before claiming success.
- Use `superpowers:requesting-code-review` after all commands pass.
- Use `superpowers:finishing-a-development-branch` to choose merge, push, or cleanup.

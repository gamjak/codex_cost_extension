package com.gamjak.codexcost.domain

import java.nio.file.Path
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals

class SessionAggregatorTest {
  private val clock = Clock.fixed(Instant.parse("2026-07-26T12:00:00Z"), ZoneOffset.UTC)

  @Test
  fun `builds project summary and daily budget from session deltas`() {
    val session = ParsedSession(
      sessionId = "session-1",
      filePath = "/logs/session.jsonl",
      updatedAt = Instant.parse("2026-07-26T11:00:00Z"),
      usageHistory = listOf(
        SessionUsage(Instant.parse("2026-07-26T10:00:00Z"), TokenUsage(1_000_000, 0, 0, 1_000_000), "/project", "gpt-5.6"),
        SessionUsage(Instant.parse("2026-07-26T11:00:00Z"), TokenUsage(1_500_000, 0, 0, 1_500_000), "/project", "gpt-5.6")
      )
    )

    val report = buildUsageReport(
      sessions = listOf(session),
      pricing = mapOf("gpt-5.6" to ModelPricing(2.0, 0.2, 4.0)),
      options = ReportOptions(
        scope = ViewScope.PROJECT,
        projectRoots = listOf(Path.of("/project")),
        budget = BudgetSettings(dayAmount = 2.5, weekAmount = 0.0, monthAmount = 0.0, warningPercent = 80.0),
        budgetPeriod = BudgetPeriod.DAY,
        clock = clock
      )
    )

    assertEquals(1, report.summary.sessionsCount)
    assertEquals(1_500_000, report.summary.totalTokens)
    assertEquals(3.0, report.summary.estimatedCost!!, 1e-12)
    assertEquals(BudgetState.ERROR, report.budget.state)
    assertEquals(3.0, report.budget.spentCost!!, 1e-12)
  }
}

package com.gamjak.codexcost.toolwindow

import com.gamjak.codexcost.domain.*
import java.time.Instant
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class ToolWindowModelTest {
  @Test
  fun `builds session and model rows without exposing full paths`() {
    val report = UsageReport(
      SummaryReport(1, 100, 10, 20, 120, 0.5),
      listOf(SessionReportItem("session-1", "C:/private/project", "gpt-5.6", Instant.EPOCH, TokenUsage(100, 10, 20, 120), 0.5, true)),
      listOf(ModelReportItem("gpt-5.6", 120, 1, 0.5, true)),
      BudgetStatus(BudgetPeriod.MONTH, 0.5, 10.0, 80.0, false, BudgetState.NEUTRAL),
      emptyList(),
      false
    )

    val model = buildToolWindowModel(report, Locale.US)

    assertEquals(listOf("session-1 | gpt-5.6 | 120 tokens | \$0.50"), model.sessions)
    assertEquals(listOf("gpt-5.6 | 1 session | 120 tokens | \$0.50"), model.models)
  }
}

package com.gamjak.codexcost.domain

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

class UsageTimelineTest {
  @Test
  fun `turns cumulative usage history into additive deltas`() {
    val session = ParsedSession(
      sessionId = "session-1",
      filePath = "/logs/session.jsonl",
      updatedAt = Instant.parse("2026-07-26T10:00:00Z"),
      usageHistory = listOf(
        SessionUsage(Instant.parse("2026-07-26T09:00:00Z"), TokenUsage(100, 10, 20, 120), "/project", "gpt-5.6"),
        SessionUsage(Instant.parse("2026-07-26T10:00:00Z"), TokenUsage(130, 20, 30, 160), "/project", "gpt-5.6")
      )
    )

    assertEquals(
      listOf(TokenUsage(100, 10, 20, 120), TokenUsage(30, 10, 10, 40)),
      buildSessionUsageDeltas(session).map { it.tokens }
    )
  }

  @Test
  fun `counter reset uses current cumulative values as the next delta`() {
    val session = ParsedSession(
      sessionId = "session-1",
      filePath = "/logs/session.jsonl",
      updatedAt = Instant.parse("2026-07-26T10:00:00Z"),
      usageHistory = listOf(
        SessionUsage(Instant.parse("2026-07-26T09:00:00Z"), TokenUsage(100, 10, 20, 120)),
        SessionUsage(Instant.parse("2026-07-26T10:00:00Z"), TokenUsage(20, 2, 5, 25))
      )
    )

    assertEquals(TokenUsage(20, 2, 5, 25), buildSessionUsageDeltas(session).last().tokens)
  }
}

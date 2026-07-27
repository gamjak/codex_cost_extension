package com.gamjak.codexcost.data

import java.nio.file.Files
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class SessionJsonlParserTest {
  @Test
  fun `keeps valid session usage when a JSONL line is malformed`() {
    val file = Files.createTempFile("codex-cost-session", ".jsonl")
    file.writeText(
      """
      {"timestamp":"2026-06-01T09:00:00.000Z","type":"session_meta","payload":{"id":"session-malformed","source":"vscode","originator":"codex_vscode","cwd":"C:\\repo"}}
      this is not json
      {"timestamp":"2026-06-01T09:01:00.000Z","type":"turn_context","payload":{"cwd":"C:\\repo","model":"gpt-5.6"}}
      {"timestamp":"2026-06-01T09:02:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":300,"cached_input_tokens":0,"output_tokens":50,"total_tokens":350}}}}
      """.trimIndent() + "\n"
    )

    val result = parseSessionFile(file)
    val session = assertNotNull(result.session)

    assertEquals("session-malformed", session.sessionId)
    assertEquals("vscode", session.source)
    assertEquals("gpt-5.6", session.model)
    assertEquals(350, session.usage!!.totalTokens)
    assertEquals(1, session.usageHistory.size)
    assertEquals(1, result.diagnostics.malformedLines)
  }
}

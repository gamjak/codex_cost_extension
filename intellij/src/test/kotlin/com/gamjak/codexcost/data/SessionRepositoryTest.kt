package com.gamjak.codexcost.data

import java.nio.file.Files
import kotlin.io.path.appendText
import kotlin.io.path.createDirectories
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals

class SessionRepositoryTest {
  @Test
  fun `deduplicates roots and reparses only an appended session file`() {
    val root = Files.createTempDirectory("codex-cost-root")
    val nested = root.resolve("nested").also { it.createDirectories() }
    val file = nested.resolve("session.jsonl")
    file.writeText(record("2026-07-26T10:00:00Z", "session-1", 100) + "\n")
    val parseKinds = mutableListOf<ParseKind>()
    val repository = SessionRepository(onParse = { kind, _ -> parseKinds += kind })

    val first = repository.load(listOf(root, root))
    val second = repository.load(listOf(root))
    file.appendText(record("2026-07-26T10:01:00Z", "session-1", 150) + "\n")
    val third = repository.load(listOf(root))

    assertEquals(1, first.filesCount)
    assertEquals(1, second.sessions.size)
    assertEquals(150, third.sessions.single().usage!!.totalTokens)
    assertEquals(listOf(ParseKind.FULL, ParseKind.APPEND), parseKinds)
  }

  private fun record(timestamp: String, id: String, total: Int) =
    """{"timestamp":"$timestamp","type":"session_meta","payload":{"id":"$id"}}
{"timestamp":"$timestamp","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":${total - 20},"cached_input_tokens":10,"output_tokens":20,"total_tokens":$total}}}}"""
}

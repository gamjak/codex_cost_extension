package com.gamjak.codexcost.data

import com.gamjak.codexcost.domain.ParsedSession
import com.gamjak.codexcost.domain.SessionUsage
import com.gamjak.codexcost.domain.TokenUsage
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.nio.file.Path
import java.time.Instant
import kotlin.io.path.readLines

data class SessionParseDiagnostics(
  var malformedLines: Int = 0,
  var invalidTimestamps: Int = 0,
  var invalidTokenUsageRecords: Int = 0
)

data class SessionParseResult(
  val session: ParsedSession?,
  val diagnostics: SessionParseDiagnostics
)

private class MutableSession(file: Path) {
  var sessionId = file.fileName.toString().substringBeforeLast('.')
  var startedAt: Instant? = null
  var updatedAt: Instant? = null
  var source: String? = null
  var originator: String? = null
  var cwd: String? = null
  var model: String? = null
  var usage: TokenUsage? = null
  val usageHistory = mutableListOf<SessionUsage>()

  fun toParsedSession(file: Path): ParsedSession? = updatedAt?.let {
    ParsedSession(
      sessionId = sessionId,
      filePath = file.toString(),
      startedAt = startedAt,
      updatedAt = it,
      source = source,
      originator = originator,
      cwd = cwd,
      model = model,
      usage = usage,
      usageHistory = usageHistory.toList()
    )
  }
}

private fun JsonObject.string(name: String): String? =
  get(name)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString

private fun JsonObject.long(name: String): Long? =
  get(name)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asLong

private fun JsonElement.obj(): JsonObject? = takeIf { it.isJsonObject }?.asJsonObject

private fun tokenUsage(value: JsonObject?): TokenUsage? {
  value ?: return null
  val input = value.long("input_tokens") ?: return null
  val cached = value.long("cached_input_tokens") ?: 0L
  val output = value.long("output_tokens") ?: return null
  return TokenUsage(input, cached, output, value.long("total_tokens") ?: input + output)
}

private fun reduceLine(session: MutableSession, diagnostics: SessionParseDiagnostics, line: String) {
  if (line.isBlank()) return
  val record = try {
    JsonParser.parseString(line).obj() ?: return
  } catch (_: RuntimeException) {
    diagnostics.malformedLines += 1
    return
  }
  val timestampText = record.string("timestamp")
  val timestamp = timestampText?.let {
    try {
      Instant.parse(it)
    } catch (_: RuntimeException) {
      diagnostics.invalidTimestamps += 1
      null
    }
  }
  if (timestamp != null) {
    if (session.startedAt == null || timestamp < session.startedAt) session.startedAt = timestamp
    if (session.updatedAt == null || timestamp > session.updatedAt) session.updatedAt = timestamp
  }

  val payload = record.get("payload").obj() ?: return
  when (record.string("type")) {
    "session_meta" -> {
      session.sessionId = payload.string("id") ?: session.sessionId
      session.source = payload.string("source") ?: session.source
      session.originator = payload.string("originator") ?: session.originator
      session.cwd = payload.string("cwd") ?: session.cwd
    }
    "turn_context" -> {
      session.cwd = payload.string("cwd") ?: session.cwd
      session.model = payload.string("model") ?: session.model
    }
    "event_msg" -> if (payload.string("type") == "token_count") {
      val usage = tokenUsage(payload.get("info").obj()?.get("total_token_usage")?.obj())
      if (usage == null) {
        diagnostics.invalidTokenUsageRecords += 1
      } else {
        session.usage = usage
        if (timestamp != null) session.usageHistory += SessionUsage(timestamp, usage, session.cwd, session.model)
      }
    }
  }
}

fun parseSessionFile(file: Path): SessionParseResult {
  val diagnostics = SessionParseDiagnostics()
  val session = MutableSession(file)
  file.readLines().forEach { reduceLine(session, diagnostics, it) }
  return SessionParseResult(session.toParsedSession(file), diagnostics)
}

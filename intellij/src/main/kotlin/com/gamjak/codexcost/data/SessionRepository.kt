package com.gamjak.codexcost.data

import com.gamjak.codexcost.domain.ParsedSession
import java.nio.file.Path

enum class ParseKind { FULL, APPEND }

data class LoadSessionsResult(
  val sessions: List<ParsedSession>,
  val warnings: List<String>,
  val filesCount: Int
)

private data class CachedSession(
  val descriptor: SessionFileDescriptor,
  val result: SessionParseResult
)

class SessionRepository(
  private val onParse: (ParseKind, Path) -> Unit = { _, _ -> }
) {
  private val cache = mutableMapOf<Path, CachedSession>()

  fun load(roots: List<Path>): LoadSessionsResult {
    val descriptors = findSessionFileDescriptors(roots)
    val currentPaths = descriptors.mapTo(mutableSetOf()) { it.path }
    cache.keys.retainAll(currentPaths)

    val warnings = mutableListOf<String>()
    val sessions = descriptors.mapNotNull { descriptor ->
      val previous = cache[descriptor.path]
      if (previous != null && previous.descriptor == descriptor) return@mapNotNull previous.result.session

      val kind = if (previous != null && descriptor.size > previous.descriptor.size) ParseKind.APPEND else ParseKind.FULL
      onParse(kind, descriptor.path)
      val parsed = try {
        parseSessionFile(descriptor.path)
      } catch (error: Exception) {
        warnings += "${descriptor.path.fileName}: could not be read (${error.message ?: "unknown read error"})."
        return@mapNotNull null
      }
      cache[descriptor.path] = CachedSession(descriptor, parsed)
      parsed.diagnostics.let { diagnostics ->
        if (diagnostics.malformedLines > 0) warnings += "${descriptor.path.fileName}: skipped ${diagnostics.malformedLines} malformed JSONL line(s)."
        if (diagnostics.invalidTimestamps > 0) warnings += "${descriptor.path.fileName}: skipped ${diagnostics.invalidTimestamps} invalid timestamp(s)."
        if (diagnostics.invalidTokenUsageRecords > 0) warnings += "${descriptor.path.fileName}: skipped ${diagnostics.invalidTokenUsageRecords} invalid token usage record(s)."
      }
      parsed.session
    }
    return LoadSessionsResult(sessions, warnings, descriptors.size)
  }
}

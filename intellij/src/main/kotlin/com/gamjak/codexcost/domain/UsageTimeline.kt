package com.gamjak.codexcost.domain

private fun hasCounterReset(current: TokenUsage, previous: TokenUsage): Boolean =
  current.inputTokens < previous.inputTokens ||
    current.cachedInputTokens < previous.cachedInputTokens ||
    current.outputTokens < previous.outputTokens ||
    current.totalTokens < previous.totalTokens

private fun subtract(current: TokenUsage, previous: TokenUsage): TokenUsage =
  TokenUsage(
    inputTokens = current.inputTokens - previous.inputTokens,
    cachedInputTokens = current.cachedInputTokens - previous.cachedInputTokens,
    outputTokens = current.outputTokens - previous.outputTokens,
    totalTokens = current.totalTokens - previous.totalTokens
  )

fun buildSessionUsageDeltas(session: ParsedSession): List<UsageDelta> {
  var previous: TokenUsage? = null
  return session.usageHistory.sortedBy { it.timestamp }.map { snapshot ->
    val deltaTokens = when (val prior = previous) {
      null -> snapshot.tokens
      else -> if (hasCounterReset(snapshot.tokens, prior)) snapshot.tokens else subtract(snapshot.tokens, prior)
    }
    previous = snapshot.tokens
    UsageDelta(
      timestamp = snapshot.timestamp,
      tokens = deltaTokens,
      cwd = snapshot.cwd ?: session.cwd,
      model = snapshot.model ?: session.model
    )
  }.filter { it.tokens.totalTokens > 0 }
}

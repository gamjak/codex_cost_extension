package com.gamjak.codexcost.domain

import java.nio.file.Path
import java.time.Instant

data class TokenUsage(
  val inputTokens: Long,
  val cachedInputTokens: Long,
  val outputTokens: Long,
  val totalTokens: Long
)

data class SessionUsage(
  val timestamp: Instant,
  val tokens: TokenUsage,
  val cwd: String? = null,
  val model: String? = null
)

data class ParsedSession(
  val sessionId: String,
  val filePath: String,
  val updatedAt: Instant,
  val startedAt: Instant? = null,
  val source: String? = null,
  val originator: String? = null,
  val cwd: String? = null,
  val model: String? = null,
  val usage: TokenUsage? = null,
  val usageHistory: List<SessionUsage> = emptyList()
)

data class ModelPricing(
  val inputPer1M: Double,
  val cachedInputPer1M: Double,
  val outputPer1M: Double
)

typealias PricingByModel = Map<String, ModelPricing>

data class UsageDelta(
  val timestamp: Instant,
  val tokens: TokenUsage,
  val cwd: String?,
  val model: String?
)

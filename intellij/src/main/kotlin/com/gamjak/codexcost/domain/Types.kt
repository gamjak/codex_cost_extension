package com.gamjak.codexcost.domain

import java.nio.file.Path
import java.time.Instant
import java.time.Clock

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

enum class ViewScope { PROJECT, ALL }
enum class BudgetPeriod { DAY, WEEK, MONTH }
enum class BudgetState { NONE, NEUTRAL, WARNING, ERROR }

data class BudgetSettings(
  val dayAmount: Double,
  val weekAmount: Double,
  val monthAmount: Double,
  val warningPercent: Double
)

data class ReportOptions(
  val scope: ViewScope,
  val projectRoots: List<Path>,
  val budget: BudgetSettings,
  val budgetPeriod: BudgetPeriod,
  val clock: Clock,
  val sources: Set<String> = emptySet()
)

data class SummaryReport(
  val sessionsCount: Int,
  val inputTokens: Long,
  val cachedInputTokens: Long,
  val outputTokens: Long,
  val totalTokens: Long,
  val estimatedCost: Double?
)

data class BudgetStatus(
  val period: BudgetPeriod,
  val spentCost: Double?,
  val budgetAmount: Double?,
  val warningPercent: Double,
  val hasEstimatedCostGaps: Boolean,
  val state: BudgetState
)

data class UsageReport(
  val summary: SummaryReport,
  val budget: BudgetStatus,
  val warnings: List<String>,
  val hasEstimatedCostGaps: Boolean
)

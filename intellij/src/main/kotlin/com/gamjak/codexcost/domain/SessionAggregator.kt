package com.gamjak.codexcost.domain

import java.nio.file.Path
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

private fun matchesProject(cwd: String?, roots: List<Path>): Boolean {
  cwd ?: return false
  val candidate = Path.of(cwd).toAbsolutePath().normalize()
  return roots.any { candidate.startsWith(it.toAbsolutePath().normalize()) }
}

private fun budgetStart(period: BudgetPeriod, now: Instant, zone: ZoneId): Instant {
  val local = now.atZone(zone)
  val dayStart = local.toLocalDate().atStartOfDay(zone)
  return when (period) {
    BudgetPeriod.DAY -> dayStart.toInstant()
    BudgetPeriod.WEEK -> dayStart.minusDays((local.dayOfWeek.value - DayOfWeek.MONDAY.value).toLong()).toInstant()
    BudgetPeriod.MONTH -> dayStart.withDayOfMonth(1).toInstant()
  }
}

private fun configuredBudget(period: BudgetPeriod, settings: BudgetSettings): Double? = when (period) {
  BudgetPeriod.DAY -> settings.dayAmount
  BudgetPeriod.WEEK -> settings.weekAmount
  BudgetPeriod.MONTH -> settings.monthAmount
}.takeIf { it > 0.0 }

fun normalizeSource(source: String?, originator: String?): String {
  val value = (source ?: originator ?: "unknown").lowercase()
  return when {
    "vscode" in value || "visual studio code" in value -> "vscode"
    "desktop" in value -> "desktop"
    "cli" in value || "codex_exec" in value || value == "codex" -> "cli"
    else -> value
  }
}

fun buildUsageReport(sessions: List<ParsedSession>, pricing: PricingByModel, options: ReportOptions): UsageReport {
  val now = options.clock.instant()
  val budgetStart = budgetStart(options.budgetPeriod, now, options.clock.zone)
  var input = 0L
  var cached = 0L
  var output = 0L
  var total = 0L
  var cost = 0.0
  var hasPricedUsage = false
  var hasGaps = false
  var budgetCost = 0.0
  var budgetHasPricedUsage = false
  var budgetHasGaps = false
  val sessionIds = mutableSetOf<String>()
  val warnings = sortedSetOf<String>()
  data class SessionAcc(var cwd: String? = null, var model: String? = null, var updatedAt: Instant = Instant.EPOCH,
    var input: Long = 0, var cached: Long = 0, var output: Long = 0, var total: Long = 0,
    var cost: Double = 0.0, var priced: Boolean = false, var gaps: Boolean = false, val id: String)
  data class ModelAcc(var total: Long = 0, var cost: Double = 0.0, var priced: Boolean = false,
    var gaps: Boolean = false, val sessions: MutableSet<String> = mutableSetOf())
  val sessionRows = mutableMapOf<String, SessionAcc>()
  val modelRows = mutableMapOf<String, ModelAcc>()

  sessions.forEach { session ->
    val normalizedSource = normalizeSource(session.source, session.originator)
    if (options.sources.isNotEmpty() && normalizedSource !in options.sources) return@forEach
    buildSessionUsageDeltas(session).forEach { delta ->
      if (delta.timestamp > now) return@forEach
      if (options.startAt != null && delta.timestamp < options.startAt) return@forEach
      if (options.endAt != null && delta.timestamp > options.endAt) return@forEach
      val inScope = options.scope == ViewScope.ALL || matchesProject(delta.cwd, options.projectRoots)
      if (!inScope) return@forEach
      val price = resolveModelPricing(delta.model, pricing)
      val deltaCost = estimateTokenCost(delta.tokens, price)
      if (delta.model == null || price == null) {
        hasGaps = true
        warnings += if (delta.model == null) "Missing model for session: ${session.sessionId}" else "Missing pricing for model: ${delta.model}"
      } else {
        cost += deltaCost!!
        hasPricedUsage = true
      }
      input += delta.tokens.inputTokens
      cached += delta.tokens.cachedInputTokens
      output += delta.tokens.outputTokens
      total += delta.tokens.totalTokens
      sessionIds += "${session.filePath}::${session.sessionId}"
      val sessionKey = "${session.filePath}::${session.sessionId}"
      val row = sessionRows.getOrPut(sessionKey) { SessionAcc(id = session.sessionId) }
      row.cwd = delta.cwd
      row.model = delta.model
      row.updatedAt = maxOf(row.updatedAt, delta.timestamp)
      row.input += delta.tokens.inputTokens
      row.cached += delta.tokens.cachedInputTokens
      row.output += delta.tokens.outputTokens
      row.total += delta.tokens.totalTokens
      if (deltaCost == null) row.gaps = true else { row.cost += deltaCost; row.priced = true }
      val modelKey = delta.model ?: "unknown"
      val modelRow = modelRows.getOrPut(modelKey) { ModelAcc() }
      modelRow.total += delta.tokens.totalTokens
      modelRow.sessions += sessionKey
      if (deltaCost == null) modelRow.gaps = true else { modelRow.cost += deltaCost; modelRow.priced = true }
      if (delta.timestamp >= budgetStart) {
        if (deltaCost == null) budgetHasGaps = true else {
          budgetCost += deltaCost
          budgetHasPricedUsage = true
        }
      }
    }
  }
  val budgetAmount = configuredBudget(options.budgetPeriod, options.budget)
  val spent = if (budgetHasPricedUsage || !budgetHasGaps) budgetCost else null
  val state = when {
    budgetAmount == null -> BudgetState.NONE
    spent == null -> BudgetState.NEUTRAL
    spent >= budgetAmount -> BudgetState.ERROR
    spent >= budgetAmount * options.budget.warningPercent / 100.0 -> BudgetState.WARNING
    else -> BudgetState.NEUTRAL
  }
  return UsageReport(
    summary = SummaryReport(sessionIds.size, input, cached, output, total, if (hasPricedUsage || !hasGaps) cost else null),
    sessions = sessionRows.values.map { row ->
      SessionReportItem(row.id, row.cwd, row.model, row.updatedAt,
        TokenUsage(row.input, row.cached, row.output, row.total),
        if (row.priced || !row.gaps) row.cost else null, !row.gaps)
    }.sortedByDescending { it.updatedAt },
    models = modelRows.map { (model, row) ->
      ModelReportItem(model, row.total, row.sessions.size, if (row.priced || !row.gaps) row.cost else null, !row.gaps)
    }.sortedByDescending { it.totalTokens },
    budget = BudgetStatus(options.budgetPeriod, spent, budgetAmount, options.budget.warningPercent, budgetHasGaps, state),
    warnings = warnings.toList(),
    hasEstimatedCostGaps = hasGaps
  )
}

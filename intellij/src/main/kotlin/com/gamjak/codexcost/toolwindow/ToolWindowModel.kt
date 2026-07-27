package com.gamjak.codexcost.toolwindow

import com.gamjak.codexcost.domain.UsageReport
import java.nio.file.Path
import java.util.Locale

data class ToolWindowModel(
  val overview: String,
  val sessions: List<String>,
  val projects: List<String>,
  val models: List<String>,
  val warnings: List<String>
)

private fun money(value: Double?, locale: Locale) = value?.let { "$" + String.format(locale, "%.2f", it) } ?: "partial"

fun buildToolWindowModel(report: UsageReport, locale: Locale = Locale.getDefault()): ToolWindowModel {
  val sessions = report.sessions.map {
    "${it.sessionId} | ${it.model ?: "unknown"} | ${it.tokens.totalTokens} tokens | ${money(it.estimatedCost, locale)}"
  }
  val projects = report.sessions.groupBy { item ->
    item.cwd?.let { Path.of(it).fileName?.toString() } ?: "Unknown project"
  }.map { (project, items) ->
    val tokens = items.sumOf { it.tokens.totalTokens }
    val cost = items.mapNotNull { it.estimatedCost }.takeIf { it.isNotEmpty() }?.sum()
    "$project | ${items.size} session${if (items.size == 1) "" else "s"} | $tokens tokens | ${money(cost, locale)}"
  }.sorted()
  val models = report.models.map {
    "${it.model} | ${it.sessionCount} session${if (it.sessionCount == 1) "" else "s"} | ${it.totalTokens} tokens | ${money(it.estimatedCost, locale)}"
  }
  return ToolWindowModel(
    overview = "${report.summary.sessionsCount} sessions | ${report.summary.totalTokens} tokens | ${money(report.summary.estimatedCost, locale)}",
    sessions = sessions,
    projects = projects,
    models = models,
    warnings = report.warnings
  )
}

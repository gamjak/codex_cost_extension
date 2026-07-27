package com.gamjak.codexcost.settings

import com.intellij.openapi.components.service
import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.openapi.ui.ComboBox
import java.awt.GridLayout
import javax.swing.JComponent
import javax.swing.JPanel

class CodexCostConfigurable : Configurable {
  private val roots = JBTextField()
  private val refresh = JBTextField()
  private val sources = JBTextField()
  private val startDate = JBTextField()
  private val day = JBTextField()
  private val week = JBTextField()
  private val month = JBTextField()
  private val warning = JBTextField()
  private val everyAmount = JBTextField()
  private val budgetPeriod = ComboBox(arrayOf("day", "week", "month"))
  private val sessionWidget = JBCheckBox("Show current session cost")
  private val projectWidget = JBCheckBox("Show current project cost")
  private val budgetWidget = JBCheckBox("Show budget")
  private val notifications = JBCheckBox("Enable budget notifications")

  override fun getDisplayName() = "Codex Cost"

  override fun createComponent(): JComponent = JPanel(GridLayout(0, 2, 8, 8)).apply {
    add(JBLabel("Log roots (comma separated)")); add(roots)
    add(JBLabel("Auto refresh (seconds)")); add(refresh)
    add(JBLabel("Sources (comma separated)")); add(sources)
    add(JBLabel("Start date (DD.MM.YYYY)")); add(startDate)
    add(JBLabel("Daily budget (USD)")); add(day)
    add(JBLabel("Weekly budget (USD)")); add(week)
    add(JBLabel("Monthly budget (USD)")); add(month)
    add(JBLabel("Warning threshold (%)")); add(warning)
    add(JBLabel("Notify every amount (USD)")); add(everyAmount)
    add(JBLabel("Status budget period")); add(budgetPeriod)
    add(sessionWidget); add(projectWidget)
    add(budgetWidget); add(notifications)
    reset()
  }

  override fun isModified(): Boolean {
    val state = service<CodexCostSettings>().state
    return roots.text != state.logRoots.joinToString(", ") ||
      refresh.text != state.autoRefreshSeconds.toString() ||
      sources.text != state.sources.joinToString(", ") || startDate.text != state.startDate ||
      day.text != state.dayBudget.toString() || week.text != state.weekBudget.toString() ||
      month.text != state.monthBudget.toString() || warning.text != state.warningPercent.toString() ||
      everyAmount.text != state.notificationEveryAmount.toString() || budgetPeriod.selectedItem != state.statusBudgetPeriod ||
      sessionWidget.isSelected != state.showSession || projectWidget.isSelected != state.showProject ||
      budgetWidget.isSelected != state.showBudget || notifications.isSelected != state.notificationsEnabled
  }

  override fun apply() {
    val state = service<CodexCostSettings>().state
    state.logRoots = roots.text.split(',').map { it.trim() }.filter { it.isNotEmpty() }
    state.autoRefreshSeconds = refresh.text.toIntOrNull()?.coerceIn(0, 86_400) ?: 60
    state.sources = sources.text.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }
    state.startDate = startDate.text.trim()
    state.dayBudget = day.text.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
    state.weekBudget = week.text.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
    state.monthBudget = month.text.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
    state.warningPercent = warning.text.toDoubleOrNull()?.coerceIn(0.0, 100.0) ?: 80.0
    state.notificationEveryAmount = everyAmount.text.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
    state.statusBudgetPeriod = budgetPeriod.selectedItem as? String ?: "month"
    state.showSession = sessionWidget.isSelected
    state.showProject = projectWidget.isSelected
    state.showBudget = budgetWidget.isSelected
    state.notificationsEnabled = notifications.isSelected
  }

  override fun reset() {
    val state = service<CodexCostSettings>().state
    roots.text = state.logRoots.joinToString(", ")
    refresh.text = state.autoRefreshSeconds.toString()
    sources.text = state.sources.joinToString(", ")
    startDate.text = state.startDate
    day.text = state.dayBudget.toString()
    week.text = state.weekBudget.toString()
    month.text = state.monthBudget.toString()
    warning.text = state.warningPercent.toString()
    everyAmount.text = state.notificationEveryAmount.toString()
    budgetPeriod.selectedItem = state.statusBudgetPeriod
    sessionWidget.isSelected = state.showSession
    projectWidget.isSelected = state.showProject
    budgetWidget.isSelected = state.showBudget
    notifications.isSelected = state.notificationsEnabled
  }
}

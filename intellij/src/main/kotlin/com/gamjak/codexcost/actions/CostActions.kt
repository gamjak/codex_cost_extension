package com.gamjak.codexcost.actions

import com.gamjak.codexcost.integration.CodexCostProjectService
import com.gamjak.codexcost.settings.CodexCostConfigurable
import com.gamjak.codexcost.settings.CodexCostSettings
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.ui.Messages
import java.awt.datatransfer.StringSelection

class RefreshCostAction : AnAction("Refresh") {
  override fun actionPerformed(event: AnActionEvent) {
    event.project?.service<CodexCostProjectService>()?.refresh()
  }
}

class ConfigureDailyBudgetAction : AnAction("Configure Daily Budget") {
  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    val input = Messages.showInputDialog(project, "Set a positive daily USD budget", "Codex Cost", null) ?: return
    val amount = input.trim().toDoubleOrNull()
    if (amount == null || amount <= 0.0) {
      Messages.showErrorDialog(project, "Enter a positive USD amount.", "Codex Cost")
      return
    }
    service<CodexCostSettings>().state.dayBudget = amount
    project.service<CodexCostProjectService>().refresh()
  }
}

class CopyCostSummaryAction : AnAction("Copy Cost Summary") {
  override fun actionPerformed(event: AnActionEvent) {
    val report = event.project?.service<CodexCostProjectService>()?.snapshot()?.report ?: return
    val summary = "Codex Cost: ${report.summary.sessionsCount} sessions, ${report.summary.totalTokens} tokens, " +
      (report.summary.estimatedCost?.let { "$%.2f".format(it) } ?: "partial estimate")
    CopyPasteManager.getInstance().setContents(StringSelection(summary))
  }
}

class OpenCostSettingsAction : AnAction("Settings") {
  override fun actionPerformed(event: AnActionEvent) {
    ShowSettingsUtil.getInstance().showSettingsDialog(event.project, CodexCostConfigurable::class.java)
  }
}

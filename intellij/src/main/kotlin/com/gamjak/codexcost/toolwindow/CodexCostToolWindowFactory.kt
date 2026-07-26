package com.gamjak.codexcost.toolwindow

import com.gamjak.codexcost.integration.CodexCostProjectService
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import javax.swing.BoxLayout
import javax.swing.JPanel

class CodexCostToolWindowFactory : ToolWindowFactory {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val panel = JPanel().apply { layout = BoxLayout(this, BoxLayout.Y_AXIS) }
    val summary = JBLabel("Loading local Codex sessions…")
    val budget = JBLabel()
    val warnings = JBLabel()
    panel.add(summary)
    panel.add(budget)
    panel.add(warnings)
    val service = project.service<CodexCostProjectService>()
    val subscription = service.subscribe { snapshot ->
      summary.text = "Project: ${snapshot.report.summary.estimatedCost?.let { "\$%.2f".format(it) } ?: "partial estimate"} (${snapshot.report.summary.totalTokens} tokens)"
      budget.text = snapshot.report.budget.let { "Budget: ${it.spentCost?.let { spent -> "\$%.2f".format(spent) } ?: "partial"}/${it.budgetAmount?.let { limit -> "\$%.2f".format(limit) } ?: "not configured"}" }
      warnings.text = snapshot.report.warnings.joinToString(" ")
    }
    Disposer.register(toolWindow.disposable, subscription)
    toolWindow.contentManager.addContent(ContentFactory.getInstance().createContent(panel, "", false))
  }
}

package com.gamjak.codexcost.toolwindow

import com.gamjak.codexcost.integration.CodexCostProjectService
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBTabbedPane
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import javax.swing.BoxLayout
import javax.swing.JPanel

class CodexCostToolWindowFactory : ToolWindowFactory {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val panel = JPanel(BorderLayout())
    val scope = ComboBox(arrayOf("Project", "All Sessions"))
    panel.add(scope, BorderLayout.NORTH)
    val overviewPanel = JPanel().apply { layout = BoxLayout(this, BoxLayout.Y_AXIS) }
    val summary = JBLabel("Loading local Codex sessions…")
    val budget = JBLabel()
    val warnings = JBLabel()
    overviewPanel.add(summary)
    overviewPanel.add(budget)
    overviewPanel.add(warnings)
    val sessions = JBList<String>()
    val projects = JBList<String>()
    val models = JBList<String>()
    val tabs = JBTabbedPane().apply {
      addTab("Overview", overviewPanel)
      addTab("Sessions", sessions)
      addTab("Projects", projects)
      addTab("Models", models)
    }
    panel.add(tabs, BorderLayout.CENTER)
    val service = project.service<CodexCostProjectService>()
    var current = service.snapshot()
    fun render() {
      val snapshot = current ?: return
      val report = if (scope.selectedIndex == 0) snapshot.report else snapshot.allSessionsReport
      summary.text = "${scope.selectedItem}: ${report.summary.estimatedCost?.let { "\$%.2f".format(it) } ?: "partial estimate"} (${report.summary.totalTokens} tokens)"
      budget.text = report.budget.let { "Budget: ${it.spentCost?.let { spent -> "\$%.2f".format(spent) } ?: "partial"}/${it.budgetAmount?.let { limit -> "\$%.2f".format(limit) } ?: "not configured"}" }
      warnings.text = report.warnings.joinToString(" ")
      val model = buildToolWindowModel(report)
      sessions.setListData(model.sessions.toTypedArray())
      projects.setListData(model.projects.toTypedArray())
      models.setListData(model.models.toTypedArray())
    }
    scope.addActionListener { render() }
    val subscription = service.subscribe { snapshot ->
      current = snapshot
      render()
    }
    Disposer.register(toolWindow.disposable, subscription)
    toolWindow.contentManager.addContent(ContentFactory.getInstance().createContent(panel, "", false))
  }
}

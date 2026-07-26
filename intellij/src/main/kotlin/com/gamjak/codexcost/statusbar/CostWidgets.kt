package com.gamjak.codexcost.statusbar

import com.gamjak.codexcost.integration.CodexCostProjectService
import com.gamjak.codexcost.integration.CostSnapshot
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import java.awt.event.MouseEvent

enum class WidgetKind(val id: String, val label: String) {
  SESSION("CodexCost.Session", "Session"), PROJECT("CodexCost.Project", "Project"), BUDGET("CodexCost.Budget", "Budget")
}

private fun money(value: Double?) = value?.let { "$" + "%.2f".format(it) } ?: "—"

private class CostWidget(private val project: Project, private val kind: WidgetKind) : StatusBarWidget, Disposable {
  private var snapshot: CostSnapshot? = null
  private var statusBar: StatusBar? = null
  private val subscription = project.service<CodexCostProjectService>().subscribe { next ->
    snapshot = next
    statusBar?.updateWidget(ID())
  }

  override fun ID(): String = kind.id
  override fun install(statusBar: StatusBar) { this.statusBar = statusBar }
  override fun dispose() { subscription.dispose() }
  override fun getPresentation(): StatusBarWidget.WidgetPresentation = object : StatusBarWidget.TextPresentation {
    override fun getText(): String = when (kind) {
      WidgetKind.SESSION -> "Codex ${money(snapshot?.latestSessionCost)}"
      WidgetKind.PROJECT -> "Project ${money(snapshot?.report?.summary?.estimatedCost)}"
      WidgetKind.BUDGET -> snapshot?.report?.budget?.let { "Budget ${money(it.spentCost)}/${money(it.budgetAmount)}" } ?: "Budget —"
    }
    override fun getTooltipText(): String = "Codex Cost local estimate"
    override fun getClickConsumer(): Consumer<MouseEvent>? = null
    override fun getAlignment(): Float = 0f
  }
}

abstract class BaseFactory(private val kind: WidgetKind) : StatusBarWidgetFactory {
  override fun getId(): String = kind.id
  override fun getDisplayName(): String = "Codex Cost ${kind.label}"
  override fun isAvailable(project: Project): Boolean = true
  override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
  override fun createWidget(project: Project): StatusBarWidget = CostWidget(project, kind)
  override fun disposeWidget(widget: StatusBarWidget) { (widget as? Disposable)?.dispose() }
}

class SessionCostWidgetFactory : BaseFactory(WidgetKind.SESSION)
class ProjectCostWidgetFactory : BaseFactory(WidgetKind.PROJECT)
class BudgetCostWidgetFactory : BaseFactory(WidgetKind.BUDGET)

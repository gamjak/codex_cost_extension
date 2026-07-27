package com.gamjak.codexcost.integration

import com.gamjak.codexcost.data.SessionRepository
import com.gamjak.codexcost.domain.BudgetPeriod
import com.gamjak.codexcost.domain.BudgetSettings
import com.gamjak.codexcost.domain.DEFAULT_PRICING
import com.gamjak.codexcost.domain.ModelPricing
import com.gamjak.codexcost.domain.ReportOptions
import com.gamjak.codexcost.domain.UsageReport
import com.gamjak.codexcost.domain.ViewScope
import com.gamjak.codexcost.domain.buildUsageReport
import com.gamjak.codexcost.domain.estimateTokenCost
import com.gamjak.codexcost.domain.resolveModelPricing
import com.gamjak.codexcost.settings.CodexCostSettings
import com.gamjak.codexcost.notifications.BudgetNotificationController
import com.gamjak.codexcost.notifications.NotificationKind
import com.intellij.openapi.Disposable
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import java.nio.file.Path
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

data class CostSnapshot(
  val report: UsageReport,
  val allSessionsReport: UsageReport,
  val latestSessionCost: Double?,
  val refreshedAt: Instant
)

@Service(Service.Level.PROJECT)
class CodexCostProjectService(private val project: Project) : Disposable {
  private val repository = SessionRepository()
  private val listeners = CopyOnWriteArrayList<(CostSnapshot) -> Unit>()
  private val scheduler = Executors.newSingleThreadScheduledExecutor { runnable ->
    Thread(runnable, "Codex Cost refresh").apply { isDaemon = true }
  }
  @Volatile private var latest: CostSnapshot? = null

  init {
    refresh()
    val seconds = settings().autoRefreshSeconds.coerceIn(0, 86_400)
    if (seconds > 0) scheduler.scheduleWithFixedDelay({ refresh() }, seconds.toLong(), seconds.toLong(), TimeUnit.SECONDS)
  }

  fun snapshot(): CostSnapshot? = latest

  fun subscribe(listener: (CostSnapshot) -> Unit): Disposable {
    listeners += listener
    latest?.let(listener)
    return Disposable { listeners -= listener }
  }

  fun refresh() {
    ApplicationManager.getApplication().executeOnPooledThread {
      if (project.isDisposed) return@executeOnPooledThread
      val state = settings()
      val roots = state.logRoots.map { resolveRoot(it) }
      val loaded = repository.load(roots)
      val sessions = loaded.sessions
      val period = when (state.statusBudgetPeriod) { "day" -> BudgetPeriod.DAY; "week" -> BudgetPeriod.WEEK; else -> BudgetPeriod.MONTH }
      val commonOptions = ReportOptions(
        scope = ViewScope.PROJECT,
        projectRoots = project.basePath?.let { listOf(Path.of(it)) } ?: emptyList(),
        budget = BudgetSettings(state.dayBudget, state.weekBudget, state.monthBudget, state.warningPercent),
        budgetPeriod = period,
        clock = Clock.systemDefaultZone(),
        sources = state.sources.map { it.lowercase() }.toSet(),
        startAt = parseStartDate(state.startDate)
      )
      val report = buildUsageReport(sessions, pricing(state), commonOptions).let {
        it.copy(warnings = (it.warnings + loaded.warnings).distinct())
      }
      val allReport = buildUsageReport(sessions, pricing(state), commonOptions.copy(scope = ViewScope.ALL)).let {
        it.copy(warnings = (it.warnings + loaded.warnings).distinct())
      }
      val last = sessions.maxByOrNull { it.updatedAt }?.let { session -> estimateTokenCost(session.usage ?: return@let null, resolveModelPricing(session.model, pricing(state))) }
      val snapshot = CostSnapshot(report, allReport, last, Instant.now())
      latest = snapshot
      notifyBudget(state, snapshot)
      ApplicationManager.getApplication().invokeLater({ listeners.forEach { it(snapshot) } }, project.disposed)
    }
  }

  private fun settings() = service<CodexCostSettings>().state

  private fun pricing(state: CodexCostSettings.State): Map<String, ModelPricing> =
    DEFAULT_PRICING + state.pricing.mapValues { (_, value) -> ModelPricing(value.inputPer1M, value.cachedInputPer1M, value.outputPer1M) }

  private fun resolveRoot(raw: String): Path {
    val home = System.getProperty("user.home")
    return Path.of(raw.replace("%USERPROFILE%", home, true).replace("~", home)).toAbsolutePath().normalize()
  }

  private fun parseStartDate(raw: String): Instant? = runCatching {
    if (raw.isBlank()) null else java.time.LocalDate.parse(raw, java.time.format.DateTimeFormatter.ofPattern("dd.MM.uuuu"))
      .atStartOfDay(Clock.systemDefaultZone().zone).toInstant()
  }.getOrNull()

  private fun notifyBudget(state: CodexCostSettings.State, snapshot: CostSnapshot) {
    if (!state.notificationsEnabled) return
    val controller = BudgetNotificationController(state.notificationKeys)
    val events = controller.events(LocalDate.now().toString(), snapshot.report.budget, state.notificationEveryAmount)
    state.notificationKeys = controller.keys().toMutableList()
    events.forEach { kind ->
      val message = when (kind) {
        NotificationKind.WARNING -> "Codex Cost reached the configured budget warning threshold."
        NotificationKind.EXCEEDED -> "Codex Cost exceeded the configured budget."
        NotificationKind.RECURRING -> "Codex Cost reached another configured spend threshold."
      }
      NotificationGroupManager.getInstance().getNotificationGroup("Codex Cost Budget")
        .createNotification(message, NotificationType.WARNING).notify(project)
    }
  }

  override fun dispose() {
    scheduler.shutdownNow()
    listeners.clear()
  }
}

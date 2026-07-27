package com.gamjak.codexcost.notifications

import com.gamjak.codexcost.domain.BudgetState
import com.gamjak.codexcost.domain.BudgetStatus
import kotlin.math.floor

enum class NotificationKind { WARNING, EXCEEDED, RECURRING }

class BudgetNotificationController(initialKeys: Collection<String> = emptyList()) {
  private val emitted = initialKeys.toMutableSet()

  fun events(periodKey: String, status: BudgetStatus, everyAmount: Double): List<NotificationKind> {
    if (status.hasEstimatedCostGaps || status.spentCost == null) return emptyList()
    val result = mutableListOf<NotificationKind>()
    fun addOnce(key: String, kind: NotificationKind) {
      if (emitted.add("$periodKey:${status.period}:$key")) result += kind
    }
    if (status.state == BudgetState.WARNING || status.state == BudgetState.ERROR) {
      addOnce("warning", NotificationKind.WARNING)
    }
    if (status.state == BudgetState.ERROR) addOnce("exceeded", NotificationKind.EXCEEDED)
    if (everyAmount > 0.0) {
      val reached = floor(status.spentCost / everyAmount).toInt()
      (1..reached).forEach { threshold -> addOnce("recurring:$threshold", NotificationKind.RECURRING) }
    }
    return result
  }

  fun keys(): Set<String> = emitted.toSet()
}

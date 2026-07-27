package com.gamjak.codexcost.notifications

import com.gamjak.codexcost.domain.BudgetPeriod
import com.gamjak.codexcost.domain.BudgetState
import com.gamjak.codexcost.domain.BudgetStatus
import kotlin.test.Test
import kotlin.test.assertEquals

class BudgetNotificationControllerTest {
  @Test
  fun `emits warning and exceeded thresholds once per period`() {
    val controller = BudgetNotificationController()
    val warning = BudgetStatus(BudgetPeriod.DAY, 8.0, 10.0, 80.0, false, BudgetState.WARNING)
    val exceeded = warning.copy(spentCost = 11.0, state = BudgetState.ERROR)

    assertEquals(listOf(NotificationKind.WARNING), controller.events("2026-07-27", warning, 0.0))
    assertEquals(emptyList(), controller.events("2026-07-27", warning, 0.0))
    assertEquals(listOf(NotificationKind.EXCEEDED), controller.events("2026-07-27", exceeded, 0.0))
    assertEquals(listOf(NotificationKind.WARNING), controller.events("2026-07-28", warning, 0.0))
  }

  @Test
  fun `emits every configured spend increment once`() {
    val controller = BudgetNotificationController()
    val status = BudgetStatus(BudgetPeriod.DAY, 12.0, 50.0, 80.0, false, BudgetState.NEUTRAL)

    assertEquals(
      listOf(NotificationKind.RECURRING, NotificationKind.RECURRING),
      controller.events("2026-07-27", status, 5.0)
    )
    assertEquals(emptyList(), controller.events("2026-07-27", status, 5.0))
  }
}

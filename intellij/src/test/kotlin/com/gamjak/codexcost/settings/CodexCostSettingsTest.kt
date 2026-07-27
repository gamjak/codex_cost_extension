package com.gamjak.codexcost.settings

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CodexCostSettingsTest {
  @Test
  fun `default settings scan local Codex sessions and show every status value`() {
    val state = CodexCostSettings.State()

    assertEquals(listOf("%USERPROFILE%/.codex/sessions"), state.logRoots)
    assertTrue(state.showSession)
    assertTrue(state.showProject)
    assertTrue(state.showBudget)
    assertTrue(state.notificationsEnabled)
    assertEquals(0.0, state.notificationEveryAmount)
    assertEquals("month", state.statusBudgetPeriod)
  }
}

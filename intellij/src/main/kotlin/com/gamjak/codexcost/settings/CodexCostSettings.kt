package com.gamjak.codexcost.settings

import com.gamjak.codexcost.domain.DEFAULT_PRICING
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.APP)
@State(name = "CodexCostSettings", storages = [Storage("codex-cost.xml")])
class CodexCostSettings : PersistentStateComponent<CodexCostSettings.State> {
  data class State(
    var logRoots: List<String> = listOf("%USERPROFILE%/.codex/sessions"),
    var pricing: MutableMap<String, PriceState> = DEFAULT_PRICING.mapValuesTo(mutableMapOf()) { (_, price) ->
      PriceState(price.inputPer1M, price.cachedInputPer1M, price.outputPer1M)
    },
    var sources: List<String> = emptyList(),
    var autoRefreshSeconds: Int = 60,
    var dayBudget: Double = 0.0,
    var weekBudget: Double = 0.0,
    var monthBudget: Double = 0.0,
    var warningPercent: Double = 80.0,
    var showSession: Boolean = true,
    var showProject: Boolean = true,
    var showBudget: Boolean = true,
    var statusBudgetPeriod: String = "month"
  )

  data class PriceState(
    var inputPer1M: Double = 0.0,
    var cachedInputPer1M: Double = 0.0,
    var outputPer1M: Double = 0.0
  )

  private var state = State()

  override fun getState(): State = state

  override fun loadState(state: State) {
    this.state = state
  }
}

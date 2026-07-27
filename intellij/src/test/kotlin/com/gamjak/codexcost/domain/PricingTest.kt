package com.gamjak.codexcost.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PricingTest {
  @Test
  fun `resolves the longest configured model family`() {
    val prices = mapOf(
      "gpt-5" to ModelPricing(1.0, 0.1, 2.0),
      "gpt-5.6" to ModelPricing(2.0, 0.2, 4.0)
    )

    assertEquals(2.0, resolveModelPricing("gpt-5.6-sol-202607", prices)!!.inputPer1M)
  }

  @Test
  fun `returns no price when model is missing or unmatched`() {
    val prices = mapOf("gpt-5.6" to ModelPricing(2.0, 0.2, 4.0))

    assertNull(resolveModelPricing(null, prices))
    assertNull(resolveModelPricing("gpt-4.1", prices))
  }

  @Test
  fun `estimates non cached input cached input and output separately`() {
    val usage = TokenUsage(inputTokens = 100, cachedInputTokens = 40, outputTokens = 10, totalTokens = 110)
    val pricing = ModelPricing(inputPer1M = 1_000.0, cachedInputPer1M = 500.0, outputPer1M = 2_000.0)

    assertEquals(0.10, estimateTokenCost(usage, pricing)!!, 1e-12)
  }
}

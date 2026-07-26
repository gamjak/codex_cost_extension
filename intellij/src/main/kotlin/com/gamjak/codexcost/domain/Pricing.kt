package com.gamjak.codexcost.domain

val DEFAULT_PRICING: PricingByModel = mapOf(
  "gpt-5.6-sol" to ModelPricing(5.0, 0.5, 30.0),
  "gpt-5.6-terra" to ModelPricing(2.5, 0.25, 15.0),
  "gpt-5.6-luna" to ModelPricing(1.0, 0.1, 6.0),
  "gpt-5.4" to ModelPricing(2.5, 0.25, 15.0),
  "gpt-5.4-mini" to ModelPricing(0.75, 0.075, 4.5),
  "gpt-5.4-nano" to ModelPricing(0.2, 0.02, 1.25),
  "gpt-5.4-pro" to ModelPricing(30.0, 30.0, 180.0),
  "gpt-5.5" to ModelPricing(5.0, 0.5, 30.0),
  "gpt-5.5-pro" to ModelPricing(30.0, 30.0, 180.0)
)

fun resolveModelPricing(model: String?, pricingByModel: PricingByModel): ModelPricing? {
  val normalizedModel = model?.trim()?.lowercase().orEmpty()
  if (normalizedModel.isEmpty()) return null

  val normalizedPricing = pricingByModel.entries.associate { (name, price) -> name.trim().lowercase() to price }
  return normalizedPricing[normalizedModel] ?: normalizedPricing
    .filterKeys { candidate -> normalizedModel.startsWith("$candidate-") }
    .maxByOrNull { (candidate, _) -> candidate.length }
    ?.value
}

fun estimateTokenCost(tokens: TokenUsage, pricing: ModelPricing?): Double? {
  pricing ?: return null
  val uncachedInputTokens = (tokens.inputTokens - tokens.cachedInputTokens).coerceAtLeast(0)
  return uncachedInputTokens / 1_000_000.0 * pricing.inputPer1M +
    tokens.cachedInputTokens / 1_000_000.0 * pricing.cachedInputPer1M +
    tokens.outputTokens / 1_000_000.0 * pricing.outputPer1M
}

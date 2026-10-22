/**
 * Why a model call did not run. `retryable` tells background jobs whether trying again
 * later can succeed on its own (Inngest retries) or the pipeline should stop and alert.
 */
export class ModelCallError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = new.target.name
    this.retryable = retryable
  }
}

/** MODEL_CALLS_ENABLED is not "true". */
export class ModelCallsDisabledError extends ModelCallError {
  constructor() {
    super('Model calls are switched off (MODEL_CALLS_ENABLED is not "true").', false)
  }
}

/** Today's spend (Shanghai day) has reached AI_DAILY_BUDGET_USD. */
export class BudgetExceededError extends ModelCallError {
  constructor(
    readonly spentUsd: number,
    readonly budgetUsd: number,
  ) {
    super(`Daily model budget used up: $${spentUsd.toFixed(4)} of $${budgetUsd.toFixed(2)}.`, false)
  }
}

/** Another run holds the receipt for this exact call and has not finished yet. */
export class ReceiptInFlightError extends ModelCallError {
  constructor(purpose: string) {
    super(`A ${purpose} call with the same input is already running.`, true)
  }
}

/** The same call already failed the maximum number of times; it needs a person. */
export class ReceiptExhaustedError extends ModelCallError {
  constructor(purpose: string, attempts: number, lastError: string | null) {
    super(`The ${purpose} call failed ${attempts} times; last error: ${lastError ?? 'unknown'}.`, false)
  }
}

/** OPENROUTER_API_KEY is missing. */
export class MissingApiKeyError extends ModelCallError {
  constructor() {
    super('OPENROUTER_API_KEY is not set.', false)
  }
}

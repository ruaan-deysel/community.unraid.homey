'use strict';

/**
 * Configuration for polling
 */
export interface PollConfig {
  /** Minimum polling interval in ms (default: 1000) */
  minInterval?: number;
  /** Maximum polling interval in ms (default: 30000) */
  maxInterval?: number;
  /** Base interval when no errors (default: varies by poll type) */
  baseInterval: number;
  /** Maximum retry attempts before stopping (default: 5) */
  maxRetries?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
}

/**
 * State tracking for a poll
 */
interface PollState {
  interval: ReturnType<typeof setInterval> | null;
  currentInterval: number;
  consecutiveErrors: number;
  isRunning: boolean;
  lastSuccess: Date | null;
  lastError: Date | null;
}

/**
 * Callback function type for polling
 */
export type PollCallback = () => Promise<void>;

/**
 * Interface for Homey-like timer functions
 */
export interface HomeyTimers {
  setInterval: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  log: (...args: unknown[]) => void;
}

/**
 * PollManager handles polling with exponential backoff
 * 
 * Uses Homey's setInterval for proper cleanup on app destroy.
 * Implements exponential backoff: 1s, 2s, 4s, 8s, max 30s
 */
export class PollManager {
  private homey: HomeyTimers;
  private polls: Map<string, PollState> = new Map();
  private callbacks: Map<string, PollCallback> = new Map();
  private configs: Map<string, Required<PollConfig>> = new Map();
  private logger: (message: string, ...args: unknown[]) => void;

  constructor(
    homey: HomeyTimers,
    logger?: (message: string, ...args: unknown[]) => void,
  ) {
    this.homey = homey;
    this.logger = logger ?? ((msg: string) => homey.log('[PollManager]', msg));
  }

  /**
   * Register a poll with a unique ID
   */
  register(
    id: string,
    callback: PollCallback,
    config: PollConfig,
  ): void {
    // Stop existing poll if any
    this.stop(id);

    const fullConfig: Required<PollConfig> = {
      minInterval: config.minInterval ?? 1000,
      maxInterval: config.maxInterval ?? 30000,
      baseInterval: config.baseInterval,
      maxRetries: config.maxRetries ?? 5,
      backoffMultiplier: config.backoffMultiplier ?? 2,
    };

    this.callbacks.set(id, callback);
    this.configs.set(id, fullConfig);
    this.polls.set(id, {
      interval: null,
      currentInterval: fullConfig.baseInterval,
      consecutiveErrors: 0,
      isRunning: false,
      lastSuccess: null,
      lastError: null,
    });

    this.logger(`Registered poll: ${id} with base interval ${fullConfig.baseInterval}ms`);
  }

  /**
   * Start a registered poll
   */
  start(id: string): void {
    const state = this.polls.get(id);
    const config = this.configs.get(id);
    const callback = this.callbacks.get(id);

    if (!state || !config || !callback) {
      this.logger(`Cannot start unknown poll: ${id}`);
      return;
    }

    if (state.isRunning) {
      this.logger(`Poll ${id} already running`);
      return;
    }

    state.isRunning = true;
    state.currentInterval = config.baseInterval;
    state.consecutiveErrors = 0;

    // Run immediately first (fire and forget with error handling)
    this.executeCallback(id).catch((err: unknown) => {
      this.logger(`Poll ${id} initial execution error: ${err}`);
    });

    // Then schedule recurring
    this.scheduleNext(id);

    this.logger(`Started poll: ${id}`);
  }

  /**
   * Stop a poll
   */
  stop(id: string): void {
    const state = this.polls.get(id);
    if (!state) return;

    if (state.interval) {
      this.homey.clearInterval(state.interval);
      state.interval = null;
    }
    state.isRunning = false;

    this.logger(`Stopped poll: ${id}`);
  }

  /**
   * Stop all polls
   */
  stopAll(): void {
    for (const id of this.polls.keys()) {
      this.stop(id);
    }
    this.logger('Stopped all polls');
  }

  /**
   * Unregister a poll completely
   */
  unregister(id: string): void {
    this.stop(id);
    this.polls.delete(id);
    this.callbacks.delete(id);
    this.configs.delete(id);
    this.logger(`Unregistered poll: ${id}`);
  }

  /**
   * Get current state of a poll
   */
  getState(id: string): PollState | undefined {
    return this.polls.get(id);
  }

  /**
   * Force immediate execution of a poll (resets backoff on success)
   */
  async forceRun(id: string): Promise<void> {
    await this.executeCallback(id);
  }

  /**
   * Execute the callback and handle errors with backoff
   */
  private async executeCallback(id: string): Promise<void> {
    const state = this.polls.get(id);
    const config = this.configs.get(id);
    const callback = this.callbacks.get(id);

    if (!state || !config || !callback) return;

    try {
      await callback();
      // Success - reset backoff
      state.consecutiveErrors = 0;
      state.currentInterval = config.baseInterval;
      state.lastSuccess = new Date();
    } catch (error) {
      state.consecutiveErrors++;
      state.lastError = new Date();

      // Calculate new interval with exponential backoff
      const backoffInterval = Math.min(
        config.baseInterval * (config.backoffMultiplier ** state.consecutiveErrors),
        config.maxInterval,
      );
      state.currentInterval = Math.max(backoffInterval, config.minInterval);

      this.logger(
        `Poll ${id} error (${state.consecutiveErrors}/${config.maxRetries}), ` +
        `next interval: ${state.currentInterval}ms`,
      );

      // Check if max retries exceeded
      if (state.consecutiveErrors >= config.maxRetries) {
        this.logger(`Poll ${id} max retries exceeded, stopping`);
        this.stop(id);
        return;
      }
    }

    // Reschedule with potentially new interval
    if (state.isRunning) {
      this.scheduleNext(id);
    }
  }

  /**
   * Schedule the next poll execution
   */
  private scheduleNext(id: string): void {
    const state = this.polls.get(id);
    if (!state || !state.isRunning) return;

    // Clear existing interval
    if (state.interval) {
      this.homey.clearInterval(state.interval);
    }

    // Use Homey's setInterval for proper cleanup
    state.interval = this.homey.setInterval(
      () => {
        this.executeCallback(id).catch((err: unknown) => {
          this.logger(`Poll ${id} scheduled execution error: ${err}`);
        });
      },
      state.currentInterval,
    );
  }
}

/**
 * Pre-defined polling intervals for common use cases
 */
export const POLL_INTERVALS = {
  /** System metrics (CPU, memory) - fast polling */
  SYSTEM_METRICS: 30000, // 30 seconds
  /** Storage info - slower polling as it changes less */
  STORAGE: 300000, // 5 minutes
  /** Docker containers status */
  DOCKER: 60000, // 1 minute
  /** VM status */
  VMS: 60000, // 1 minute
};

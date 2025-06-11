
interface CandleTimeConfig {
  timeframe: string;
  expectedInterval: number; // in seconds
  maxDelay: number; // maximum acceptable delay in seconds
  fillMissing: boolean; // whether to fill missing candles
}

interface CandleGap {
  expectedTime: number;
  actualTime: number;
  delay: number;
  isMissing: boolean;
}

export class CandleTimeValidator {
  private timeframeIntervals: Record<string, number> = {
    'M1': 60,     // 1 minute
    'M5': 300,    // 5 minutes
    'M15': 900,   // 15 minutes
    'M30': 1800,  // 30 minutes
    'H1': 3600,   // 1 hour
    'H4': 14400,  // 4 hours
    'D1': 86400,  // 1 day
    'W1': 604800, // 1 week
    'MN1': 2629746 // 1 month (average)
  };

  private config: CandleTimeConfig;

  constructor(timeframe: string, options?: Partial<CandleTimeConfig>) {
    const expectedInterval = this.timeframeIntervals[timeframe] || 60;
    
    this.config = {
      timeframe,
      expectedInterval,
      maxDelay: options?.maxDelay || expectedInterval * 2, // Allow up to 2x interval delay
      fillMissing: options?.fillMissing ?? true,
      ...options
    };
  }

  /**
   * Get the aligned candle start time for a given timestamp
   */
  getCandleStartTime(timestamp: number): number {
    const timestampMs = timestamp * 1000;
    const intervalMs = this.config.expectedInterval * 1000;
    return Math.floor(timestampMs / intervalMs) * intervalMs / 1000;
  }

  /**
   * Get the next expected candle time
   */
  getNextCandleTime(currentTime: number): number {
    const alignedTime = this.getCandleStartTime(currentTime);
    return alignedTime + this.config.expectedInterval;
  }

  /**
   * Validate candle timing and detect gaps
   */
  validateCandleSequence(candles: Array<{ time: number | string }>): {
    gaps: CandleGap[];
    missingCandles: number[];
    delayedCandles: CandleGap[];
    isValid: boolean;
  } {
    const gaps: CandleGap[] = [];
    const missingCandles: number[] = [];
    const delayedCandles: CandleGap[] = [];

    if (candles.length < 2) {
      return { gaps, missingCandles, delayedCandles, isValid: true };
    }

    // Sort candles by time
    const sortedCandles = candles
      .map(c => ({
        time: typeof c.time === 'string' ? parseInt(c.time, 10) : Number(c.time)
      }))
      .sort((a, b) => a.time - b.time);

    for (let i = 1; i < sortedCandles.length; i++) {
      const prevCandle = sortedCandles[i - 1];
      const currentCandle = sortedCandles[i];
      
      const expectedTime = this.getNextCandleTime(prevCandle.time);
      const actualTime = currentCandle.time;
      const timeDiff = actualTime - expectedTime;

      // Check for missing candles (gaps larger than expected interval)
      if (timeDiff > this.config.expectedInterval) {
        const missedCount = Math.floor(timeDiff / this.config.expectedInterval);
        
        // Generate missing candle times
        for (let j = 1; j <= missedCount; j++) {
          const missedTime = expectedTime + (j - 1) * this.config.expectedInterval;
          missingCandles.push(missedTime);
          
          gaps.push({
            expectedTime: missedTime,
            actualTime: 0, // No actual candle
            delay: 0,
            isMissing: true
          });
        }
      }

      // Check for delayed candles
      if (timeDiff > 0 && timeDiff <= this.config.maxDelay) {
        const delayGap: CandleGap = {
          expectedTime,
          actualTime,
          delay: timeDiff,
          isMissing: false
        };
        
        delayedCandles.push(delayGap);
        gaps.push(delayGap);
      }
    }

    const isValid = gaps.length === 0;
    return { gaps, missingCandles, delayedCandles, isValid };
  }

  /**
   * Create missing candles using the last known price
   */
  fillMissingCandles<T extends { time: number | string; close: number; open: number; high: number; low: number }>(
    candles: T[],
    lastKnownCandle?: T
  ): T[] {
    if (!this.config.fillMissing || candles.length === 0) {
      return candles;
    }

    const validation = this.validateCandleSequence(candles);
    if (validation.isValid) {
      return candles;
    }

    const filledCandles = [...candles];
    const template = lastKnownCandle || candles[candles.length - 1];

    // Create missing candles
    validation.missingCandles.forEach(missedTime => {
      const missingCandle = {
        ...template,
        time: missedTime,
        open: template.close,
        high: template.close,
        low: template.close,
        close: template.close
      } as T;

      filledCandles.push(missingCandle);
    });

    // Sort by time
    return filledCandles.sort((a, b) => {
      const timeA = typeof a.time === 'string' ? parseInt(a.time, 10) : Number(a.time);
      const timeB = typeof b.time === 'string' ? parseInt(b.time, 10) : Number(b.time);
      return timeA - timeB;
    });
  }

  /**
   * Get statistics about candle timing
   */
  getTimingStats(candles: Array<{ time: number | string }>): {
    totalCandles: number;
    missingCount: number;
    delayedCount: number;
    averageDelay: number;
    maxDelay: number;
    completeness: number; // percentage of expected candles present
  } {
    const validation = this.validateCandleSequence(candles);
    
    const delayedCount = validation.delayedCandles.length;
    const missingCount = validation.missingCandles.length;
    const totalExpected = candles.length + missingCount;
    
    const delays = validation.delayedCandles.map(g => g.delay);
    const averageDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
    const maxDelay = delays.length > 0 ? Math.max(...delays) : 0;
    
    const completeness = totalExpected > 0 ? (candles.length / totalExpected) * 100 : 100;

    return {
      totalCandles: candles.length,
      missingCount,
      delayedCount,
      averageDelay,
      maxDelay,
      completeness
    };
  }

  /**
   * Check if a new candle should be created based on timing
   */
  shouldCreateCandle(lastCandleTime: number, currentTime: number): boolean {
    const expectedNextTime = this.getNextCandleTime(lastCandleTime);
    return currentTime >= expectedNextTime;
  }

  /**
   * Create a delayed candle array with proper timing validation
   */
  createTimedCandleArray<T extends { time: number | string }>(
    candles: T[],
    delayMs: number = 100
  ): Promise<T[]> {
    return new Promise((resolve) => {
      const validation = this.validateCandleSequence(candles);
      
      if (validation.isValid) {
        setTimeout(() => resolve(candles), delayMs);
        return;
      }

      console.warn(`Candle timing validation failed for ${this.config.timeframe}:`, {
        missing: validation.missingCandles.length,
        delayed: validation.delayedCandles.length,
        gaps: validation.gaps.length
      });

      // Add delay based on severity of timing issues
      const severityDelay = Math.min(validation.gaps.length * 50, 500);
      const totalDelay = delayMs + severityDelay;

      setTimeout(() => resolve(candles), totalDelay);
    });
  }
}

// Utility functions for easy use
export const createCandleValidator = (timeframe: string, options?: Partial<CandleTimeConfig>) => {
  return new CandleTimeValidator(timeframe, options);
};

export const validateAndFillCandles = <T extends { time: number | string; close: number; open: number; high: number; low: number }>(
  candles: T[],
  timeframe: string,
  options?: Partial<CandleTimeConfig>
): T[] => {
  const validator = new CandleTimeValidator(timeframe, options);
  return validator.fillMissingCandles(candles);
};

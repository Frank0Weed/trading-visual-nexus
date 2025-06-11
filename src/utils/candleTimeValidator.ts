export interface CandleValidationOptions {
  fillMissing?: boolean;
  maxDelay?: number;
}

interface TimingStats {
  missingCount: number;
  completeness: number;
}

export class CandleTimeValidator {
  private timeframe: string;
  private options: CandleValidationOptions;
  private timeframeMinutes: number;

  constructor(timeframe: string, options: CandleValidationOptions = {}) {
    this.timeframe = timeframe;
    this.options = {
      fillMissing: options.fillMissing ?? true,
      maxDelay: options.maxDelay ?? 60,
      ...options
    };
    this.timeframeMinutes = this.getTimeframeMinutes(timeframe);
  }

  private getTimeframeMinutes(timeframe: string): number {
    const timeframeMap: Record<string, number> = {
      'M1': 1,
      'M5': 5,
      'M15': 15,
      'M30': 30,
      'H1': 60,
      'H4': 240,
      'D1': 1440,
      'W1': 10080,
      'MN1': 43200,  // 30 days * 24 hours * 60 minutes
      'MN': 43200    // Alias for MN1
    };
    
    return timeframeMap[timeframe] || 1;
  }

  public shouldCreateCandle(lastTime: number, currentTime: number): boolean {
    const expectedTime = lastTime + this.timeframeMinutes * 60;
    return currentTime >= expectedTime;
  }

  public fillMissingCandles<T extends { time: number }>(candles: T[]): T[] {
    if (!this.options.fillMissing) {
      return candles;
    }

    const filledCandles: T[] = [];
    if (candles.length === 0) return filledCandles;

    let lastTime = candles[0].time;
    filledCandles.push(candles[0]);

    for (let i = 1; i < candles.length; i++) {
      const currentTime = candles[i].time;
      let expectedTime = lastTime + this.timeframeMinutes * 60;

      while (currentTime > expectedTime) {
        // Create a new candle with the expected time
        const missingCandle = {
          time: expectedTime,
          open: filledCandles[filledCandles.length - 1].close,
          high: filledCandles[filledCandles.length - 1].close,
          low: filledCandles[filledCandles.length - 1].close,
          close: filledCandles[filledCandles.length - 1].close,
          volume: 0
        } as any; // Using any to avoid type issues

        filledCandles.push(missingCandle as T);
        expectedTime += this.timeframeMinutes * 60;
      }

      filledCandles.push(candles[i]);
      lastTime = currentTime;
    }

    return filledCandles;
  }

  public getTimingStats<T extends { time: number }>(candles: T[]): TimingStats {
    let missingCount = 0;
    if (candles.length <= 1) {
      return { missingCount: 0, completeness: 100 };
    }

    let lastTime = candles[0].time;
    for (let i = 1; i < candles.length; i++) {
      const currentTime = candles[i].time;
      let expectedTime = lastTime + this.timeframeMinutes * 60;

      while (currentTime > expectedTime) {
        missingCount++;
        expectedTime += this.timeframeMinutes * 60;
      }
      lastTime = currentTime;
    }

    const totalExpected = candles.length + missingCount;
    const completeness = (candles.length / totalExpected) * 100;

    return { missingCount, completeness };
  }
}

export function validateAndFillCandles<T extends { time: number }>(
  data: T[],
  timeframe: string,
  options: CandleValidationOptions = {}
): T[] {
  const validator = new CandleTimeValidator(timeframe, options);
  return validator.fillMissingCandles(data);
}

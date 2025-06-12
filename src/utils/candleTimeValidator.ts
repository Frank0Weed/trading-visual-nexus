
import { CandleData } from '../services/apiService';

export interface CandleValidationOptions {
  fillMissing?: boolean;
  maxDelay?: number;
}

interface TimingStats {
  missingCount: number;
  completeness: number;
}

// Extended interface for candle-like objects
interface CandleLike {
  time: string | number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  tick_volume?: number;
  volume?: number;
  spread?: number;
  real_volume?: number;
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

  private normalizeTime(time: string | number): number {
    if (typeof time === 'string') {
      const parsed = parseInt(time, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return Number(time) || 0;
  }

  public shouldCreateCandle(lastTime: string | number, currentTime: string | number): boolean {
    const normalizedLastTime = this.normalizeTime(lastTime);
    const normalizedCurrentTime = this.normalizeTime(currentTime);
    const expectedTime = normalizedLastTime + this.timeframeMinutes * 60;
    return normalizedCurrentTime >= expectedTime;
  }

  public fillMissingCandles<T extends CandleLike>(candles: T[]): T[] {
    if (!this.options.fillMissing) {
      return candles;
    }

    const filledCandles: T[] = [];
    if (candles.length === 0) return filledCandles;

    let lastTime = this.normalizeTime(candles[0].time);
    filledCandles.push(candles[0]);

    for (let i = 1; i < candles.length; i++) {
      const currentTime = this.normalizeTime(candles[i].time);
      let expectedTime = lastTime + this.timeframeMinutes * 60;

      while (currentTime > expectedTime) {
        // Get the previous candle's close price or fallback values
        const previousCandle = filledCandles[filledCandles.length - 1];
        const closePrice = previousCandle.close || 0;
        
        // Create a new candle with the expected time
        const missingCandle = {
          ...previousCandle,
          time: expectedTime,
          open: closePrice,
          high: closePrice,
          low: closePrice,
          close: closePrice,
          tick_volume: 0,
          volume: 0,
          spread: previousCandle.spread || 0,
          real_volume: 0
        } as T;

        filledCandles.push(missingCandle);
        expectedTime += this.timeframeMinutes * 60;
      }

      filledCandles.push(candles[i]);
      lastTime = currentTime;
    }

    return filledCandles;
  }

  public getTimingStats<T extends CandleLike>(candles: T[]): TimingStats {
    let missingCount = 0;
    if (candles.length <= 1) {
      return { missingCount: 0, completeness: 100 };
    }

    let lastTime = this.normalizeTime(candles[0].time);
    for (let i = 1; i < candles.length; i++) {
      const currentTime = this.normalizeTime(candles[i].time);
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

export function validateAndFillCandles(
  data: CandleData[],
  timeframe: string,
  options: CandleValidationOptions = {}
): CandleData[] {
  const validator = new CandleTimeValidator(timeframe, options);
  return validator.fillMissingCandles(data);
}

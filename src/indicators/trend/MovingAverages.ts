
import { CandlestickData, Time } from 'lightweight-charts';

export interface SMAConfig {
  period: number;
}

export interface EMAConfig {
  period: number;
}

export const defaultSMAConfig: SMAConfig = { period: 50 };
export const defaultEMAConfig: EMAConfig = { period: 20 };

export const calculateSMA = (candles: CandlestickData<Time>[], config: SMAConfig = defaultSMAConfig): number[] => {
  const { period } = config;
  const prices = candles.map(c => c.close);
  const sma: number[] = [];
  
  for (let i = 0; i < period - 1; i++) {
    sma.push(prices[i]);
  }
  
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma.push(sum / period);
  }
  
  return sma;
};

export const calculateEMA = (candles: CandlestickData<Time>[], config: EMAConfig = defaultEMAConfig): number[] => {
  const { period } = config;
  const prices = candles.map(c => c.close);
  const k = 2 / (period + 1);
  const ema: number[] = [];
  
  // Start with SMA for first period
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
    ema.push(prices[i]);
  }
  
  let currentEma = sum / period;
  ema[period - 1] = currentEma;
  
  for (let i = period; i < prices.length; i++) {
    currentEma = (prices[i] * k) + (currentEma * (1 - k));
    ema.push(currentEma);
  }
  
  return ema;
};

export const SMAIndicator = {
  id: 'sma',
  name: 'Simple Moving Average',
  description: 'Average of price over a specific period',
  category: 'trend' as const,
  defaultConfig: defaultSMAConfig,
  calculate: calculateSMA,
  format: (value: number) => `SMA: ${value.toFixed(2)}`,
  display: 'main' as const,
  color: '#22C55E',
  plotConfig: {
    type: 'line' as const,
    lineWidth: 1.5,
    priceScaleId: 'right',
    visible: true,
    lastValueVisible: true,
    priceLineVisible: false
  }
};

export const EMAIndicator = {
  id: 'ema',
  name: 'Exponential Moving Average',
  description: 'Weighted moving average giving more importance to recent prices',
  category: 'trend' as const,
  defaultConfig: defaultEMAConfig,
  calculate: calculateEMA,
  format: (value: number) => `EMA: ${value.toFixed(2)}`,
  display: 'main' as const,
  color: '#3B82F6',
  plotConfig: {
    type: 'line' as const,
    lineWidth: 1.5,
    priceScaleId: 'right',
    visible: true,
    lastValueVisible: true,
    priceLineVisible: false
  }
};

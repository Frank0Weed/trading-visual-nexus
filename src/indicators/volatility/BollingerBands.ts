
import { CandlestickData, Time } from 'lightweight-charts';

export interface BollingerBandsConfig {
  period: number;
  stdDev: number;
}

export interface BollingerBandsResult {
  upper: number[];
  middle: number[];
  lower: number[];
}

export const defaultBollingerBandsConfig: BollingerBandsConfig = {
  period: 20,
  stdDev: 2
};

export const calculateBollingerBands = (candles: CandlestickData<Time>[], config: BollingerBandsConfig = defaultBollingerBandsConfig): BollingerBandsResult => {
  const { period, stdDev } = config;
  const prices = candles.map(c => c.close);
  
  if (prices.length < period) {
    const emptyResult = Array(candles.length).fill(prices[0] || 0);
    return {
      upper: emptyResult,
      middle: emptyResult,
      lower: emptyResult
    };
  }
  
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];
  
  // Fill initial values
  for (let i = 0; i < period - 1; i++) {
    upper.push(prices[i]);
    middle.push(prices[i]);
    lower.push(prices[i]);
  }
  
  for (let i = period - 1; i < prices.length; i++) {
    // Calculate SMA
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += prices[j];
    }
    const sma = sum / period;
    
    // Calculate standard deviation
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sqSum += Math.pow(prices[j] - sma, 2);
    }
    const stdDevValue = Math.sqrt(sqSum / period);
    
    middle.push(sma);
    upper.push(sma + (stdDev * stdDevValue));
    lower.push(sma - (stdDev * stdDevValue));
  }
  
  return { upper, middle, lower };
};

export const BollingerBandsIndicator = {
  id: 'bbands',
  name: 'Bollinger Bands',
  description: 'Volatility bands placed above and below a moving average',
  category: 'volatility' as const,
  defaultConfig: defaultBollingerBandsConfig,
  calculate: calculateBollingerBands,
  format: (value: BollingerBandsResult, index: number) => {
    if (index >= 0 && index < value.upper.length) {
      return `BB Upper: ${value.upper[index].toFixed(2)} Middle: ${value.middle[index].toFixed(2)} Lower: ${value.lower[index].toFixed(2)}`;
    }
    return '';
  },
  display: 'main' as const,
  color: '#D946EF',
  plotConfig: {
    type: 'line' as const,
    lineWidth: 1,
    priceScaleId: 'right',
    visible: true,
    lastValueVisible: true,
    priceLineVisible: false
  }
};

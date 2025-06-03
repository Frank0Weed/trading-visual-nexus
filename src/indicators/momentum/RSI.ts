
import { CandlestickData, Time } from 'lightweight-charts';

export interface RSIConfig {
  period: number;
}

export const defaultRSIConfig: RSIConfig = {
  period: 14
};

export const calculateRSI = (candles: CandlestickData<Time>[], config: RSIConfig = defaultRSIConfig): number[] => {
  const { period } = config;
  const prices = candles.map(c => c.close);
  const rsi: number[] = [];
  
  if (prices.length <= period) {
    return Array(prices.length).fill(50);
  }
  
  let gains = 0;
  let losses = 0;
  
  // Calculate initial averages
  for (let i = 1; i <= period; i++) {
    const difference = prices[i] - prices[i - 1];
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Fill initial periods
  for (let i = 0; i < period; i++) {
    rsi.push(50);
  }
  
  // Calculate first RSI value
  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  // Calculate RSI for remaining data
  for (let i = period + 1; i < prices.length; i++) {
    const difference = prices[i] - prices[i - 1];
    let currentGain = 0;
    let currentLoss = 0;
    
    if (difference >= 0) {
      currentGain = difference;
    } else {
      currentLoss = -difference;
    }
    
    avgGain = ((avgGain * (period - 1)) + currentGain) / period;
    avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
};

export const RSIIndicator = {
  id: 'rsi',
  name: 'Relative Strength Index',
  description: 'Momentum oscillator measuring speed and change of price movements',
  category: 'momentum' as const,
  defaultConfig: defaultRSIConfig,
  calculate: calculateRSI,
  format: (value: number) => `RSI: ${value.toFixed(2)}`,
  display: 'separate-window' as const,
  color: '#9b87f5',
  plotConfig: {
    type: 'line' as const,
    lineWidth: 2,
    priceScaleId: 'rsi',
    scaleMargins: { top: 0.1, bottom: 0.1 },
    visible: true,
    lastValueVisible: true,
    priceLineVisible: false
  }
};

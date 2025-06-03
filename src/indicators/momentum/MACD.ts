
import { CandlestickData, Time } from 'lightweight-charts';

export interface MACDConfig {
  fast: number;
  slow: number;
  signal: number;
}

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export const defaultMACDConfig: MACDConfig = {
  fast: 12,
  slow: 26,
  signal: 9
};

const calculateEMA = (data: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const emaData: number[] = [];
  let ema = data.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  
  // Fill initial periods with SMA value
  for (let i = 0; i < period - 1; i++) {
    emaData.push(ema);
  }
  emaData.push(ema);
  
  for (let i = period; i < data.length; i++) {
    ema = (data[i] * k) + (ema * (1 - k));
    emaData.push(ema);
  }
  
  return emaData;
};

export const calculateMACD = (candles: CandlestickData<Time>[], config: MACDConfig = defaultMACDConfig): MACDResult => {
  const { fast, slow, signal } = config;
  const prices = candles.map(c => c.close);
  
  if (prices.length < slow) {
    const emptyResult = Array(prices.length).fill(0);
    return {
      macd: emptyResult,
      signal: emptyResult,
      histogram: emptyResult
    };
  }
  
  const fastEMA = calculateEMA(prices, fast);
  const slowEMA = calculateEMA(prices, slow);
  
  // Calculate MACD line
  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i]);
  }
  
  // Calculate signal line
  const signalValues = calculateEMA(macdLine, signal);
  
  // Calculate histogram
  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    histogram.push(macdLine[i] - signalValues[i]);
  }
  
  return {
    macd: macdLine,
    signal: signalValues,
    histogram
  };
};

export const MACDIndicator = {
  id: 'macd',
  name: 'MACD',
  description: 'Trend-following momentum indicator',
  category: 'momentum' as const,
  defaultConfig: defaultMACDConfig,
  calculate: calculateMACD,
  format: (value: MACDResult, index: number) => {
    if (index >= 0 && index < value.macd.length) {
      return `MACD: ${value.macd[index].toFixed(3)} Signal: ${value.signal[index].toFixed(3)} Hist: ${value.histogram[index].toFixed(3)}`;
    }
    return '';
  },
  display: 'separate-window' as const,
  color: '#0EA5E9',
  plotConfig: {
    type: 'histogram' as const,
    lineWidth: 1,
    priceScaleId: 'macd',
    scaleMargins: { top: 0.1, bottom: 0.1 },
    visible: true,
    lastValueVisible: true,
    priceLineVisible: false
  }
};

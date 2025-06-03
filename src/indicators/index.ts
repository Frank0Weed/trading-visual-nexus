
import { RSIIndicator } from './momentum/RSI';
import { MACDIndicator } from './momentum/MACD';
import { SMAIndicator, EMAIndicator } from './trend/MovingAverages';
import { BollingerBandsIndicator } from './volatility/BollingerBands';

export type IndicatorCategory = 'momentum' | 'trend' | 'volume' | 'volatility';
export type IndicatorDisplay = 'main' | 'separate' | 'separate-window';

export interface BaseIndicator {
  id: string;
  name: string;
  description: string;
  category: IndicatorCategory;
  defaultConfig: any;
  calculate: (candles: any[], params?: any) => any;
  format: (value: any, index?: number) => string;
  display: IndicatorDisplay;
  color: string;
  plotConfig: {
    type: 'line' | 'histogram' | 'area' | 'bars';
    lineWidth?: number;
    priceScaleId?: string;
    scaleMargins?: { top: number; bottom: number };
    visible?: boolean;
    lastValueVisible?: boolean;
    priceLineVisible?: boolean;
  };
}

export const indicators: Record<string, BaseIndicator> = {
  rsi: RSIIndicator,
  macd: MACDIndicator,
  sma: SMAIndicator,
  ema: EMAIndicator,
  bbands: BollingerBandsIndicator,
};

export default indicators;

// Re-export individual indicators
export { RSIIndicator, MACDIndicator, SMAIndicator, EMAIndicator, BollingerBandsIndicator };

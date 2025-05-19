
import React, { useEffect, useRef, useState } from 'react';
import { CandlestickData, LineData, Time } from 'lightweight-charts';
import Chart, { ChartType } from '../Chart';
import { PriceData, CandleData } from '@/services/apiService';

interface ChartContainerProps {
  isLoading: boolean;
  candles: CandlestickData<Time>[] | LineData<Time>[];
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  activeIndicators: string[];
  latestPrice?: PriceData;
  updateLatestPrice?: (price: number) => void;
}

const ChartContainer: React.FC<ChartContainerProps> = ({
  isLoading,
  candles,
  symbol,
  timeframe,
  chartType,
  activeIndicators,
  latestPrice,
  updateLatestPrice
}) => {
  // Use a ref to track the previous price for comparison
  const prevPriceRef = useRef<number | null>(null);
  
  // State to track the latest OHLC data
  const [ohlcData, setOhlcData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePercent: number;
  } | null>(null);
  
  // Extract OHLC data from the latest candle
  useEffect(() => {
    if (candles && candles.length > 0) {
      const latestCandle = candles[candles.length - 1];
      if ('open' in latestCandle) {
        const candleData = latestCandle as CandlestickData<Time>;
        const prevClose = candles.length > 1 && 'close' in candles[candles.length - 2] 
          ? (candles[candles.length - 2] as CandlestickData<Time>).close 
          : candleData.open;
        
        const change = candleData.close - prevClose;
        const changePercent = (change / prevClose) * 100;
        
        setOhlcData({
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          change,
          changePercent
        });
      } else if ('value' in latestCandle) {
        const lineData = latestCandle as LineData<Time>;
        const prevValue = candles.length > 1 && 'value' in candles[candles.length - 2] 
          ? (candles[candles.length - 2] as LineData<Time>).value 
          : lineData.value;
        
        const change = lineData.value - prevValue;
        const changePercent = (change / prevValue) * 100;
        
        setOhlcData({
          open: lineData.value,
          high: lineData.value,
          low: lineData.value,
          close: lineData.value,
          change,
          changePercent
        });
      }
    }
  }, [candles]);
  
  // Update chart with live prices
  useEffect(() => {
    if (latestPrice && updateLatestPrice && candles.length > 0) {
      const currentPrice = latestPrice.bid;
      
      // Only update if the price has changed
      if (currentPrice !== prevPriceRef.current) {
        updateLatestPrice(currentPrice);
        prevPriceRef.current = currentPrice;
      }
    }
  }, [latestPrice, updateLatestPrice, candles]);

  return (
    <div className="flex-1 p-0 relative rounded-lg border border-border bg-trading-bg-dark overflow-hidden">
      {/* OHLC data bar at the top of chart */}
      {ohlcData && !isLoading && (
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-1.5 bg-sidebar-secondary border-b border-border text-xs font-mono">
          <div className="flex items-center space-x-4">
            <div>
              <span className="text-muted-foreground mr-1">O:</span>
              <span className="text-foreground font-medium">{ohlcData.open.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground mr-1">H:</span>
              <span className="text-trading-up font-medium">{ohlcData.high.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground mr-1">L:</span>
              <span className="text-trading-down font-medium">{ohlcData.low.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground mr-1">C:</span>
              <span className="text-foreground font-medium">{ohlcData.close.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`${ohlcData.change >= 0 ? 'text-trading-up' : 'text-trading-down'} font-medium`}>
              {ohlcData.change >= 0 ? '+' : ''}{ohlcData.change.toFixed(2)}
            </div>
            <div className={`${ohlcData.change >= 0 ? 'text-trading-up' : 'text-trading-down'} font-medium`}>
              ({ohlcData.change >= 0 ? '+' : ''}{ohlcData.changePercent.toFixed(2)}%)
            </div>
          </div>
        </div>
      )}
    
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-trading-bg-dark bg-opacity-50 z-10">
          <div className="animate-pulse-light text-primary font-medium px-4 py-2 bg-trading-bg-dark bg-opacity-80 rounded-md border border-border/30">
            Loading chart data...
          </div>
        </div>
      ) : (
        <Chart
          data={candles}
          symbol={symbol}
          timeframe={timeframe}
          chartType={chartType}
          height={500}
          className="w-full"
          activeIndicators={activeIndicators}
        />
      )}
      
      {/* Latest price badge with color indication for price movement */}
      {latestPrice && !isLoading && (
        <div 
          className={`absolute top-10 right-2 text-sm font-medium py-1 px-3 rounded z-20 transition-all duration-300 ${
            prevPriceRef.current && latestPrice.bid > prevPriceRef.current 
              ? 'bg-trading-up text-white' 
              : prevPriceRef.current && latestPrice.bid < prevPriceRef.current
                ? 'bg-trading-down text-white'
                : 'bg-primary text-primary-foreground'
          }`}
        >
          {latestPrice.bid.toFixed(2)}
        </div>
      )}
    </div>
  );
};

export default ChartContainer;

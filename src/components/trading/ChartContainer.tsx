
import React, { useEffect, useRef, useState } from 'react';
import { CandlestickData, LineData, Time } from 'lightweight-charts';
import Chart, { ChartType } from '../Chart';
import { PriceData } from '@/services/apiService';
import { Volume } from 'lucide-react';

interface ChartContainerProps {
  isLoading: boolean;
  candles: CandlestickData<Time>[] | LineData<Time>[];
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  latestPrice?: PriceData;
  updateLatestPrice?: (price: number) => void;
}

const ChartContainer: React.FC<ChartContainerProps> = ({
  isLoading,
  candles,
  symbol,
  timeframe,
  chartType,
  latestPrice,
  updateLatestPrice
}) => {
  const prevPriceRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const priceUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [ohlcData, setOhlcData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePercent: number;
    volume?: number;
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
        
        const volumeData = 
          (latestCandle as any).tick_volume || 
          (latestCandle as any).volume || 0;
        
        setOhlcData({
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          change,
          changePercent,
          volume: volumeData
        });
      } else if ('value' in latestCandle) {
        const lineData = latestCandle as LineData<Time>;
        const prevValue = candles.length > 1 && 'value' in candles[candles.length - 2] 
          ? (candles[candles.length - 2] as LineData<Time>).value 
          : lineData.value;
        
        const change = lineData.value - prevValue;
        const changePercent = (change / prevValue) * 100;
        
        const volumeData = 
          (latestCandle as any).tick_volume || 
          (latestCandle as any).volume || 0;
        
        setOhlcData({
          open: lineData.value,
          high: lineData.value,
          low: lineData.value,
          close: lineData.value,
          change,
          changePercent,
          volume: volumeData
        });
      }
    }
  }, [candles]);
  
  // Set up price update interval
  useEffect(() => {
    if (!latestPrice || !updateLatestPrice) return;
    
    if (priceUpdateIntervalRef.current) {
      clearInterval(priceUpdateIntervalRef.current);
    }
    
    const currentPrice = latestPrice.bid;
    if (updateLatestPrice && currentPrice !== prevPriceRef.current) {
      updateLatestPrice(currentPrice);
      prevPriceRef.current = currentPrice;
    }
    
    priceUpdateIntervalRef.current = setInterval(() => {
      if (latestPrice && updateLatestPrice) {
        const currentPrice = latestPrice.bid;
        const currentTime = Date.now();
        
        if (currentPrice !== prevPriceRef.current || currentTime - lastUpdateTimeRef.current > 250) {
          updateLatestPrice(currentPrice);
          prevPriceRef.current = currentPrice;
          lastUpdateTimeRef.current = currentTime;
          
          if (ohlcData) {
            setOhlcData(prev => {
              if (!prev) return prev;
              
              const newHigh = Math.max(prev.high, currentPrice);
              const newLow = Math.min(prev.low, currentPrice);
              const change = currentPrice - prev.open;
              const changePercent = (change / prev.open) * 100;
              
              return {
                ...prev,
                high: newHigh,
                low: newLow,
                close: currentPrice,
                change,
                changePercent
              };
            });
          }
        }
      }
    }, 250);
    
    return () => {
      if (priceUpdateIntervalRef.current) {
        clearInterval(priceUpdateIntervalRef.current);
      }
    };
  }, [latestPrice, updateLatestPrice, ohlcData]);

  return (
    <div className="flex-1 p-0 relative rounded-lg border border-border bg-trading-bg-dark overflow-hidden">
      {ohlcData && !isLoading && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-sidebar-secondary border-b border-border z-20 text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <span className="text-muted-foreground">O</span>
              <span className="text-foreground font-medium ml-1">{ohlcData.open.toFixed(2)}</span>
            </div>
            <div className="flex items-center">
              <span className="text-muted-foreground">H</span>
              <span className="text-trading-up font-medium ml-1">{ohlcData.high.toFixed(2)}</span>
            </div>
            <div className="flex items-center">
              <span className="text-muted-foreground">L</span>
              <span className="text-trading-down font-medium ml-1">{ohlcData.low.toFixed(2)}</span>
            </div>
            <div className="flex items-center">
              <span className="text-muted-foreground">C</span>
              <span className="text-foreground font-medium ml-1">{ohlcData.close.toFixed(2)}</span>
            </div>
            <div className="flex items-center">
              <Volume className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
              <span className="text-foreground font-medium">{ohlcData.volume !== undefined ? ohlcData.volume.toLocaleString() : '0'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
        />
      )}
      
      {latestPrice && !isLoading && (
        <div 
          className={`absolute top-8 right-2 text-xs font-medium py-0.5 px-2 rounded z-20 transition-colors duration-200 ${
            prevPriceRef.current && latestPrice.bid > prevPriceRef.current 
              ? 'bg-trading-up/80 text-white' 
              : prevPriceRef.current && latestPrice.bid < prevPriceRef.current
                ? 'bg-trading-down/80 text-white'
                : 'bg-sidebar-secondary text-foreground'
          }`}
        >
          {latestPrice.bid.toFixed(2)}
        </div>
      )}
    </div>
  );
};

export default ChartContainer;

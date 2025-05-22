
import React, { useEffect, useRef, useState } from 'react';
import { CandlestickData, LineData, Time } from 'lightweight-charts';
import Chart, { ChartType } from '../Chart';
import { PriceData, CandleData } from '@/services/apiService';
import { Card } from '@/components/ui/card';
import { ChartContainer as UIChartContainer } from '@/components/ui/chart';
import { BarChart, LineChart, Volume } from 'lucide-react';

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
  const lastUpdateTimeRef = useRef<number>(0);
  const priceUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // State to track the latest OHLC data
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
        
        // Get volume from the original candle data if available
        const volumeData = candles.length > 0 ? 
          (candles[candles.length - 1] as any).tick_volume || 
          (candles[candles.length - 1] as any).volume || 0 : 0;
        
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
        
        // Get volume from the original candle data if available
        const volumeData = candles.length > 0 ? 
          (candles[candles.length - 1] as any).tick_volume || 
          (candles[candles.length - 1] as any).volume || 0 : 0;
        
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
    
    // Clear any existing interval
    if (priceUpdateIntervalRef.current) {
      clearInterval(priceUpdateIntervalRef.current);
    }
    
    // Update immediately on first render
    const currentPrice = latestPrice.bid;
    if (updateLatestPrice && currentPrice !== prevPriceRef.current) {
      updateLatestPrice(currentPrice);
      prevPriceRef.current = currentPrice;
    }
    
    // Set up interval for regular updates
    priceUpdateIntervalRef.current = setInterval(() => {
      if (latestPrice && updateLatestPrice) {
        const currentPrice = latestPrice.bid;
        const currentTime = Date.now();
        
        // Only update if price has changed or it's been 250ms since last update
        if (currentPrice !== prevPriceRef.current || currentTime - lastUpdateTimeRef.current > 250) {
          updateLatestPrice(currentPrice);
          prevPriceRef.current = currentPrice;
          lastUpdateTimeRef.current = currentTime;
          
          // Update OHLC display for current candle if we have data
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
    }, 250); // Update every 250ms at most
    
    return () => {
      if (priceUpdateIntervalRef.current) {
        clearInterval(priceUpdateIntervalRef.current);
      }
    };
  }, [latestPrice, updateLatestPrice, ohlcData]);

  return (
    <div className="flex-1 p-0 relative rounded-lg border border-border bg-trading-bg-dark overflow-hidden">
      {/* Improved OHLC data bar at the top of chart */}
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
            {/* Volume display */}
            {ohlcData.volume !== undefined && (
              <div className="flex items-center">
                <Volume className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
                <span className="text-foreground font-medium">{ohlcData.volume.toLocaleString()}</span>
              </div>
            )}
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
          activeIndicators={activeIndicators}
        />
      )}
      
      {/* Latest price ticker - shown as a small pill instead of a card */}
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

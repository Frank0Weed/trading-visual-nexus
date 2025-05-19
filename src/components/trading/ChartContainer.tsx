
import React, { useEffect, useRef } from 'react';
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
          className={`absolute top-2 right-2 text-sm font-medium py-1 px-3 rounded z-20 transition-all duration-300 ${
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

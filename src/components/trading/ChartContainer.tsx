
import React from 'react';
import { CandlestickData, LineData, Time } from 'lightweight-charts';
import Chart, { ChartType } from '../Chart';
import { PriceData } from '@/services/apiService';

interface ChartContainerProps {
  isLoading: boolean;
  candles: CandlestickData<Time>[] | LineData<Time>[];
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  activeIndicators: string[];
  latestPrice?: PriceData;
}

const ChartContainer: React.FC<ChartContainerProps> = ({
  isLoading,
  candles,
  symbol,
  timeframe,
  chartType,
  activeIndicators,
  latestPrice
}) => {
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
      
      {/* Latest price badge */}
      {latestPrice && !isLoading && (
        <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-sm font-medium py-1 px-3 rounded z-20">
          {latestPrice.bid.toFixed(2)}
        </div>
      )}
    </div>
  );
};

export default ChartContainer;

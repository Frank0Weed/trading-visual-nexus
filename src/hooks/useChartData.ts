
import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/ui/sonner';
import { 
  fetchCandles,
  CandleData,
  TimeFrame
} from '../services/apiService';
import { CandlestickData, LineData, Time } from 'lightweight-charts';
import { ChartType } from '@/components/Chart';

interface UseChartDataProps {
  selectedSymbol: string;
  selectedTimeframe: string;
  chartType: ChartType;
  latestCandle?: CandleData;
}

interface ChartDataResult {
  candles: CandlestickData<Time>[] | LineData<Time>[];
  isLoading: boolean;
  updateLatestCandle: (candle: CandleData) => void;
  updateLatestPrice: (price: number) => void;
}

// Helper function to format candle data to match Chart component requirements
const formatCandleData = (candles: CandleData[], chartType: ChartType): CandlestickData<Time>[] | LineData<Time>[] => {
  if (chartType === 'line' || chartType === 'area') {
    // Return as LineData array for line or area charts
    return candles.map(candle => {
      // Convert time to UTC timestamp in seconds if it's a string
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : candle.time;
        
      return {
        time: timeValue as Time,
        value: candle.close,
      };
    }) as LineData<Time>[];
  } else {
    // Return as CandlestickData array for candlestick or bar charts
    return candles.map(candle => {
      // Convert time to UTC timestamp in seconds if it's a string
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : candle.time;
        
      return {
        time: timeValue as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        // Remove the volume property as it's not part of the CandlestickData<Time> interface
      };
    }) as CandlestickData<Time>[];
  }
};

export const useChartData = ({ 
  selectedSymbol, 
  selectedTimeframe, 
  chartType,
  latestCandle
}: UseChartDataProps): ChartDataResult => {
  const [candles, setCandles] = useState<CandlestickData<Time>[] | LineData<Time>[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch candles when symbol or timeframe changes
  useEffect(() => {
    const loadCandles = async () => {
      try {
        setIsLoading(true);
        console.log(`Fetching candles for ${selectedSymbol} ${selectedTimeframe}`);
        const data = await fetchCandles(selectedSymbol, selectedTimeframe, 500);
        // Format the data to match Chart component requirements
        const formattedData = formatCandleData(data, chartType);
        setCandles(formattedData);
        setIsLoading(false);
      } catch (error) {
        console.error(`Error fetching candles for ${selectedSymbol} ${selectedTimeframe}:`, error);
        toast.error(`Failed to load ${selectedSymbol} chart data`);
        setIsLoading(false);
      }
    };

    if (selectedSymbol && selectedTimeframe) {
      loadCandles();
    }
  }, [selectedSymbol, selectedTimeframe, chartType]);

  // Update the latest candle when new data arrives
  const updateLatestCandle = useCallback((candle: CandleData) => {
    if (!candle) return;
    
    if (chartType === 'line' || chartType === 'area') {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles as LineData<Time>[];

        const timeValue = typeof candle.time === 'string'
          ? new Date(candle.time).getTime() / 1000
          : candle.time;
        
        // Type cast the array to ensure TypeScript knows it's LineData
        const lineCandles = prevCandles as LineData<Time>[];
        
        // Find the candle with matching timestamp
        const candleIndex = lineCandles.findIndex(c => c.time === timeValue);
        
        const lineCandle: LineData<Time> = {
          time: timeValue as Time,
          value: candle.close
        };
        
        if (candleIndex >= 0) {
          // Update existing candle
          const updatedCandles = [...lineCandles];
          updatedCandles[candleIndex] = lineCandle;
          return updatedCandles;
        } else {
          // Add new candle
          return [...lineCandles, lineCandle].sort((a, b) => 
            Number(a.time) - Number(b.time)
          );
        }
      });
    } else {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles as CandlestickData<Time>[];

        const timeValue = typeof candle.time === 'string'
          ? new Date(candle.time).getTime() / 1000
          : candle.time;

        // Type cast the array to ensure TypeScript knows it's CandlestickData
        const candlestickCandles = prevCandles as CandlestickData<Time>[];
        
        // Find the candle with matching timestamp
        const candleIndex = candlestickCandles.findIndex(c => c.time === timeValue);
        
        const candlestickData: CandlestickData<Time> = {
          time: timeValue as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          // Remove volume property from here as well
        };
        
        if (candleIndex >= 0) {
          // Update existing candle
          const updatedCandles = [...candlestickCandles];
          updatedCandles[candleIndex] = candlestickData;
          return updatedCandles;
        } else {
          // Add new candle
          return [...candlestickCandles, candlestickData].sort((a, b) => 
            Number(a.time) - Number(b.time)
          );
        }
      });
    }
  }, [chartType]);
  
  // Update just the latest price (for real-time updates)
  const updateLatestPrice = useCallback((price: number) => {
    if (chartType === 'line' || chartType === 'area') {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles as LineData<Time>[];
        
        // Type cast to ensure TypeScript knows it's LineData
        const lineCandles = prevCandles as LineData<Time>[];
        const lastCandle = { ...lineCandles[lineCandles.length - 1] };
        lastCandle.value = price;
        
        return [
          ...lineCandles.slice(0, -1),
          lastCandle
        ];
      });
    } else {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles as CandlestickData<Time>[];
        
        // Type cast to ensure TypeScript knows it's CandlestickData
        const candlestickCandles = prevCandles as CandlestickData<Time>[];
        const lastCandle = { ...candlestickCandles[candlestickCandles.length - 1] };
        lastCandle.close = price;
        lastCandle.high = Math.max(lastCandle.high, price);
        lastCandle.low = Math.min(lastCandle.low, price);
        
        return [
          ...candlestickCandles.slice(0, -1),
          lastCandle
        ];
      });
    }
  }, [chartType]);
  
  // Update candle when latestCandle prop changes
  useEffect(() => {
    if (latestCandle) {
      console.log('Updating chart with new candle:', latestCandle);
      updateLatestCandle(latestCandle);
    }
  }, [latestCandle, updateLatestCandle]);

  return {
    candles,
    isLoading,
    updateLatestCandle,
    updateLatestPrice
  };
};

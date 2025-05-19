
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
        volume: candle.tick_volume
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
    
    setCandles(prevCandles => {
      if (!prevCandles || prevCandles.length === 0) return prevCandles;
      
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : candle.time;
      
      // Check if this candle already exists (same timestamp)
      const candleIndex = prevCandles.findIndex(
        c => (c as any).time === timeValue
      );
      
      let newCandles = [...prevCandles];
      
      if (chartType === 'line' || chartType === 'area') {
        // For line charts
        const lineCandle = {
          time: timeValue as Time,
          value: candle.close
        } as LineData<Time>;
        
        if (candleIndex >= 0) {
          // Update existing candle
          newCandles[candleIndex] = lineCandle;
        } else {
          // Add new candle
          newCandles.push(lineCandle);
        }
      } else {
        // For candlestick/bar charts
        const candlestickData = {
          time: timeValue as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.tick_volume
        } as CandlestickData<Time>;
        
        if (candleIndex >= 0) {
          // Update existing candle
          newCandles[candleIndex] = candlestickData;
        } else {
          // Add new candle
          newCandles.push(candlestickData);
        }
      }
      
      // Sort candles by time to ensure they're in chronological order
      return newCandles.sort((a, b) => 
        ((a as any).time as number) - ((b as any).time as number)
      );
    });
  }, [chartType]);
  
  // Update just the latest price (for real-time updates)
  const updateLatestPrice = useCallback((price: number) => {
    setCandles(prevCandles => {
      if (!prevCandles || prevCandles.length === 0) return prevCandles;
      
      const lastCandle = {...prevCandles[prevCandles.length - 1]};
      
      // Update the close price and potentially the high/low if needed
      if (chartType === 'line' || chartType === 'area') {
        (lastCandle as LineData<Time>).value = price;
      } else {
        const candleData = lastCandle as CandlestickData<Time>;
        candleData.close = price;
        candleData.high = Math.max(candleData.high, price);
        candleData.low = Math.min(candleData.low, price);
      }
      
      return [
        ...prevCandles.slice(0, -1),
        lastCandle
      ];
    });
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

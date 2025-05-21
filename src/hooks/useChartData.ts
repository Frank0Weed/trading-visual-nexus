
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
      };
    }) as CandlestickData<Time>[];
  }
};

// Helper to create a new empty candle based on the current time
const createNewCandle = (symbol: string, timeframe: string, lastPrice: number, lastTime: number): CandleData => {
  // Get current time in seconds
  const currentTime = Math.floor(Date.now() / 1000);
  
  // For different timeframes, we need to adjust the start time
  let intervalInSeconds = 60; // Default to M1
  
  switch(timeframe) {
    case 'M1': intervalInSeconds = 60; break;
    case 'M5': intervalInSeconds = 300; break;
    case 'M15': intervalInSeconds = 900; break;
    case 'M30': intervalInSeconds = 1800; break;
    case 'H1': intervalInSeconds = 3600; break;
    case 'H4': intervalInSeconds = 14400; break;
    case 'D1': intervalInSeconds = 86400; break;
    case 'W1': intervalInSeconds = 604800; break;
    case 'MN1': intervalInSeconds = 2592000; break; // 30 days
    default: intervalInSeconds = 60;
  }
  
  // Calculate the start time of the candle
  const candleStartTime = Math.floor(currentTime / intervalInSeconds) * intervalInSeconds;
  
  return {
    time: candleStartTime,
    open: lastPrice,
    high: lastPrice,
    low: lastPrice,
    close: lastPrice,
    tick_volume: 1,
    spread: 0,
    real_volume: 1
  };
};

export const useChartData = ({ 
  selectedSymbol, 
  selectedTimeframe, 
  chartType,
  latestCandle
}: UseChartDataProps): ChartDataResult => {
  const [candles, setCandles] = useState<CandlestickData<Time>[] | LineData<Time>[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastCandleTimes, setLastCandleTimes] = useState<Record<string, number>>({});

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
        
        // Store the last candle time for new candle detection
        if (data.length > 0) {
          const lastCandle = data[data.length - 1];
          const timeValue = typeof lastCandle.time === 'string' 
            ? new Date(lastCandle.time).getTime() / 1000
            : lastCandle.time;
            
          setLastCandleTimes({
            [selectedSymbol + selectedTimeframe]: timeValue
          });
        }
        
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
      
      // Get key for this symbol and timeframe
      const candleKey = selectedSymbol + selectedTimeframe;
      const lastKnownTime = lastCandleTimes[candleKey] || 0;
      
      // Check if this is a new candle (different timestamp)
      const isNewCandle = timeValue > lastKnownTime;
      
      if (isNewCandle) {
        console.log(`New candle detected for ${selectedSymbol} ${selectedTimeframe}:`, candle);
        
        // Update the last known time
        setLastCandleTimes(prev => ({
          ...prev,
          [candleKey]: timeValue
        }));
      }
      
      if (chartType === 'line' || chartType === 'area') {
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
        } else if (isNewCandle) {
          // Add new candle
          return [...lineCandles, lineCandle].sort((a, b) => 
            Number(a.time) - Number(b.time)
          );
        }
        
        return lineCandles;
      } else {
        // Type cast the array to ensure TypeScript knows it's CandlestickData
        const candlestickCandles = prevCandles as CandlestickData<Time>[];
        
        // Find the candle with matching timestamp
        const candleIndex = candlestickCandles.findIndex(c => c.time === timeValue);
        
        const candlestickData: CandlestickData<Time> = {
          time: timeValue as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        };
        
        if (candleIndex >= 0) {
          // Update existing candle
          const updatedCandles = [...candlestickCandles];
          updatedCandles[candleIndex] = candlestickData;
          return updatedCandles;
        } else if (isNewCandle) {
          // Add new candle
          return [...candlestickCandles, candlestickData].sort((a, b) => 
            Number(a.time) - Number(b.time)
          );
        }
        
        return candlestickCandles;
      }
    });
  }, [chartType, selectedSymbol, selectedTimeframe, lastCandleTimes]);
  
  // Update just the latest price (for real-time updates)
  const updateLatestPrice = useCallback((price: number) => {
    if (candles.length === 0) return;
    
    if (chartType === 'line' || chartType === 'area') {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles as LineData<Time>[];
        
        // Type cast to ensure TypeScript knows it's LineData
        const lineCandles = prevCandles as LineData<Time>[];
        const lastCandle = { ...lineCandles[lineCandles.length - 1] };
        
        // Only update if the price has actually changed
        if (lastCandle.value === price) return lineCandles;
        
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
        
        // Only update if the price has actually changed
        if (lastCandle.close === price) return candlestickCandles;
        
        lastCandle.close = price;
        lastCandle.high = Math.max(lastCandle.high, price);
        lastCandle.low = Math.min(lastCandle.low, price);
        
        return [
          ...candlestickCandles.slice(0, -1),
          lastCandle
        ];
      });
    }
  }, [chartType, candles.length]);
  
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

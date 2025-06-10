
import { useCallback, useRef, useMemo } from 'react';
import { CandlestickData, LineData, Time } from 'lightweight-charts';

interface ChartPerformanceOptions {
  maxDataPoints?: number;
  updateThrottleMs?: number;
  enableVirtualization?: boolean;
}

export const useChartPerformance = (options: ChartPerformanceOptions = {}) => {
  const {
    maxDataPoints = 1000,
    updateThrottleMs = 100,
    enableVirtualization = true
  } = options;

  const lastUpdateRef = useRef<number>(0);
  const dataBufferRef = useRef<Array<CandlestickData<Time> | LineData<Time>>>([]);
  const pendingUpdatesRef = useRef<Array<CandlestickData<Time> | LineData<Time>>>([]);

  // Throttled data update function
  const throttledUpdate = useCallback((
    newData: Array<CandlestickData<Time> | LineData<Time>>,
    updateCallback: (data: Array<CandlestickData<Time> | LineData<Time>>) => void
  ) => {
    const now = Date.now();
    
    // Add to pending updates
    pendingUpdatesRef.current.push(...newData);
    
    if (now - lastUpdateRef.current >= updateThrottleMs) {
      // Process all pending updates
      const allUpdates = [...pendingUpdatesRef.current];
      pendingUpdatesRef.current = [];
      
      // Apply data compression if needed
      const optimizedData = enableVirtualization 
        ? compressDataForVisualization(allUpdates, maxDataPoints)
        : allUpdates.slice(-maxDataPoints);
      
      updateCallback(optimizedData);
      lastUpdateRef.current = now;
    }
  }, [maxDataPoints, updateThrottleMs, enableVirtualization]);

  // Data compression for large datasets
  const compressDataForVisualization = useCallback((
    data: Array<CandlestickData<Time> | LineData<Time>>,
    maxPoints: number
  ) => {
    if (data.length <= maxPoints) return data;
    
    const step = Math.ceil(data.length / maxPoints);
    const compressed: Array<CandlestickData<Time> | LineData<Time>> = [];
    
    for (let i = 0; i < data.length; i += step) {
      const chunk = data.slice(i, i + step);
      
      if (chunk.length === 0) continue;
      
      // For candlestick data, aggregate OHLC values
      if ('open' in chunk[0]) {
        const candleChunk = chunk as CandlestickData<Time>[];
        const aggregated: CandlestickData<Time> = {
          time: candleChunk[0].time,
          open: candleChunk[0].open,
          high: Math.max(...candleChunk.map(c => c.high)),
          low: Math.min(...candleChunk.map(c => c.low)),
          close: candleChunk[candleChunk.length - 1].close,
          customValues: candleChunk[candleChunk.length - 1].customValues
        };
        compressed.push(aggregated);
      } else {
        // For line data, use the last value in the chunk
        compressed.push(chunk[chunk.length - 1]);
      }
    }
    
    return compressed;
  }, []);

  // Memory cleanup function
  const cleanup = useCallback(() => {
    dataBufferRef.current = [];
    pendingUpdatesRef.current = [];
  }, []);

  return {
    throttledUpdate,
    compressDataForVisualization,
    cleanup
  };
};

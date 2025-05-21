
import { useState, useEffect, useCallback } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { getWebSocketUrl, PriceData, CandleData } from '../services/apiService';
import { toast } from '@/components/ui/sonner';

interface UseMarketDataFeedProps {
  symbols: string[];
  currentTimeframe?: string;
}

interface MarketDataFeedResult {
  prices: Record<string, PriceData>;
  latestCandles: Record<string, Record<string, CandleData>>;
  connectionStatus: string;
  readyState: ReadyState;
  sendMessage: (message: string) => void;
}

export const useMarketDataFeed = ({ symbols, currentTimeframe }: UseMarketDataFeedProps): MarketDataFeedResult => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [latestCandles, setLatestCandles] = useState<Record<string, Record<string, CandleData>>>({});
  const [lastCandleTimes, setLastCandleTimes] = useState<Record<string, number>>({});
  
  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log('WebSocket connection established');
    },
    onError: () => {
      toast.error('WebSocket connection error');
    }
  });

  // WebSocket connection status
  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // Helper function to get interval in seconds based on timeframe
  const getTimeframeIntervalSeconds = (timeframe: string): number => {
    switch(timeframe) {
      case 'M1': return 60;
      case 'M5': return 300;
      case 'M15': return 900;
      case 'M30': return 1800;
      case 'H1': return 3600;
      case 'H4': return 14400;
      case 'D1': return 86400;
      case 'W1': return 604800;
      default: return 60; // Default to M1
    }
  };

  // Create a new empty candle based on current time and timeframe
  const createNewCandle = (symbol: string, timeframe: string, price: number): CandleData => {
    const currentTime = Math.floor(Date.now() / 1000);
    const intervalSeconds = getTimeframeIntervalSeconds(timeframe);
    
    // Calculate the start time of the current candle period
    const candleStartTime = Math.floor(currentTime / intervalSeconds) * intervalSeconds;
    
    console.log(`Creating new ${timeframe} candle for ${symbol} at time: ${new Date(candleStartTime * 1000).toLocaleTimeString()}`);
    
    return {
      time: candleStartTime,
      open: price,
      high: price,
      low: price,
      close: price,
      tick_volume: 1,
      spread: 0,
      real_volume: 1
    };
  };

  // Subscribe to symbol updates via WebSocket
  const subscribeToSymbols = useCallback(() => {
    if (readyState === ReadyState.OPEN && symbols.length > 0) {
      console.log('Subscribing to symbols:', symbols);
      // Subscribe to all symbols
      sendMessage(JSON.stringify({
        type: 'subscribe',
        symbols: symbols
      }));
      
      // If we have a current timeframe, subscribe to candle updates too
      if (currentTimeframe) {
        console.log(`Subscribing to candles for timeframe: ${currentTimeframe}`);
        sendMessage(JSON.stringify({
          type: 'subscribe_candles',
          symbols: symbols,
          timeframe: currentTimeframe
        }));
      }
    }
  }, [readyState, sendMessage, symbols, currentTimeframe]);

  // Check if a new candle should be created based on current time and previous candle time
  const shouldCreateNewCandle = (symbol: string, timeframe: string, currentTime: number): boolean => {
    if (!timeframe) return false;
    
    const key = `${symbol}-${timeframe}`;
    const lastCandleTime = lastCandleTimes[key] || 0;
    const intervalSeconds = getTimeframeIntervalSeconds(timeframe);
    
    // If the current time has crossed into a new interval period since the last candle
    const lastCandlePeriod = Math.floor(lastCandleTime / intervalSeconds);
    const currentPeriod = Math.floor(currentTime / intervalSeconds);
    
    return currentPeriod > lastCandlePeriod;
  };

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Handle price updates
        if (data.type === 'price_update') {
          setPrices(prev => ({
            ...prev,
            [data.symbol]: data.data
          }));
          
          // Check if we need to create a new candle based on the current time
          if (data.symbol && currentTimeframe && data.data) {
            const symbol = data.symbol;
            const price = data.data.bid;
            const key = `${symbol}-${currentTimeframe}`;
            
            if (shouldCreateNewCandle(symbol, currentTimeframe, currentTime)) {
              console.log(`Time for new ${currentTimeframe} candle for ${symbol}`);
              
              // Create a new candle
              const newCandle = createNewCandle(symbol, currentTimeframe, price);
              
              // Update the latest candles with this new candle
              setLatestCandles(prev => {
                const symbolCandles = prev[symbol] || {};
                return {
                  ...prev,
                  [symbol]: {
                    ...symbolCandles,
                    [currentTimeframe]: newCandle
                  }
                };
              });
              
              // Fix: Ensure we're only storing numbers in lastCandleTimes
              setLastCandleTimes(prev => ({
                ...prev,
                [key]: Number(newCandle.time) // Explicitly convert to number
              }));
            } else {
              // If we have an existing candle for this time period, update it with the new price
              const existingCandle = latestCandles[symbol]?.[currentTimeframe];
              
              if (existingCandle && existingCandle.time === Math.floor(currentTime / getTimeframeIntervalSeconds(currentTimeframe)) * getTimeframeIntervalSeconds(currentTimeframe)) {
                const updatedCandle = {
                  ...existingCandle,
                  high: Math.max(existingCandle.high, price),
                  low: Math.min(existingCandle.low, price),
                  close: price,
                  tick_volume: existingCandle.tick_volume + 1
                };
                
                setLatestCandles(prev => {
                  const symbolCandles = prev[symbol] || {};
                  return {
                    ...prev,
                    [symbol]: {
                      ...symbolCandles,
                      [currentTimeframe]: updatedCandle
                    }
                  };
                });
              }
            }
          }
        }
        
        // Handle new candle data from the server
        if (data.type === 'candle_update') {
          const { symbol, timeframe, candle } = data;
          
          if (!candle || typeof candle !== 'object') {
            console.error('Received invalid candle data:', candle);
            return;
          }
          
          // Create a properly structured candle object
          const parsedCandle: CandleData = {
            time: candle.time || Math.floor(Date.now() / 1000),
            open: parseFloat(candle.open) || 0,
            high: parseFloat(candle.high) || 0,
            low: parseFloat(candle.low) || 0,
            close: parseFloat(candle.close) || 0,
            tick_volume: parseInt(candle.tick_volume) || 0,
            spread: parseFloat(candle.spread) || 0,
            real_volume: parseInt(candle.real_volume) || 0
          };
          
          console.log(`Received server candle for ${symbol} ${timeframe}:`, parsedCandle);
          
          // Fix: Ensure we're only storing numbers in lastCandleTimes
          const key = `${symbol}-${timeframe}`;
          setLastCandleTimes(prev => ({
            ...prev,
            [key]: Number(parsedCandle.time) // Explicitly convert to number
          }));
          
          // Update the candle in our state
          setLatestCandles(prev => {
            const symbolCandles = prev[symbol] || {};
            return {
              ...prev,
              [symbol]: {
                ...symbolCandles,
                [timeframe]: parsedCandle
              }
            };
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }
  }, [lastMessage, prices, currentTimeframe, latestCandles]);

  // Initial subscription
  useEffect(() => {
    subscribeToSymbols();
  }, [subscribeToSymbols]);

  // When first mounted and readyState becomes open, initialize lastCandleTimes for each symbol
  useEffect(() => {
    if (readyState === ReadyState.OPEN && symbols.length > 0 && currentTimeframe) {
      const now = Math.floor(Date.now() / 1000);
      const intervalSeconds = getTimeframeIntervalSeconds(currentTimeframe);
      const currentPeriodStart = Math.floor(now / intervalSeconds) * intervalSeconds;
      
      // Initialize last candle times for all symbols
      const initialCandleTimes: Record<string, number> = {};
      symbols.forEach(symbol => {
        const key = `${symbol}-${currentTimeframe}`;
        initialCandleTimes[key] = currentPeriodStart;
      });
      
      setLastCandleTimes(initialCandleTimes);
    }
  }, [readyState, symbols, currentTimeframe]);

  // Resubscribe when timeframe changes
  useEffect(() => {
    if (currentTimeframe && readyState === ReadyState.OPEN) {
      console.log(`Timeframe changed to ${currentTimeframe}, resubscribing...`);
      
      // Unsubscribe from old candle feeds first
      sendMessage(JSON.stringify({
        type: 'unsubscribe_candles',
        symbols: symbols
      }));
      
      // Subscribe to new timeframe
      sendMessage(JSON.stringify({
        type: 'subscribe_candles',
        symbols: symbols,
        timeframe: currentTimeframe
      }));
      
      // Reset last candle times for the new timeframe
      const now = Math.floor(Date.now() / 1000);
      const intervalSeconds = getTimeframeIntervalSeconds(currentTimeframe);
      const currentPeriodStart = Math.floor(now / intervalSeconds) * intervalSeconds;
      
      const newCandleTimes: Record<string, number> = {};
      symbols.forEach(symbol => {
        const key = `${symbol}-${currentTimeframe}`;
        newCandleTimes[key] = currentPeriodStart;
      });
      
      setLastCandleTimes(prev => ({
        ...prev,
        ...newCandleTimes
      }));
    }
  }, [currentTimeframe, symbols, sendMessage, readyState]);

  return { 
    prices, 
    latestCandles,
    connectionStatus, 
    readyState,
    sendMessage 
  };
};


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
  lastMessageTime: number;
}

export const useMarketDataFeed = ({ symbols, currentTimeframe }: UseMarketDataFeedProps): MarketDataFeedResult => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [latestCandles, setLatestCandles] = useState<Record<string, Record<string, CandleData>>>({});
  const [lastCandleTimes, setLastCandleTimes] = useState<Record<string, number>>({});
  const [lastMessageTime, setLastMessageTime] = useState<number>(Date.now());
  
  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log('WebSocket connection established at:', new Date().toISOString());
      toast.success('Market data connection established');
    },
    onError: () => {
      console.error('WebSocket connection error at:', new Date().toISOString());
      toast.error('Market data connection error');
    },
    onClose: () => {
      console.warn('WebSocket connection closed at:', new Date().toISOString());
      toast.warning('Market data connection closed, attempting to reconnect...');
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
    // This ensures the candle start time is properly aligned to the timeframe intervals
    const candleStartTime = Math.floor(currentTime / intervalSeconds) * intervalSeconds;
    
    console.log(`Creating new ${timeframe} candle for ${symbol} at time: ${new Date(candleStartTime * 1000).toLocaleTimeString()}, opening price: ${price}`);
    
    return {
      time: candleStartTime,
      open: price,
      high: price,
      low: price,
      close: price,
      tick_volume: 1,
      spread: 0,
      real_volume: 1,
      volume: 1 
    };
  };

  // Subscribe to symbol updates via WebSocket
  const subscribeToSymbols = useCallback(() => {
    if (readyState === ReadyState.OPEN && symbols.length > 0) {
      console.log('Subscribing to symbols:', symbols, 'at:', new Date().toISOString());
      // Subscribe to all symbols
      sendMessage(JSON.stringify({
        type: 'subscribe',
        symbols: symbols
      }));
      
      // If we have a current timeframe, subscribe to candle updates too
      if (currentTimeframe) {
        console.log(`Subscribing to candles for timeframe: ${currentTimeframe}`, 'at:', new Date().toISOString());
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
    
    // Calculate the current period based on current time
    const currentPeriod = Math.floor(currentTime / intervalSeconds);
    
    // Calculate the period of the last candle
    const lastCandlePeriod = Math.floor(lastCandleTime / intervalSeconds);
    
    // Debug logging for candle periods
    if (lastCandlePeriod < currentPeriod) {
      console.log(`Time for new candle: Last period ${lastCandlePeriod}, Current period ${currentPeriod} for ${symbol} ${timeframe}`);
      console.log(`Last candle time: ${new Date(lastCandleTime * 1000).toLocaleTimeString()}, Current time: ${new Date(currentTime * 1000).toLocaleTimeString()}`);
    }
    
    // Create new candle if we've moved to a new period
    return currentPeriod > lastCandlePeriod;
  };

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Update last message time
        setLastMessageTime(Date.now());
        
        // Handle price updates
        if (data.type === 'price_update') {
          const symbol = data.symbol;
          const priceData = data.data;
          
          if (!symbol || !priceData) {
            console.warn('Received incomplete price update:', data);
            return;
          }
          
          setPrices(prev => ({
            ...prev,
            [symbol]: priceData
          }));
          
          // Check if we need to create a new candle based on the current time
          if (currentTimeframe) {
            const price = priceData.bid;
            const key = `${symbol}-${currentTimeframe}`;
            const intervalSeconds = getTimeframeIntervalSeconds(currentTimeframe);
            const currentPeriodStart = Math.floor(currentTime / intervalSeconds) * intervalSeconds;
            
            // First check if we should create a new candle
            if (shouldCreateNewCandle(symbol, currentTimeframe, currentTime)) {
              console.log(`Creating new ${currentTimeframe} candle for ${symbol} at ${new Date(currentTime * 1000).toLocaleTimeString()}, opening at ${price}`);
              
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
              
              // Update the last candle time for this symbol and timeframe
              setLastCandleTimes(prev => ({
                ...prev,
                [key]: currentPeriodStart
              }));
              
              console.log(`New candle period started: ${new Date(currentPeriodStart * 1000).toLocaleTimeString()} with price ${price}`);
            } else {
              // If we have an existing candle for this time period, update it with the new price
              const existingCandle = latestCandles[symbol]?.[currentTimeframe];
              
              // Only update if we have an existing candle and it's for the current period
              if (existingCandle && existingCandle.time === currentPeriodStart) {
                const updatedCandle = {
                  ...existingCandle,
                  high: Math.max(existingCandle.high, price),
                  low: Math.min(existingCandle.low, price),
                  close: price,
                  tick_volume: existingCandle.tick_volume + 1,
                  volume: (existingCandle.volume || existingCandle.tick_volume) + 1
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
              } else if (!existingCandle || existingCandle.time < currentPeriodStart) {
                // If we don't have a candle for this period yet, create one
                console.log(`No candle for current period, creating new one for ${symbol} at ${new Date(currentPeriodStart * 1000).toLocaleTimeString()}`);
                const newCandle = createNewCandle(symbol, currentTimeframe, price);
                
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
                
                // Update the last candle time
                setLastCandleTimes(prev => ({
                  ...prev,
                  [key]: currentPeriodStart
                }));
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
            time: candle.time ? Number(candle.time) : Math.floor(Date.now() / 1000), // Ensure time is a number
            open: parseFloat(candle.open) || 0,
            high: parseFloat(candle.high) || 0,
            low: parseFloat(candle.low) || 0,
            close: parseFloat(candle.close) || 0,
            tick_volume: parseInt(candle.tick_volume) || 0,
            spread: parseFloat(candle.spread) || 0,
            real_volume: parseInt(candle.real_volume) || 0,
            volume: parseInt(candle.volume || candle.tick_volume) || 0
          };
          
          console.log(`Received server candle for ${symbol} ${timeframe} at ${new Date().toLocaleTimeString()}: open=${parsedCandle.open}, close=${parsedCandle.close}`);
          
          // Update the last candle time for this symbol and timeframe
          const key = `${symbol}-${timeframe}`;
          setLastCandleTimes(prev => ({
            ...prev,
            [key]: parsedCandle.time
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
  }, [lastMessage, currentTimeframe, latestCandles]);

  // Initial subscription and heartbeat setup
  useEffect(() => {
    subscribeToSymbols();
    
    // Set up heartbeat to check connection
    const heartbeatInterval = setInterval(() => {
      if (readyState === ReadyState.OPEN) {
        sendMessage(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        
        // Check if we haven't received a message in over 30 seconds
        const now = Date.now();
        if (now - lastMessageTime > 30000) {
          console.warn('No messages received in 30 seconds, attempting to reconnect...');
          toast.warning('Connection seems slow, attempting to reconnect...');
          // Attempt to resubscribe
          subscribeToSymbols();
        }
      }
    }, 15000); // Check every 15 seconds
    
    return () => clearInterval(heartbeatInterval);
  }, [subscribeToSymbols, readyState, sendMessage, lastMessageTime]);

  // Initialize lastCandleTimes for each symbol when first mounted
  useEffect(() => {
    if (readyState === ReadyState.OPEN && symbols.length > 0 && currentTimeframe) {
      const now = Math.floor(Date.now() / 1000);
      const intervalSeconds = getTimeframeIntervalSeconds(currentTimeframe);
      const currentPeriodStart = Math.floor(now / intervalSeconds) * intervalSeconds;
      
      console.log(`Initializing candle times for ${symbols.length} symbols with currentPeriodStart: ${new Date(currentPeriodStart * 1000).toLocaleTimeString()}`);
      
      // Initialize last candle times for all symbols
      const initialCandleTimes: Record<string, number> = {};
      symbols.forEach(symbol => {
        const key = `${symbol}-${currentTimeframe}`;
        initialCandleTimes[key] = currentPeriodStart;
        
        // Also create initial candles for each symbol
        if (prices[symbol]) {
          const price = prices[symbol].bid;
          const newCandle = createNewCandle(symbol, currentTimeframe, price);
          
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
        }
      });
      
      setLastCandleTimes(initialCandleTimes);
    }
  }, [readyState, symbols, currentTimeframe, prices]);

  // Resubscribe when timeframe changes
  useEffect(() => {
    if (currentTimeframe && readyState === ReadyState.OPEN) {
      console.log(`Timeframe changed to ${currentTimeframe}, resubscribing at ${new Date().toLocaleTimeString()}...`);
      
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
      
      // Reset last candle times for the new timeframe and create new candles
      const now = Math.floor(Date.now() / 1000);
      const intervalSeconds = getTimeframeIntervalSeconds(currentTimeframe);
      const currentPeriodStart = Math.floor(now / intervalSeconds) * intervalSeconds;
      
      const newCandleTimes: Record<string, number> = {};
      
      symbols.forEach(symbol => {
        const key = `${symbol}-${currentTimeframe}`;
        newCandleTimes[key] = currentPeriodStart;
        
        // Create new candles for each symbol if we have price data
        if (prices[symbol]) {
          const price = prices[symbol].bid;
          const newCandle = createNewCandle(symbol, currentTimeframe, price);
          
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
        }
      });
      
      setLastCandleTimes(prev => ({
        ...prev,
        ...newCandleTimes
      }));
    }
  }, [currentTimeframe, symbols, sendMessage, readyState, prices]);

  return { 
    prices, 
    latestCandles,
    connectionStatus, 
    readyState,
    sendMessage,
    lastMessageTime
  };
};

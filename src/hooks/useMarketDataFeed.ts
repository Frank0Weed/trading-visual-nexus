
import { useState, useEffect, useCallback, useRef } from 'react';
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
  newCandleEvents: Record<string, Record<string, number>>; // symbol -> timeframe -> timestamp
}

// Helper function to calculate next candle open time
const getNextCandleOpenTime = (currentTime: number, timeframe: string): number => {
  const timeframeMinutes: Record<string, number> = {
    'M1': 1,
    'M5': 5,
    'M15': 15,
    'M30': 30,
    'H1': 60,
    'H4': 240,
    'D1': 1440,
    'W1': 10080,
    'MN1': 43200
  };

  const minutes = timeframeMinutes[timeframe] || 1;
  const milliseconds = minutes * 60 * 1000;
  const currentTimeMs = currentTime * 1000;
  
  return Math.ceil(currentTimeMs / milliseconds) * milliseconds / 1000;
};

// Helper function to check if a new candle has opened
const isNewCandleOpen = (previousTime: number, currentTime: number, timeframe: string): boolean => {
  const timeframeMinutes: Record<string, number> = {
    'M1': 1,
    'M5': 5,
    'M15': 15,
    'M30': 30,
    'H1': 60,
    'H4': 240,
    'D1': 1440,
    'W1': 10080,
    'MN1': 43200
  };

  const minutes = timeframeMinutes[timeframe] || 1;
  const milliseconds = minutes * 60 * 1000;
  
  const prevCandleStart = Math.floor((previousTime * 1000) / milliseconds) * milliseconds;
  const currentCandleStart = Math.floor((currentTime * 1000) / milliseconds) * milliseconds;
  
  return prevCandleStart !== currentCandleStart;
};

export const useMarketDataFeed = ({ symbols, currentTimeframe }: UseMarketDataFeedProps): MarketDataFeedResult => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [latestCandles, setLatestCandles] = useState<Record<string, Record<string, CandleData>>>({});
  const [newCandleEvents, setNewCandleEvents] = useState<Record<string, Record<string, number>>>({});
  const [lastMessageTime, setLastMessageTime] = useState<number>(Date.now());
  
  const subscribedSymbolsRef = useRef<string>('');
  const subscribedTimeframeRef = useRef<string>('');
  const isInitializedRef = useRef<boolean>(false);
  const lastCandleTimesRef = useRef<Record<string, Record<string, number>>>({});
  
  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log('WebSocket connection established');
      toast.success('Market data connection established');
      isInitializedRef.current = false;
    },
    onError: () => {
      console.error('WebSocket connection error');
      toast.error('Market data connection error');
    },
    onClose: () => {
      console.warn('WebSocket connection closed');
      toast.warning('Market data connection closed, attempting to reconnect...');
      isInitializedRef.current = false;
    }
  });

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  const subscribeToData = useCallback(() => {
    if (readyState !== ReadyState.OPEN || symbols.length === 0) return;
    
    const symbolsKey = symbols.sort().join(',');
    const needsSubscription = symbolsKey !== subscribedSymbolsRef.current || 
                             currentTimeframe !== subscribedTimeframeRef.current ||
                             !isInitializedRef.current;
    
    if (!needsSubscription) return;
    
    console.log('Subscribing to live data for symbols:', symbols);
    
    // Subscribe to live price updates using the correct message format
    sendMessage(JSON.stringify({
      type: 'subscribe_prices',
      symbols: symbols
    }));
    
    // Subscribe to all timeframes for new candle detection
    const allTimeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1'];
    
    allTimeframes.forEach(timeframe => {
      console.log(`Subscribing to candles for timeframe: ${timeframe}`);
      sendMessage(JSON.stringify({
        type: 'subscribe_candles',
        symbols: symbols,
        timeframe: timeframe
      }));
    });
    
    subscribedSymbolsRef.current = symbolsKey;
    subscribedTimeframeRef.current = currentTimeframe || '';
    isInitializedRef.current = true;
  }, [readyState, symbols, currentTimeframe, sendMessage]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    try {
      const message = JSON.parse(lastMessage.data);
      setLastMessageTime(Date.now());
      
      console.log('Received WebSocket message:', message);
      
      // Handle live price updates with the new format
      if (message.type === 'price_update') {
        const { symbol, data } = message;
        
        if (symbol && data && data.bid && data.ask) {
          const { time, bid, ask, spread } = data;
          
          setPrices(prev => ({
            ...prev,
            [symbol]: {
              symbol,
              time: time || Date.now() / 1000,
              bid: parseFloat(bid),
              ask: parseFloat(ask),
              spread: parseFloat(spread) || Math.abs(parseFloat(ask) - parseFloat(bid))
            }
          }));
          
          console.log(`Price update for ${symbol}: bid=${bid}, ask=${ask}, spread=${spread}`);
        }
      }
      
      // Also handle the old format for backwards compatibility
      if (message.type === 'price_tick') {
        const { symbol, bid, ask, time, spread } = message;
        
        if (symbol && bid && ask) {
          setPrices(prev => ({
            ...prev,
            [symbol]: {
              symbol,
              time: time || Date.now() / 1000,
              bid: parseFloat(bid),
              ask: parseFloat(ask),
              spread: parseFloat(spread) || Math.abs(parseFloat(ask) - parseFloat(bid))
            }
          }));
        }
      }
      
      // Handle candle updates with new candle detection
      if (message.type === 'candle_update') {
        const { symbol, timeframe, candle } = message;
        
        if (!candle || typeof candle !== 'object') return;
        
        // Convert candle time to number - this fixes the TypeScript errors
        const candleTime = typeof candle.time === 'string' ? parseInt(candle.time, 10) : Number(candle.time);
        
        const parsedCandle: CandleData = {
          time: candleTime,
          open: parseFloat(candle.open) || 0,
          high: parseFloat(candle.high) || 0,
          low: parseFloat(candle.low) || 0,
          close: parseFloat(candle.close) || 0,
          tick_volume: parseInt(candle.tick_volume) || 0,
          spread: parseFloat(candle.spread) || 0,
          real_volume: parseInt(candle.real_volume) || 0,
          volume: parseInt(candle.volume || candle.tick_volume) || 0
        };
        
        // Check for new candle opening
        const lastCandleTime = lastCandleTimesRef.current[symbol]?.[timeframe];
        if (lastCandleTime && isNewCandleOpen(lastCandleTime, candleTime, timeframe)) {
          console.log(`🕯️ NEW CANDLE OPENED: ${symbol} ${timeframe} at ${new Date(candleTime * 1000).toLocaleTimeString()}`);
          
          // Update new candle events
          setNewCandleEvents(prev => ({
            ...prev,
            [symbol]: {
              ...prev[symbol],
              [timeframe]: candleTime
            }
          }));
          
          // Toast notification for current timeframe
          if (timeframe === currentTimeframe) {
            toast.info(`New ${timeframe} candle opened for ${symbol}`, {
              duration: 2000,
            });
          }
        }
        
        // Update last candle time tracking
        if (!lastCandleTimesRef.current[symbol]) {
          lastCandleTimesRef.current[symbol] = {};
        }
        lastCandleTimesRef.current[symbol][timeframe] = candleTime;
        
        console.log(`Live candle update for ${symbol} ${timeframe}:`, parsedCandle);
        
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

      // Handle new candle notifications from server
      if (message.type === 'new_candle_open') {
        const { symbol, timeframe, time } = message;
        
        console.log(`🔔 Server notification: New ${timeframe} candle opened for ${symbol}`);
        
        setNewCandleEvents(prev => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            [timeframe]: time
          }
        }));
        
        if (timeframe === currentTimeframe) {
          toast.success(`New ${timeframe} candle opened for ${symbol}`, {
            duration: 3000,
          });
        }
      }

      // Handle heartbeat/pong
      if (message.type === 'pong') {
        console.log('Received heartbeat response');
      }

    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, [lastMessage, currentTimeframe]);

  // Subscribe when connection opens
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      subscribeToData();
    }
  }, [readyState, subscribeToData]);

  // Handle timeframe changes
  useEffect(() => {
    if (readyState === ReadyState.OPEN && currentTimeframe && isInitializedRef.current) {
      const timeframeChanged = currentTimeframe !== subscribedTimeframeRef.current;
      
      if (timeframeChanged) {
        console.log(`Timeframe changed to ${currentTimeframe}, resubscribing...`);
        subscribedTimeframeRef.current = currentTimeframe;
      }
    }
  }, [currentTimeframe, readyState, symbols, sendMessage]);

  // Heartbeat to maintain connection
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    
    const heartbeatInterval = setInterval(() => {
      sendMessage(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      
      const now = Date.now();
      if (now - lastMessageTime > 30000) {
        console.warn('No messages received in 30 seconds');
      }
    }, 15000);
    
    return () => clearInterval(heartbeatInterval);
  }, [readyState, sendMessage, lastMessageTime]);

  return { 
    prices, 
    latestCandles,
    connectionStatus, 
    readyState,
    sendMessage,
    lastMessageTime,
    newCandleEvents
  };
};


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
}

export const useMarketDataFeed = ({ symbols, currentTimeframe }: UseMarketDataFeedProps): MarketDataFeedResult => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [latestCandles, setLatestCandles] = useState<Record<string, Record<string, CandleData>>>({});
  const [lastMessageTime, setLastMessageTime] = useState<number>(Date.now());
  
  // Use refs to prevent infinite loops
  const subscribedSymbolsRef = useRef<string>('');
  const subscribedTimeframeRef = useRef<string>('');
  const isInitializedRef = useRef<boolean>(false);
  
  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log('WebSocket connection established');
      toast.success('Market data connection established');
      isInitializedRef.current = false; // Reset on reconnection
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

  // WebSocket connection status
  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // Subscribe to symbol updates via WebSocket - memoized to prevent loops
  const subscribeToSymbols = useCallback(() => {
    if (readyState !== ReadyState.OPEN || symbols.length === 0) return;
    
    const symbolsKey = symbols.sort().join(',');
    const needsSubscription = symbolsKey !== subscribedSymbolsRef.current || 
                             currentTimeframe !== subscribedTimeframeRef.current ||
                             !isInitializedRef.current;
    
    if (!needsSubscription) return;
    
    console.log('Subscribing to symbols:', symbols);
    
    // Subscribe to price updates
    sendMessage(JSON.stringify({
      type: 'subscribe',
      symbols: symbols
    }));
    
    // Subscribe to candle updates if timeframe is available
    if (currentTimeframe) {
      console.log(`Subscribing to candles for timeframe: ${currentTimeframe}`);
      sendMessage(JSON.stringify({
        type: 'subscribe_candles',
        symbols: symbols,
        timeframe: currentTimeframe
      }));
    }
    
    // Update refs to track current subscription
    subscribedSymbolsRef.current = symbolsKey;
    subscribedTimeframeRef.current = currentTimeframe || '';
    isInitializedRef.current = true;
  }, [readyState, symbols, currentTimeframe, sendMessage]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    try {
      const data = JSON.parse(lastMessage.data);
      setLastMessageTime(Date.now());
      
      // Handle price updates
      if (data.type === 'price_update') {
        const symbol = data.symbol;
        const priceData = data.data;
        
        if (!symbol || !priceData) return;
        
        setPrices(prev => ({
          ...prev,
          [symbol]: priceData
        }));
      }
      
      // Handle candle updates
      if (data.type === 'candle_update') {
        const { symbol, timeframe, candle } = data;
        
        if (!candle || typeof candle !== 'object') return;
        
        const parsedCandle: CandleData = {
          time: typeof candle.time === 'string' ? parseInt(candle.time, 10) : Number(candle.time),
          open: parseFloat(candle.open) || 0,
          high: parseFloat(candle.high) || 0,
          low: parseFloat(candle.low) || 0,
          close: parseFloat(candle.close) || 0,
          tick_volume: parseInt(candle.tick_volume) || 0,
          spread: parseFloat(candle.spread) || 0,
          real_volume: parseInt(candle.real_volume) || 0,
          volume: parseInt(candle.volume || candle.tick_volume) || 0
        };
        
        console.log(`Received server candle for ${symbol} ${timeframe}: open=${parsedCandle.open}, close=${parsedCandle.close}, time=${new Date(Number(parsedCandle.time) * 1000).toLocaleTimeString()}`);
        
        // Update candles state
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
  }, [lastMessage]);

  // Initial subscription - only when connection opens
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      subscribeToSymbols();
    }
  }, [readyState, subscribeToSymbols]);

  // Handle timeframe changes
  useEffect(() => {
    if (readyState === ReadyState.OPEN && currentTimeframe && isInitializedRef.current) {
      const timeframeChanged = currentTimeframe !== subscribedTimeframeRef.current;
      
      if (timeframeChanged) {
        console.log(`Timeframe changed to ${currentTimeframe}, resubscribing...`);
        
        // Unsubscribe from old candle feeds
        if (subscribedTimeframeRef.current) {
          sendMessage(JSON.stringify({
            type: 'unsubscribe_candles',
            symbols: symbols
          }));
        }
        
        // Subscribe to new timeframe
        sendMessage(JSON.stringify({
          type: 'subscribe_candles',
          symbols: symbols,
          timeframe: currentTimeframe
        }));
        
        subscribedTimeframeRef.current = currentTimeframe;
      }
    }
  }, [currentTimeframe, readyState, symbols, sendMessage]);

  // Heartbeat to maintain connection
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    
    const heartbeatInterval = setInterval(() => {
      sendMessage(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      
      // Check connection health
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
    lastMessageTime
  };
};

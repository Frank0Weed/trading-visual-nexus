
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

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        
        // Handle price updates
        if (data.type === 'price_update') {
          setPrices(prev => ({
            ...prev,
            [data.symbol]: data.data
          }));
          
          // When we get a price update, we need to also check if it's time for a new candle
          if (data.symbol && prices[data.symbol] && data.data) {
            const prevTime = prices[data.symbol].time;
            const currentTime = data.data.time;
            
            // If the minute has changed and we're tracking M1 candles, this could be a new candle
            if (currentTimeframe === 'M1' && 
                Math.floor(prevTime / 60) !== Math.floor(currentTime / 60)) {
              console.log(`New minute detected, possibly new M1 candle for ${data.symbol}`);
            }
          }
        }
        
        // Handle new candle data
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
          
          console.log(`Received new candle for ${symbol} ${timeframe}:`, parsedCandle);
          
          setLatestCandles(prev => {
            // Initialize nested structure if needed
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
  }, [lastMessage, prices, currentTimeframe]);

  // Initial subscription
  useEffect(() => {
    subscribeToSymbols();
  }, [subscribeToSymbols]);

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

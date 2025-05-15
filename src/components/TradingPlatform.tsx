
import React, { useState, useEffect, useCallback } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { toast } from '@/components/ui/sonner';
import Chart, { ChartType } from './Chart';
import ChartToolbar from './ChartToolbar';
import PriceTicker from './PriceTicker';
import SymbolSelector from './SymbolSelector';
import { 
  fetchSymbols, 
  fetchTimeframes, 
  fetchCandles, 
  fetchLivePrice,
  getWebSocketUrl,
  CandleData,
  PriceData,
  TimeFrame
} from '../services/apiService';
import { CandlestickData, LineData, Time } from 'lightweight-charts';

// Helper function to format candle data to match Chart component requirements
const formatCandleData = (candles: CandleData[]): (CandlestickData<Time> | LineData<Time>)[] => {
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
  });
};

const TradingPlatform: React.FC = () => {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [timeframes, setTimeframes] = useState<TimeFrame[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAUUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('M1'); // Using M1 format based on API response
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [candles, setCandles] = useState<(CandlestickData<Time> | LineData<Time>)[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});

  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
  });

  // Load initial data
  useEffect(() => {
    const initializeData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch available symbols
        const symbolsData = await fetchSymbols();
        setSymbols(symbolsData);
        
        // Fetch available timeframes
        const timeframesData = await fetchTimeframes();
        setTimeframes(timeframesData);
        
        // Initialize with default selections
        if (symbolsData.length > 0 && !symbolsData.includes(selectedSymbol)) {
          setSelectedSymbol(symbolsData[0]);
        }

        // Fetch initial prices for all symbols
        const initialPrices: Record<string, PriceData> = {};
        for (const symbol of symbolsData) {
          try {
            const price = await fetchLivePrice(symbol);
            initialPrices[symbol] = price;
          } catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error);
          }
        }
        setPrices(initialPrices);

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing data:', error);
        toast.error('Failed to load trading data');
        setIsLoading(false);
      }
    };

    initializeData();
  }, []);

  // Fetch candles when symbol or timeframe changes
  useEffect(() => {
    const loadCandles = async () => {
      try {
        setIsLoading(true);
        console.log(`Fetching candles for ${selectedSymbol} ${selectedTimeframe}`);
        const data = await fetchCandles(selectedSymbol, selectedTimeframe, 500);
        // Format the data to match Chart component requirements
        const formattedData = formatCandleData(data);
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
  }, [selectedSymbol, selectedTimeframe]);

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
          
          // Update candles if this update is for our selected symbol and the time matches a new candle
          if (data.symbol === selectedSymbol) {
            // Check if we need to add a new candle or update the latest one...
            // This logic would depend on your data format and requirements
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }
  }, [lastMessage, selectedSymbol]);

  // WebSocket connection status
  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // Subscribe to symbol updates via WebSocket
  useEffect(() => {
    if (readyState === ReadyState.OPEN && symbols.length > 0) {
      // Subscribe to all symbols
      sendMessage(JSON.stringify({
        type: 'subscribe',
        symbols: symbols
      }));
    }
  }, [readyState, sendMessage, symbols]);

  // Handle symbol selection
  const handleSymbolSelect = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
  }, []);

  // Handle timeframe selection
  const handleTimeframeChange = useCallback((timeframe: string) => {
    setSelectedTimeframe(timeframe);
  }, []);

  // Handle chart type selection
  const handleChartTypeChange = useCallback((type: ChartType) => {
    setChartType(type);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header with connection status */}
      <div className="flex items-center justify-between p-2 bg-trading-bg-dark border-b border-trading-grid">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">TradingPro</h1>
          <span 
            className={`text-xs px-2 py-0.5 rounded-full ${
              readyState === ReadyState.OPEN 
                ? 'bg-green-800/30 text-green-400' 
                : 'bg-yellow-800/30 text-yellow-400'
            }`}
          >
            {connectionStatus}
          </span>
        </div>
        <SymbolSelector
          symbols={symbols}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={handleSymbolSelect}
          className="h-8 text-sm"
        />
      </div>

      {/* Price ticker */}
      <PriceTicker
        prices={prices}
        onSymbolSelect={handleSymbolSelect}
        selectedSymbol={selectedSymbol}
      />

      {/* Chart toolbar */}
      <ChartToolbar
        chartType={chartType}
        onChartTypeChange={handleChartTypeChange}
        timeframe={selectedTimeframe}
        timeframes={timeframes}
        onTimeframeChange={handleTimeframeChange}
      />

      {/* Main chart */}
      <div className="flex-1 p-0 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-trading-bg-dark bg-opacity-50 z-10">
            <div className="animate-pulse-light text-primary">Loading chart data...</div>
          </div>
        ) : (
          <Chart
            data={candles}
            symbol={selectedSymbol}
            timeframe={selectedTimeframe}
            chartType={chartType}
            height={500}
            className="w-full"
          />
        )}
      </div>
    </div>
  );
};

export default TradingPlatform;

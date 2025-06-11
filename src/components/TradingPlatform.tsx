
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ReadyState } from 'react-use-websocket';

import { ChartType } from './Chart';
import PriceTicker from './PriceTicker';
import ChartToolbar from './ChartToolbar';
import TradingHeader from './trading/TradingHeader';
import ChartContainer from './trading/ChartContainer';

import { useMarketInitialization } from '../hooks/useMarketInitialization';
import { useMarketDataFeed } from '../hooks/useMarketDataFeed';
import { useChartData } from '../hooks/useChartData';
import { toast } from '@/components/ui/sonner';

const TradingPlatform: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAUUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('M1');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [lastConnectionCheck, setLastConnectionCheck] = useState<number>(Date.now());
  const [lastTimeframeChange, setLastTimeframeChange] = useState<number>(Date.now());

  console.log('TradingPlatform render with symbol:', selectedSymbol, 'timeframe:', selectedTimeframe);

  // Initialize market data
  const { 
    symbols, 
    timeframes, 
    isLoading: isInitializing 
  } = useMarketInitialization();

  // Get live market data via WebSocket - memoize the config
  const marketDataConfig = useMemo(() => ({
    symbols,
    currentTimeframe: selectedTimeframe
  }), [symbols, selectedTimeframe]);

  const { 
    prices, 
    latestCandles,
    connectionStatus, 
    readyState,
    lastMessageTime,
    newCandleEvents
  } = useMarketDataFeed(marketDataConfig);

  const latestCandle = latestCandles[selectedSymbol]?.[selectedTimeframe];

  // Fetch and format chart data - memoize the config
  const chartDataConfig = useMemo(() => ({
    selectedSymbol, 
    selectedTimeframe, 
    chartType,
    latestCandle
  }), [selectedSymbol, selectedTimeframe, chartType, latestCandle]);

  const { 
    candles, 
    isLoading: isLoadingChart,
    updateLatestPrice
  } = useChartData(chartDataConfig);

  // Monitor new candle events - stable reference
  const stableNewCandleEvents = useMemo(() => newCandleEvents, [newCandleEvents]);
  
  useEffect(() => {
    const currentNewCandleTime = stableNewCandleEvents[selectedSymbol]?.[selectedTimeframe];
    if (currentNewCandleTime) {
      console.log(`📊 New ${selectedTimeframe} candle detected for ${selectedSymbol} at ${new Date(currentNewCandleTime * 1000).toLocaleString()}`);
    }
  }, [stableNewCandleEvents, selectedSymbol, selectedTimeframe]);

  // Monitor connection health - prevent frequent checks
  useEffect(() => {
    const CHECK_INTERVAL = 30000;
    let connectionMonitor: NodeJS.Timeout;
    
    const checkConnection = () => {
      const now = Date.now();
      if (now - lastMessageTime > 60000 && readyState !== ReadyState.CONNECTING) {
        if (now - lastConnectionCheck > CHECK_INTERVAL) {
          console.warn('No market data received recently');
          toast.warning("No market data received recently. Check your connection.");
          setLastConnectionCheck(now);
        }
      }
    };
    
    connectionMonitor = setInterval(checkConnection, CHECK_INTERVAL);
    
    return () => {
      if (connectionMonitor) {
        clearInterval(connectionMonitor);
      }
    };
  }, [lastMessageTime, readyState, lastConnectionCheck]);

  // Event handlers - stable references
  const handleSymbolSelect = useCallback((symbol: string) => {
    if (symbol !== selectedSymbol) {
      console.log('Changing symbol from', selectedSymbol, 'to', symbol);
      setSelectedSymbol(symbol);
    }
  }, [selectedSymbol]);

  const handleTimeframeChange = useCallback((timeframe: string) => {
    const now = Date.now();
    if (timeframe !== selectedTimeframe && now - lastTimeframeChange > 1000) {
      console.log(`Changing timeframe from ${selectedTimeframe} to ${timeframe}`);
      setSelectedTimeframe(timeframe);
      setLastTimeframeChange(now);
    }
  }, [selectedTimeframe, lastTimeframeChange]);

  const handleChartTypeChange = useCallback((type: ChartType) => {
    if (type !== chartType) {
      console.log('Changing chart type from', chartType, 'to', type);
      setChartType(type);
    }
  }, [chartType]);

  const isLoading = isInitializing || isLoadingChart;
  const latestPrice = prices[selectedSymbol];

  // Memoize the new candle display data
  const newCandleDisplay = useMemo(() => {
    const symbolEvents = newCandleEvents[selectedSymbol];
    if (!symbolEvents) return null;
    
    return Object.entries(symbolEvents).slice(-3).map(([timeframe, timestamp]) => ({
      timeframe,
      timestamp,
      time: new Date(timestamp * 1000).toLocaleTimeString()
    }));
  }, [newCandleEvents, selectedSymbol]);

  return (
    <div className="flex flex-col h-full">
      <TradingHeader
        connectionStatus={connectionStatus}
        readyState={readyState}
        symbols={symbols}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={handleSymbolSelect}
      />

      <PriceTicker
        prices={prices}
        onSymbolSelect={handleSymbolSelect}
        selectedSymbol={selectedSymbol}
      />

      <ChartToolbar
        chartType={chartType}
        onChartTypeChange={handleChartTypeChange}
        timeframe={selectedTimeframe}
        timeframes={timeframes}
        onTimeframeChange={handleTimeframeChange}
      />

      <ChartContainer
        isLoading={isLoading}
        candles={candles}
        symbol={selectedSymbol}
        timeframe={selectedTimeframe}
        chartType={chartType}
        latestPrice={latestPrice}
        updateLatestPrice={updateLatestPrice}
      />

      {/* New Candle Notification Display */}
      {newCandleDisplay && newCandleDisplay.length > 0 && (
        <div className="absolute top-16 right-4 z-20 bg-primary/10 backdrop-blur-sm border border-primary/20 rounded-lg p-3 max-w-64">
          <div className="text-xs font-medium text-primary mb-2">Recent New Candles ({selectedSymbol})</div>
          <div className="space-y-1">
            {newCandleDisplay.map(({ timeframe, time }) => (
              <div key={timeframe} className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">{timeframe}:</span>
                <span className="font-mono text-foreground">{time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingPlatform;

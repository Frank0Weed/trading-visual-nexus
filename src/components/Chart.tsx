
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { createChart, CrosshairMode, IChartApi, ISeriesApi, Time, CandlestickData, HistogramData, LineData, LineStyle, PriceScaleMode, MouseEventParams } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { CandleData } from '@/services/apiService';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import { useChartPerformance } from '@/hooks/useChartPerformance';

export type ChartType = 'candlestick' | 'line' | 'bar' | 'area';

interface ChartProps {
  data: CandlestickData<Time>[] | LineData<Time>[];
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  height?: number;
  width?: string | number;
  className?: string;
  onVisibleTimeRangeChange?: (range: {
    from: number;
    to: number;
  }) => void;
}

interface HoverData {
  time: Time | null;
  price: number | null;
  ohlc: {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  } | null;
}

const Chart: React.FC<ChartProps> = React.memo(({
  data,
  symbol,
  timeframe,
  chartType,
  height = 500,
  width = '100%',
  className,
  onVisibleTimeRangeChange
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Bar"> | ISeriesApi<"Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLineRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [hoverData, setHoverData] = useState<HoverData>({
    time: null,
    price: null,
    ohlc: null
  });

  // Use performance optimization hook
  const { throttledUpdate, compressDataForVisualization, cleanup } = useChartPerformance({
    maxDataPoints: 1000,
    updateThrottleMs: 100,
    enableVirtualization: true
  });

  // Memoize chart options to prevent unnecessary recreations
  const chartOptions = useMemo(() => ({
    width: typeof width === 'string' ? 0 : width,
    height: height,
    layout: {
      background: { color: '#131722' },
      textColor: '#d1d4dc'
    },
    grid: {
      vertLines: { color: '#242731' },
      horzLines: { color: '#242731' }
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        width: 1 as const,
        color: '#aaa',
        style: LineStyle.Solid,
        labelBackgroundColor: '#5d606b'
      },
      horzLine: {
        width: 1 as const,
        color: '#aaa',
        style: LineStyle.Solid,
        labelBackgroundColor: '#5d606b'
      }
    },
    rightPriceScale: {
      borderColor: '#242731',
      mode: PriceScaleMode.Normal
    },
    timeScale: {
      borderColor: '#242731',
      timeVisible: true,
      secondsVisible: false
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: true
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true
    }
  }), [height, width]);

  // Memoize volume data formatting
  const volumeData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((candle: any) => {
      const color = candle.close >= candle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)';
      return {
        time: candle.time,
        value: candle.customValues?.volume || candle.customValues?.tick_volume || 0,
        color
      };
    });
  }, [data]);

  // Optimize zoom functions with useCallback
  const handleZoomIn = useCallback(() => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const visibleLogicalRange = timeScale.getVisibleLogicalRange();
    if (visibleLogicalRange !== null) {
      const newRange = {
        from: visibleLogicalRange.from + (visibleLogicalRange.to - visibleLogicalRange.from) * 0.25,
        to: visibleLogicalRange.to - (visibleLogicalRange.to - visibleLogicalRange.from) * 0.25
      };
      timeScale.setVisibleLogicalRange(newRange);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const visibleLogicalRange = timeScale.getVisibleLogicalRange();
    if (visibleLogicalRange !== null) {
      const rangeSize = visibleLogicalRange.to - visibleLogicalRange.from;
      const newRange = {
        from: visibleLogicalRange.from - rangeSize * 0.25,
        to: visibleLogicalRange.to + rangeSize * 0.25
      };
      timeScale.setVisibleLogicalRange(newRange);
    }
  }, []);

  // Optimize candle finding with useMemo
  const candleMap = useMemo(() => {
    if (!data) return new Map();
    const map = new Map();
    data.forEach(candle => {
      map.set((candle as any).time, candle);
    });
    return map;
  }, [data]);

  const findCandleByTime = useCallback((time: Time): CandlestickData<Time> | LineData<Time> | null => {
    return candleMap.get(time) || null;
  }, [candleMap]);

  // Optimize price line updates
  const updatePriceLine = useCallback((price: number) => {
    if (!seriesRef.current) return;
    
    // Remove old price line if exists
    if (priceLineRef.current) {
      seriesRef.current.removePriceLine(priceLineRef.current);
    }

    // Create new price line
    priceLineRef.current = seriesRef.current.createPriceLine({
      price: price,
      color: '#2196F3',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Current'
    });
  }, []);

  // Set up live price line with performance optimization
  useEffect(() => {
    if (!data || data.length === 0 || !seriesRef.current) return;

    const lastCandle = data[data.length - 1];
    const price = 'close' in lastCandle ? lastCandle.close : lastCandle.value;
    setCurrentPrice(price);
    
    // Throttle price line updates
    const timeoutId = setTimeout(() => {
      updatePriceLine(price);
    }, 50);
    
    return () => {
      clearTimeout(timeoutId);
      if (seriesRef.current && priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
      }
    };
  }, [data, isInitialized, updatePriceLine]);

  // Initialize chart with performance optimizations
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth
        });
      }
    };

    // Create chart with optimized options
    const chart = createChart(chartContainerRef.current, {
      ...chartOptions,
      width: chartContainerRef.current.clientWidth
    });

    let series;

    // Create series based on chart type with performance settings
    if (chartType === 'candlestick') {
      series = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350'
      });
    } else if (chartType === 'line') {
      series = chart.addLineSeries({
        color: '#2962FF',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4
      });
    } else if (chartType === 'bar') {
      series = chart.addBarSeries({
        upColor: '#26a69a',
        downColor: '#ef5350'
      });
    } else if (chartType === 'area') {
      series = chart.addAreaSeries({
        topColor: 'rgba(41, 98, 255, 0.28)',
        bottomColor: 'rgba(41, 98, 255, 0.05)',
        lineColor: '#2962FF',
        lineWidth: 2
      });
    }

    // Add volume histogram with optimization
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: true,
      autoScale: true
    });

    // Set data with performance optimization
    if (data && data.length > 0) {
      const optimizedData = compressDataForVisualization(data, 1000);
      
      if (chartType === 'candlestick' || chartType === 'bar') {
        series?.setData(optimizedData as CandlestickData<Time>[]);
      } else {
        series?.setData(optimizedData as LineData<Time>[]);
      }
      
      if (volumeData.length > 0) {
        const optimizedVolumeData = compressDataForVisualization(volumeData, 1000);
        volumeSeries.setData(optimizedVolumeData as HistogramData<Time>[]);
      }
    }

    seriesRef.current = series || null;
    volumeSeriesRef.current = volumeSeries;
    chartRef.current = chart;

    // Optimize crosshair move handler
    let crosshairMoveTimeout: NodeJS.Timeout;
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      clearTimeout(crosshairMoveTimeout);
      crosshairMoveTimeout = setTimeout(() => {
        if (param.point === undefined || !param.time || 
            param.point.x < 0 || param.point.x > chartContainerRef.current!.clientWidth || 
            param.point.y < 0 || param.point.y > chartContainerRef.current!.clientHeight) {
          setHoverData({ time: null, price: null, ohlc: null });
          return;
        }
        
        const candle = findCandleByTime(param.time);
        let ohlcData = null;
        
        if (candle && 'open' in candle) {
          const candleWithOHLC = candle as CandlestickData<Time>;
          ohlcData = {
            open: candleWithOHLC.open,
            high: candleWithOHLC.high,
            low: candleWithOHLC.low,
            close: candleWithOHLC.close,
            volume: 'volume' in candleWithOHLC ? candleWithOHLC.volume : undefined
          };
        } else if (candle && 'value' in candle) {
          ohlcData = { close: (candle as LineData<Time>).value };
        }

        const price = candle ? 'close' in candle ? candle.close : 'value' in candle ? candle.value : null : null;
        setHoverData({ time: param.time, price: price, ohlc: ohlcData });
      }, 16); // ~60fps
    });

    // Set up resize observer
    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(chartContainerRef.current);

    // Set up time range change callback
    if (onVisibleTimeRangeChange) {
      chart.timeScale().subscribeVisibleTimeRangeChange(range => {
        if (range) {
          onVisibleTimeRangeChange({
            from: range.from as number,
            to: range.to as number
          });
        }
      });
    }

    setIsInitialized(true);

    return () => {
      clearTimeout(crosshairMoveTimeout);
      cleanup();
      if (resizeObserverRef.current && chartContainerRef.current) {
        resizeObserverRef.current.unobserve(chartContainerRef.current);
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [chartType, height, chartOptions, compressDataForVisualization, findCandleByTime, onVisibleTimeRangeChange, cleanup]);

  // Optimize data updates with throttling
  useEffect(() => {
    if (!isInitialized || !seriesRef.current || !volumeSeriesRef.current || !data || data.length === 0) return;
    
    throttledUpdate([...data], (optimizedData) => {
      if (chartType === 'candlestick' || chartType === 'bar') {
        seriesRef.current?.setData(optimizedData as CandlestickData<Time>[]);
      } else {
        seriesRef.current?.setData(optimizedData as LineData<Time>[]);
      }
      
      if (volumeData && volumeData.length > 0) {
        const optimizedVolumeData = compressDataForVisualization(volumeData, 1000);
        volumeSeriesRef.current?.setData(optimizedVolumeData as HistogramData<Time>[]);
      }
    });
  }, [data, isInitialized, chartType, throttledUpdate, volumeData, compressDataForVisualization]);

  // Format timestamp for display
  const formatTime = useCallback((timestamp: Time | null): string => {
    if (!timestamp) return '';
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  }, []);

  return (
    <div className={cn('chart-container relative', className)} style={{ width, height }}>
      {/* Symbol and timeframe badges */}
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <div className="bg-sidebar-primary text-sidebar-primary-foreground text-xs py-1 px-2 rounded-md font-medium">
          {symbol}
        </div>
        <div className="bg-sidebar-accent text-sidebar-accent-foreground text-xs py-1 px-2 rounded-md font-medium">
          {timeframe}
        </div>
      </div>
      
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8 bg-sidebar-secondary bg-opacity-80 hover:bg-sidebar-accent transition-colors" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 bg-sidebar-secondary bg-opacity-80 hover:bg-sidebar-accent transition-colors" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
      
      {currentPrice && (
        <div className="absolute top-2 right-20 z-10">
          <div className="bg-primary text-primary-foreground text-sm py-1 px-3 font-medium rounded-full">
            {currentPrice.toFixed(2)}
          </div>
        </div>
      )}
      
      {hoverData.time && hoverData.ohlc && (
        <div className="absolute top-12 right-2 z-10 bg-trading-bg-dark bg-opacity-95 p-4 rounded-md border border-border shadow-lg max-w-64">
          <div className="font-medium pb-1 border-b border-border mb-3 text-xs text-primary">
            {formatTime(hoverData.time)}
          </div>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
            <div className="text-muted-foreground text-xs">Open</div>
            <div className="font-mono text-sm text-right text-foreground">{hoverData.ohlc.open?.toFixed(2)}</div>
            
            <div className="text-muted-foreground text-xs">High</div>
            <div className="font-mono text-sm text-right text-trading-up">{hoverData.ohlc.high?.toFixed(2)}</div>
            
            <div className="text-muted-foreground text-xs">Low</div>
            <div className="font-mono text-sm text-right text-trading-down">{hoverData.ohlc.low?.toFixed(2)}</div>
            
            <div className="text-muted-foreground text-xs">Close</div>
            <div className="font-mono text-sm text-right text-foreground font-medium">{hoverData.ohlc.close?.toFixed(2)}</div>
            
            {hoverData.ohlc.volume !== undefined && (
              <>
                <div className="text-muted-foreground text-xs">Volume</div>
                <div className="font-mono text-sm text-right">{Number(hoverData.ohlc.volume).toLocaleString()}</div>
              </>
            )}
          </div>
        </div>
      )}
      
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
});

Chart.displayName = 'Chart';

export default Chart;

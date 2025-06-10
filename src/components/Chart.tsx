
import React, { useRef, useEffect, useState } from 'react';
import { createChart, CrosshairMode, IChartApi, ISeriesApi, Time, CandlestickData, HistogramData, LineData, LineStyle, PriceScaleMode, MouseEventParams } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { CandleData } from '@/services/apiService';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';

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

const Chart: React.FC<ChartProps> = ({
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

  // Format volume data
  const formatVolumeData = () => {
    if (!data || data.length === 0) return [];
    return data.map((candle: any) => {
      const color = candle.close >= candle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)';
      return {
        time: candle.time,
        value: candle.volume || 0,
        color
      };
    });
  };

  // Handle zoom in
  const handleZoomIn = () => {
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
  };

  // Handle zoom out
  const handleZoomOut = () => {
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
  };

  // Find candle data by time
  const findCandleByTime = (time: Time): CandlestickData<Time> | LineData<Time> | null => {
    if (!data || !time) return null;
    return data.find(candle => (candle as any).time === time) || null;
  };

  // Set up live price line
  useEffect(() => {
    if (!data || data.length === 0 || !seriesRef.current) return;

    // Get the latest price
    const lastCandle = data[data.length - 1];
    const price = 'close' in lastCandle ? lastCandle.close : lastCandle.value;
    setCurrentPrice(price);
    
    if (seriesRef.current) {
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
    }
    
    return () => {
      if (seriesRef.current && priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
      }
    };
  }, [data, isInitialized]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth
        });
      }
    };

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: {
          color: '#131722'
        },
        textColor: '#d1d4dc'
      },
      grid: {
        vertLines: {
          color: '#242731'
        },
        horzLines: {
          color: '#242731'
        }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: '#aaa',
          style: LineStyle.Solid,
          labelBackgroundColor: '#5d606b'
        },
        horzLine: {
          width: 1,
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
    });

    let series;

    // Create series based on chart type
    if (chartType === 'candlestick') {
      series = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350'
      });
      series.setData(data as CandlestickData<Time>[]);
    } else if (chartType === 'line') {
      series = chart.addLineSeries({
        color: '#2962FF',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4
      });
      series.setData(data as LineData<Time>[]);
    } else if (chartType === 'bar') {
      series = chart.addBarSeries({
        upColor: '#26a69a',
        downColor: '#ef5350'
      });
      series.setData(data as CandlestickData<Time>[]);
    } else if (chartType === 'area') {
      series = chart.addAreaSeries({
        topColor: 'rgba(41, 98, 255, 0.28)',
        bottomColor: 'rgba(41, 98, 255, 0.05)',
        lineColor: '#2962FF',
        lineWidth: 2
      });
      series.setData(data as LineData<Time>[]);
    }

    // Add volume histogram
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume'
      },
      priceScaleId: ''
    });

    // Configure the price scale for the volume series separately
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0
      },
      visible: true,
      autoScale: true
    });

    // Only set volume data if we have data
    if (data && data.length > 0) {
      const formattedVolumeData = formatVolumeData();
      if (formattedVolumeData.length > 0) {
        volumeSeries.setData(formattedVolumeData as HistogramData<Time>[]);
      }
    }

    seriesRef.current = series || null;
    volumeSeriesRef.current = volumeSeries;
    chartRef.current = chart;

    // Set up mouse move handler for data window
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (param.point === undefined || !param.time || param.point.x < 0 || param.point.x > chartContainerRef.current!.clientWidth || param.point.y < 0 || param.point.y > chartContainerRef.current!.clientHeight) {
        // Mouse is outside the chart
        setHoverData({
          time: null,
          price: null,
          ohlc: null
        });
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
        ohlcData = {
          close: (candle as LineData<Time>).value
        };
      }

      const price = candle ? 'close' in candle ? candle.close : 'value' in candle ? candle.value : null : null;
      setHoverData({
        time: param.time,
        price: price,
        ohlc: ohlcData
      });
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
      if (resizeObserverRef.current && chartContainerRef.current) {
        resizeObserverRef.current.unobserve(chartContainerRef.current);
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [chartType, height, data]);

  // Update data when it changes
  useEffect(() => {
    if (!isInitialized || !seriesRef.current || !volumeSeriesRef.current || !data || data.length === 0) return;
    
    if (chartType === 'candlestick' || chartType === 'bar') {
      seriesRef.current.setData(data as CandlestickData<Time>[]);
    } else {
      seriesRef.current.setData(data as LineData<Time>[]);
    }
    
    const volumeData = formatVolumeData();
    if (volumeData && volumeData.length > 0) {
      volumeSeriesRef.current.setData(volumeData as HistogramData<Time>[]);
    }
  }, [data, isInitialized, chartType]);

  // Format timestamp for display
  const formatTime = (timestamp: Time | null): string => {
    if (!timestamp) return '';
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

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
      
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8 bg-sidebar-secondary bg-opacity-80 hover:bg-sidebar-accent transition-colors" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 bg-sidebar-secondary bg-opacity-80 hover:bg-sidebar-accent transition-colors" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Current price display */}
      {currentPrice && (
        <div className="absolute top-2 right-20 z-10">
          <div className="bg-primary text-primary-foreground text-sm py-1 px-3 font-medium rounded-full">
            {currentPrice.toFixed(2)}
          </div>
        </div>
      )}
      
      {/* Data window - show OHLC values on hover */}
      {hoverData.time && hoverData.ohlc && (
        <div className="absolute top-12 right-2 z-10 bg-trading-bg-dark bg-opacity-95 p-4 rounded-md border border-border shadow-lg max-w-64">
          <div className="font-medium pb-1 border-b border-border mb-3 text-xs text-primary">
            {formatTime(hoverData.time)}
          </div>
          
          {/* OHLC data */}
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
};

export default Chart;

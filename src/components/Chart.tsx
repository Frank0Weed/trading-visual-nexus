
import React, { useRef, useEffect, useState } from 'react';
import { createChart, CrosshairMode, IChartApi, ISeriesApi, Time, CandlestickData, HistogramData, LineData } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { CandleData } from '@/services/apiService';

export type ChartType = 'candlestick' | 'line' | 'bar' | 'area';

interface ChartProps {
  data: CandlestickData<Time>[] | LineData<Time>[];
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  height?: number;
  width?: string | number;
  className?: string;
  onVisibleTimeRangeChange?: (range: { from: number; to: number }) => void;
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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);

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

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current?.clientWidth });
      }
    };

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#242731' },
        horzLines: { color: '#242731' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#242731',
      },
      timeScale: {
        borderColor: '#242731',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    let series;

    // Create series based on chart type
    if (chartType === 'candlestick') {
      series = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });
      series.setData(data as CandlestickData<Time>[]);
    } else if (chartType === 'line') {
      series = chart.addLineSeries({
        color: '#2962FF',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      series.setData(data as LineData<Time>[]);
    } else if (chartType === 'bar') {
      series = chart.addBarSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
      });
      series.setData(data as CandlestickData<Time>[]);
    } else if (chartType === 'area') {
      series = chart.addAreaSeries({
        topColor: 'rgba(41, 98, 255, 0.28)',
        bottomColor: 'rgba(41, 98, 255, 0.05)',
        lineColor: '#2962FF',
        lineWidth: 2,
      });
      series.setData(data as LineData<Time>[]);
    }

    // Add volume histogram
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    
    // Configure the price scale for the volume series separately
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8, // Volume appears at the bottom 20% of the chart
        bottom: 0,
      },
    });
    
    volumeSeries.setData(formatVolumeData() as HistogramData<Time>[]);

    seriesRef.current = series || null;
    volumeSeriesRef.current = volumeSeries;
    chartRef.current = chart;
    
    // Set up resize observer
    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(chartContainerRef.current);

    // Set up time range change callback
    if (onVisibleTimeRangeChange) {
      chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (range) {
          onVisibleTimeRangeChange({
            from: range.from as number,
            to: range.to as number,
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
    if (!isInitialized || !seriesRef.current || !volumeSeriesRef.current || !data.length) return;

    if (chartType === 'candlestick' || chartType === 'bar') {
      seriesRef.current.setData(data as CandlestickData<Time>[]);
    } else {
      seriesRef.current.setData(data as LineData<Time>[]);
    }

    volumeSeriesRef.current.setData(formatVolumeData() as HistogramData<Time>[]);
  }, [data, isInitialized, chartType]);

  return (
    <div
      className={cn('chart-container relative', className)}
      style={{ width, height }}
    >
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <div className="bg-trading-bg-dark bg-opacity-70 text-sm py-1 px-2 rounded">
          {symbol}
        </div>
        <div className="bg-trading-bg-dark bg-opacity-70 text-sm py-1 px-2 rounded">
          {timeframe}
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};

export default Chart;

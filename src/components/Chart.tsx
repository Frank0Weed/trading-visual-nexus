
import React, { useRef, useEffect, useState } from 'react';
import { 
  createChart, 
  CrosshairMode, 
  IChartApi, 
  ISeriesApi, 
  Time, 
  CandlestickData, 
  HistogramData, 
  LineData,
  LineStyle
} from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { CandleData } from '@/services/apiService';
import availableIndicators, { Indicator } from '@/utils/indicators';

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
  activeIndicators?: string[]; // Array of indicator IDs to display
}

const Chart: React.FC<ChartProps> = ({
  data,
  symbol,
  timeframe,
  chartType,
  height = 500,
  width = '100%',
  className,
  onVisibleTimeRangeChange,
  activeIndicators = []
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Bar"> | ISeriesApi<"Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRef = useRef<Record<string, any>>({});
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [indicators, setIndicators] = useState<Record<string, any>>({});

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

  // Calculate indicators
  useEffect(() => {
    if (!data || data.length === 0) return;

    // Calculate indicators
    const calculatedIndicators: Record<string, any> = {};
    
    for (const indicatorId of activeIndicators) {
      const indicator = availableIndicators[indicatorId];
      if (indicator) {
        calculatedIndicators[indicatorId] = indicator.calculate(data as CandlestickData<Time>[]);
      }
    }

    setIndicators(calculatedIndicators);
  }, [data, activeIndicators]);

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

  // Update indicator visualizations
  useEffect(() => {
    if (!isInitialized || !chartRef.current || !indicators) return;

    // Clear existing indicator series
    Object.values(indicatorSeriesRef.current).forEach(series => {
      if (series && typeof series.remove === 'function') {
        series.remove();
      }
    });
    
    indicatorSeriesRef.current = {};

    // Add indicator series
    for (const indicatorId of activeIndicators) {
      const indicator = availableIndicators[indicatorId];
      const indicatorData = indicators[indicatorId];
      
      if (!indicator || !indicatorData) continue;

      if (indicator.display === 'main') {
        // Add overlay indicators on main chart
        if (indicatorId === 'sma' || indicatorId === 'ema') {
          const lineSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#2962FF',
            lineWidth: 2,
            title: indicator.name,
          });
          
          const lineData = indicatorData.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          lineSeries.setData(lineData);
          indicatorSeriesRef.current[indicatorId] = lineSeries;
        } else if (indicatorId === 'bollingerBands') {
          // Add upper band
          const upperSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#7E57C2',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: `${indicator.name} Upper`,
          });
          
          const upperData = indicatorData.upper.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          upperSeries.setData(upperData);
          indicatorSeriesRef.current[`${indicatorId}_upper`] = upperSeries;
          
          // Add middle band
          const middleSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#7E57C2',
            lineWidth: 1,
            title: `${indicator.name} Middle`,
          });
          
          const middleData = indicatorData.middle.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          middleSeries.setData(middleData);
          indicatorSeriesRef.current[`${indicatorId}_middle`] = middleSeries;
          
          // Add lower band
          const lowerSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#7E57C2',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: `${indicator.name} Lower`,
          });
          
          const lowerData = indicatorData.lower.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          lowerSeries.setData(lowerData);
          indicatorSeriesRef.current[`${indicatorId}_lower`] = lowerSeries;
        }
      } else {
        // Add secondary indicators in separate panes
        if (indicatorId === 'macd') {
          // MACD Line
          const macdSeries = chartRef.current.addHistogramSeries({
            color: '#2962FF',
            priceScaleId: 'macd',
            priceFormat: {
              type: 'price',
              precision: 4,
            },
            title: 'MACD'
          });
          
          macdSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.7, 
              bottom: 0.3,
            },
            drawTicks: false,
          });
          
          const macdData = indicatorData.macd.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value,
            color: value >= 0 ? '#26a69a' : '#ef5350'
          }));
          
          macdSeries.setData(macdData);
          indicatorSeriesRef.current[`${indicatorId}_line`] = macdSeries;
          
          // Signal Line
          const signalSeries = chartRef.current.addLineSeries({
            color: '#FF6B6B',
            lineWidth: 1,
            priceScaleId: 'macd',
            title: 'Signal'
          });
          
          const signalData = indicatorData.signal.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          signalSeries.setData(signalData);
          indicatorSeriesRef.current[`${indicatorId}_signal`] = signalSeries;
          
          // Histogram
          const histogramSeries = chartRef.current.addHistogramSeries({
            priceScaleId: 'macd_histogram',
            priceFormat: {
              type: 'price',
              precision: 4,
            },
            title: 'Histogram'
          });
          
          histogramSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.2, 
              bottom: 0,
            },
            drawTicks: false,
          });
          
          const histogramData = indicatorData.histogram.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value,
            color: value >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
          }));
          
          histogramSeries.setData(histogramData);
          indicatorSeriesRef.current[`${indicatorId}_histogram`] = histogramSeries;
        } else if (indicatorId === 'rsi') {
          const rsiSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#6B8E23',
            lineWidth: 2,
            priceScaleId: 'rsi',
            title: 'RSI'
          });
          
          rsiSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.1, 
              bottom: 0.1,
            },
            minValue: 0,
            maxValue: 100,
          });
          
          const rsiData = indicatorData.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          rsiSeries.setData(rsiData);
          indicatorSeriesRef.current[indicatorId] = rsiSeries;
          
          // Add overbought/oversold lines
          const overboughtSeries = chartRef.current.addLineSeries({
            color: 'rgba(255, 107, 107, 0.5)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceScaleId: 'rsi',
            title: 'Overbought'
          });
          
          const oversoldSeries = chartRef.current.addLineSeries({
            color: 'rgba(38, 166, 154, 0.5)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceScaleId: 'rsi',
            title: 'Oversold'
          });
          
          const overboughtData = data.map((candle: any) => ({
            time: candle.time,
            value: 70
          }));
          
          const oversoldData = data.map((candle: any) => ({
            time: candle.time,
            value: 30
          }));
          
          overboughtSeries.setData(overboughtData);
          oversoldSeries.setData(oversoldData);
          
          indicatorSeriesRef.current[`${indicatorId}_overbought`] = overboughtSeries;
          indicatorSeriesRef.current[`${indicatorId}_oversold`] = oversoldSeries;
        } else if (indicatorId === 'adx') {
          // ADX Line
          const adxSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#B05B3B',
            lineWidth: 2,
            priceScaleId: 'adx',
            title: 'ADX'
          });
          
          adxSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.1, 
              bottom: 0.3,
            },
            minValue: 0,
            maxValue: 100,
          });
          
          const adxData = indicatorData.adx.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          adxSeries.setData(adxData);
          indicatorSeriesRef.current[`${indicatorId}_adx`] = adxSeries;
          
          // +DI Line
          const plusDISeries = chartRef.current.addLineSeries({
            color: '#26a69a',
            lineWidth: 1,
            priceScaleId: 'adx',
            title: '+DI'
          });
          
          const plusDIData = indicatorData.plusDI.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          plusDISeries.setData(plusDIData);
          indicatorSeriesRef.current[`${indicatorId}_plusDI`] = plusDISeries;
          
          // -DI Line
          const minusDISeries = chartRef.current.addLineSeries({
            color: '#ef5350',
            lineWidth: 1,
            priceScaleId: 'adx',
            title: '-DI'
          });
          
          const minusDIData = indicatorData.minusDI.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          minusDISeries.setData(minusDIData);
          indicatorSeriesRef.current[`${indicatorId}_minusDI`] = minusDISeries;
        }
      }
    }
  }, [indicators, activeIndicators, isInitialized, data]);

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

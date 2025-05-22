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
  LineStyle,
  PriceScaleMode,
  MouseEventParams
} from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { CandleData } from '@/services/apiService';
import availableIndicators, { Indicator } from '@/utils/indicators';
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
  onVisibleTimeRangeChange?: (range: { from: number; to: number }) => void;
  activeIndicators?: string[]; // Array of indicator IDs to display
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
  indicatorValues: Record<string, any>;
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
  const priceLineRef = useRef<any>(null);
  const indicatorSeriesRef = useRef<Record<string, ISeriesApi<any>>>({});
  const trendlineSeriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isDrawingModeEnabled, setIsDrawingModeEnabled] = useState(false);
  const [trendlines, setTrendlines] = useState<Array<{id: string, point1: {time: Time, price: number}, point2: {time: Time, price: number}}>>([]);
  const [currentTrendlinePoints, setCurrentTrendlinePoints] = useState<Array<{time: Time, price: number}>>([]);
  const [indicators, setIndicators] = useState<Record<string, any>>({});
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [hoverData, setHoverData] = useState<HoverData>({
    time: null,
    price: null,
    ohlc: null,
    indicatorValues: {}
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

  const toggleDrawingMode = () => {
    setIsDrawingModeEnabled(prev => !prev);
    setCurrentTrendlinePoints([]); // Reset current points when toggling mode
    if (chartRef.current) {
      // Disable crosshair when drawing mode is active, enable when inactive
      // Also, disable normal click-to-zoom behavior if drawing.
      chartRef.current.applyOptions({
        crosshair: {
          mode: !isDrawingModeEnabled ? CrosshairMode.Normal : CrosshairMode.Hidden,
        },
        handleScroll: {
            mouseWheel: !isDrawingModeEnabled,
            pressedMouseMove: !isDrawingModeEnabled,
            horzTouchDrag: !isDrawingModeEnabled,
            vertTouchDrag: !isDrawingModeEnabled,
        },
        handleScale: {
            mouseWheel: !isDrawingModeEnabled,
            pinch: !isDrawingModeEnabled,
            axisPressedMouseMove: !isDrawingModeEnabled,
        }
      });
    }
  };

  // Find candle data by time
  const findCandleByTime = (time: Time): CandlestickData<Time> | LineData<Time> | null => {
    if (!data || !time) return null;
    return data.find(candle => (candle as any).time === time) || null;
  };

  // Get indicator values at specific time
  const getIndicatorValuesAtTime = (time: Time): Record<string, any> => {
    const result: Record<string, any> = {};
    
    if (!time || !indicators || !data || data.length === 0) return result;
    
    Object.entries(indicators).forEach(([indicatorId, indicatorData]) => {
      const indicator = availableIndicators[indicatorId];
      if (!indicator || !indicatorData) return;
      
      // Find index of the data point with the specific time
      const index = data.findIndex(candle => 
        candle && (candle as any).time === time
      );
      if (index === -1) return;
      
      // For different indicator types
      if (indicatorId === 'rsi' && Array.isArray(indicatorData) && index < indicatorData.length) {
        result[indicatorId] = {
          name: 'RSI',
          value: indicatorData[index]
        };
      } else if (indicatorId === 'macd' && indicatorData.macd && indicatorData.signal && 
                 indicatorData.histogram && index < indicatorData.macd.length &&
                 index < indicatorData.signal.length && index < indicatorData.histogram.length) {
        result[indicatorId] = {
          name: 'MACD',
          macd: indicatorData.macd[index],
          signal: indicatorData.signal[index],
          histogram: indicatorData.histogram[index]
        };
      } else if (indicatorId === 'bbands' && indicatorData.upper && indicatorData.middle && 
                 indicatorData.lower && index < indicatorData.upper.length &&
                 index < indicatorData.middle.length && index < indicatorData.lower.length) {
        result[indicatorId] = {
          name: 'Bollinger Bands',
          upper: indicatorData.upper[index],
          middle: indicatorData.middle[index],
          lower: indicatorData.lower[index]
        };
      } else if (indicatorId === 'adx' && indicatorData.adx && indicatorData.plusDI && 
                 indicatorData.minusDI && index < indicatorData.adx.length &&
                 index < indicatorData.plusDI.length && index < indicatorData.minusDI.length) {
        result[indicatorId] = {
          name: 'ADX',
          adx: indicatorData.adx[index],
          plusDI: indicatorData.plusDI[index],
          minusDI: indicatorData.minusDI[index]
        };
      } else if (indicatorId === 'sma' && Array.isArray(indicatorData) && index < indicatorData.length) {
        result[indicatorId] = {
          name: 'SMA',
          value: indicatorData[index]
        };
      } else if (indicatorId === 'ema' && Array.isArray(indicatorData) && index < indicatorData.length) {
        result[indicatorId] = {
          name: 'EMA',
          value: indicatorData[index]
        };
      } else if (indicatorId === 'vwap' && Array.isArray(indicatorData) && index < indicatorData.length) {
        result[indicatorId] = {
          name: 'VWAP', // Make sure this matches the name in indicators.ts if needed, but this is for display
          value: indicatorData[index]
        };
      }
    });
    
    return result;
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
        title: 'Current',
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
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    // Create chart
    const chartOptions = {
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
        vertLine: {
          width: 1,
          color: '#aaa',
          style: LineStyle.Solid,
          labelBackgroundColor: '#5d606b',
        },
        horzLine: {
          width: 1,
          color: '#aaa',
          style: LineStyle.Solid,
          labelBackgroundColor: '#5d606b',
        },
      },
      rightPriceScale: {
        borderColor: '#242731',
        mode: PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: '#242731',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { // Initial state, can be overridden by toggleDrawingMode
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      handleScroll: { // Initial state, can be overridden by toggleDrawingMode
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    };

    const chart = createChart(chartContainerRef.current, chartOptions);
    chartRef.current = chart; // Assign to ref early

    // Apply drawing mode options if active on init
    if (isDrawingModeEnabled) {
        chart.applyOptions({
            crosshair: {
                mode: CrosshairMode.Hidden,
            },
            handleScroll: {
                mouseWheel: false,
                pressedMouseMove: false,
                horzTouchDrag: false,
                vertTouchDrag: false,
            },
            handleScale: {
                mouseWheel: false,
                pinch: false,
                axisPressedMouseMove: false,
            }
        });
    }


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
    
    // Only set volume data if we have data
    if (data && data.length > 0) {
      const formattedVolumeData = formatVolumeData();
      if (formattedVolumeData.length > 0) {
        volumeSeries.setData(formattedVolumeData as HistogramData<Time>[]);
      }
    }

    seriesRef.current = series || null;
    volumeSeriesRef.current = volumeSeries;
    // chartRef.current = chart; // Moved up
    
    // Set up mouse move handler for data window
    if (!isDrawingModeEnabled) { // Only subscribe if not in drawing mode
      chart.subscribeCrosshairMove((param: MouseEventParams) => {
        if (
          param.point === undefined ||
          !param.time ||
          param.point.x < 0 ||
          param.point.x > chartContainerRef.current!.clientWidth ||
          param.point.y < 0 ||
          param.point.y > chartContainerRef.current!.clientHeight
        ) {
          // Mouse is outside the chart
          setHoverData({
            time: null,
            price: null,
            ohlc: null,
            indicatorValues: {}
          });
          return;
        }

        const candle = findCandleByTime(param.time);
        const indicatorValues = getIndicatorValuesAtTime(param.time);
        
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

        // Fix: Use the candle's close/value instead of seriesPrices which doesn't exist
        const price = candle ? 
          ('close' in candle ? candle.close : ('value' in candle ? candle.value : null)) 
          : null;

        setHoverData({
          time: param.time,
          price: price,
          ohlc: ohlcData,
          indicatorValues
        });
      });
    }

    // Handle click for drawing trendlines
    chart.subscribeClick((param: MouseEventParams) => {
      if (!isDrawingModeEnabled || !param.time || param.point === undefined || !seriesRef.current) return;

      const price = seriesRef.current.coordinateToPrice(param.point.y);
      if (price === null) return;

      const time = param.time;

      setCurrentTrendlinePoints(prevPoints => {
        const newPoints = [...prevPoints, { time, price }];
        if (newPoints.length === 2) {
          const newTrendline = {
            id: Date.now().toString(),
            point1: newPoints[0],
            point2: newPoints[1],
          };
          setTrendlines(prevTrendlines => [...prevTrendlines, newTrendline]);
          return []; // Clear points for next trendline
        }
        return newPoints;
      });
    });
    
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

  // Update indicator visualizations
  useEffect(() => {
    if (!isInitialized || !chartRef.current || !indicators || !data || data.length === 0) return;

    // Clear existing indicator series
    Object.entries(indicatorSeriesRef.current).forEach(([id, series]) => {
      if (series && chartRef.current) {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) {
          console.warn(`Error removing indicator series ${id}:`, e);
        }
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
          
          // Create line data safely with null checks
          const lineData = indicatorData.map((value: number, index: number) => {
            if (index < data.length && data[index]) {
              return {
                time: (data[index] as any).time,
                value: value
              };
            }
            return null;
          }).filter(item => item !== null);
          
          lineSeries.setData(lineData);
          indicatorSeriesRef.current[indicatorId] = lineSeries;
        } else if (indicatorId === 'bbands' && indicatorData.upper && indicatorData.middle && indicatorData.lower) {
          // Add upper band
          const upperSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#7E57C2',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: `${indicator.name} Upper`,
          });
          
          // Create upper band data safely with null checks
          const upperData = indicatorData.upper.map((value: number, index: number) => {
            if (index < data.length && data[index]) {
              return {
                time: (data[index] as any).time,
                value: value
              };
            }
            return null;
          }).filter(item => item !== null);
          
          upperSeries.setData(upperData);
          indicatorSeriesRef.current[`${indicatorId}_upper`] = upperSeries;
          
          // Add middle band with similar safety checks
          const middleSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#7E57C2',
            lineWidth: 1,
            title: `${indicator.name} Middle`,
          });
          
          const middleData = indicatorData.middle.map((value: number, index: number) => {
            if (index < data.length && data[index]) {
              return {
                time: (data[index] as any).time,
                value: value
              };
            }
            return null;
          }).filter(item => item !== null);
          
          middleSeries.setData(middleData);
          indicatorSeriesRef.current[`${indicatorId}_middle`] = middleSeries;
          
          // Add lower band with similar safety checks
          const lowerSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#7E57C2',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: `${indicator.name} Lower`,
          });
          
          const lowerData = indicatorData.lower.map((value: number, index: number) => {
            if (index < data.length && data[index]) {
              return {
                time: (data[index] as any).time,
                value: value
              };
            }
            return null;
          }).filter(item => item !== null);
          
          lowerSeries.setData(lowerData);
          indicatorSeriesRef.current[`${indicatorId}_lower`] = lowerSeries;
        }
      } else {
        // Add secondary indicators in separate panes with similar safety checks for all data mappings
        if (indicatorId === 'macd' && indicatorData.macd && indicatorData.signal && indicatorData.histogram) {
          // MACD Line (using HistogramSeries for MACD line itself for potential coloring)
          const macdSeries = chartRef.current.addHistogramSeries({
            priceScaleId: 'macdPane', // Ensure a unique pane ID
            priceFormat: { type: 'price', precision: indicator.precision || 4 },
            title: 'MACD Line',
          });
          macdSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.7, bottom: 0.3 },
          });
          const macdLineData = indicatorData.macd.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value,
            color: value >= 0 ? 'rgba(38, 166, 154, 0.7)' : 'rgba(239, 83, 80, 0.7)', // Example coloring
          })).filter(d => d.time && d.value !== undefined);
          if (macdLineData.length > 0) macdSeries.setData(macdLineData);
          indicatorSeriesRef.current[`${indicatorId}_macdLine`] = macdSeries;
        
          // Signal Line
          const signalSeries = chartRef.current.addLineSeries({
            color: indicator.signalColor || '#FF6B6B',
            lineWidth: 1,
            priceScaleId: 'macdPane', // Same pane as MACD line
            title: 'Signal',
          });
          const signalData = indicatorData.signal.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value,
          })).filter(d => d.time && d.value !== undefined);
         if (signalData.length > 0) signalSeries.setData(signalData);
          indicatorSeriesRef.current[`${indicatorId}_signal`] = signalSeries;
        
          // Histogram
          const histogramSeries = chartRef.current.addHistogramSeries({
            priceScaleId: 'macdHistPane', // Separate pane for histogram if desired, or use 'macdPane'
            priceFormat: { type: 'price', precision: indicator.precision || 4 },
            title: 'MACD Hist',
          });
          histogramSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.2, bottom: 0 },
          });
          const histogramData = indicatorData.histogram.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value,
            color: value >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
          })).filter(d => d.time && d.value !== undefined);
          if (histogramData.length > 0) histogramSeries.setData(histogramData);
          indicatorSeriesRef.current[`${indicatorId}_histogram`] = histogramSeries;

        } else if (indicatorId === 'rsi' && Array.isArray(indicatorData)) {
          const rsiSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#6B8E23',
            lineWidth: 2,
            priceScaleId: 'rsiPane', // Unique pane ID
            title: 'RSI',
          });
          rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
          const rsiLineData = indicatorData.map((value: number, index: number) => ({
            time: (data[index]as any).time,
            value: value,
          })).filter(d => d.time && d.value !== undefined);
          if (rsiLineData.length > 0) rsiSeries.setData(rsiLineData);
          indicatorSeriesRef.current[indicatorId] = rsiSeries;
        
          // Overbought/Oversold lines for RSI
          const overboughtLevel = 70;
          const oversoldLevel = 30;
          const rsiTimeData = data.map(d => d.time).filter(t => t !== undefined);

          if (rsiTimeData.length > 0) {
            const overboughtSeries = chartRef.current.addLineSeries({
              color: 'rgba(255, 107, 107, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed,
              priceScaleId: 'rsiPane', title: 'Overbought',
              lastValueVisible: false, priceLineVisible: false,
            });
            overboughtSeries.setData(rsiTimeData.map(time => ({ time, value: overboughtLevel })));
            indicatorSeriesRef.current[`${indicatorId}_overbought`] = overboughtSeries;
      
            const oversoldSeries = chartRef.current.addLineSeries({
              color: 'rgba(38, 166, 154, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed,
              priceScaleId: 'rsiPane', title: 'Oversold',
              lastValueVisible: false, priceLineVisible: false,
            });
            oversoldSeries.setData(rsiTimeData.map(time => ({ time, value: oversoldLevel })));
            indicatorSeriesRef.current[`${indicatorId}_oversold`] = oversoldSeries;
          }

        } else if (indicatorId === 'adx' && indicatorData.adx && indicatorData.plusDI && indicatorData.minusDI) {
          const adxPaneId = 'adxPane'; // Unique pane ID
          // ADX Line
          const adxSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#B05B3B', lineWidth: 2, priceScaleId: adxPaneId, title: 'ADX',
          });
          adxSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.3 } });
          const adxLineData = indicatorData.adx.map((value: number, index: number) => ({
            time: (data[index] as any).time, value: value,
          })).filter(d => d.time && d.value !== undefined);
          if (adxLineData.length > 0) adxSeries.setData(adxLineData);
          indicatorSeriesRef.current[`${indicatorId}_adx`] = adxSeries;
        
          // +DI Line
          const plusDISeries = chartRef.current.addLineSeries({
            color: '#26a69a', lineWidth: 1, priceScaleId: adxPaneId, title: '+DI',
          });
          const plusDIData = indicatorData.plusDI.map((value: number, index: number) => ({
            time: (data[index] as any).time, value: value,
          })).filter(d => d.time && d.value !== undefined);
          if (plusDIData.length > 0) plusDISeries.setData(plusDIData);
          indicatorSeriesRef.current[`${indicatorId}_plusDI`] = plusDISeries;
        
          // -DI Line
          const minusDISeries = chartRef.current.addLineSeries({
            color: '#ef5350', lineWidth: 1, priceScaleId: adxPaneId, title: '-DI',
          });
          const minusDIData = indicatorData.minusDI.map((value: number, index: number) => ({
            time: (data[index] as any).time, value: value,
          })).filter(d => d.time && d.value !== undefined);
          if (minusDIData.length > 0) minusDISeries.setData(minusDIData);
          indicatorSeriesRef.current[`${indicatorId}_minusDI`] = minusDISeries;
        }
      }
    }
  }, [indicators, activeIndicators, isInitialized, data]); // Keep data dependency for recalculating indicator lines

  // Render trendlines
  useEffect(() => {
    if (!isInitialized || !chartRef.current) return;

    // Clear existing trendline series
    Object.entries(trendlineSeriesRef.current).forEach(([id, series]) => {
      if (series && chartRef.current) {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) {
          console.warn(`Error removing trendline series ${id}:`, e);
        }
      }
    });
    trendlineSeriesRef.current = {};

    // Draw trendlines
    trendlines.forEach(trendline => {
      if (trendline.point1 && trendline.point2 && chartRef.current) {
        const lineSeries = chartRef.current.addLineSeries({
          lineWidth: 2,
          color: 'yellow', // Or make this configurable
          priceScaleId: '', // Main price scale
          lastValueVisible: false, // No need for labels on trendlines
          priceLineVisible: false,
        });
        lineSeries.setData([
          { time: trendline.point1.time, value: trendline.point1.price },
          { time: trendline.point2.time, value: trendline.point2.price },
        ]);
        trendlineSeriesRef.current[trendline.id] = lineSeries;
      }
    });
  }, [trendlines, isInitialized]); // Redraw when trendlines change or chart re-initializes

  // Format timestamp for display
  const formatTime = (timestamp: Time | null): string => {
    if (!timestamp) return '';
    
    // Convert timestamp to Date object (timestamp is in seconds)
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

  return (
    <div
      className={cn('chart-container relative', className)}
      style={{ width, height }}
    >
      {/* Symbol and timeframe badges */}
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <div className="bg-sidebar-primary text-sidebar-primary-foreground text-xs py-1 px-2 rounded-md font-medium">
          {symbol}
        </div>
        <div className="bg-sidebar-accent text-sidebar-accent-foreground text-xs py-1 px-2 rounded-md font-medium">
          {timeframe}
        </div>
      </div>
      
      {/* Toolbar: Zoom controls and Drawing mode */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <Button
          variant={isDrawingModeEnabled ? "secondary" : "outline"}
          size="sm"
          className="h-8 bg-sidebar-secondary bg-opacity-80 hover:bg-sidebar-accent transition-colors"
          onClick={toggleDrawingMode}
        >
          {isDrawingModeEnabled ? "Cancel Draw" : "Draw Trendline"}
        </Button>
        <Button 
          variant="outline" 
          size="icon"
          className="h-8 w-8 bg-sidebar-secondary bg-opacity-80 hover:bg-sidebar-accent transition-colors"
          onClick={handleZoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button 
          variant="outline" 
          size="icon"
          className="h-8 w-8 bg-sidebar-secondary bg-opacity-80 hover:bg-sidebar-accent transition-colors"
          onClick={handleZoomOut}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Current price display */}
      {currentPrice && (
        <div className="absolute top-2 right-20 z-10">
          <div className="bg-primary text-primary-foreground text-sm py-1 px-3 rounded font-medium">
            {currentPrice.toFixed(2)}
          </div>
        </div>
      )}
      
      {/* Data window - show OHLC and indicator values on hover */}
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
          
          {/* Indicator values */}
          {Object.keys(hoverData.indicatorValues).length > 0 && (
            <div className="border-t border-border pt-2">
              <div className="font-medium mb-2 text-xs text-primary">Indicators</div>
              {Object.entries(hoverData.indicatorValues).map(([indicatorId, data]) => (
                <div key={indicatorId} className="mb-2 bg-sidebar-accent/10 rounded-sm p-1.5">
                  <div className="font-medium text-xs text-primary mb-1">{data.name}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {indicatorId === 'rsi' && (
                      <>
                        <div className="text-muted-foreground text-xs">Value</div>
                        <div className={cn(
                          "font-mono text-right text-xs font-medium",
                          data.value > 70 ? "text-trading-down" : data.value < 30 ? "text-trading-up" : ""
                        )}>
                          {Number(data.value).toFixed(2)}
                        </div>
                      </>
                    )}
                    {(indicatorId === 'sma' || indicatorId === 'ema' || indicatorId === 'vwap') && (
                      <>
                        <div className="text-muted-foreground text-xs">Value</div>
                        <div className="font-mono text-right text-xs">
                          {data.value !== null && data.value !== undefined ? Number(data.value).toFixed(2) : 'N/A'}
                        </div>
                      </>
                    )}
                    {indicatorId === 'macd' && (
                      <>
                        <div className="text-muted-foreground text-xs">MACD</div>
                        <div className="font-mono text-right text-xs">{Number(data.macd).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">Signal</div>
                        <div className="font-mono text-right text-xs">{Number(data.signal).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">Histogram</div>
                        <div className={cn(
                          "font-mono text-right text-xs",
                          Number(data.histogram) > 0 ? "text-trading-up" : "text-trading-down"
                        )}>
                          {Number(data.histogram).toFixed(2)}
                        </div>
                      </>
                    )}
                    {indicatorId === 'bbands' && (
                      <>
                        <div className="text-muted-foreground text-xs">Upper</div>
                        <div className="font-mono text-right text-xs">{Number(data.upper).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">Middle</div>
                        <div className="font-mono text-right text-xs">{Number(data.middle).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">Lower</div>
                        <div className="font-mono text-right text-xs">{Number(data.lower).toFixed(2)}</div>
                      </>
                    )}
                    {indicatorId === 'adx' && (
                      <>
                        <div className="text-muted-foreground text-xs">ADX</div>
                        <div className={cn(
                          "font-mono text-right text-xs",
                          Number(data.adx) > 25 ? "text-trading-up font-medium" : ""
                        )}>
                          {Number(data.adx).toFixed(2)}
                        </div>
                        <div className="text-muted-foreground text-xs">+DI</div>
                        <div className="font-mono text-right text-xs text-trading-up">{Number(data.plusDI).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">-DI</div>
                        <div className="font-mono text-right text-xs text-trading-down">{Number(data.minusDI).toFixed(2)}</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};

export default Chart;

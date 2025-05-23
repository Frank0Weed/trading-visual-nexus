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
  const indicatorSeriesRef = useRef<Record<string, any>>({});
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
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
      }
    });
    
    return result;
  };

  // Calculate separate pane heights based on active indicators
  const calculatePaneHeights = () => {
    const totalHeight = height;
    const mainPaneHeight = totalHeight * 0.7; // Main pane takes 70% by default
    
    // Count separate indicators (those that need their own pane)
    const separateIndicators = activeIndicators.filter(id => {
      const indicator = availableIndicators[id];
      return indicator && (indicator.display === 'separate' || indicator.display === 'separate-window');
    });
    
    const separateCount = separateIndicators.length;
    
    if (separateCount === 0) {
      return { mainPane: '100%', perIndicator: '0%' };
    }
    
    // Calculate height percentages
    const indicatorsPortion = 0.3; // Indicators take 30% of the total height
    const mainPortion = 1 - indicatorsPortion;
    
    // Calculate per indicator height
    const perIndicatorPortion = indicatorsPortion / separateCount;
    
    return {
      mainPane: `${mainPortion * 100}%`,
      perIndicator: `${perIndicatorPortion * 100}%`
    };
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

    // Configure main price scale to give room for indicators
    const paneHeights = calculatePaneHeights();
    if (activeIndicators.some(id => ['rsi', 'macd', 'adx'].includes(id))) {
      series.priceScale().applyOptions({
        scaleMargins: {
          top: 0.1,
          bottom: 0.2, // Leave more room at bottom for separate indicators
        },
      });
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
      visible: true,
      autoScale: true,
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
  }, [chartType, height, data, activeIndicators]);

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
          
          // Add middle and lower bands with similar safety checks
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
      } else if (indicator.display === 'separate' || indicator.display === 'separate-window') {
        // Enhanced handling for separate window indicators
        if (indicatorId === 'rsi') {
          // RSI Line in separate window
          const rsiSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#9b87f5',
            lineWidth: 2,
            priceScaleId: 'rsi',
            title: 'RSI',
            lastValueVisible: true,
            priceLineVisible: false,
          });
          
          // Set correct scale margins for RSI (0-100 scale)
          rsiSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.1, 
              bottom: 0.1,
            },
            autoScale: true,
            visible: true,
            entireTextOnly: true,
          });
          
          // Create data points for RSI
          const rsiData = [];
          for (let i = 0; i < data.length && i < indicatorData.length; i++) {
            if (data[i]) {
              rsiData.push({
                time: (data[i] as any).time,
                value: indicatorData[i]
              });
            }
          }
          
          rsiSeries.setData(rsiData);
          indicatorSeriesRef.current[indicatorId] = rsiSeries;
          
          // Add overbought/oversold lines
          const overboughtSeries = chartRef.current.addLineSeries({
            color: 'rgba(255, 107, 107, 0.5)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceScaleId: 'rsi',
            title: 'Overbought',
            lastValueVisible: false,
          });
          
          const oversoldSeries = chartRef.current.addLineSeries({
            color: 'rgba(38, 166, 154, 0.5)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceScaleId: 'rsi',
            title: 'Oversold',
            lastValueVisible: false,
          });
          
          // Create data points for overbought/oversold lines
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
        } else if (indicatorId === 'macd') {
          // Create a separate pane for MACD
          // MACD Line
          const macdSeries = chartRef.current.addLineSeries({
            color: '#0EA5E9',
            lineWidth: 2,
            priceScaleId: 'macd',
            title: 'MACD',
            lastValueVisible: true,
          });
          
          // Configure scale for MACD pane
          macdSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.2,
              bottom: 0.4,
            },
            autoScale: true,
            visible: true,
            entireTextOnly: true,
          });
          
          // Create data points for MACD line
          const macdData = [];
          for (let i = 0; i < data.length && i < indicatorData.macd.length; i++) {
            if (data[i]) {
              macdData.push({
                time: (data[i] as any).time,
                value: indicatorData.macd[i]
              });
            }
          }
          
          macdSeries.setData(macdData);
          indicatorSeriesRef.current[`${indicatorId}_line`] = macdSeries;
          
          // Signal Line
          const signalSeries = chartRef.current.addLineSeries({
            color: '#FF6B6B',
            lineWidth: 1,
            priceScaleId: 'macd',
            title: 'Signal',
            lastValueVisible: true,
          });
          
          // Create data points for Signal line
          const signalData = [];
          for (let i = 0; i < data.length && i < indicatorData.signal.length; i++) {
            if (data[i]) {
              signalData.push({
                time: (data[i] as any).time,
                value: indicatorData.signal[i]
              });
            }
          }
          
          signalSeries.setData(signalData);
          indicatorSeriesRef.current[`${indicatorId}_signal`] = signalSeries;
          
          // Histogram
          const histogramSeries = chartRef.current.addHistogramSeries({
            color: '#D946EF',
            priceScaleId: 'macd',
            priceFormat: {
              type: 'price',
              precision: 4,
            },
            title: 'Histogram'
          });
          
          // Create data points for histogram
          const histogramData = [];
          for (let i = 0; i < data.length && i < indicatorData.histogram.length; i++) {
            if (data[i]) {
              histogramData.push({
                time: (data[i] as any).time,
                value: indicatorData.histogram[i],
                color: indicatorData.histogram[i] >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
              });
            }
          }
          
          histogramSeries.setData(histogramData);
          indicatorSeriesRef.current[`${indicatorId}_histogram`] = histogramSeries;
        } else if (indicatorId === 'adx') {
          // ADX Line with improved separate pane configuration
          const adxSeries = chartRef.current.addLineSeries({
            color: indicator.color || '#B05B3B',
            lineWidth: 2,
            priceScaleId: 'adx',
            title: 'ADX',
            lastValueVisible: true,
          });
          
          adxSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.1, 
              bottom: 0.3,
            },
            autoScale: true,
            visible: true,
            entireTextOnly: true,
          });
          
          const adxData = indicatorData.adx.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          adxSeries.setData(adxData);
          indicatorSeriesRef.current[`${indicatorId}_adx`] = adxSeries;
          
          // +DI and -DI Lines with similar configurations
          const plusDISeries = chartRef.current.addLineSeries({
            color: '#26a69a',
            lineWidth: 1,
            priceScaleId: 'adx',
            title: '+DI',
          });
          
          const plusDIData = indicatorData.plusDI.map((value: number, index: number) => ({
            time: (data[index] as any).time,
            value: value
          }));
          
          plusDISeries.setData(plusDIData);
          indicatorSeriesRef.current[`${indicatorId}_plusDI`] = plusDISeries;
          
          const minusDISeries = chartRef.current.addLineSeries({
            color: '#ef5350',
            lineWidth: 1,
            priceScaleId: 'adx',
            title: '-DI',
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
      
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
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
          
          {/* Indicator values with improved display */}
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
                    {(indicatorId === 'sma' || indicatorId === 'ema') && (
                      <>
                        <div className="text-muted-foreground text-xs">Value</div>
                        <div className="font-mono text-right text-xs">{Number(data.value).toFixed(2)}</div>
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

import React, { useRef, useEffect, useState, useMemo } from 'react';
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
  MouseEventParams,
  SeriesType
} from 'lightweight-charts';
import { cn } from '@/lib/utils';
// import { CandleData } from '@/services/apiService'; // Not directly used in this file
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
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Bar" | "Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLineRef = useRef<any>(null);
  const indicatorSeriesRef = useRef<Record<string, ISeriesApi<any> | ISeriesApi<any>[]>>({});
  const trendlineSeriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isDrawingModeEnabled, setIsDrawingModeEnabled] = useState(false);
  const [trendlines, setTrendlines] = useState<Array<{id: string, point1: {time: Time, price: number}, point2: {time: Time, price: number}}>>([]);
  const [currentTrendlinePoints, setCurrentTrendlinePoints] = useState<Array<{time: Time, price: number}>>([]);
  // const [indicators, setIndicators] = useState<Record<string, any>>({}); // Replaced by useMemo
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [hoverData, setHoverData] = useState<HoverData>({
    time: null,
    price: null,
    ohlc: null,
    indicatorValues: {}
  });

  // Format volume data (memoized to prevent re-computation if data reference hasn't changed)
  const formattedVolumeData = useMemo(() => {
    if (!data || data.length === 0) return [];
    console.log('[Chart.tsx] Memoizing formattedVolumeData...');
    return data.map((candle: any) => {
      const color = candle.close >= candle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)';
      return {
        time: candle.time,
        value: candle.volume || 0,
        color
      };
    });
  }, [data]);

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
    setCurrentTrendlinePoints([]); 
    if (chartRef.current) {
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

  const findCandleByTime = (time: Time): CandlestickData<Time> | LineData<Time> | null => {
    if (!data || !time) return null;
    return data.find(candle => (candle as any).time === time) || null;
  };

  const getIndicatorValuesAtTime = (time: Time): Record<string, any> => {
    const result: Record<string, any> = {};
    if (!time || !indicators || !data || data.length === 0) return result;
    
    const index = data.findIndex(candle => candle && (candle as any).time === time);
    if (index === -1) return result;

    Object.entries(indicators).forEach(([indicatorId, indicatorResultData]) => {
      const indicatorMeta = availableIndicators[indicatorId];
      if (!indicatorMeta || !indicatorResultData) return;

      switch (indicatorId) {
        case 'rsi':
        case 'sma':
        case 'ema':
        case 'vwap':
        case 'atr':
          if (Array.isArray(indicatorResultData) && index < indicatorResultData.length) {
            result[indicatorId] = { name: indicatorMeta.name, value: indicatorResultData[index] };
          }
          break;
        case 'macd':
          if (indicatorResultData.macd && indicatorResultData.signal && indicatorResultData.histogram &&
              index < indicatorResultData.macd.length && index < indicatorResultData.signal.length && index < indicatorResultData.histogram.length) {
            result[indicatorId] = {
              name: indicatorMeta.name,
              macd: indicatorResultData.macd[index],
              signal: indicatorResultData.signal[index],
              histogram: indicatorResultData.histogram[index]
            };
          }
          break;
        case 'bbands':
          if (indicatorResultData.upper && indicatorResultData.middle && indicatorResultData.lower &&
              index < indicatorResultData.upper.length && index < indicatorResultData.middle.length && index < indicatorResultData.lower.length) {
            result[indicatorId] = {
              name: indicatorMeta.name,
              upper: indicatorResultData.upper[index],
              middle: indicatorResultData.middle[index],
              lower: indicatorResultData.lower[index]
            };
          }
          break;
        case 'adx':
          if (indicatorResultData.adx && indicatorResultData.plusDI && indicatorResultData.minusDI &&
              index < indicatorResultData.adx.length && index < indicatorResultData.plusDI.length && index < indicatorResultData.minusDI.length) {
            result[indicatorId] = {
              name: indicatorMeta.name,
              adx: indicatorResultData.adx[index],
              plusDI: indicatorResultData.plusDI[index],
              minusDI: indicatorResultData.minusDI[index]
            };
          }
          break;
        case 'stochastic':
          if (indicatorResultData.kLine && indicatorResultData.dLine &&
              index < indicatorResultData.kLine.length && index < indicatorResultData.dLine.length) {
            result[indicatorId] = {
              name: indicatorMeta.name,
              kValue: indicatorResultData.kLine[index],
              dValue: indicatorResultData.dLine[index]
            };
          }
          break;
        default:
          break;
      }
    });
    return result;
  };
  
  const indicators = useMemo(() => {
    if (!data || data.length === 0) return {};
    console.log('[Chart.tsx] Recalculating indicators via useMemo...');
    const calculatedIndicators: Record<string, any> = {};
    for (const indicatorId of activeIndicators) {
      const indicator = availableIndicators[indicatorId];
      if (indicator) {
        calculatedIndicators[indicatorId] = indicator.calculate(data as CandlestickData<Time>[], indicator.defaultParams);
      }
    }
    return calculatedIndicators;
  }, [data, activeIndicators]);

  // Set up live price line
  useEffect(() => {
    if (!data || data.length === 0 || !seriesRef.current || !isInitialized) return;
    const lastCandle = data[data.length - 1];
    const price = 'close' in lastCandle ? lastCandle.close : lastCandle.value;
    setCurrentPrice(price);

    if (seriesRef.current) {
      if (priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
      }
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
        try { seriesRef.current.removePriceLine(priceLineRef.current); } catch(e) {/* ignore */}
      }
    };
  }, [data, isInitialized]); // Re-run if data changes (to update price) or if not initialized

  // Initialize chart and main series effect
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return; // Prevent re-initialization if chart already exists

    console.log('[Chart.tsx] Initializing chart instance and main series. Chart Type:', chartType);

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#242731' }, horzLines: { color: '#242731' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#242731', mode: PriceScaleMode.Normal },
      timeScale: { borderColor: '#242731', timeVisible: true, secondsVisible: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    });
    chartRef.current = chart;

    if (isDrawingModeEnabled) {
        chart.applyOptions({
            crosshair: { mode: CrosshairMode.Hidden },
            handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
            handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false }
        });
    }
    
    // Create main series based on chartType
    let mainSeries: ISeriesApi<SeriesType>;
    if (chartType === 'candlestick') {
      mainSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });
    } else if (chartType === 'line') {
      mainSeries = chart.addLineSeries({ color: '#2962FF', lineWidth: 2, crosshairMarkerVisible: true, crosshairMarkerRadius: 4 });
    } else if (chartType === 'bar') {
      mainSeries = chart.addBarSeries({ upColor: '#26a69a', downColor: '#ef5350' });
    } else { // area
      mainSeries = chart.addAreaSeries({ topColor: 'rgba(41, 98, 255, 0.28)', bottomColor: 'rgba(41, 98, 255, 0.05)', lineColor: '#2962FF', lineWidth: 2 });
    }
    seriesRef.current = mainSeries;
    if (data && data.length > 0) {
        seriesRef.current.setData(data as any); // Cast as any because type changes with chartType
    }

    // Volume series
    volumeSeriesRef.current = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay on bottom of chart
    });
    volumeSeriesRef.current.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
     if (data && data.length > 0) { // Set initial volume data
        const volData = formattedVolumeData; // Use memoized version
        if (volData.length > 0) {
            volumeSeriesRef.current.setData(volData as HistogramData<Time>[]);
        }
    }


    if (!isDrawingModeEnabled) {
      chart.subscribeCrosshairMove((param: MouseEventParams) => {
        if (!param.time || param.point === undefined || !chartContainerRef.current ||
            param.point.x < 0 || param.point.x > chartContainerRef.current.clientWidth ||
            param.point.y < 0 || param.point.y > chartContainerRef.current.clientHeight) {
          setHoverData({ time: null, price: null, ohlc: null, indicatorValues: {} });
          return;
        }
        const candle = findCandleByTime(param.time);
        const price = candle ? ('close' in candle ? candle.close : ('value' in candle ? candle.value : null)) : null;
        let ohlcData = null;
        if (candle && 'open' in candle) ohlcData = { open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: (candle as any).volume };
        else if (candle && 'value' in candle) ohlcData = { close: candle.value };
        setHoverData({ time: param.time, price, ohlc: ohlcData, indicatorValues: getIndicatorValuesAtTime(param.time) });
      });
    }

    chart.subscribeClick((param: MouseEventParams) => {
      if (!isDrawingModeEnabled || !param.time || param.point === undefined || !seriesRef.current) return;
      const price = seriesRef.current.coordinateToPrice(param.point.y);
      if (price === null) return;
      const time = param.time;
      setCurrentTrendlinePoints(prev => {
        const newPoints = [...prev, { time, price }];
        if (newPoints.length === 2) {
          setTrendlines(st => [...st, { id: Date.now().toString(), point1: newPoints[0], point2: newPoints[1] }]);
          return [];
        }
        return newPoints;
      });
    });
    
    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(chartContainerRef.current);

    if (onVisibleTimeRangeChange) {
      chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (range) onVisibleTimeRangeChange({ from: range.from as number, to: range.to as number });
      });
    }

    setIsInitialized(true);
    console.log('[Chart.tsx] Chart initialized.');

    return () => {
      console.log('[Chart.tsx] Cleaning up chart instance.');
      if (resizeObserverRef.current && chartContainerRef.current) {
        resizeObserverRef.current.unobserve(chartContainerRef.current);
      }
      // Remove all series before removing the chart
      if (chartRef.current) {
        Object.values(indicatorSeriesRef.current).forEach(seriesOrGroup => {
          if (Array.isArray(seriesOrGroup)) seriesOrGroup.forEach(s => { try { chartRef.current?.removeSeries(s); } catch(e) {/*ignore*/} });
          else if (seriesOrGroup) { try { chartRef.current?.removeSeries(seriesOrGroup); } catch(e) {/*ignore*/} }
        });
        indicatorSeriesRef.current = {};
        Object.values(trendlineSeriesRef.current).forEach(s => { try { chartRef.current?.removeSeries(s); } catch(e) {/*ignore*/} });
        trendlineSeriesRef.current = {};
        if(seriesRef.current) { try { chartRef.current?.removeSeries(seriesRef.current); } catch(e) {/*ignore*/} }
        if(volumeSeriesRef.current) { try { chartRef.current?.removeSeries(volumeSeriesRef.current); } catch(e) {/*ignore*/} }
        
        chartRef.current.remove();
      }
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      setIsInitialized(false);
    };
  }, [chartType, height, onVisibleTimeRangeChange]); // Removed `data`. `isDrawingModeEnabled` removed as it's handled by applyOptions.

  // Update main series data when `data` prop changes or chart is re-initialized for a different type
   useEffect(() => {
    if (!isInitialized || !seriesRef.current || !data) {
      return;
    }
    console.log('[Chart.tsx] Updating main series data. Data length:', data.length);
    seriesRef.current.setData(data as any); // Lightweight Charts handles type check internally or use specific setData
  }, [data, isInitialized]); // chartType change is handled by chart recreation effect

  // Update volume series data when `formattedVolumeData` (derived from `data`) changes
  useEffect(() => {
    if (!isInitialized || !volumeSeriesRef.current) {
      return;
    }
    console.log('[Chart.tsx] Updating volume series data. Data length:', formattedVolumeData.length);
    if (formattedVolumeData.length > 0) {
      volumeSeriesRef.current.setData(formattedVolumeData as HistogramData<Time>[]);
    } else {
      volumeSeriesRef.current.setData([]); // Clear if no volume data
    }
  }, [formattedVolumeData, isInitialized]);


  // Update indicator visualizations
  useEffect(() => {
    if (!isInitialized || !chartRef.current) { // Ensure chart is ready
        // If chart is not ready, attempt to clean up any lingering series state
        indicatorSeriesRef.current = {}; 
        return;
    }
    
    console.log('[Chart.tsx] Syncing indicator series visualizations. Active:', activeIndicators, 'Calculated indicators count:', Object.keys(indicators).length);

    const currentSeriesKeys = Object.keys(indicatorSeriesRef.current);
    const activeSeriesKeysForIndicators: string[] = [];

    // Determine which series keys should be active based on current indicators
    activeIndicators.forEach(indicatorId => {
        const indicator = availableIndicators[indicatorId];
        if (!indicator) return;

        if (indicatorId === 'bbands') {
            activeSeriesKeysForIndicators.push(`${indicatorId}_upper`, `${indicatorId}_middle`, `${indicatorId}_lower`);
        } else if (indicatorId === 'macd') {
            activeSeriesKeysForIndicators.push(`${indicatorId}_macdLine`, `${indicatorId}_signal`, `${indicatorId}_histogram`);
        } else if (indicatorId === 'adx') {
            activeSeriesKeysForIndicators.push(`${indicatorId}_adx`, `${indicatorId}_plusDI`, `${indicatorId}_minusDI`);
        } else if (indicatorId === 'stochastic') {
            activeSeriesKeysForIndicators.push(`${indicatorId}_kLine`, `${indicatorId}_dLine`, `${indicatorId}_level80`, `${indicatorId}_level20`);
        } else if (indicatorId === 'rsi') {
            activeSeriesKeysForIndicators.push(indicatorId, `${indicatorId}_overbought`, `${indicatorId}_oversold`);
        } else { // Single series indicators (SMA, EMA, VWAP, ATR)
            activeSeriesKeysForIndicators.push(indicatorId);
        }
    });
    
    // Remove series that are no longer active
    currentSeriesKeys.forEach(seriesKey => {
        if (!activeSeriesKeysForIndicators.includes(seriesKey)) {
            const seriesToRemove = indicatorSeriesRef.current[seriesKey];
            if (seriesToRemove) {
                console.log(`[Chart.tsx] Removing stale indicator series: ${seriesKey}`);
                if (Array.isArray(seriesToRemove)) { // Should not happen with current structure, but good check
                    seriesToRemove.forEach(s => chartRef.current?.removeSeries(s));
                } else {
                    chartRef.current?.removeSeries(seriesToRemove);
                }
                delete indicatorSeriesRef.current[seriesKey];
            }
        }
    });

    // Add or Update indicator series
    for (const indicatorId of activeIndicators) {
      const indicator = availableIndicators[indicatorId];
      const indicatorResultData = indicators[indicatorId]; // Calculated data from useMemo

      if (!indicator || !indicatorResultData || !data || data.length === 0) continue;

      const mapToLineData = (values: (number | null)[], currentTimeData: typeof data) => 
        values.map((value, index) => ({
            time: (currentTimeData[index] as any).time,
            value: value,
        })).filter(d => d.time && d.value !== null && d.value !== undefined) as LineData<Time>[];

      const addOrUpdateSeries = (
        seriesId: string, 
        seriesType: 'Line' | 'Histogram', 
        options: any, 
        seriesData: LineData<Time>[] | HistogramData<Time>[]
      ) => {
        let series = indicatorSeriesRef.current[seriesId] as ISeriesApi<any>;
        if (series) {
          series.setData(seriesData);
        } else {
          if (seriesType === 'Line') series = chartRef.current!.addLineSeries(options);
          else series = chartRef.current!.addHistogramSeries(options);
          series.setData(seriesData);
          indicatorSeriesRef.current[seriesId] = series;
        }
        if (options.priceScaleId && indicator.plotConfig?.scaleMargins) {
            series.priceScale().applyOptions({ scaleMargins: indicator.plotConfig.scaleMargins });
        }
      };
      
      const paneId = indicator.plotConfig?.priceScaleId || `${indicatorId}Pane`;

      if (indicator.display === 'main') {
        if ((indicatorId === 'sma' || indicatorId === 'ema' || indicatorId === 'vwap') && Array.isArray(indicatorResultData)) {
           const lineData = mapToLineData(indicatorResultData, data);
           if (lineData.length > 0) addOrUpdateSeries(indicatorId, 'Line', { color: indicator.color, lineWidth: indicator.plotConfig?.lineWidth || 2, title: indicator.name, priceScaleId: 'right' }, lineData);
        } else if (indicatorId === 'bbands' && indicatorResultData.upper) {
            addOrUpdateSeries(`${indicatorId}_upper`, 'Line', { color: indicator.color, lineWidth: 1, lineStyle: LineStyle.Dotted, title: `${indicator.name} Upper`, priceScaleId: 'right' }, mapToLineData(indicatorResultData.upper, data));
            addOrUpdateSeries(`${indicatorId}_middle`, 'Line', { color: indicator.color, lineWidth: 1, title: `${indicator.name} Middle`, priceScaleId: 'right' }, mapToLineData(indicatorResultData.middle, data));
            addOrUpdateSeries(`${indicatorId}_lower`, 'Line', { color: indicator.color, lineWidth: 1, lineStyle: LineStyle.Dotted, title: `${indicator.name} Lower`, priceScaleId: 'right' }, mapToLineData(indicatorResultData.lower, data));
        }
      } else { // Separate PANE
        if (indicatorId === 'macd' && indicatorResultData.macd) {
            const macdLineData = indicatorResultData.macd.map((value: number, index: number) => ({ time: (data[index] as any).time, value: value, color: value >= 0 ? 'rgba(38, 166, 154, 0.7)' : 'rgba(239, 83, 80, 0.7)'})).filter(d=>d.time && d.value !== undefined);
            addOrUpdateSeries(`${indicatorId}_macdLine`, 'Histogram', { priceScaleId: paneId, priceFormat: { type: 'price', precision: indicator.precision || 4 }, title: 'MACD Line' }, macdLineData);
            addOrUpdateSeries(`${indicatorId}_signal`, 'Line', { color: (indicator as any).signalColor || '#FF6B6B', lineWidth: 1, priceScaleId: paneId, title: 'Signal' }, mapToLineData(indicatorResultData.signal, data));
            addOrUpdateSeries(`${indicatorId}_histogram`, 'Histogram', { priceScaleId: `${paneId}_hist`, priceFormat: { type: 'price', precision: indicator.precision || 4 }, title: 'MACD Hist' }, indicatorResultData.histogram.map((value: number, index: number) => ({ time: (data[index] as any).time, value: value, color: value >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'})).filter(d=>d.time && d.value !== undefined));
        } else if ((indicatorId === 'rsi' || indicatorId === 'atr') && Array.isArray(indicatorResultData)) {
            addOrUpdateSeries(indicatorId, 'Line', { color: indicator.color, lineWidth: indicator.plotConfig?.lineWidth || 1.5, priceScaleId: paneId, title: indicator.name }, mapToLineData(indicatorResultData, data));
            if (indicatorId === 'rsi') {
                const rsiTimeData = data.map(d => d.time).filter(t => t !== undefined);
                if (rsiTimeData.length > 0) {
                    const levelData = (level: number) => rsiTimeData.map(time => ({ time, value: level }));
                    addOrUpdateSeries(`${indicatorId}_overbought`, 'Line', { color: 'rgba(255, 107, 107, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: paneId, title: 'Overbought', lastValueVisible: false, priceLineVisible: false }, levelData(70));
                    addOrUpdateSeries(`${indicatorId}_oversold`, 'Line', { color: 'rgba(38, 166, 154, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: paneId, title: 'Oversold', lastValueVisible: false, priceLineVisible: false }, levelData(30));
                }
            }
        } else if (indicatorId === 'adx' && indicatorResultData.adx) {
            addOrUpdateSeries(`${indicatorId}_adx`, 'Line', { color: indicator.color, lineWidth: 2, priceScaleId: paneId, title: 'ADX' }, mapToLineData(indicatorResultData.adx, data));
            addOrUpdateSeries(`${indicatorId}_plusDI`, 'Line', { color: '#26a69a', lineWidth: 1, priceScaleId: paneId, title: '+DI' }, mapToLineData(indicatorResultData.plusDI, data));
            addOrUpdateSeries(`${indicatorId}_minusDI`, 'Line', { color: '#ef5350', lineWidth: 1, priceScaleId: paneId, title: '-DI' }, mapToLineData(indicatorResultData.minusDI, data));
        } else if (indicatorId === 'stochastic' && indicatorResultData.kLine) {
            addOrUpdateSeries(`${indicatorId}_kLine`, 'Line', { color: indicator.color, lineWidth: 1.5, priceScaleId: paneId, title: '%K' }, mapToLineData(indicatorResultData.kLine, data));
            addOrUpdateSeries(`${indicatorId}_dLine`, 'Line', { color: '#D1D5DB', lineWidth: 1.5, priceScaleId: paneId, title: '%D' }, mapToLineData(indicatorResultData.dLine, data));
            const stochTimeData = data.map(d => d.time).filter(t => t !== undefined);
            if (stochTimeData.length > 0) {
                 const levelData = (level: number) => stochTimeData.map(time => ({ time, value: level }));
                addOrUpdateSeries(`${indicatorId}_level80`, 'Line', { color: 'rgba(200, 200, 200, 0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: paneId, title: '80 Level', lastValueVisible: false, priceLineVisible: false }, levelData(80));
                addOrUpdateSeries(`${indicatorId}_level20`, 'Line', { color: 'rgba(200, 200, 200, 0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: paneId, title: '20 Level', lastValueVisible: false, priceLineVisible: false }, levelData(20));
            }
        }
      }
    }
  }, [indicators, activeIndicators, isInitialized, chartRef, data]); // `data` is needed for time mapping for indicators

  // Render trendlines
  useEffect(() => {
    if (!isInitialized || !chartRef.current) return;

    Object.values(trendlineSeriesRef.current).forEach(s => chartRef.current?.removeSeries(s));
    trendlineSeriesRef.current = {};

    trendlines.forEach(trendline => {
      if (trendline.point1 && trendline.point2 && chartRef.current) {
        const lineSeries = chartRef.current.addLineSeries({
          lineWidth: 2, color: 'yellow', priceScaleId: '', lastValueVisible: false, priceLineVisible: false,
        });
        lineSeries.setData([
          { time: trendline.point1.time, value: trendline.point1.price },
          { time: trendline.point2.time, value: trendline.point2.price },
        ]);
        trendlineSeriesRef.current[trendline.id] = lineSeries;
      }
    });
  }, [trendlines, isInitialized]);

  // Format timestamp for display
  const formatTime = (timestamp: Time | null): string => {
    if (!timestamp) return '';
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
              {Object.entries(hoverData.indicatorValues).map(([indicatorId, valueData]) => ( // Renamed 'data' to 'valueData' to avoid conflict
                <div key={indicatorId} className="mb-2 bg-sidebar-accent/10 rounded-sm p-1.5">
                  <div className="font-medium text-xs text-primary mb-1">{valueData.name}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {indicatorId === 'rsi' && (
                      <>
                        <div className="text-muted-foreground text-xs">Value</div>
                        <div className={cn(
                          "font-mono text-right text-xs font-medium",
                          valueData.value > 70 ? "text-trading-down" : valueData.value < 30 ? "text-trading-up" : ""
                        )}>
                          {Number(valueData.value).toFixed(2)}
                        </div>
                      </>
                    )}
                    {(indicatorId === 'sma' || indicatorId === 'ema' || indicatorId === 'vwap' || indicatorId === 'atr') && (
                      <>
                        <div className="text-muted-foreground text-xs">Value</div>
                        <div className="font-mono text-right text-xs">
                          {valueData.value !== null && valueData.value !== undefined 
                            ? Number(valueData.value).toFixed(indicatorId === 'atr' ? 4 : 2) 
                            : 'N/A'}
                        </div>
                      </>
                    )}
                    {indicatorId === 'macd' && (
                      <>
                        <div className="text-muted-foreground text-xs">MACD</div>
                        <div className="font-mono text-right text-xs">{Number(valueData.macd).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">Signal</div>
                        <div className="font-mono text-right text-xs">{Number(valueData.signal).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">Histogram</div>
                        <div className={cn(
                          "font-mono text-right text-xs",
                          Number(valueData.histogram) > 0 ? "text-trading-up" : "text-trading-down"
                        )}>
                          {Number(valueData.histogram).toFixed(2)}
                        </div>
                      </>
                    )}
                    {indicatorId === 'bbands' && (
                      <>
                        <div className="text-muted-foreground text-xs">Upper</div>
                        <div className="font-mono text-right text-xs">{Number(valueData.upper).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">Middle</div>
                        <div className="font-mono text-right text-xs">{Number(valueData.middle).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">Lower</div>
                        <div className="font-mono text-right text-xs">{Number(valueData.lower).toFixed(2)}</div>
                      </>
                    )}
                    {indicatorId === 'adx' && (
                      <>
                        <div className="text-muted-foreground text-xs">ADX</div>
                        <div className={cn(
                          "font-mono text-right text-xs",
                          Number(valueData.adx) > 25 ? "text-trading-up font-medium" : ""
                        )}>
                          {Number(valueData.adx).toFixed(2)}
                        </div>
                        <div className="text-muted-foreground text-xs">+DI</div>
                        <div className="font-mono text-right text-xs text-trading-up">{Number(valueData.plusDI).toFixed(2)}</div>
                        <div className="text-muted-foreground text-xs">-DI</div>
                        <div className="font-mono text-right text-xs text-trading-down">{Number(valueData.minusDI).toFixed(2)}</div>
                      </>
                    )}
                    {indicatorId === 'stochastic' && (
                      <>
                        <div className="text-muted-foreground text-xs">%K</div>
                        <div className="font-mono text-right text-xs">
                          {valueData.kValue !== null && valueData.kValue !== undefined ? Number(valueData.kValue).toFixed(2) : 'N/A'}
                        </div>
                        <div className="text-muted-foreground text-xs">%D</div>
                        <div className="font-mono text-right text-xs">
                          {valueData.dValue !== null && valueData.dValue !== undefined ? Number(valueData.dValue).toFixed(2) : 'N/A'}
                        </div>
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

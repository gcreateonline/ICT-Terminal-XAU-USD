
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { Candle, AnalysisResult, Drawing, DrawingType } from '../types';

interface ChartProps {
  data: Candle[];
  analysis: AnalysisResult;
  activeTool: DrawingType | null;
  drawings: Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
  onToolUsed: () => void;
}

const Chart: React.FC<ChartProps> = ({ data, analysis, activeTool, drawings, onDrawingsChange, onToolUsed }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPoints, setCurrentPoints] = useState<{ time: number; price: number }[]>([]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 60, bottom: 40, left: 10 };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const x = d3.scaleBand()
      .domain(data.map(d => d.time.toString()))
      .range([margin.left, width - margin.right])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([
        d3.min([d3.min(data, d => d.low)!, analysis.slPrice ?? Infinity, analysis.tpPrice ?? Infinity])! * 0.999,
        d3.max([d3.max(data, d => d.high)!, analysis.slPrice ?? -Infinity, analysis.tpPrice ?? -Infinity])! * 1.001
      ])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Grid lines
    svg.append('g')
      .attr('stroke', '#1e293b')
      .attr('stroke-opacity', 0.5)
      .call(d3.axisLeft(y).tickSize(-width + margin.left + margin.right).tickFormat(() => ''))
      .attr('transform', `translate(${margin.left}, 0)`);

    // Draw Fair Value Gaps (FVG)
    analysis.fvgs.forEach(fvg => {
      const xPos = x(fvg.startTime.toString());
      if (xPos === undefined) return;

      svg.append('rect')
        .attr('x', xPos)
        .attr('y', y(fvg.top))
        .attr('width', (width - margin.right - xPos))
        .attr('height', Math.abs(y(fvg.bottom) - y(fvg.top)))
        .attr('fill', fvg.type === 'bullish' ? '#3b82f6' : '#f97316')
        .attr('fill-opacity', 0.15)
        .attr('stroke', fvg.type === 'bullish' ? '#3b82f6' : '#f97316')
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '2,2');
    });

    // Draw Order Blocks (OB)
    analysis.orderBlocks.forEach(ob => {
      const xPos = x(ob.startTime.toString());
      if (xPos === undefined) return;

      svg.append('rect')
        .attr('x', xPos)
        .attr('y', y(ob.top))
        .attr('width', (width - margin.right - xPos))
        .attr('height', Math.abs(y(ob.bottom) - y(ob.top)))
        .attr('fill', ob.type === 'bullish' ? '#10b981' : '#ef4444')
        .attr('fill-opacity', 0.1);
    });

    // Draw Candles
    const candleGroup = svg.append('g');
    data.forEach(d => {
      const xPos = x(d.time.toString())!;
      const color = d.close >= d.open ? '#10b981' : '#ef4444';
      
      // Wick
      candleGroup.append('line')
        .attr('x1', xPos + x.bandwidth() / 2)
        .attr('x2', xPos + x.bandwidth() / 2)
        .attr('y1', y(d.high))
        .attr('y2', y(d.low))
        .attr('stroke', color)
        .attr('stroke-width', 1.5);

      // Body
      candleGroup.append('rect')
        .attr('x', xPos)
        .attr('y', y(Math.max(d.open, d.close)))
        .attr('width', x.bandwidth())
        .attr('height', Math.max(1, Math.abs(y(d.open) - y(d.close))))
        .attr('fill', color);
    });

    // Market Structure Markers
    analysis.structure.forEach(s => {
      const xPos = x(s.time.toString());
      if (xPos === undefined) return;

      svg.append('line')
        .attr('x1', xPos - 10)
        .attr('x2', xPos + x.bandwidth() + 10)
        .attr('y1', y(s.price))
        .attr('y2', y(s.price))
        .attr('stroke', s.direction === 'bullish' ? '#10b981' : '#ef4444')
        .attr('stroke-dasharray', '4,2')
        .attr('stroke-width', 2);
    });

    // Draw SL/TP Lines if available
    const lastX = (x(data[data.length - 1].time.toString()) ?? 0) + x.bandwidth();
    if (analysis.slPrice !== undefined) {
      svg.append('line')
        .attr('x1', lastX)
        .attr('x2', width - margin.right)
        .attr('y1', y(analysis.slPrice))
        .attr('y2', y(analysis.slPrice))
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5');
      
      svg.append('text')
        .attr('x', width - margin.right + 5)
        .attr('y', y(analysis.slPrice))
        .attr('dy', '0.32em')
        .attr('fill', '#ef4444')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .text('SL');
    }

    if (analysis.tpPrice !== undefined) {
      svg.append('line')
        .attr('x1', lastX)
        .attr('x2', width - margin.right)
        .attr('y1', y(analysis.tpPrice))
        .attr('y2', y(analysis.tpPrice))
        .attr('stroke', '#10b981')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5');

      svg.append('text')
        .attr('x', width - margin.right + 5)
        .attr('y', y(analysis.tpPrice))
        .attr('dy', '0.32em')
        .attr('fill', '#10b981')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .text('TP');
    }

    // Y-Axis
    svg.append('g')
      .attr('transform', `translate(${width - margin.right}, 0)`)
      .call(d3.axisRight(y).ticks(10).tickFormat(d3.format('.2f')))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', '#475569'));

    // --- Drawings Layer ---
    const drawGroup = svg.append('g').attr('class', 'drawings');

    const renderDrawing = (d: Drawing) => {
      const color = d.color || '#6366f1';
      if (d.type === 'trendline' && d.points.length >= 2) {
        const p1 = d.points[0];
        const p2 = d.points[1];
        const x1 = x(p1.time.toString()) ?? 0;
        const x2 = x(p2.time.toString()) ?? 0;
        drawGroup.append('line')
          .attr('x1', x1 + x.bandwidth() / 2)
          .attr('y1', y(p1.price))
          .attr('x2', x2 + x.bandwidth() / 2)
          .attr('y2', y(p2.price))
          .attr('stroke', color)
          .attr('stroke-width', 2);
      } else if (d.type === 'horizontal' && d.points.length >= 1) {
        const p = d.points[0];
        drawGroup.append('line')
          .attr('x1', margin.left)
          .attr('x2', width - margin.right)
          .attr('y1', y(p.price))
          .attr('y2', y(p.price))
          .attr('stroke', color)
          .attr('stroke-width', 2);
      } else if (d.type === 'fib' && d.points.length >= 2) {
        const p1 = d.points[0];
        const p2 = d.points[1];
        const y1 = y(p1.price);
        const y2 = y(p2.price);
        const diff = p2.price - p1.price;
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        levels.forEach(lvl => {
          const pLvl = p1.price + diff * lvl;
          const yLvl = y(pLvl);
          drawGroup.append('line')
            .attr('x1', margin.left)
            .attr('x2', width - margin.right)
            .attr('y1', yLvl)
            .attr('y2', yLvl)
            .attr('stroke', color)
            .attr('stroke-opacity', 0.5)
            .attr('stroke-dasharray', '2,2');
          drawGroup.append('text')
            .attr('x', margin.left + 5)
            .attr('y', yLvl - 2)
            .attr('fill', color)
            .attr('font-size', '10px')
            .text(`${(lvl * 100).toFixed(1)}%`);
        });
      }
    };

    drawings.forEach(renderDrawing);

    // Click handling for new drawings
    const interactionLayer = svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('pointer-events', activeTool ? 'all' : 'none');

    interactionLayer.on('click', (event) => {
      if (!activeTool) return;
      const [mx, my] = d3.pointer(event);
      
      // Find closest candle for time
      const domain = x.domain();
      const bandwidth = x.bandwidth();
      const step = x.step();
      const index = Math.floor((mx - margin.left) / step);
      if (index < 0 || index >= domain.length) return;

      const time = parseInt(domain[index]);
      const price = y.invert(my);

      const newPoint = { time, price };

      if (activeTool === 'horizontal') {
        onDrawingsChange([...drawings, {
          id: Math.random().toString(36).substr(2, 9),
          type: 'horizontal',
          points: [newPoint],
          color: '#6366f1'
        }]);
        onToolUsed();
      } else {
        const updatedPoints = [...currentPoints, newPoint];
        if (updatedPoints.length === 2) {
          onDrawingsChange([...drawings, {
            id: Math.random().toString(36).substr(2, 9),
            type: activeTool,
            points: updatedPoints,
            color: '#6366f1'
          }]);
          setCurrentPoints([]);
          onToolUsed();
        } else {
          setCurrentPoints(updatedPoints);
        }
      }
    });

    // Preview crosshair or pending lines
    interactionLayer.on('mousemove', (event) => {
       if (currentPoints.length === 1 && (activeTool === 'trendline' || activeTool === 'fib')) {
          const [mx, my] = d3.pointer(event);
          const price = y.invert(my);
          const p1 = currentPoints[0];
          
          svg.select('.drawing-preview').remove();
          const preview = svg.append('g').attr('class', 'drawing-preview');
          const x1 = (x(p1.time.toString()) ?? 0) + x.bandwidth()/2;
          
          if (activeTool === 'trendline') {
            preview.append('line')
              .attr('x1', x1).attr('y1', y(p1.price))
              .attr('x2', mx).attr('y2', my)
              .attr('stroke', '#6366f1').attr('stroke-width', 1).attr('stroke-dasharray', '4,4');
          }
       }
    });

  }, [data, analysis, drawings, activeTool, currentPoints]);

  return (
    <div ref={containerRef} className={`w-full h-full relative ${activeTool ? 'cursor-crosshair' : 'cursor-default'}`}>
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

export default Chart;

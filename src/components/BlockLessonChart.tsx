import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

interface StreakChartProps {
  type: 'streak';
  blockId: string;
  data: Array<{ day: string | number; streak: number }>;
}

interface GenericChartProps {
  type: 'generic';
  blockId: string;
  data: Array<{ name: string; value: number }>;
}

export type BlockLessonChartProps = StreakChartProps | GenericChartProps;

export default function BlockLessonChart(props: BlockLessonChartProps) {
  if (props.type === 'streak') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={props.data}>
          <defs>
            <linearGradient id={`colorStreak_${props.blockId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
          <XAxis dataKey="day" stroke="#666" fontSize={10} tickLine={false} />
          <YAxis stroke="#666" fontSize={10} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
          />
          <Area type="monotone" dataKey="streak" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill={`url(#colorStreak_${props.blockId})`} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={props.data}>
        <defs>
          <linearGradient id={`chart_grad_${props.blockId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
        <XAxis dataKey="name" stroke="#888" fontSize={11} tickLine={false} />
        <YAxis stroke="#888" fontSize={11} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
        />
        <Area type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={3} fillOpacity={1} fill={`url(#chart_grad_${props.blockId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

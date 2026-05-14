import React from "react";

interface Props {
  value: number;
  total: number;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}

export function CircularProgress({ value, total, onClick, title }: Props) {
  const r = 15;
  const size = 42;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? value / total : 0;
  const dashOffset = circumference * (1 - fraction);
  const allDone = total > 0 && value === total;

  const content = (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3a3a46" strokeWidth="2.5" />
      {fraction > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#e8820c"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      <text
        x={cx}
        y={cy + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9.5"
        fill={allDone ? '#e8820c' : '#8888a0'}
        fontFamily="system-ui, sans-serif"
      >
        {value}/{total}
      </text>
    </svg>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex-shrink-0 rounded-full hover:opacity-75 transition-opacity"
        title={title ?? (allDone ? 'Uncheck all' : 'Check all')}
      >
        {content}
      </button>
    );
  }

  return <span className="flex-shrink-0">{content}</span>;
}

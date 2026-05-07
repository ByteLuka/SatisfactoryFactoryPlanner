interface Props {
  value: number;
  total: number;
}

export function SegmentedProgressBar({ value, total }: Props) {
  if (total === 0) return null;
  return (
    <div className="flex h-2" style={{ gap: '2px' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm transition-colors duration-150 ${
            i < value ? 'bg-[#e8820c]' : 'bg-[#3a3a46]'
          }`}
        />
      ))}
    </div>
  );
}

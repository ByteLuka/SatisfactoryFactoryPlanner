import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

interface Waypoint { x: number; y: number; }

// Builds an SVG path through orthogonal waypoints with rounded corners.
function buildRoutedPath(points: Waypoint[], cornerRadius = 8): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const next = points[i + 1];
    if (!next) {
      d += ` L ${curr.x},${curr.y}`;
      continue;
    }
    const prev = points[i - 1];
    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(cornerRadius, d1 / 2, d2 / 2);
    const t1x = curr.x - (r / d1) * (curr.x - prev.x);
    const t1y = curr.y - (r / d1) * (curr.y - prev.y);
    const t2x = curr.x + (r / d2) * (next.x - curr.x);
    const t2y = curr.y + (r / d2) * (next.y - curr.y);
    d += ` L ${t1x},${t1y} Q ${curr.x},${curr.y} ${t2x},${t2y}`;
  }
  return d;
}

export function ELKRouteEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    data, style, label, markerEnd,
  } = props;

  const waypoints = (data?.waypoints as Waypoint[] | undefined) ?? [];

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (waypoints.length > 0) {
    const allPoints: Waypoint[] = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
    edgePath = buildRoutedPath(allPoints);
    const mid = allPoints[Math.floor(allPoints.length / 2)];
    labelX = mid.x;
    labelY = mid.y;
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
    });
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              color: '#8888a0',
              background: 'rgba(37, 37, 45, 0.9)',
              padding: '1px 4px',
              borderRadius: 2,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

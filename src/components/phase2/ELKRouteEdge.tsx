import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position } from '@xyflow/react';
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

// Computes a fresh orthogonal path when ELK waypoints would create a backward route.
// Returns all points including source and target.
function buildOrthogonalFallback(
  sx: number, sy: number, sourcePosition: Position,
  tx: number, ty: number, targetPosition: Position,
): Waypoint[] {
  const offset = 40;

  if (sourcePosition === Position.Right && targetPosition === Position.Left) {
    if (tx >= sx) {
      // Target is ahead: simple 3-segment S-shape
      const midX = (sx + tx) / 2;
      return [{ x: sx, y: sy }, { x: midX, y: sy }, { x: midX, y: ty }, { x: tx, y: ty }];
    }
    // Target is behind: U-shape that routes around without going backward
    const midY = sy !== ty ? (sy + ty) / 2 : sy - 60;
    return [
      { x: sx, y: sy },
      { x: sx + offset, y: sy },
      { x: sx + offset, y: midY },
      { x: tx - offset, y: midY },
      { x: tx - offset, y: ty },
      { x: tx, y: ty },
    ];
  }

  if (sourcePosition === Position.Left && targetPosition === Position.Right) {
    if (tx <= sx) {
      const midX = (sx + tx) / 2;
      return [{ x: sx, y: sy }, { x: midX, y: sy }, { x: midX, y: ty }, { x: tx, y: ty }];
    }
    const midY = sy !== ty ? (sy + ty) / 2 : sy - 60;
    return [
      { x: sx, y: sy },
      { x: sx - offset, y: sy },
      { x: sx - offset, y: midY },
      { x: tx + offset, y: midY },
      { x: tx + offset, y: ty },
      { x: tx, y: ty },
    ];
  }

  // Top/Bottom or mixed: simple mid-axis path
  const midX = (sx + tx) / 2;
  return [{ x: sx, y: sy }, { x: midX, y: sy }, { x: midX, y: ty }, { x: tx, y: ty }];
}

export function ELKRouteEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    data, style, label, markerEnd,
  } = props;

  const waypoints = (data?.waypoints as Waypoint[] | undefined) ?? [];
  const highlighted = (data?.highlighted as boolean | undefined) ?? false;
  const edgeColor = (style?.stroke as string | undefined) ?? '#3a3a46';

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (waypoints.length > 0) {
    // Snap the first/last waypoints' transverse axis to source/target handle positions
    // so the entry and exit segments stay orthogonal after node drags.
    const snapped = waypoints.map((wp, i) => {
      if (i === 0) {
        return (sourcePosition === Position.Left || sourcePosition === Position.Right)
          ? { x: wp.x, y: sourceY }
          : { x: sourceX, y: wp.y };
      }
      if (i === waypoints.length - 1) {
        return (targetPosition === Position.Left || targetPosition === Position.Right)
          ? { x: wp.x, y: targetY }
          : { x: targetX, y: wp.y };
      }
      return wp;
    });

    // Detect backward segments: the first waypoint is behind the source handle,
    // or the last waypoint is past the target handle. This happens when a node is
    // dragged far enough that the static ELK waypoints are no longer on the correct
    // side — the path would double back unnecessarily.
    const first = snapped[0];
    const last = snapped[snapped.length - 1];
    const isBackward =
      (sourcePosition === Position.Right  && first.x < sourceX) ||
      (sourcePosition === Position.Left   && first.x > sourceX) ||
      (sourcePosition === Position.Bottom && first.y < sourceY) ||
      (sourcePosition === Position.Top    && first.y > sourceY) ||
      (targetPosition === Position.Left   && last.x  > targetX) ||
      (targetPosition === Position.Right  && last.x  < targetX) ||
      (targetPosition === Position.Top    && last.y  > targetY) ||
      (targetPosition === Position.Bottom && last.y  < targetY);

    const allPoints = isBackward
      ? buildOrthogonalFallback(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition)
      : [{ x: sourceX, y: sourceY }, ...snapped, { x: targetX, y: targetY }];

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
      {highlighted && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={3}
          strokeDasharray="16 8"
          strokeLinecap="round"
          style={{
            animation: 'edge-flow 0.6s linear infinite',
            filter: `drop-shadow(0 0 5px ${edgeColor})`,
            opacity: 0.95,
            pointerEvents: 'none',
          }}
        />
      )}
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

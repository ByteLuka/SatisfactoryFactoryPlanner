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
  const isIncoming = (data?.isIncoming as boolean | undefined) ?? false;
  const gradientStart = (data?.gradientStart as string | undefined) ?? '#606072';
  const gradientEnd = (data?.gradientEnd as string | undefined) ?? '#606072';
  const useGradient = highlighted && gradientStart !== gradientEnd;
  const gradientId = `edge-grad-${id}`;
  const highlightStroke = useGradient ? `url(#${gradientId})` : gradientStart;

  let edgePath: string;
  let flowEdgePath: string;
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
    // For incoming (converging) edges: reverse the flow path so the animation's
    // position-0 anchor sits at the target end. Combined with animation-direction:reverse
    // the dashes still visually flow source→target, but now all converging edges share
    // the same phase at the target — mirroring how diverging edges sync at the source.
    flowEdgePath = isIncoming ? buildRoutedPath([...allPoints].reverse()) : edgePath;
    const mid = allPoints[Math.floor(allPoints.length / 2)];
    labelX = mid.x;
    labelY = mid.y;
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
    });
    // For the smooth-step fallback, swap source↔target to get a reversed path.
    [flowEdgePath] = isIncoming
      ? getSmoothStepPath({
          sourceX: targetX, sourceY: targetY, sourcePosition: targetPosition,
          targetX: sourceX, targetY: sourceY, targetPosition: sourcePosition,
        })
      : [edgePath];
  }

  return (
    <>
      {useGradient && (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={sourceX}
            y1={sourceY}
            x2={targetX}
            y2={targetY}
          >
            <stop offset="0%" stopColor={gradientStart} />
            <stop offset="100%" stopColor={gradientEnd} />
          </linearGradient>
        </defs>
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        style={highlighted
          ? { ...style, stroke: highlightStroke, strokeOpacity: 0.4 }
          : style
        }
        markerEnd={markerEnd}
      />
      {highlighted && (
        <path
          d={flowEdgePath}
          fill="none"
          stroke={highlightStroke}
          strokeWidth={3}
          strokeDasharray="16 8"
          strokeLinecap="round"
          style={{
            animation: `edge-flow 0.6s linear ${isIncoming ? 'reverse' : 'normal'} infinite`,
            filter: useGradient ? undefined : `drop-shadow(0 0 5px ${gradientStart})`,
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
              fontSize: 11,
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

/**
 * Orthogonal wire routing helpers for pin diagrams.
 */

/**
 * @param {{x:number,y:number,side:'left'|'right'}} pa
 * @param {{x:number,y:number,side:'left'|'right'}} pb
 * @param {number} lane - horizontal channel offset between modules
 */
export function orthogonalPath(pa, pb, lane = 0) {
  const stub = 14;
  const ax = pa.side === "left" ? pa.x - stub : pa.x + stub;
  const bx = pb.side === "left" ? pb.x - stub : pb.x + stub;
  const ay = pa.y;
  const by = pb.y;

  // Same vertical channel (facing each other): stub out, mid vertical, stub in
  if (pa.side !== pb.side) {
    const mid = (ax + bx) / 2 + lane;
    return `M${pa.x} ${ay} L${ax} ${ay} L${mid} ${ay} L${mid} ${by} L${bx} ${by} L${pb.x} ${by}`;
  }

  // Same side: go out, shared vertical bus, then in
  const bus = pa.side === "left" ? Math.min(ax, bx) - 18 - Math.abs(lane) : Math.max(ax, bx) + 18 + Math.abs(lane);
  return `M${pa.x} ${ay} L${ax} ${ay} L${bus} ${ay} L${bus} ${by} L${bx} ${by} L${pb.x} ${by}`;
}

/** Stable lane index from net id so parallel wires don't stack. */
export function laneOffset(netId, groupIndex = 0) {
  let h = 0;
  for (let i = 0; i < netId.length; i++) h = (h * 31 + netId.charCodeAt(i)) | 0;
  return ((h % 7) - 3) * 6 + groupIndex * 2;
}

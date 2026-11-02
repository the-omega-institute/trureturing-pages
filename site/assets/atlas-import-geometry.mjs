const id = value => typeof value === "object" ? value.id : value;

// Match 3d-force-graph's quadratic paths, so a hovered native link follows the
// same geometry as its batched overview path, including arrows and particles.
export function importGeometry(edge, positions, primary) {
  const a = positions[id(edge.source)], b = positions[id(edge.target)];
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  const axis = [dx / length, dy / length, dz / length];
  const rotation = primary ? Math.PI / 2 : (dx < 0 ? -.45 : .45);
  const perpendicular = dx || dy ? [dy, -dx, 0] : [-dz, 0, dx];
  const cross = [axis[1] * perpendicular[2] - axis[2] * perpendicular[1], axis[2] * perpendicular[0] - axis[0] * perpendicular[2], axis[0] * perpendicular[1] - axis[1] * perpendicular[0]];
  // The perpendicular has zero dot product with the rotation axis.
  const offset = perpendicular.map((v, i) => v * Math.cos(rotation) + cross[i] * Math.sin(rotation));
  const bend = Math.min(primary ? 32 : 140, length * (primary ? .12 : .24));
  const curvature = Math.min(bend / (Math.hypot(...offset) || 1), Math.abs(dy) * .45 / (Math.abs(offset[1]) || 1));
  const control = { x: (a.x + b.x) / 2 + offset[0] * curvature,
    y: (a.y + b.y) / 2 + offset[1] * curvature,
    z: (a.z + b.z) / 2 + offset[2] * curvature };
  const point = t => {
    const u = 1 - t;
    return { x: u*u*a.x + 2*u*t*control.x + t*t*b.x,
      y: u*u*a.y + 2*u*t*control.y + t*t*b.y,
      z: u*u*a.z + 2*u*t*control.z + t*t*b.z };
  };
  return { curvature, rotation, control, point, steps: primary ? 8 : 16 };
}

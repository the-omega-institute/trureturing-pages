// Fit fixed graph coordinates into the usable canvas with the same slight
// three-dimensional viewing angle. Perspective constraints account for depth,
// so the camera does not need a large blanket margin around the whole graph.
export function fitOverview(points, { width, height, fov, padding }) {
  const tiltX = 0.1, tiltY = 0.1;
  const length = Math.hypot(tiltX, tiltY, 1);
  const side = Math.hypot(1, tiltX);
  const right = [1 / side, 0, -tiltX / side];
  const back = [tiltX / length, tiltY / length, 1 / length];
  const up = [back[1] * right[2], back[2] * right[0] - back[0] * right[2], -back[1] * right[0]];
  const dot = (point, axis) => point.x * axis[0] + point.y * axis[1] + point.z * axis[2];
  const tangent = Math.tan(fov * Math.PI / 360);
  const horizontal = tangent * width / height;
  const left = -1 + 2 * padding.left / width;
  const rightLimit = 1 - 2 * padding.right / width;
  const bottom = -1 + 2 * padding.bottom / height;
  const top = 1 - 2 * padding.top / height;
  let lowerX = -Infinity, upperX = Infinity, lowerY = -Infinity, upperY = Infinity;
  let near = -Infinity, far = Infinity;
  for (const point of points) {
    const x = dot(point, right), y = dot(point, up), z = dot(point, back);
    lowerX = Math.max(lowerX, x + rightLimit * horizontal * z);
    upperX = Math.min(upperX, x + left * horizontal * z);
    lowerY = Math.max(lowerY, y + top * tangent * z);
    upperY = Math.min(upperY, y + bottom * tangent * z);
    near = Math.max(near, z); far = Math.min(far, z);
  }
  const depth = Math.max(
    (lowerX - upperX) / ((rightLimit - left) * horizontal),
    (lowerY - upperY) / ((top - bottom) * tangent),
    near + 16,
  );
  const x = (lowerX + upperX - (rightLimit + left) * horizontal * depth) / 2;
  const y = (lowerY + upperY - (top + bottom) * tangent * depth) / 2;
  const world = z => ({
    x: x * right[0] + y * up[0] + z * back[0],
    y: x * right[1] + y * up[1] + z * back[1],
    z: x * right[2] + y * up[2] + z * back[2],
  });
  return { position: world(depth), target: world((near + far) / 2) };
}

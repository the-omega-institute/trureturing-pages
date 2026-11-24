import {
  Group,
  Vector2,
  Vector3,
  Color,
  BufferGeometry,
  Float32BufferAttribute,
  CubicBezierCurve3,
  TubeGeometry,
  Mesh,
  Points,
  ShaderMaterial,
  MeshBasicMaterial,
  LineSegments,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Raycaster,
  OctahedronGeometry,
  Fog,
  AmbientLight,
  DirectionalLight,
  TorusGeometry,
} from "./vendor/three-atlas.mjs?v=points-v1";
import { partitionImportEdges } from "./atlas-import-batches.mjs";
import { importGeometry } from "./atlas-import-geometry.mjs";

const vector = (point) => new Vector3(point.x, point.y, point.z);
const average = (ids, positions) => {
  const points = [...new Set(ids)].map((id) => vector(positions[id]));
  return points
    .reduce((sum, p) => sum.add(p), new Vector3())
    .divideScalar(points.length || 1);
};
function clear(group) {
  for (const child of [...group.children]) {
    child.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material))
        object.material.forEach((m) => m.dispose());
      else object.material?.dispose();
    });
    group.remove(child);
  }
}

export function createAtlasScene(renderer, host, callbacks) {
  const root = new Group();
  root.name = "Atlas semantic overlays";
  const bundles = new Group();
  const research = new Group();
  const changes = new Group();
  const focus = new Group();
  const landmarks = new Group();
  const imports = new Group();
  const nodes = new Group();
  root.add(bundles, research, changes, focus, landmarks, imports, nodes);
  renderer.scene().add(root);
  const ambient = new AmbientLight("#e4edf3", 0.85);
  const key = new DirectionalLight("#edfff8", 1.5);
  key.position.set(-600, 850, 1200);
  const fill = new DirectionalLight("#b7caff", 0.55);
  fill.position.set(800, -100, 500);
  const rim = new DirectionalLight("#ecc58e", 0.35);
  rim.position.set(0, 400, -650);
  if (typeof renderer.lights === "function")
    renderer.lights([ambient, key, fill, rim]);
  renderer.scene().fog = new Fog("#090c10", 1500, 4500);
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let pickable = [],
    labels = [],
    press = null;
  let nodeItems = [], projectedNodes = null, moveFrame = 0, moveEvent;
  function pickNode(event, rect) {
    if (!nodes.visible) return null;
    if (!projectedNodes) {
      const camera = renderer.camera();
      const scale = rect.height / (2 * Math.tan(camera.fov * Math.PI / 360));
      projectedNodes = nodeItems.map(item => {
        const view = vector(item.position).applyMatrix4(camera.matrixWorldInverse);
        const screen = renderer.graph2ScreenCoords(item.position.x, item.position.y, item.position.z);
        return {...item, screen, depth: -view.z, pixels: Math.max(4, item.radius * scale / -view.z)};
      });
    }
    const x = event.clientX - rect.x, y = event.clientY - rect.y;
    let best = null;
    for (const item of projectedNodes) {
      if (item.depth <= 0 || Math.hypot(item.screen.x-x, item.screen.y-y) > item.pixels + 2) continue;
      if (!best || item.depth < best.depth) best = item;
    }
    return best ? {type: 'node', id: best.id} : null;
  }
  const pick = (event) => {
    if (!root.visible) return null;
    const rect = host.getBoundingClientRect();
    const node = pickNode(event, rect);
    if (node) return node;
    pointer.set(
      ((event.clientX - rect.x) / rect.width) * 2 - 1,
      (-(event.clientY - rect.y) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, renderer.camera());
    raycaster.params.Line.threshold = renderer.camera().position.distanceTo(renderer.controls().target) / Math.max(300, rect.height) * 2;
    // Dense imports stay selectable on click. Hovering the complete line mesh
    // would raycast hundreds of thousands of segments on every pointer move.
    const hit = raycaster.intersectObjects(pickable.filter(o => o.visible && o.parent.visible &&
      (event.type === 'pointerup' || o.userData.type !== 'imports')), false)[0];
    if (!hit) return null;
    if (hit.object.userData.type === "imports") {
      const edge = hit.object.userData.segmentEdges[Math.floor(hit.index / 2)];
      return edge ? { type: "import", edge } : null;
    }
    return hit.object.userData;
  };
  const onMove = (event) => {
    moveEvent = event;
    if (moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      const orbiting = press && Math.hypot(moveEvent.clientX - press[0], moveEvent.clientY - press[1]) > 5;
      callbacks.hover?.(orbiting ? null : pick(moveEvent), moveEvent);
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(moveFrame); moveFrame = 0;
    press = null;
    callbacks.hover?.(null);
  };
  const onDown = (event) => {
    press = [event.clientX, event.clientY];
  };
  const onUp = (event) => {
    if (
      !press ||
      Math.hypot(event.clientX - press[0], event.clientY - press[1]) > 5
    )
      { press = null; return; }
    const item = pick(event);
    if (item) callbacks.select(item);
    press = null;
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointerleave", onLeave);
  return {
    rebuildNodes(items, positions, colorFor, radiusFor, enabled) {
      clear(nodes);
      nodes.visible = enabled;
      nodeItems = []; projectedNodes = null;
      if (!enabled || !items.length) return;
      const coordinates = [], colors = [], radii = [];
      for (const item of items) {
        const position = positions[item.id], radius = radiusFor(item);
        const color = new Color(colorFor(item));
        coordinates.push(position.x, position.y, position.z);
        colors.push(color.r, color.g, color.b); radii.push(radius);
        nodeItems.push({id: item.id, position, radius});
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(coordinates, 3));
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.setAttribute('radius', new Float32BufferAttribute(radii, 1));
      const mesh = new Points(geometry, new ShaderMaterial({
        uniforms: {height: {value: host.clientHeight * renderer.renderer().getPixelRatio()},
          fogNear: {value: 1500}, fogFar: {value: 4500}},
        vertexShader: `attribute vec3 color; attribute float radius;
          uniform float height; varying vec3 tint; varying float depth;
          void main() { vec4 view = modelViewMatrix * vec4(position, 1.0);
            tint = color; depth = -view.z; gl_Position = projectionMatrix * view;
            gl_PointSize = max(1.0, radius * height * projectionMatrix[1][1] / -view.z); }`,
        fragmentShader: `varying vec3 tint; varying float depth; uniform float fogNear; uniform float fogFar;
          void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p,p);
            if (r > 1.0) discard;
            vec3 shaded = tint * (0.72 + 0.28 * sqrt(1.0-r));
            gl_FragColor = vec4(mix(shaded, vec3(0.003,0.004,0.005), smoothstep(fogNear,fogFar,depth)), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }));
      nodes.add(mesh);
    },
    rebuildImports(edges, positions, colorFor, widthFor, enabled, primaryFor, curved = true) {
      clear(imports);
      pickable = pickable.filter(object => object.userData.type !== "imports");
      imports.visible = enabled;
      if (!enabled) return;
      for (const batch of partitionImportEdges(edges, colorFor, widthFor)) {
        const coordinates = [], colors = [], members = [], segmentEdges = [], samples = [];
        for (const { edge, color: colorValue } of batch.members) {
          const from = typeof edge.source === "object" ? edge.source.id : edge.source;
          const to = typeof edge.target === "object" ? edge.target.id : edge.target;
          const color = new Color(colorValue);
          const route = curved ? importGeometry(edge, positions, primaryFor(edge)) : {
            steps: 1, curvature: 0,
            point: t => ({x: positions[from].x * (1-t) + positions[to].x * t,
              y: positions[from].y * (1-t) + positions[to].y * t,
              z: positions[from].z * (1-t) + positions[to].z * t}),
          };
          let previous = route.point(0);
          for (let step = 1; step <= route.steps; step++) {
            const next = route.point(step / route.steps);
            for (const p of [previous, next]) {
              coordinates.push(p.x,p.y,p.z); colors.push(color.r,color.g,color.b);
            }
            segmentEdges.push(edge); previous = next;
          }
          const middle = route.point(.5);
          samples.push({ source: from, target: to, midpoint: middle, curved: route.curvature > 0 });
          members.push(edge);
        }
        if (!members.length) continue;
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(coordinates,3));
        geometry.setAttribute("color", new Float32BufferAttribute(colors,3));
        const line = new LineSegments(geometry, new LineBasicMaterial({vertexColors:true, transparent:true, opacity:batch.opacity, depthWrite:false}));
        line.userData = {type:"imports",edges:members,segmentEdges,samples};
        imports.add(line); pickable.push(line);
      }
    },
    rebuildBundles(groups, positions, families, selected = null) {
      clear(bundles);
      pickable = pickable.filter((o) => o.userData.type !== "bundle");
      labels = [];
      for (const [index, group] of groups.entries()) {
        if (group.key === selected) continue;
        const source = average(
          group.edges.map((e) => e.source),
          positions,
        );
        const target = average(
          group.edges.map((e) => e.target),
          positions,
        );
        const gap = source.distanceTo(target);
        const from = families.find((f) => f.id === group.source),
          to = families.find((f) => f.id === group.target);
        const direction = Math.sign(
          families.indexOf(to) - families.indexOf(from),
        );
        const middle = source.clone().lerp(target, 0.5);
        const bend = Math.min(100, gap * 0.16);
        middle.x += ((target.y - source.y) / gap) * bend;
        middle.y -= ((target.x - source.x) / gap) * bend;
        middle.z += direction * (70 + gap * 0.13);
        const curve = new CubicBezierCurve3(
          source,
          source.clone().lerp(middle, 0.72),
          target.clone().lerp(middle, 0.72),
          target,
        );
        const color = new Color(from.color).lerp(new Color(to.color), 0.5);
        const tube = new Mesh(
          new TubeGeometry(
            curve,
            28,
            0.35 + Math.min(1.15, Math.log2(1 + group.edges.length) * 0.15),
            5,
            false,
          ),
          new MeshBasicMaterial({
            color,
            transparent: true,
            opacity: selected
              ? 0.05
              : 0.035 + Math.log2(1 + group.edges.length) * 0.065,
            depthWrite: false,
          }),
        );
        tube.userData = {
          type: "bundle",
          key: group.key,
          title: `${from.name} to ${to.name}`,
          count: group.edges.length,
        };
        bundles.add(tube);
        pickable.push(tube);
        const spokes = [];
        for (const [ids, center] of [
          [group.edges.map((e) => e.source), source],
          [group.edges.map((e) => e.target), target],
        ]) {
          for (const id of new Set(ids))
            spokes.push(vector(positions[id]), center.clone());
        }
        bundles.add(
          new LineSegments(
            new BufferGeometry().setFromPoints(spokes),
            new LineBasicMaterial({
              color,
              transparent: true,
              opacity: selected ? 0.025 : 0.075,
              depthWrite: false,
            }),
          ),
        );
        if (index < 5 && !selected)
          labels.push({ ...tube.userData, point: curve.getPoint(0.5) });
      }
      return labels;
    },
    rebuildResearch(markers, positions, active) {
      clear(research);
      pickable = pickable.filter((o) => o.userData.type !== "research");
      research.visible = active;
      if (!active) return [];
      for (const item of markers) {
        const diamond = new Mesh(
          new OctahedronGeometry(10),
          new MeshBasicMaterial({
            color: "#ffe1a0",
            wireframe: true,
            transparent: true,
            opacity: 0.92,
          }),
        );
        diamond.position.copy(vector(item.point));
        diamond.userData = item;
        research.add(diamond);
        pickable.push(diamond);
        for (const id of item.anchors) {
          const from = vector(positions[id]),
            to = vector(item.point);
          const middle = from.clone().lerp(to, 0.5);
          middle.z += 25;
          const curve = new CubicBezierCurve3(
            from,
            from.clone().lerp(middle, 0.7),
            to.clone().lerp(middle, 0.7),
            to,
          );
          const line = new Line(
            new BufferGeometry().setFromPoints(curve.getPoints(20)),
            new LineDashedMaterial({
              color: "#dcb979",
              dashSize: 4,
              gapSize: 5,
              transparent: true,
              opacity: markers.length === 1 ? 0.55 : 0.25,
              depthWrite: false,
            }),
          );
          line.computeLineDistances();
          research.add(line);
        }
      }
      return markers;
    },
    setBundlesVisible(visible) {
      bundles.visible = visible;
    },
    setDragging(active) {
      root.visible = !active;
    },
    rebuildFocus(position) {
      clear(focus);
      if (!position) return;
      const ring = new Mesh(
        new TorusGeometry(8, 0.28, 5, 40),
        new MeshBasicMaterial({
          color: "#e8fff6",
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      );
      focus.position.copy(vector(position));
      focus.add(ring);
    },
    rebuildLandmarks(items) {
      clear(landmarks);
      for (const item of items) {
        const group = new Group();
        group.position.copy(vector(item.position));
        for (const [scale, opacity, thickness] of [[1, .8, .32], [1.5, .18, .65]]) {
          group.add(new Mesh(new TorusGeometry(item.radius * scale, thickness, 5, 40),
            new MeshBasicMaterial({color: item.color, transparent: true, opacity, depthWrite: false})));
        }
        landmarks.add(group);
      }
    },
    updateCamera() {
      projectedNodes = null;
      const distance = renderer
        .camera()
        .position.distanceTo(renderer.controls().target);
      renderer.scene().fog.near = distance * 0.65;
      renderer.scene().fog.far = distance * 1.65;
      for (const mesh of nodes.children) {
        mesh.material.uniforms.height.value = host.clientHeight * renderer.renderer().getPixelRatio();
        mesh.material.uniforms.fogNear.value = distance * .65;
        mesh.material.uniforms.fogFar.value = distance * 1.65;
      }
      focus.quaternion.copy(renderer.camera().quaternion);
      for (const group of landmarks.children) group.quaternion.copy(renderer.camera().quaternion);
    },
    rebuildChanges(summary, positions, visibleIds, enabled) {
      clear(changes);
      changes.visible = enabled;
      if (!enabled || !summary) return;
      for (const [ids, color] of [
        [summary.added, "#9aefc0"],
        [summary.changed, "#efb27e"],
      ]) {
        const vertices = [];
        for (const id of ids) {
          if (!positions[id] || !visibleIds.has(id)) continue;
          const p = vector(positions[id]);
          for (let i = 0; i < 20; i++) {
            for (const angle of [
              (i / 20) * Math.PI * 2,
              ((i + 1) / 20) * Math.PI * 2,
            ])
              vertices.push(
                p
                  .clone()
                  .add(
                    new Vector3(Math.cos(angle) * 9, Math.sin(angle) * 9, 0),
                  ),
              );
          }
        }
        if (vertices.length)
          changes.add(
            new LineSegments(
              new BufferGeometry().setFromPoints(vertices),
              new LineBasicMaterial({
                color,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
              }),
            ),
          );
      }
    },
    pulseChanges(amount) {
      for (const line of changes.children)
        line.material.opacity = 0.4 + amount * 0.4;
    },
    diagnostics({ includeGraph = false } = {}) {
      return {
        ...(includeGraph ? {
          importPairs: imports.visible ? imports.children.flatMap(object => object.userData.edges.map(edge =>
            [typeof edge.source === "object" ? edge.source.id : edge.source, typeof edge.target === "object" ? edge.target.id : edge.target])) : [],
          importOpacities: imports.children.map(object => object.material.opacity),
          importSamples: imports.children.flatMap(object => object.userData.samples).filter((_,i)=>i%7===0).slice(0,1200),
        } : {}),
        landmarks: landmarks.children.length,
        batchedNodes: nodes.visible ? nodeItems.length : 0,
        nodeDrawCalls: nodes.visible ? nodes.children.length : 0,
        batchedImports: imports.visible ? imports.children.reduce((n,object) => n+object.userData.edges.length,0) : 0,
        importDrawCalls: imports.visible ? imports.children.length : 0,
        importSegments: imports.visible ? imports.children.reduce((n,object)=>n+object.userData.segmentEdges.length,0) : 0,
        curvedImports: imports.visible ? imports.children.reduce((n,object)=>n+object.userData.samples.filter(s=>s.curved).length,0) : 0,
        bundles: pickable.filter((o) => o.userData.type === "bundle").length,
        bundleObjects: bundles.children.length,
        bundlesVisible: bundles.visible,
        researchMarkers: pickable.filter((o) => o.userData.type === "research")
          .length,
        researchVisible: research.visible,
        changeHalos: changes.children.reduce(
          (n, o) => n + o.geometry.attributes.position.count / 40,
          0,
        ),
      };
    },
    destroy() {
      clear(bundles);
      clear(research);
      clear(changes);
      clear(focus);
      clear(landmarks);
      clear(imports);
      renderer.scene().remove(root);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointerleave", onLeave);
    },
  };
}

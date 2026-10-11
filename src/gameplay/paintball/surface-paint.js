import * as THREE from 'three';

export const PAINT_VERTICES = 1536; // 512 triangles per mark, 96 reused buffers.
const EPSILON = .0015;

export function createSurfacePaintGeometry() {
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'paintCoord']) geometry.setAttribute(name,
    new THREE.BufferAttribute(new Float32Array(PAINT_VERTICES * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), .6);
  return geometry;
}

/** A 3D brush, evaluated on clipped scene triangles. Distance through the brush
 * continues across a box edge, rather than collapsing the adjacent face's UVs. */
export function surfacePaintMaterial(color) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, toneMapped: false, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => 'surface-paint-v1';
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute vec3 paintCoord; varying vec3 vPaintCoord;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintCoord = paintCoord;');
    shader.fragmentShader = `varying vec3 vPaintCoord;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `
      #include <color_fragment>
      float angle = atan(vPaintCoord.y, vPaintCoord.x);
      float rim = 1.0 + .16 * sin(angle * 5.0) + .09 * cos(angle * 9.0);
      float ink = rim - length(vPaintCoord);
      ink = max(ink, .21 - length(vPaintCoord - vec3(1.35, .52, 0.0)));
      ink = max(ink, .17 - length(vPaintCoord - vec3(-1.25, .21, 0.0)));
      ink = max(ink, .18 - length(vPaintCoord - vec3(.36, -1.35, 0.0)));
      ink = max(ink, .14 - length(vPaintCoord - vec3(-.62, 1.2, 0.0)));
      ink = max(ink, .12 - length(vPaintCoord - vec3(1.3, -.73, 0.0)));
      if (ink < 0.0) discard;
    `);
  };
  return material;
}

function dynamicOwner(object) {
  for (let o = object; o; o = o.parent) if (o.userData.dynamicPaint || o.userData.rigidBody || o.userData.physicsBody) return o;
  return null;
}
function visible(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}
const paintable = m => m && m.visible !== false && !m.isShaderMaterial && (!m.transparent || m.opacity >= .65);

/** Work happens at impact only. BVH narrows big merged meshes, instance/mesh
 * bounds reject distant scenery, and output/storage are strictly bounded. */
export function projectSurfacePaint(hit, meshes, geometry, serial = 1) {
  const radius = .19 * (.9 + serial % 5 * .06);
  const brushRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), serial * 2.39996));
  const brushInverse = brushRotation.clone().invert(), origin = hit.point.clone().addScaledVector(hit.normal, .002);
  const worldBox = new THREE.Box3().setFromCenterAndSize(hit.point, new THREE.Vector3().setScalar(radius * 3.2));
  const owner = dynamicOwner(hit.object), position = geometry.attributes.position, coords = geometry.attributes.paintCoord;
  const matrix = new THREE.Matrix4(), inverse = new THREE.Matrix4(), localBox = new THREE.Box3(), bounds = new THREE.Box3();
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), edge = new THREE.Vector3();
  let count = 0, visitedTriangles = 0, instances = 0;
  function emit(a, b, c, transform, material) {
    if (count + 3 > PAINT_VERTICES || !paintable(material)) return;
    visitedTriangles++;
    let polygon = [a.clone().applyMatrix4(transform), b.clone().applyMatrix4(transform), c.clone().applyMatrix4(transform)];
    normal.subVectors(polygon[1], polygon[0]).cross(edge.subVectors(polygon[2], polygon[0])).normalize();
    if (material.side === THREE.BackSide) normal.negate();
    if (normal.dot(hit.normal) < -.15) {
      if (material.side !== THREE.DoubleSide) return;
      normal.negate();
    }
    // Clip triangles to the small axis-aligned brush box before uploading.
    for (const axis of ['x', 'y', 'z']) for (const sign of [-1, 1]) {
      if (!polygon.length) return;
      const limit = hit.point[axis] + sign * radius * 1.6, clipped = [];
      let previous = polygon.at(-1), previousDistance = sign * (previous[axis] - limit);
      for (const current of polygon) {
        const distance = sign * (current[axis] - limit);
        if ((distance <= 0) !== (previousDistance <= 0)) clipped.push(previous.clone().lerp(current, previousDistance / (previousDistance - distance)));
        if (distance <= 0) clipped.push(current);
        previous = current; previousDistance = distance;
      }
      polygon = clipped;
    }
    for (let i = 1; i + 1 < polygon.length && count + 3 <= PAINT_VERTICES; i++) for (const vertex of [polygon[0], polygon[i], polygon[i + 1]]) {
      point.copy(vertex).sub(origin).addScaledVector(normal, EPSILON); position.setXYZ(count, point.x, point.y, point.z);
      point.copy(vertex).sub(hit.point).applyQuaternion(brushInverse).divideScalar(radius); coords.setXYZ(count, point.x, point.y, point.z); count++;
    }
  }
  function project(mesh, transform) {
    const geo = mesh.geometry;
    if (!geo?.attributes.position) return;
    geo.boundingBox ||= (geo.computeBoundingBox(), geo.boundingBox);
    if (!bounds.copy(geo.boundingBox).applyMatrix4(transform).intersectsBox(worldBox)) return;
    inverse.copy(transform).invert(); localBox.copy(worldBox).applyMatrix4(inverse);
    const materialAt = triangleIndex => {
      if (triangleIndex * 3 < geo.drawRange.start || triangleIndex * 3 >= geo.drawRange.start + geo.drawRange.count) return null;
      if (!Array.isArray(mesh.material)) return mesh.material;
      const group = geo.groups.find(g => triangleIndex * 3 >= g.start && triangleIndex * 3 < g.start + g.count);
      return mesh.material[group?.materialIndex ?? 0];
    };
    if (geo.boundsTree) {
      geo.boundsTree.shapecast({
        intersectsBounds: box => box.intersectsBox(localBox),
        intersectsTriangle: (triangle, triangleIndex) => {
          emit(triangle.a, triangle.b, triangle.c, transform, materialAt(triangleIndex));
          return count + 3 > PAINT_VERTICES;
        },
      });
    } else {
      const vertices = geo.attributes.position, index = geo.index, n = index?.count ?? vertices.count;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < n && count + 3 <= PAINT_VERTICES; i += 3) {
        a.fromBufferAttribute(vertices, index ? index.getX(i) : i);
        b.fromBufferAttribute(vertices, index ? index.getX(i + 1) : i + 1);
        c.fromBufferAttribute(vertices, index ? index.getX(i + 2) : i + 2);
        if (bounds.setFromPoints([a, b, c]).intersectsBox(localBox)) emit(a, b, c, transform, materialAt(i / 3));
      }
    }
  }
  // Always handle the actually hit instance first, even in a very large batch.
  const candidates = [hit.object, ...meshes.filter(mesh => mesh !== hit.object)];
  for (const mesh of candidates) {
    if (count + 3 > PAINT_VERTICES) break;
    if (!visible(mesh) || dynamicOwner(mesh) !== owner) continue;
    mesh.updateWorldMatrix(true, false);
    const meshBounds = mesh.isInstancedMesh ? mesh.boundingBox : mesh.geometry?.boundingBox;
    if (meshBounds && !bounds.copy(meshBounds).applyMatrix4(mesh.matrixWorld).intersectsBox(worldBox)) continue;
    if (mesh.isInstancedMesh) {
      const first = mesh === hit.object ? hit.instanceId : undefined;
      if (first !== undefined) { mesh.getMatrixAt(first, matrix); matrix.premultiply(mesh.matrixWorld); project(mesh, matrix); }
      // Broad-phase batches are spatially partitioned when the level loads.
      for (let i = 0; i < mesh.count && count + 3 <= PAINT_VERTICES && instances < 512; i++) {
        if (i === first) continue;
        instances++; mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld); project(mesh, matrix);
      }
    } else project(mesh, mesh.matrixWorld);
  }
  geometry.setDrawRange(0, count);
  for (const attribute of [position, coords]) {
    attribute.clearUpdateRanges(); attribute.addUpdateRange(0, count * 3); attribute.needsUpdate = true;
  }
  return { origin, owner, vertices: count, visitedTriangles };
}

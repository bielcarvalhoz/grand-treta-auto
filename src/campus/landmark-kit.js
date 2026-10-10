import * as THREE from 'three';

// Peças simples para os marcos do campus (escadaria, locomotiva, acessos): tudo vira UMA malha
// por cor, mais uma por textura de placa. Sem UV nas peças lisas; sombreamento chapado.

/** Sistema local de uma peça: +x local = (cos yaw, -sin yaw), +z local = (sin yaw, cos yaw). */
export const frameAt = (x, z, yaw, y = 0) => ({ x, y, z, yaw });
export const yawOf = (dx, dz) => Math.atan2(-dz, dx);
export const toWorld = (frame, x, z) => {
  const c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
  return [frame.x + x * c + z * s, frame.z - x * s + z * c];
};
export const rectRing = (frame, x0, z0, x1, z1) => [toWorld(frame, x0, z0), toWorld(frame, x1, z0), toWorld(frame, x1, z1), toWorld(frame, x0, z1)];

/** Fecho convexo (cadeia monótona) de pontos [x, z]. */
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) { while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 1e-9) out.pop(); out.push(p); }
    out.pop(); return out;
  };
  return [...half(pts), ...half(pts.reverse())];
}

export function createKit(renderer) {
  const solids = new Map(), signs = new Map();
  const bucket = (color) => { if (!solids.has(color)) solids.set(color, []); return solids.get(color); };
  const matrixOf = (frame) => new THREE.Matrix4().makeRotationY(frame.yaw).setPosition(frame.x, frame.y || 0, frame.z);
  const push = (color, geometry, frame) => {
    if (frame) geometry.applyMatrix4(matrixOf(frame));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry, out = bucket(color), p = flat.attributes.position.array;
    for (let i = 0; i < p.length; i++) out.push(p[i]);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  };
  /** triângulo em coordenadas do mundo; `toward` orienta a face (vetor aproximado da normal) */
  const tri = (color, a, b, c, toward) => {
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (toward && nx * toward[0] + ny * toward[1] + nz * toward[2] < 0) [b, c] = [c, b];
    bucket(color).push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const quad = (color, a, b, c, d, toward) => { tri(color, a, b, c, toward); tri(color, a, c, d, toward); };

  const kit = {
    box(color, frame, x, y, z, w, h, d) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); push(color, g, frame); },
    cylinder(color, frame, x, y, z, radius, length, axis = 'y', segments = 10, top = radius) {
      const g = new THREE.CylinderGeometry(top, radius, length, segments);
      if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
      g.translate(x, y, z); push(color, g, frame);
    },
    sphere(color, frame, x, y, z, radius, sy = 1) { const g = new THREE.SphereGeometry(radius, 8, 6); g.scale(1, sy, 1); g.translate(x, y, z); push(color, g, frame); },
    /** tubo entre dois pontos locais [x, y, z] */
    tube(color, frame, a, b, radius = .035, segments = 5) {
      const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), vector = bv.clone().sub(av), length = vector.length();
      if (length < 1e-4) return;
      const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize()));
      g.translate(...av.add(bv).multiplyScalar(.5).toArray()); push(color, g, frame);
    },
    /** tubo entre dois pontos do mundo [x, y, z] */
    rail(color, a, b, radius = .03) { kit.tube(color, null, a, b, radius); },
    /** prisma reto sobre um polígono [x, z] convexo (y0 embaixo, y1 em cima) */
    prism(color, ring, y0, y1) {
      const n = ring.length; let cx = 0, cz = 0;
      for (const [x, z] of ring) { cx += x / n; cz += z / n; }
      for (let i = 0; i < n; i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
        tri(color, [cx, y1, cz], [ax, y1, az], [bx, y1, bz], [0, 1, 0]);
        tri(color, [cx, y0, cz], [ax, y0, az], [bx, y0, bz], [0, -1, 0]);
        quad(color, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [(ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz]);
      }
    },
    /** parede entre dois pontos do mundo com base e topo inclinados (guarda-corpo de lance) */
    wall(color, a, b, thickness, bottomA, topA, bottomB, topB) {
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1, px = -dz / length * thickness / 2, pz = dx / length * thickness / 2;
      const P = (p, side, y) => [p[0] + px * side, y, p[1] + pz * side];
      for (const side of [-1, 1]) quad(color, P(a, side, bottomA), P(b, side, bottomB), P(b, side, topB), P(a, side, topA), [px * side, 0, pz * side]);
      quad(color, P(a, -1, topA), P(b, -1, topB), P(b, 1, topB), P(a, 1, topA), [0, 1, 0]);
      quad(color, P(a, -1, bottomA), P(a, 1, bottomA), P(a, 1, topA), P(a, -1, topA), [-dx, 0, -dz]);
      quad(color, P(b, -1, bottomB), P(b, 1, bottomB), P(b, 1, topB), P(b, -1, topB), [dx, 0, dz]);
    },
    tri, quad,
    /** piso que acompanha o relevo: `at(u, v)` devolve o ponto do mundo [x, y, z] de cada nó da malha */
    drape(color, at, u0, v0, u1, v1, step = 1) {
      const nu = Math.max(1, Math.ceil((u1 - u0) / step)), nv = Math.max(1, Math.ceil((v1 - v0) / step));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const ua = u0 + (u1 - u0) * i / nu, ub = u0 + (u1 - u0) * (i + 1) / nu, va = v0 + (v1 - v0) * j / nv, vb = v0 + (v1 - v0) * (j + 1) / nv;
        quad(color, at(ua, va), at(ub, va), at(ub, vb), at(ua, vb), [0, 1, 0]);
      }
    },
    /** placa texturizada: `paint(g, w, h)` desenha num canvas; uv = [u0, v0, u1, v1] recorta um atlas */
    sign(key, paint, frame, x, y, z, w, h, { reverse = false, uv = null, size = [512, 256], tilt = 0 } = {}) {
      if (!signs.has(key)) signs.set(key, { paint, size, geometries: [] });
      const g = new THREE.PlaneGeometry(w, h);
      if (uv) { const t = g.attributes.uv; for (let i = 0; i < t.count; i++) t.setXY(i, uv[0] + t.getX(i) * (uv[2] - uv[0]), uv[1] + t.getY(i) * (uv[3] - uv[1])); }
      if (tilt) g.rotateX(tilt);
      if (reverse) g.rotateY(Math.PI);
      g.translate(x, y, z); g.applyMatrix4(matrixOf(frame));
      signs.get(key).geometries.push(g);
    },
    /** placa texturizada em 4 cantos do mundo [x, y, z]: inf-esq, inf-dir, sup-dir, sup-esq */
    signCorners(key, paint, [a, b, c, d], { size = [512, 256] } = {}) {
      if (!signs.has(key)) signs.set(key, { paint, size, geometries: [] });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
      signs.get(key).geometries.push(g);
    },
    finish(name) {
      const root = new THREE.Group(); root.name = name;
      // Todas as peças lisas numa malha só (cor por vértice); vidro e marquise têm material próprio.
      const special = { glass: () => new THREE.MeshStandardMaterial({ color: '#27404a', roughness: .2, metalness: .25 }),
        canopy: () => new THREE.MeshStandardMaterial({ color: '#f1f1ea', roughness: .5, transparent: true, opacity: .78, side: THREE.DoubleSide }) };
      const mesh = (name, positions, material, colors) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        const m = new THREE.Mesh(geometry, material); m.name = name; m.receiveShadow = true; root.add(m);
        return m;
      };
      const positions = [], colors = [], tint = new THREE.Color();
      for (const [color, list] of solids) {
        if (!list.length) continue;
        if (special[color]) { mesh(`${name}-${color}`, list, special[color]()).castShadow = color !== 'canopy'; continue; }
        tint.set(color);
        for (let i = 0; i < list.length; i += 3) { positions.push(list[i], list[i + 1], list[i + 2]); colors.push(tint.r, tint.g, tint.b); }
      }
      if (positions.length) mesh(`${name}-pecas`, positions, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, side: THREE.DoubleSide }), colors).castShadow = true;
      for (const [key, { paint, size, geometries }] of signs) {
        let map = null;
        if (typeof document !== 'undefined') {
          const canvas = document.createElement('canvas'); canvas.width = size[0]; canvas.height = size[1];
          paint(canvas.getContext('2d'), size[0], size[1]);
          map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = Math.min(4, renderer?.capabilities.getMaxAnisotropy() || 1);
        }
        const positions = [], uvs = [];
        for (const g of geometries) {
          const flat = g.index ? g.toNonIndexed() : g;
          positions.push(...flat.attributes.position.array); uvs.push(...flat.attributes.uv.array);
          if (flat !== g) flat.dispose();
          g.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, color: 0xffffff, side: THREE.DoubleSide }));
        mesh.name = `${name}-placa-${key}`; mesh.receiveShadow = false; root.add(mesh);
      }
      const stats = { meshes: 0, triangles: 0 };
      root.traverse((o) => { if (o.isMesh) { stats.meshes++; stats.triangles += o.geometry.attributes.position.count / 3; } });
      root.userData.stats = stats;
      return root;
    },
  };
  return kit;
}

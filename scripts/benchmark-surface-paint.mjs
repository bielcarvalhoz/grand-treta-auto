// CPU impact projection only; GPU/mobile FPS requires device measurement.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { preparePaintColliders } from '../src/gameplay/paintball/collision.js';
import { createSurfacePaintGeometry, projectSurfacePaint, PAINT_VERTICES } from '../src/gameplay/paintball/surface-paint.js';

const material = new THREE.MeshBasicMaterial();
const parts = Array.from({ length: 3000 }, (_, i) => new THREE.BoxGeometry(6, 8, 6).translate((i % 60 - 30) * 20, 4, (Math.floor(i / 60) - 25) * 20));
const buildings = new THREE.Mesh(mergeGeometries(parts), material); parts.forEach(g => g.dispose());
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 256, 256).rotateX(-Math.PI / 2), material);
const column = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 256, 8), material); column.position.set(8, 1.5, 0);
const meshes = [buildings, ground, column]; meshes.forEach(m => m.updateMatrixWorld(true));
const stats = preparePaintColliders(meshes), geometry = createSurfacePaintGeometry();
const impacts = Array.from({ length: 600 }, (_, i) => i % 3 === 0
  ? { object: buildings, point: new THREE.Vector3(2.95, 4 + (i % 10 - 5) * .03, 3), normal: new THREE.Vector3(0, 0, 1) }
  : i % 3 === 1 ? { object: ground, point: new THREE.Vector3(7 + i % 5 * .1, 0, 3), normal: new THREE.Vector3(0, 1, 0) }
    : { object: column, point: new THREE.Vector3(8, 1 + i % 5 * .1, 1), normal: new THREE.Vector3(0, 0, 1) });
impacts.slice(0, 30).forEach((hit, i) => projectSurfacePaint(hit, meshes, geometry, i + 1));
const elapsed = []; let maxVertices = 0, maxVisitedTriangles = 0;
for (const [i, hit] of impacts.entries()) {
  const start = performance.now(), result = projectSurfacePaint(hit, meshes, geometry, i + 1);
  elapsed.push(performance.now() - start);
  if (!result.vertices) throw new Error(`Missing paint at impact ${i}`);
  maxVertices = Math.max(maxVertices, result.vertices); maxVisitedTriangles = Math.max(maxVisitedTriangles, result.visitedTriangles);
}
elapsed.sort((a, b) => a - b);
console.log(JSON.stringify({ impacts: impacts.length, sceneTriangles: stats.triangles,
  medianMs: +elapsed[300].toFixed(3), p95Ms: +elapsed[570].toFixed(3), maxMs: +elapsed.at(-1).toFixed(3),
  maxVertices, vertexCap: PAINT_VERTICES, maxVisitedTriangles, poolBufferMiB: +(96 * PAINT_VERTICES * 6 * 4 / 1024 ** 2).toFixed(2),
  gpuOrMobileFpsMeasured: false }, null, 2));
geometry.dispose(); meshes.forEach(m => m.geometry.dispose()); material.dispose();

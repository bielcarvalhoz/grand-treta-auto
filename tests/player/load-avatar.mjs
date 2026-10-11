import fs from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Keep real geometry, skin and animation data, excluding browser-only images. */
export async function loadAvatarGeometry(url) {
  const bytes = await fs.readFile(url);
  const jsonSize = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonSize));
  const binaryOffset = 20 + jsonSize;
  const binary = bytes.subarray(binaryOffset + 8, binaryOffset + 8 + bytes.readUInt32LE(binaryOffset));
  for (const material of gltf.materials || []) {
    delete material.normalTexture; delete material.occlusionTexture; delete material.emissiveTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  delete gltf.images; delete gltf.textures; delete gltf.samplers;
  gltf.buffers = [{ byteLength: binary.length, uri: `data:application/octet-stream;base64,${binary.toString('base64')}` }];
  globalThis.ProgressEvent ??= class ProgressEvent extends Event {};
  return new GLTFLoader().parseAsync(JSON.stringify(gltf), '');
}

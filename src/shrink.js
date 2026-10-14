// Shrinks a .glb model by re-saving its texture images smaller, for shrink.html.
// A Meshy export is mostly big PNG textures (a 25 MB file is ~18 MB of
// pictures), so the mesh, skeleton and animations are copied byte for byte
// and only the images change: scaled down to `maxSize` pixels and saved as
// JPEG (or PNG if they use transparency).

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function readGlb(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('This is not a .glb file.');
  let json = null;
  let bin = new ArrayBuffer(0);
  for (let at = 12; at + 8 <= buf.byteLength;) {
    const len = dv.getUint32(at, true);
    const type = dv.getUint32(at + 4, true);
    const data = buf.slice(at + 8, at + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === CHUNK_BIN) bin = data;
    at += 8 + len;
  }
  if (!json) throw new Error('The file has no glTF data in it.');
  return { json, bin };
}

const pad4 = (n) => (n + 3) & ~3;

function writeGlb(json, bin) {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(text.length);
  const binLen = pad4(bin.length);
  const out = new Uint8Array(12 + 8 + jsonLen + 8 + binLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.fill(0x20, 20, 20 + jsonLen); // JSON is padded with spaces
  out.set(text, 20);
  const binAt = 20 + jsonLen;
  dv.setUint32(binAt, binLen, true);
  dv.setUint32(binAt + 4, CHUNK_BIN, true);
  out.set(bin, binAt + 8);
  return out;
}

// Which material slot uses each image, so the less important ones can be smaller.
function imageRoles(json) {
  const roles = {};
  const mark = (texInfo, role) => {
    const src = texInfo && json.textures?.[texInfo.index]?.source;
    if (src !== undefined) roles[src] = roles[src] ?? role;
  };
  for (const m of json.materials ?? []) {
    mark(m.pbrMetallicRoughness?.baseColorTexture, 'color');
    mark(m.normalTexture, 'normal');
    mark(m.emissiveTexture, 'glow');
    mark(m.pbrMetallicRoughness?.metallicRoughnessTexture, 'roughness');
    mark(m.occlusionTexture, 'shadow');
  }
  return roles;
}

export function describeGlb(buf) {
  const { json } = readGlb(buf);
  const bones = (json.skins ?? []).flatMap((s) => s.joints.map((j) => json.nodes[j].name ?? ''));
  const mixamo = bones.some((n) => /hips$/i.test(n.replace(/[:_]/g, '')));
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      const acc = json.accessors[p.indices ?? p.attributes.POSITION];
      tris += Math.floor(acc.count / 3);
    }
  }
  const imgs = (json.images ?? []).length;
  const lines = [
    `Shape: ${tris.toLocaleString()} triangles`,
    `Textures: ${imgs ? `${imgs} picture${imgs === 1 ? '' : 's'}` : 'none (it will get a clay look in game)'}`,
    `Skeleton: ${!bones.length ? 'none - needs rigging before it can be animated' : mixamo ? `yes, ${bones.length} bones (the game can animate it)` : `${bones.length} bones, but not Mixamo-style names (the game won't animate it)`}`,
  ];
  if (json.animations?.length) lines.push(`Animations: ${json.animations.map((a) => a.name).join(', ')}`);
  if (json.extensionsRequired?.length) lines.push(`Uses: ${json.extensionsRequired.join(', ')}`);
  return lines.join('\n');
}

export async function shrinkGlb(buf, maxSize = 2048, log = () => {}) {
  const { json, bin } = readGlb(buf);
  if ((json.buffers?.length ?? 0) > 1 || json.extensionsRequired?.length) {
    throw new Error('This file is already compressed in a way this page does not handle.');
  }
  const views = (json.bufferViews ?? []).map((v) => new Uint8Array(bin, v.byteOffset ?? 0, v.byteLength));
  const roles = imageRoles(json);

  for (const [i, img] of (json.images ?? []).entries()) {
    if (img.bufferView === undefined) continue;
    const bitmap = await createImageBitmap(new Blob([views[img.bufferView]], { type: img.mimeType }), {
      colorSpaceConversion: 'none', // keep the raw values: normal maps aren't colors
      premultiplyAlpha: 'none',
    });
    // Roughness/shadow maps barely show at game distance, so they get half the size.
    const role = roles[i] ?? 'other';
    const limit = role === 'roughness' || role === 'shadow' ? Math.max(256, maxSize / 2) : maxSize;
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, w, h).data;
    let seeThrough = false;
    for (let p = 3; p < pixels.length; p += 16) {
      if (pixels[p] < 250) { seeThrough = true; break; }
    }
    const blob = await canvas.convertToBlob(seeThrough ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.9 });
    const before = views[img.bufferView].length;
    if (blob.size < before) {
      views[img.bufferView] = new Uint8Array(await blob.arrayBuffer());
      img.mimeType = blob.type;
    }
    log(`${role} picture: ${(before / 1048576).toFixed(1)} MB → ${(views[img.bufferView].length / 1048576).toFixed(1)} MB`);
  }

  // Pack everything back into one binary chunk (4-byte aligned).
  let size = 0;
  for (const v of views) size = pad4(size) + v.length;
  const out = new Uint8Array(pad4(size));
  let at = 0;
  json.bufferViews?.forEach((bv, i) => {
    at = pad4(at);
    out.set(views[i], at);
    bv.byteOffset = at;
    bv.byteLength = views[i].length;
    at += views[i].length;
  });
  if (json.buffers?.[0]) json.buffers[0].byteLength = out.length;
  return writeGlb(json, out);
}

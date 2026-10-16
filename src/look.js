import * as THREE from 'three';
import { INK } from './stage.js';

// Makes the scanned friends look like they belong in the cartoon world:
// the same cel shading as the scenery (soft bands instead of photo lighting),
// the same dark ink outline around them, and a rim of the stage's sky color
// along their edges, so each stage's air wraps around them. A scene sets the
// rim color with setAtmosphere() (stages pass their sky color).

const RIM = { value: new THREE.Color(0xcfe6ff) };
const RIM_STRENGTH = { value: 0.55 };

export function setAtmosphere(color, strength = 0.55) {
  RIM.value.set(color);
  RIM_STRENGTH.value = strength;
}

// For a one-off render (a portrait) in the middle of something else.
export function withAtmosphere(color, strength, draw) {
  const was = [RIM.value.clone(), RIM_STRENGTH.value];
  setAtmosphere(color, strength);
  try {
    return draw();
  } finally {
    setAtmosphere(...was);
  }
}

// Lit side, a softer middle band, and the shadow side, a little warmer and
// lighter than the scenery's ramp: faces with hard dark bands look bruised.
let ramp = null;
function skinRamp() {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([120, 150, 205, 235, 255]), 5, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.LinearFilter; // soft edges between the bands
    ramp.needsUpdate = true;
  }
  return ramp;
}

// The photo textures are lit flat and look washed out next to the painted
// scenery: a bit more color and contrast, done in the shader so the
// textures stay shared with the model cache.
const GRADE = /* glsl */ `
  vec3 graded = diffuseColor.rgb;
  float lumaG = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded = mix(vec3(lumaG), graded, 1.15);
  graded = clamp((graded - 0.5) * 1.08 + 0.5, 0.0, 1.0);
  diffuseColor.rgb = graded;
`;

function rimAndGrade(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = RIM;
    shader.uniforms.rimStrength = RIM_STRENGTH;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GRADE}`)
      .replace('#include <opaque_fragment>', /* glsl */ `
        // The smooth surface normal, not the scan's bumpy one: the rim stays
        // a clean edge instead of speckling every wrinkle.
        vec3 smoothN = normalize(vNormal);
        float facing = clamp(dot(smoothN, normalize(vViewPosition)), 0.0, 1.0);
        float rim = smoothstep(0.62, 0.92, 1.0 - facing) * (0.65 + 0.35 * smoothN.y);
        outgoingLight = mix(outgoingLight, outgoingLight * 0.55 + rimColor * 1.05, rim * rimStrength);
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'friend-look';
}

// A scanned model's material -> cel-shaded, graded, rim-lit. The scan's
// normal map is left out: its fine bumps break flat cel bands into specks
// (the texture already has the wrinkles painted in).
export function celMaterial(src) {
  const m = new THREE.MeshToonMaterial({
    color: src.color?.clone() ?? new THREE.Color(0xffffff),
    map: src.map ?? null,
    gradientMap: skinRamp(),
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
  });
  m.name = src.name;
  rimAndGrade(m);
  return m;
}

// Ink outline for a skinned mesh: a copy on the same skeleton, drawn inside
// out and pushed out along the normals. The push grows with distance, so the
// line stays about as thick on screen as the scenery's (~2 px at 720p)
// whether the camera is far out in a match or close up on the victory screen.
const OUTLINE = (() => {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: 0.0058 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;\nattribute float outlineScale;')
      .replace('#include <skinning_vertex>', /* glsl */ `#include <skinning_vertex>
        {
          vec4 viewPos = modelViewMatrix * vec4(transformed, 1.0);
          // Object scale: models come in at all sizes.
          float scale = length(modelViewMatrix[0].xyz);
          transformed += normalize(objectNormal) * outlineWidth * outlineScale * -viewPos.z / (projectionMatrix[1][1] * scale);
        }`)
      // Pushed a few cm away from the camera (same spot on screen): only the
      // silhouette shows, not clothing folds poking through the front.
      .replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
        mvPosition.xyz += normalize(mvPosition.xyz) * 0.06;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'friend-outline';
  m.userData.shared = true; // one for everybody: matches don't dispose it
  return m;
})();

// Hands are small: a full-width line around curled fingers turns the whole
// hand dark, so their line is thinner. Worked out once per model file (the
// geometry is shared by every copy), from how much each vertex follows the
// hand and finger bones.
const HAND_BONE = /hand|finger|thumb|index|middle|ring|pinky|mitten/i;
function outlineScales(mesh) {
  const geo = mesh.geometry;
  if (geo.attributes.outlineScale) return;
  const hand = mesh.skeleton.bones.map((b) => HAND_BONE.test(b.name));
  const idx = geo.attributes.skinIndex;
  const wt = geo.attributes.skinWeight;
  const scale = new Float32Array(idx.count);
  for (let i = 0; i < idx.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (hand[idx.getComponent(i, k)]) w += wt.getComponent(i, k);
    scale[i] = 1 - 0.7 * Math.min(1, w);
  }
  geo.setAttribute('outlineScale', new THREE.BufferAttribute(scale, 1));
}

export function outline(mesh) {
  if (!mesh.isSkinnedMesh) return null;
  outlineScales(mesh);
  const line = new THREE.SkinnedMesh(mesh.geometry, OUTLINE);
  line.bind(mesh.skeleton, mesh.bindMatrix);
  line.position.copy(mesh.position);
  line.quaternion.copy(mesh.quaternion);
  line.scale.copy(mesh.scale);
  line.frustumCulled = false;
  line.castShadow = false;
  line.userData.cached = true; // the geometry belongs to the model cache
  line.userData.outline = true;
  mesh.parent.add(line);
  return line;
}

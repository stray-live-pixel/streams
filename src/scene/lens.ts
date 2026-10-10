import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';

// A small lens-like softness at the image perimeter. Keeping this on the camera
// leaves the HTML interface and the separate interaction canvas sharp.
ShaderStore.ShadersStore['miniatureLensPixelShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 blurStep;
uniform vec2 safeInset;
uniform float highQuality;
uniform vec2 focus;
vec4 sampleScene(vec2 uv) {
  return texture2D(textureSampler, clamp(uv, safeInset, vec2(1.0) - safeInset));
}
void main(void) {
  // An ellipse in the 16:9 image: the central city stays in focus, while the
  // falloff reaches each edge equally instead of stretching a pixel-space circle.
  vec2 halfFrame = mix(focus, vec2(1.0) - focus, step(focus, vUV));
  float edge = smoothstep(0.4, 1.15, length((vUV - focus) / halfFrame));
  vec2 stepUV = blurStep * edge;
  vec4 center = sampleScene(vUV);
  vec4 cross = sampleScene(vUV + vec2(stepUV.x, 0.0))
    + sampleScene(vUV - vec2(stepUV.x, 0.0))
    + sampleScene(vUV + vec2(0.0, stepUV.y))
    + sampleScene(vUV - vec2(0.0, stepUV.y));
  vec4 blurred = center * 0.4 + cross * 0.15;
  if (highQuality > 0.5) {
    vec2 diagonal = stepUV * 0.70710678;
    vec4 corners = sampleScene(vUV + diagonal)
      + sampleScene(vUV - diagonal)
      + sampleScene(vUV + vec2(diagonal.x, -diagonal.y))
      + sampleScene(vUV + vec2(-diagonal.x, diagonal.y));
    blurred = center * 0.28 + cross * 0.12 + corners * 0.06;
  }
  gl_FragColor = blurred;
}
`;

/** Cheap screen-space lens softness, independent of depth buffers and picking. */
export function createLens(camera: Camera) {
  const engine = camera.getScene().getEngine();
  let quality: 'high' | 'low' = 'high';
  const postProcess = new PostProcess('miniature-lens', 'miniatureLens', {
    uniforms: ['blurStep', 'safeInset', 'highQuality', 'focus'],
    size: 1,
    camera,
    samplingMode: Texture.BILINEAR_SAMPLINGMODE,
    engine,
  });
  postProcess.onApplyObservable.add((effect) => {
    const canvas = engine.getRenderingCanvas();
    const width = Math.max(1, canvas?.clientWidth || engine.getRenderWidth());
    const height = Math.max(1, canvas?.clientHeight || engine.getRenderHeight());
    // Express the radius in CSS pixels so Retina rendering and the lower
    // quality resolution do not change the apparent size of the blur.
    const radius = quality === 'high' ? 5.5 : 4;
    effect.setFloat2('blurStep', radius / width, radius / height);
    effect.setFloat2('safeInset', 0.5 / postProcess.width, 0.5 / postProcess.height);
    effect.setFloat('highQuality', quality === 'high' ? 1 : 0);
    effect.setFloat2('focus', width < 760 ? 0.5 : 0.6, width < 760 ? 0.45 : 0.49);
  });
  return {
    setQuality(value: 'high' | 'low') {
      quality = value;
    },
    dispose() {
      postProcess.dispose(camera);
    },
  };
}

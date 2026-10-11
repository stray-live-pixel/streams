import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';

// Lens softness and a restrained painted finish share one camera pass. The
// HTML interface and separate interaction canvas remain sharp and ungraded.
ShaderStore.ShadersStore['miniatureLensPixelShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 blurStep;
uniform vec2 safeInset;
uniform float highQuality;
uniform float artisticStrength;
uniform vec2 focus;
vec4 sampleScene(vec2 uv) {
  return texture2D(textureSampler, clamp(uv, safeInset, vec2(1.0) - safeInset));
}
float paintWeight(vec3 sampleColor, vec3 centerColor) {
  vec3 difference = sampleColor - centerColor;
  return exp(-dot(difference, difference) * 42.0);
}
vec3 paintedPalette(vec3 color) {
  float luminance = dot(color, vec3(.2126, .7152, .0722));
  // A continuous shoulder retains the distinctions between cream, sand and
  // white foam. No posterisation, quantised palette or added canvas grain.
  float shoulder = .024 * smoothstep(.66, 1.0, luminance);
  float shadowLift = .006 * (1.0 - smoothstep(.04, .32, luminance));
  color *= max(0.0, luminance + shadowLift - shoulder) / max(luminance, .0001);
  float light = smoothstep(.28, .82, luminance);
  color *= mix(vec3(.986, 1.004, 1.018), vec3(1.015, 1.004, .985), light);
  return clamp(color, 0.0, 1.0);
}
void main(void) {
  // An ellipse in the 16:9 image: the central city stays in focus, while the
  // falloff reaches each edge equally instead of stretching a pixel-space circle.
  vec2 halfFrame = mix(focus, vec2(1.0) - focus, step(focus, vUV));
  float edge = smoothstep(0.5, 1.2, length((vUV - focus) / halfFrame));
  // At the centre these same taps sample about one CSS pixel for a very small
  // bilateral wash. Strength zero restores the original perimeter-only lens.
  vec2 stepUV = blurStep * max(edge, artisticStrength * .48);
  vec4 center = sampleScene(vUV);
  vec4 right = sampleScene(vUV + vec2(stepUV.x, 0.0));
  vec4 left = sampleScene(vUV - vec2(stepUV.x, 0.0));
  vec4 up = sampleScene(vUV + vec2(0.0, stepUV.y));
  vec4 down = sampleScene(vUV - vec2(0.0, stepUV.y));
  vec4 cross = right + left + up + down;
  vec4 blurred = center * 0.4 + cross * 0.15;
  float wr = paintWeight(right.rgb, center.rgb);
  float wl = paintWeight(left.rgb, center.rgb);
  float wu = paintWeight(up.rgb, center.rgb);
  float wd = paintWeight(down.rgb, center.rgb);
  vec3 wash = center.rgb + right.rgb * wr + left.rgb * wl + up.rgb * wu + down.rgb * wd;
  float washWeight = 1.0 + wr + wl + wu + wd;
  if (highQuality > 0.5) {
    vec2 diagonal = stepUV * 0.70710678;
    vec4 topRight = sampleScene(vUV + diagonal);
    vec4 bottomLeft = sampleScene(vUV - diagonal);
    vec4 bottomRight = sampleScene(vUV + vec2(diagonal.x, -diagonal.y));
    vec4 topLeft = sampleScene(vUV + vec2(-diagonal.x, diagonal.y));
    vec4 corners = topRight + bottomLeft + bottomRight + topLeft;
    blurred = center * 0.28 + cross * 0.12 + corners * 0.06;
    float wtr = paintWeight(topRight.rgb, center.rgb);
    float wbl = paintWeight(bottomLeft.rgb, center.rgb);
    float wbr = paintWeight(bottomRight.rgb, center.rgb);
    float wtl = paintWeight(topLeft.rgb, center.rgb);
    wash += topRight.rgb * wtr + bottomLeft.rgb * wbl
      + bottomRight.rgb * wbr + topLeft.rgb * wtl;
    washWeight += wtr + wbl + wbr + wtl;
  }
  // Preserve silhouettes and small bright flowers: distant colours receive
  // little bilateral weight, and the wash itself contributes only 22%.
  vec3 inFocus = mix(center.rgb, wash / washWeight, .22 * artisticStrength);
  vec3 sceneColor = mix(inFocus, blurred.rgb, smoothstep(.03, .30, edge));
  vec3 graded = paintedPalette(sceneColor);
  gl_FragColor = vec4(mix(blurred.rgb, graded, artisticStrength), blurred.a);
}
`;

/** One inexpensive screen-space finish, independent of depth buffers and picking. */
export function createLens(camera: Camera) {
  const engine = camera.getScene().getEngine();
  let quality: 'high' | 'low' = 'high';
  let artisticStrength = 1;
  const postProcess = new PostProcess('miniature-lens', 'miniatureLens', {
    uniforms: ['blurStep', 'safeInset', 'highQuality', 'focus', 'artisticStrength'],
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
    const radius = quality === 'high' ? 2.1 : 1.6;
    effect.setFloat2('blurStep', radius / width, radius / height);
    effect.setFloat2('safeInset', 0.5 / postProcess.width, 0.5 / postProcess.height);
    effect.setFloat('highQuality', quality === 'high' ? 1 : 0);
    effect.setFloat('artisticStrength', artisticStrength);
    effect.setFloat2('focus', width < 760 ? 0.5 : 0.6, width < 760 ? 0.45 : 0.49);
  });
  return {
    setQuality(value: 'high' | 'low') {
      quality = value;
    },
    setArtisticStrength(value: number) {
      artisticStrength = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    },
    get diagnostics() {
      return {
        artisticFilter: 'soft-painted-palette',
        artisticStrength,
        filterSamples: quality === 'high' ? 9 : 5,
      };
    },
    dispose() {
      postProcess.dispose(camera);
    },
  };
}

import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';

/** Small world-space pigment shapes on tagged scenery. The regular material
 * still supplies lighting/shadows; buildings and moving objects keep their paint. */
export class PaintedScenery extends MaterialPluginBase {
  constructor(material: StandardMaterial) {
    super(material, 'painted-scenery', 200, {}, true, true);
  }
  override getAttributes(attributes: string[]) {
    if (!attributes.includes('uv')) attributes.push('uv');
  }
  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType === 'vertex')
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
#ifndef UV1
attribute vec2 uv;
#endif
varying float vPaintSurface;`,
        CUSTOM_VERTEX_MAIN_END: 'vPaintSurface = uv.x;',
      };
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
varying float vPaintSurface;
float pigmentHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float pigmentNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p);
  float a=pigmentHash(i), b=pigmentHash(i+vec2(1,0));
  float c=pigmentHash(i+vec2(0,1)), d=pigmentHash(i+vec2(1,1));
  return f.x+f.y<1.0 ? a+(b-a)*f.x+(c-a)*f.y
    : d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);
}`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
if (vPaintSurface > 0.5) {
  vec3 p=vPositionW;
  vec2 paper=p.xz + vec2(p.y*.73,p.y*1.21);
  float pigment=pigmentNoise(paper*1.8);
  float grain=pigmentNoise(paper*9.0);
  if (vPaintSurface < 1.5) {
    // Broad mineral washes plus sparse sharp chips, rather than a photo texture.
    float warm=step(.58,pigment)*.15;
    baseColor.rgb=mix(baseColor.rgb,vec3(.96,.76,.48),warm);
    baseColor.rgb*=.96+pigment*.08;
    baseColor.rgb+=vec3(.022,.018,.012)*step(.76,grain)*step(.48,pigment);
    float tide=-.41+(pigmentNoise(p.xz*2.8)-.5)*.19
      +(pigmentNoise(p.xz*8.0)-.5)*.06;
    float wet=1.0-smoothstep(tide-.18,tide+.06,p.y);
    baseColor.rgb=mix(baseColor.rgb,baseColor.rgb*vec3(.53,.66,.73),wet);
  } else {
    // Soft ochre meadows with small, angular pigment islands.
    float meadow=pigmentNoise(p.xz*1.1);
    baseColor.rgb=mix(baseColor.rgb,baseColor.rgb*vec3(.81,.91,.80),step(.59,meadow)*.35);
    baseColor.rgb+=vec3(.045,.027,-.008)*step(.68,pigment)*.45;
    baseColor.rgb*=1.0-step(.8,grain)*.025;
  }
}`,
    };
  }
}

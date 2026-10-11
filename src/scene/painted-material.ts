import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import terrainTextures from '../../.generated/terrain-textures.json';

/** Broad-brush nature and transition atlases. UV.x tags stone (1),
 * meadow (2), sand (3), foliage (4), bark (5), petals (6), pine needles (7).
 * Grass-capped and sand-capped cliffs use tags 8 and 9. UV.y describes
 * terrain coverage, cliff caps, or the pine's normalised local height.
 * Buildings use zero and retain their own art. No fine grain or photo normals. */
export class PaintedScenery extends MaterialPluginBase {
  readonly natureTexture: Texture;
  readonly transitionTexture: Texture;
  constructor(material: StandardMaterial) {
    super(material, 'painted-scenery', 200, {}, true, true);
    this.natureTexture = new Texture(terrainTextures.paint, material.getScene());
    this.natureTexture.name = 'broad-brush-nature-atlas';
    this.natureTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.natureTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.natureTexture.anisotropicFilteringLevel = 4;
    this.transitionTexture = new Texture(terrainTextures.transition, material.getScene());
    this.transitionTexture.name = 'painted-shore-transitions';
    this.transitionTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.transitionTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.transitionTexture.anisotropicFilteringLevel = 4;
  }
  override isReadyForSubMesh() {
    return this.natureTexture.isReady() && this.transitionTexture.isReady();
  }
  override getSamplers(samplers: string[]) {
    samplers.push('paintedNatureSampler');
    samplers.push('shoreTransitionSampler');
  }
  override getActiveTextures(textures: BaseTexture[]) {
    textures.push(this.natureTexture);
    textures.push(this.transitionTexture);
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.setTexture('paintedNatureSampler', this.natureTexture);
    buffer.setTexture('shoreTransitionSampler', this.transitionTexture);
  }
  override dispose() {
    this.natureTexture.dispose();
    this.transitionTexture.dispose();
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
varying vec2 vPaintSurface;`,
        CUSTOM_VERTEX_MAIN_END: 'vPaintSurface = uv;',
      };
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
varying vec2 vPaintSurface;
uniform sampler2D paintedNatureSampler;
uniform sampler2D shoreTransitionSampler;
float pigmentHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float pigmentNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p);
  float a=pigmentHash(i), b=pigmentHash(i+vec2(1,0));
  float c=pigmentHash(i+vec2(0,1)), d=pigmentHash(i+vec2(1,1));
  return f.x+f.y<1.0 ? a+(b-a)*f.x+(c-a)*f.y
    : d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);
}
vec3 paintTile(vec2 p,vec2 tile) {
  // Mirror each tile internally. The gutter keeps filtering away from the
  // neighbouring material; no visible atlas edge or repeating straight seam.
  vec2 uv=abs(fract(p*.5)*2.0-1.0);
  return texture2D(paintedNatureSampler,(tile+mix(vec2(.025),vec2(.975),uv))/vec2(3.0,2.0)).rgb;
}
vec3 transitionTile(vec2 p,vec2 tile) {
  vec2 uv=abs(fract(p*.5)*2.0-1.0);
  return texture2D(shoreTransitionSampler,(tile+mix(vec2(.025),vec2(.975),uv))*.5).rgb;
}
vec3 stonePaint(vec3 p,vec3 normal) {
  vec3 weights=abs(normal)+vec3(.25);
  weights/=weights.x+weights.y+weights.z;
  return paintTile(p.zy*.32,vec2(2.0,1.0))*weights.x
    +paintTile(p.xz*.32,vec2(2.0,1.0))*weights.y
    +paintTile(p.xy*.32,vec2(2.0,1.0))*weights.z;
}
vec3 sandPaint(vec3 p) {
  vec3 sand=paintTile(p.xz*.19,vec2(1.0,1.0));
  float wash=pigmentNoise(p.xz*1.3);
  float tide=-.49+(wash-.5)*.12;
  float wet=1.0-smoothstep(tide-.20,tide+.13,p.y);
  // Damp sand is a large, quiet ochre wash, not a speckled brown outline.
  return mix(sand,sand*vec3(.91,.94,.91),wet*.55);
}`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
if (vPaintSurface.x > .5) {
  vec3 p=vPositionW;
  vec2 paper=p.xz+vec2(p.y*.73,p.y*1.21);
  float pigment=pigmentNoise(paper*.8);
  float mask=transitionTile(p.xz*.65,vec2(1.0,0.0)).r;
  if (vPaintSurface.x < 1.5 || vPaintSurface.x > 7.5) {
    vec3 mineral=stonePaint(p,normalW);
    baseColor.rgb=mix(baseColor.rgb,mineral,.64);
    if (vPaintSurface.x > 7.5) {
      float cover=smoothstep(.08,.9,vPaintSurface.y+(mask-.5)*.32);
      vec3 edgePaint=transitionTile(p.xz*.5,vec2(0.0,0.0));
      vec3 meadow=mix(vec3(.73,.79,.32),paintTile(p.xz*.21,vec2(0.0,1.0)),.68);
      vec3 cap=vPaintSurface.x > 8.5 ? sandPaint(p) : meadow;
      baseColor.rgb=mix(baseColor.rgb,edgePaint,.22*cover*(1.0-cover)*4.0);
      baseColor.rgb=mix(baseColor.rgb,cap,cover);
    }
    float tide=-.43+(pigmentNoise(p.xz*1.4)-.5)*.17;
    float wet=1.0-smoothstep(tide-.19,tide+.04,p.y);
    baseColor.rgb=mix(baseColor.rgb,baseColor.rgb*vec3(.55,.68,.73),wet);
  } else if (vPaintSurface.x < 2.5) {
    vec3 meadow=paintTile(p.xz*.21,vec2(0.0,1.0));
    baseColor.rgb=mix(vec3(.73,.79,.32),meadow,.68);
    float stone=smoothstep(.08,.8,1.0-vPaintSurface.y*2.0+(mask-.5)*.30);
    baseColor.rgb=mix(baseColor.rgb,stonePaint(p,normalW),stone);
    float sand=smoothstep(.08,.85,vPaintSurface.y*2.0-1.0+(mask-.5)*.25);
    vec3 edgePaint=transitionTile(p.xz*.5,vec2(0.0,1.0));
    baseColor.rgb=mix(baseColor.rgb,edgePaint,sand*(1.0-sand)*.8);
    baseColor.rgb=mix(baseColor.rgb,sandPaint(p),sand);
  } else if (vPaintSurface.x < 3.5) {
    baseColor.rgb=sandPaint(p);
  } else if (vPaintSurface.x < 4.5) {
    vec3 foliage=paintTile(paper*.55,vec2(0.0,0.0));
    // Retain the light tips and dark lower tiers of each tree. Broad painted
    // patches vary hue inside those forms rather than drawing tiny leaves.
    baseColor.rgb=baseColor.rgb*(.85+foliage.g*.35);
    baseColor.rgb=mix(baseColor.rgb,foliage,.10);
  } else if (vPaintSurface.x < 5.5) {
    vec3 bark=paintTile(vec2(p.x+p.z,p.y)*.62,vec2(1.0,0.0));
    baseColor.rgb=mix(baseColor.rgb,bark,.55);
  } else if (vPaintSurface.x < 6.5) {
    vec3 petals=paintTile(paper*.7,vec2(2.0,0.0));
    baseColor.rgb*=.88+petals.g*.15;
  } else if (vPaintSurface.x < 7.5) {
    // Blend projections on all three axes: a single slanted projection
    // stretches the painting into straight bands along the conical skirts.
    vec3 weights=abs(normalW)+vec3(.25);
    weights/=weights.x+weights.y+weights.z;
    vec3 needles=paintTile(p.zy*.85+vec2(.37,.13),vec2(0.0,0.0))*weights.x
      +paintTile(p.xz*.85+vec2(.71,.41),vec2(0.0,0.0))*weights.y
      +paintTile(vec2(-p.x,p.y)*.85+vec2(.19,.83),vec2(0.0,0.0))*weights.z;
    float height=smoothstep(.12,1.0,vPaintSurface.y);
    // Use the generated foliage painting directly, not the model's alternating
    // face palette. A gentle root-to-tip tint is independent of ground height.
    baseColor.rgb=needles*mix(vec3(.83,.85,.81),vec3(1.01,1.04,.97),height);
  }
}`,
    };
  }
}

import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import type { Scene } from '@babylonjs/core/scene.js';
import terrainTextures from '../../.generated/terrain-textures.json';

/** Broad-brush nature and transition atlases. UV.x tags stone (1),
 * meadow (2), sand (3), foliage (4), bark (5), petals (6), pine needles (7).
 * Grass-capped and sand-capped cliffs use tags 8 and 9. UV.y describes
 * terrain coverage, cliff caps, or the pine's normalised local height.
 * Buildings use zero and retain their own art. No fine grain or photo normals. */
export class PaintedScenery extends MaterialPluginBase {
  readonly natureTexture: Texture;
  readonly transitionTexture: Texture;
  private contactTexture: Texture;
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
    this.contactTexture = RawTexture.CreateRGBATexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      material.getScene(),
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    this.contactTexture.name = 'empty-nature-contact';
  }
  /** Takes ownership; replacing the island also releases its old contact map. */
  setContactTexture(texture: Texture) {
    if (texture === this.contactTexture) return;
    this.contactTexture.dispose();
    this.contactTexture = texture;
  }
  override isReadyForSubMesh() {
    return (
      this.natureTexture.isReady() &&
      this.transitionTexture.isReady() &&
      this.contactTexture.isReady()
    );
  }
  override getSamplers(samplers: string[]) {
    samplers.push('paintedNatureSampler');
    samplers.push('shoreTransitionSampler');
    samplers.push('paintedContactSampler');
  }
  override getActiveTextures(textures: BaseTexture[]) {
    textures.push(this.natureTexture);
    textures.push(this.transitionTexture);
    textures.push(this.contactTexture);
  }
  override getUniforms() {
    return {
      ubo: [{ name: 'paintDaylight', size: 1, type: 'float' }],
      fragment: 'uniform float paintDaylight;',
    };
  }
  override bindForSubMesh(buffer: UniformBuffer, scene: Scene) {
    buffer.setTexture('paintedNatureSampler', this.natureTexture);
    buffer.setTexture('shoreTransitionSampler', this.transitionTexture);
    buffer.setTexture('paintedContactSampler', this.contactTexture);
    const sun = scene.getLightByName('sunlight');
    buffer.updateFloat(
      'paintDaylight',
      sun ? Math.min(1, Math.max(0, sun.diffuse.r - sun.diffuse.b) * 8) : 1,
    );
  }
  override dispose() {
    this.natureTexture.dispose();
    this.transitionTexture.dispose();
    this.contactTexture.dispose();
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
uniform sampler2D paintedContactSampler;
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
vec2 paintTurn(vec2 p,float cosine,float sine) {
  return vec2(p.x*cosine-p.y*sine,p.x*sine+p.y*cosine);
}
vec3 meadowPaint(vec3 p) {
  // Offset paintings at two scales and different angles. This preserves the
  // generated brushwork without turning its mirrored diagonal into stripes.
  vec3 broad=paintTile(paintTurn(p.xz*.14,.8,.6)+vec2(.31,1.73),vec2(0.0,1.0));
  vec3 crossing=paintTile(paintTurn(p.xz*.23,-.48,.877)+vec2(1.67,.29),vec2(0.0,1.0));
  vec3 brush=mix(broad,crossing,.40);
  return mix(vec3(.61,.73,.32),brush,.53);
}
float groundContact(vec3 p,vec3 normal) {
  vec2 contactUV=(p.xz-vec2(6.0))/1.41421356237/16.0+vec2(.5);
  return texture2D(paintedContactSampler,contactUV).r*smoothstep(.32,.82,normal.y);
}
vec3 contactShade(vec3 color,float amount) {
  return color*mix(vec3(1.0),vec3(.62,.72,.67),amount);
}
vec3 stonePaint(vec3 p,vec3 normal) {
  vec3 weights=abs(normal)+vec3(.18);
  weights/=weights.x+weights.y+weights.z;
  vec3 mineral=paintTile(paintTurn(p.zy*.26,.819,.574)+vec2(.29,.73),vec2(2.0,1.0))*weights.x
    +paintTile(paintTurn(p.xz*.22,-.423,.906)+vec2(.63,.17),vec2(2.0,1.0))*weights.y
    +paintTile(paintTurn(p.xy*.28,.94,-.342)+vec2(.83,.41),vec2(2.0,1.0))*weights.z;
  // Warm broad planes, with restrained cool mineral washes inside the stone.
  // Their orientation follows the block, rather than painting height bands.
  mineral=mix(vec3(.79,.72,.60),mineral,.74);
  return mineral*mix(vec3(.96,.985,1.025),vec3(1.035,1.015,.955),
    smoothstep(-.15,.9,normal.y));
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
float paintedStoneAmount=0.0;
if (vPaintSurface.x > .5) {
  vec3 p=vPositionW;
  vec2 paper=p.xz+vec2(p.y*.73,p.y*1.21);
  float pigment=pigmentNoise(paper*.8);
  float mask=transitionTile(p.xz*.65,vec2(1.0,0.0)).r;
  if (vPaintSurface.x < 1.5 || vPaintSurface.x > 7.5) {
    paintedStoneAmount=1.0;
    vec3 mineral=stonePaint(p,normalW);
    baseColor.rgb=mix(baseColor.rgb,mineral,.82);
    if (vPaintSurface.x > 7.5) {
      float cover=smoothstep(.08,.9,vPaintSurface.y+(mask-.5)*.32);
      cover*=smoothstep(.38,.72,abs(normalW.y));
      vec3 edgePaint=transitionTile(p.xz*.5,vec2(0.0,0.0));
      vec3 meadow=meadowPaint(p);
      vec3 cap=vPaintSurface.x > 8.5 ? sandPaint(p) : meadow;
      baseColor.rgb=mix(baseColor.rgb,edgePaint,.22*cover*(1.0-cover)*4.0);
      baseColor.rgb=mix(baseColor.rgb,cap,cover);
      paintedStoneAmount=1.0-cover;
      baseColor.rgb=contactShade(baseColor.rgb,groundContact(p,normalW)*cover);
    }
    float tide=-.43+(pigmentNoise(p.xz*1.1)-.5)*.15;
    float wet=1.0-smoothstep(tide-.22,tide+.13,p.y);
    baseColor.rgb=mix(baseColor.rgb,baseColor.rgb*vec3(.62,.76,.75),wet);
  } else if (vPaintSurface.x < 2.5) {
    baseColor.rgb=meadowPaint(p);
    float stone=smoothstep(.08,.8,1.0-vPaintSurface.y*2.0+(mask-.5)*.30);
    // A cliff is a cut through turf. Do not interpolate green triangles down
    // its wall just because the upper corners belong to the meadow.
    stone=max(stone,1.0-smoothstep(.42,.72,abs(normalW.y)));
    baseColor.rgb=mix(baseColor.rgb,stonePaint(p,normalW),stone);
    paintedStoneAmount=stone;
    float sand=smoothstep(.08,.85,vPaintSurface.y*2.0-1.0+(mask-.5)*.25);
    vec3 edgePaint=transitionTile(p.xz*.5,vec2(0.0,1.0));
    baseColor.rgb=mix(baseColor.rgb,edgePaint,sand*(1.0-sand)*.8);
    baseColor.rgb=mix(baseColor.rgb,sandPaint(p),sand);
    baseColor.rgb=contactShade(baseColor.rgb,groundContact(p,normalW));
    // Broad sand washes should not reveal every diagonal of the terrain
    // tessellation. Soften only their lighting normal; rock cuts stay faceted.
    normalW=normalize(mix(normalW,vec3(0.0,1.0,0.0),sand*.58));
  } else if (vPaintSurface.x < 3.5) {
    baseColor.rgb=sandPaint(p);
    baseColor.rgb=contactShade(baseColor.rgb,groundContact(p,normalW));
    normalW=normalize(mix(normalW,vec3(0.0,1.0,0.0),.58));
  } else if (vPaintSurface.x < 4.5) {
    vec3 foliage=paintTile(paintTurn(paper*.38,.8,.6)+vec2(.37,.19),vec2(0.0,0.0));
    // Retain the light tips and dark lower tiers of each tree. Broad painted
    // patches vary hue inside those forms rather than drawing tiny leaves.
    baseColor.rgb=baseColor.rgb*(.91+foliage.g*.21);
    baseColor.rgb=mix(baseColor.rgb,foliage,.18);
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
    vec3 needles=paintTile(paintTurn(p.zy*.55,.766,.643)+vec2(.37,.13),vec2(0.0,0.0))*weights.x
      +paintTile(paintTurn(p.xz*.49,.342,-.94)+vec2(.71,.41),vec2(0.0,0.0))*weights.y
      +paintTile(paintTurn(vec2(-p.x,p.y)*.57,.906,.423)+vec2(.19,.83),vec2(0.0,0.0))*weights.z;
    float height=smoothstep(.12,1.0,vPaintSurface.y);
    // Use the generated foliage painting directly, not the model's alternating
    // face palette. A gentle root-to-tip tint is independent of ground height.
    needles=mix(vec3(.30,.46,.24),needles,.76);
    baseColor.rgb=needles*mix(vec3(.89,.96,.91),vec3(1.12,1.15,1.02),height);
  }
}`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
// A warm diffuse bounce keeps shaded ivory faces luminous. It is restrained
// in bright areas and fades into the cool wet base; moonlight adds no warmth.
if (paintedStoneAmount > .001) {
  float dryStone=smoothstep(-.43,.38,vPositionW.y);
  float headroom=1.0-clamp(dot(color.rgb,vec3(.299,.587,.114)),0.0,1.0);
  color.rgb+=baseColor.rgb*vec3(.30,.21,.12)*paintedStoneAmount
    *dryStone*headroom*paintDaylight;
}`,
    };
  }
}

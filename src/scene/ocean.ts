import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture.js';
import { Plane } from '@babylonjs/core/Maths/math.plane.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { Building } from '../domain/index.js';
import { createWorld } from '../domain/index.js';
import { environmentLayout } from './environment.js';
import type { Board } from './types.js';

export const WATER_LEVEL = -0.68;
export const SHORE_TEXTURE_SIZE = 256;
const shaderNoise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;
const waveCode = `
float heightAt(vec2 p){
 float uneven=noise(p*.24+seed)*2.3;
 return sin(dot(p,vec2(.93,.36))*1.7+time*.85+uneven)*.047
 +sin(dot(p,vec2(-.42,.91))*2.9-time*.57+uneven*.6)*.028
 +(noise(p*.9+vec2(time*.12,-time*.06)+seed)-.5)*.055;
}`;
export const waterVertex = `precision highp float;
attribute vec3 position;uniform mat4 worldViewProjection;uniform float time;uniform float seed;
varying vec3 vPosition;varying vec3 vNormal;varying vec4 vClip;
${shaderNoise}${waveCode}
void main(){
 vec3 p=position;p.y+=heightAt(p.xz);
 float e=.13;float dx=(heightAt(p.xz+vec2(e,0))-heightAt(p.xz-vec2(e,0)))/(2.0*e);
 float dz=(heightAt(p.xz+vec2(0,e))-heightAt(p.xz-vec2(0,e)))/(2.0*e);
 vPosition=p;vNormal=normalize(vec3(-dx,1.0,-dz));
 vClip=worldViewProjection*vec4(p,1.0);gl_Position=vClip;
}`;
export const waterFragment = `precision highp float;
varying vec3 vPosition;varying vec3 vNormal;varying vec4 vClip;
uniform float time;uniform float seed;uniform float daylight;uniform float reflectionStrength;
uniform vec3 eyePosition;uniform vec3 lightDirection;uniform sampler2D coastSampler;uniform sampler2D reflectionSampler;
${shaderNoise}
void main(){
 vec2 p=vPosition.xz;vec3 normal=normalize(vNormal);
 vec2 coastUV=(p+18.0)/48.0;float coast=texture2D(coastSampler,coastUV).r*2.0;
 if(any(lessThan(coastUV,vec2(0)))||any(greaterThan(coastUV,vec2(1))))coast=2.0;
 float mottling=noise(p*.38+seed)*.6+noise(p*1.2+vec2(time*.028,-time*.018))*.4;
 vec3 deep=mix(vec3(.18,.52,.56),vec3(.28,.65,.65),mottling);
 vec3 shallow=mix(vec3(.40,.72,.67),vec3(.51,.78,.70),mottling);
 vec3 color=mix(shallow,deep,smoothstep(.0,1.8,coast));
 float diffuse=.82+.18*max(0.0,dot(normal,lightDirection));
 color*=diffuse*mix(.30,1.0,daylight);
 vec3 view=normalize(eyePosition-vPosition);
 float fresnel=pow(1.0-max(0.0,dot(view,normal)),3.0);
 vec2 uv=vClip.xy/vClip.w*.5+.5+normal.xz*.022;
 vec4 reflected=texture2D(reflectionSampler,uv);
 reflected+=texture2D(reflectionSampler,uv+vec2(.003,0));
 reflected+=texture2D(reflectionSampler,uv-vec2(.003,0));reflected/=3.0;
 color=mix(color,reflected.rgb,reflectionStrength*(.45+fresnel)*reflected.a);
 float sparkle=pow(max(0.0,dot(reflect(-lightDirection,normal),view)),75.0);
 color+=vec3(1.0,.86,.58)*sparkle*.34*mix(.25,1.0,daylight);
 // Прибой движется к берегу. Шум меняет ширину и разрывает границы пены.
 float foamNoise=noise(p*5.5+vec2(time*.17,-time*.12));
 float surge=sin(time*1.35+noise(p*1.4)*5.0)*.5+.5;
 float edge=.11+surge*.24+noise(p*2.7+time*.04)*.14;
 float foam=(1.0-smoothstep(edge-.09,edge+.06,coast))*smoothstep(.23,.58,foamNoise);
 float breaker=1.0-smoothstep(.025,.11,abs(coast-edge));
 foam=max(foam,breaker*smoothstep(.43,.71,foamNoise)*.8);
 foam*=1.0-smoothstep(.65,.9,coast);
 vec3 foamColor=mix(vec3(.34,.46,.58),vec3(.91,.97,.91),daylight);
 color=mix(color,foamColor,foam*.85);
 gl_FragColor=vec4(color,1.0);
}`;

/** Непрерывная сетка: высокая плотность у острова, общие рёбра дальних колец. */
export function waterGeometry(high = true) {
  const n = high ? 96 : 64,
    span = 48,
    positions: number[] = [],
    indices: number[] = [];
  const jitter = (x: number, z: number) => (Math.sin(x * 127.1 + z * 311.7) * 43758.5453) % 1;
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      const edge = x === 0 || z === 0 || x === n || z === n;
      positions.push(
        -18 + (x * span) / n + (edge ? 0 : jitter(x, z) * 0.09),
        WATER_LEVEL,
        -18 + (z * span) / n + (edge ? 0 : jitter(z, x) * 0.09),
      );
    }
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const a = z * (n + 1) + x,
        b = a + 1,
        c = a + n + 2,
        d = a + n + 1;
      if ((x + z) % 2) indices.push(a, d, b, b, d, c);
      else indices.push(a, d, c, a, c, b);
    }
  let border: number[] = [];
  for (let x = 0; x < n; x++) border.push(x);
  for (let z = 0; z < n; z++) border.push(z * (n + 1) + n);
  for (let x = n; x > 0; x--) border.push(n * (n + 1) + x);
  for (let z = n; z > 0; z--) border.push(z * (n + 1));
  const base = [...border];
  for (const scale of [1.7, 3.5, 8]) {
    const outer = base.map((i) => {
      const index = positions.length / 3;
      positions.push(
        6 + (positions[i * 3] - 6) * scale,
        WATER_LEVEL,
        6 + (positions[i * 3 + 2] - 6) * scale,
      );
      return index;
    });
    for (let i = 0; i < border.length; i++) {
      const j = (i + 1) % border.length;
      indices.push(border[i], outer[j], outer[i], border[i], border[j], outer[j]);
    }
    border = outer;
  }
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  return data;
}

/** Поле расстояний до берега и реальных прибрежных камней. Считается только при перестройке острова. */
export function shoreDistancePixels(
  board: Board,
  buildings: Building[],
  size = SHORE_TEXTURE_SIZE,
) {
  const world = createWorld(board.seed ?? 0);
  const rocks = environmentLayout(board, buildings).filter((o) => o.y < -0.2);
  const data = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const px = -18 + ((x + 0.5) / size) * 48,
        pz = -18 + ((z + 0.5) / size) * 48;
      let distance =
        Math.hypot(px - 6, pz - 6) - world.coastRadius(Math.atan2(pz - 6, px - 6)) - 0.2;
      for (const rock of rocks) {
        if (Math.abs(px - rock.x) > 2 || Math.abs(pz - rock.z) > 2) continue;
        distance = Math.min(
          distance,
          Math.hypot(px - rock.x, (pz - rock.z) / 0.85) - rock.scale * 0.52,
        );
      }
      const index = (z * size + x) * 4;
      data[index] = Math.round(Math.max(0, Math.min(1, distance / 2)) * 255);
      data[index + 1] = Math.round(Math.max(0, Math.min(1, -distance / 2)) * 255);
      data[index + 3] = 255;
    }
  return data;
}

export function createOcean(scene: Scene, camera: Camera) {
  const mesh = new Mesh('deforming-water', scene);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  waterGeometry().applyToMesh(mesh);
  const reflection = new MirrorTexture('water-reflection', 256, scene, false);
  reflection.mirrorPlane = new Plane(0, -1, 0, WATER_LEVEL);
  reflection.clearColor = new Color4(0, 0, 0, 0);
  reflection.refreshRate = 0;
  // ShaderMaterial не собирает render targets из своих sampler автоматически.
  scene.customRenderTargets.push(reflection);
  const material = new ShaderMaterial(
    'living-water',
    scene,
    { vertexSource: waterVertex, fragmentSource: waterFragment },
    {
      attributes: ['position'],
      uniforms: [
        'worldViewProjection',
        'time',
        'seed',
        'daylight',
        'eyePosition',
        'lightDirection',
        'reflectionStrength',
      ],
      samplers: ['coastSampler', 'reflectionSampler'],
    },
  );
  material.backFaceCulling = false;
  mesh.material = material;
  material.setTexture('reflectionSampler', reflection);
  material.setFloat('seed', 0);
  material.setFloat('time', 0);
  material
    .setFloat('daylight', 1)
    .setFloat('reflectionStrength', 0.2)
    .setVector3('lightDirection', Vector3.Up())
    .setVector3('eyePosition', camera.position);
  let field: RawTexture | null = null,
    lastReflection = -100,
    quality: 'high' | 'low' = 'high',
    time = 0;
  let reflections = 0;
  reflection.onClearObservable.add((engine) => {
    engine.clear(reflection.clearColor, true, true, true);
    reflections++;
  });
  return {
    setIsland(board: Board, buildings: Building[], island: Mesh, ship: Mesh) {
      field?.dispose();
      field = RawTexture.CreateRGBATexture(
        shoreDistancePixels(board, buildings),
        SHORE_TEXTURE_SIZE,
        SHORE_TEXTURE_SIZE,
        scene,
        false,
        false,
        Texture.BILINEAR_SAMPLINGMODE,
      );
      field.wrapU = Texture.CLAMP_ADDRESSMODE;
      field.wrapV = Texture.CLAMP_ADDRESSMODE;
      material
        .setTexture('coastSampler', field)
        .setFloat('seed', ((board.seed ?? 0) % 10000) / 137);
      reflection.renderList = [island, ship];
      lastReflection = -100;
    },
    update(seconds: number, daylight: number, sun: Vector3, clockSeconds: number) {
      time = seconds;
      material
        .setFloat('time', time)
        .setFloat('daylight', daylight)
        .setVector3('lightDirection', sun.y > 0 ? sun : sun.scale(-1))
        .setVector3('eyePosition', camera.position);
      if (clockSeconds - lastReflection > (quality === 'high' ? 0.5 : 1)) {
        reflection.resetRefreshCounter();
        lastReflection = clockSeconds;
      }
    },
    setQuality(value: 'high' | 'low') {
      if (value === quality) return;
      quality = value;
      waterGeometry(value === 'high').applyToMesh(mesh);
      reflection.resize(value === 'high' ? 256 : 128);
      lastReflection = -100;
    },
    invalidate() {
      lastReflection = -100;
      reflection.resetRefreshCounter();
    },
    get diagnostics() {
      return {
        time,
        triangles: mesh.getTotalIndices() / 3,
        vertices: mesh.getTotalVertices(),
        reflectionSize: reflection.getSize().width,
        reflectionUpdates: reflections,
        reflectionHz: quality === 'high' ? 2 : 1,
        shoreTextureSize: SHORE_TEXTURE_SIZE,
      };
    },
    dispose() {
      field?.dispose();
      reflection.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

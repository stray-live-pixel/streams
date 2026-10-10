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
import { environmentLayout, shorelineRadius } from './environment.js';
import type { Board } from './types.js';
import { ISLAND_SPREAD } from './space.js';

export const WATER_LEVEL = -0.68;
export const SHORE_TEXTURE_SIZE = 256;
const shaderNoise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;
const waveCode = `
float heightAt(vec2 p){
 float uneven=noise(p*.24+seed)*2.3;
 return sin(dot(p,vec2(.93,.36))*1.35+time*.62+uneven)*.105
 +sin(dot(p,vec2(-.42,.91))*2.05-time*.43+uneven*.6)*.060
 +(noise(p*.65+vec2(time*.08,-time*.04)+seed)-.5)*.070;
}`;
export const waterVertex = `precision highp float;
attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;uniform mat4 world;uniform float time;uniform float seed;
varying vec3 vPosition;varying vec3 vWorldPosition;varying vec2 vFacet;varying vec4 vClip;
${shaderNoise}${waveCode}
void main(){
 vec3 p=position;
 // Одинаковое смещение общих вершин: грани качаются без разрывов между ними.
 p.y+=heightAt(position.xz);
 p.x+=sin(position.z*.75+time*.43+seed)*.035;
 p.z+=cos(position.x*.67-time*.37+seed)*.035;
 vPosition=p;vWorldPosition=(world*vec4(p,1.0)).xyz;vFacet=uv;
 vClip=worldViewProjection*vec4(p,1.0);gl_Position=vClip;
}`;
export const waterFragment = `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
precision highp float;
varying vec3 vPosition;varying vec3 vWorldPosition;varying vec2 vFacet;varying vec4 vClip;
uniform float time;uniform float seed;uniform float daylight;uniform float reflectionStrength;
uniform vec3 eyePosition;uniform vec3 lightDirection;uniform sampler2D coastSampler;uniform sampler2D reflectionSampler;
${shaderNoise}
// Линейный шум по треугольникам сохраняет изломы вместо округления фронтов.
float angularNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);
 float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
 return f.x+f.y<1.0 ? a+(b-a)*f.x+(c-a)*f.y
 : d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);
}
float shoreAt(vec2 p){
 vec2 uv=(p+18.0)/48.0;
 if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return 2.0;
 vec2 distance=texture2D(coastSampler,uv).rg;
 return (distance.r-distance.g)*2.0;
}
float angularShore(vec2 p){
 const float cell=.28;
 vec2 i=floor(p/cell)*cell,f=fract(p/cell);
 float a=shoreAt(i),b=shoreAt(i+vec2(cell,0)),c=shoreAt(i+vec2(0,cell)),d=shoreAt(i+vec2(cell,cell));
 return f.x+f.y<1.0 ? a+(b-a)*f.x+(c-a)*f.y
 : d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);
}
void main(){
 vec2 p=vPosition.xz;
 // Производные одной грани дают плоскую нормаль, а общий центр — её постоянный оттенок.
 #if defined(GL_OES_standard_derivatives) || __VERSION__ >= 300
 vec3 normal=normalize(cross(dFdx(vWorldPosition),dFdy(vWorldPosition)));
 #else
 vec3 normal=vec3(0.0,1.0,0.0);
 #endif
 if(normal.y<0.0)normal=-normal;
 float coast=max(0.0,angularShore(p));
 float facetTone=hash(vFacet+seed);
 float mottling=noise(vFacet*.32+seed);
 vec3 deep=mix(vec3(.17,.69,.73),vec3(.27,.78,.79),mottling);
 vec3 shallow=mix(vec3(.32,.81,.74),vec3(.48,.87,.77),mottling);
 vec3 color=mix(shallow,deep,smoothstep(.0,1.8,coast));
 color*=mix(.95,1.05,facetTone);
 float diffuse=.88+.12*max(0.0,dot(normal,lightDirection));
 color*=diffuse*mix(.30,1.0,daylight);
 vec3 view=normalize(eyePosition-vWorldPosition);
 float fresnel=pow(1.0-max(0.0,dot(view,normal)),3.0);
 vec2 uv=vClip.xy/vClip.w*.5+.5+normal.xz*.012;
 vec4 reflected=texture2D(reflectionSampler,uv);
 reflected+=texture2D(reflectionSampler,uv+vec2(.003,0));
 reflected+=texture2D(reflectionSampler,uv-vec2(.003,0));reflected/=3.0;
 color=mix(color,reflected.rgb,reflectionStrength*(.45+fresnel)*reflected.a);
 // Широкий мягкий отблеск оставляет главным цвет граней, без зеркального блеска.
 float glow=pow(max(0.0,dot(reflect(-lightDirection,normal),view)),8.0);
 color+=vec3(.70,.90,.83)*glow*.035*daylight;
 // Медленные нерегулярные фронты идут к берегу. Все контуры линейные,
 // поэтому прибой огибает скалы ломаными лентами, без гладких окружностей.
 float slowTime=time/3.0;
 float broken=angularNoise(p*2.1+seed);
 float localRhythm=angularNoise(p*.32+seed);
 float phase=coast*1.7+slowTime*(.30+localRhythm*.12)
 +angularNoise(p*.8+seed)*.24;
 float front=abs(fract(phase)-.19);
 float crest=clamp((.068-front)/.028,0.0,1.0);
 float reach=clamp((1.15-coast)/.65,0.0,1.0);
 float gaps=clamp((broken-.32)*5.0,0.0,1.0);
 float ribbons=crest*reach*gaps;
 float impact=sin(slowTime*2.26+localRhythm*6.28)*.5+.5;
 float wash=clamp((.12+impact*.10-coast)/.08,0.0,1.0)*impact*.56;
 float contact=clamp((.075-coast)/.055,0.0,1.0)*.44;
 float foam=max(ribbons,max(wash,contact))*mix(.50,1.0,broken);
 vec3 foamColor=mix(vec3(.34,.46,.58),vec3(.94,1.0,.93),daylight);
 color=mix(color,foamColor,foam*.84);
 gl_FragColor=vec4(color,1.0);
}`;

/** Конечная равномерная сетка: одинаково небольшие грани вплоть до видимого края. */
export function waterGeometry(high = true) {
  const n = high ? 48 : 32,
    span = 48,
    positions: number[] = [],
    indices: number[] = [];
  const jitter = (x: number, z: number) => (Math.sin(x * 127.1 + z * 311.7) * 43758.5453) % 1;
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      const edge = x === 0 || z === 0 || x === n || z === n;
      positions.push(
        -18 + (x * span) / n + (edge ? 0 : jitter(x, z) * 0.24),
        WATER_LEVEL,
        -18 + (z * span) / n + (edge ? 0 : jitter(z, x) * 0.24),
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
  const data = new VertexData();
  // Раздельные вершины сохраняют один оттенок на треугольник. Координаты общих
  // рёбер совпадают буквально, поэтому волновая деформация не создаёт щелей.
  const facetedPositions: number[] = [],
    facets: number[] = [],
    facetedIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3);
    const centerX = triangle.reduce((sum, v) => sum + positions[v * 3], 0) / 3;
    const centerZ = triangle.reduce((sum, v) => sum + positions[v * 3 + 2], 0) / 3;
    for (const vertex of triangle) {
      facetedIndices.push(facetedPositions.length / 3);
      facetedPositions.push(...positions.slice(vertex * 3, vertex * 3 + 3));
      facets.push(centerX, centerZ);
    }
  }
  data.positions = facetedPositions;
  data.indices = facetedIndices;
  data.uvs = facets;
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
      const angle = Math.atan2(pz - 6, px - 6);
      let distance =
        Math.hypot(px - 6, pz - 6) -
        shorelineRadius(angle, board.seed ?? 0, world.coastRadius(angle), buildings);
      for (const rock of rocks) {
        if (Math.abs(px - rock.x) > 2 || Math.abs(pz - rock.z) > 2) continue;
        distance = Math.min(
          distance,
          Math.hypot(px - rock.x, (pz - rock.z) / 0.85) - (rock.scale * 0.52) / ISLAND_SPREAD,
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
  mesh.scaling.set(ISLAND_SPREAD, 1, ISLAND_SPREAD);
  mesh.position.set(6 * (1 - ISLAND_SPREAD), 0, 6 * (1 - ISLAND_SPREAD));
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
      attributes: ['position', 'uv'],
      uniforms: [
        'worldViewProjection',
        'world',
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
    .setFloat('reflectionStrength', 0.12)
    .setVector3('lightDirection', Vector3.Up())
    .setVector3('eyePosition', camera.position);
  let field: RawTexture | null = null,
    lastReflection = -100,
    quality: 'high' | 'low' = 'high',
    time = 0;
  let reflections = 0,
    cameraMoving = false;
  const previousCamera = new Float32Array(32).fill(Number.NaN);
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
      const view = camera.getViewMatrix().m,
        projection = camera.getProjectionMatrix().m;
      cameraMoving = false;
      for (let i = 0; i < 16; i++) {
        if (
          !Number.isFinite(previousCamera[i]) ||
          Math.abs(view[i] - previousCamera[i]) > 0.000001 ||
          Math.abs(projection[i] - previousCamera[i + 16]) > 0.000001
        )
          cameraMoving = true;
        previousCamera[i] = view[i];
        previousCamera[i + 16] = projection[i];
      }
      // Положение отражения должно соответствовать текущему кадру камеры.
      // В покое маленькая RTT обновляется реже: вода сама не входит в renderList.
      if (cameraMoving || clockSeconds - lastReflection > (quality === 'high' ? 0.25 : 0.5)) {
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
        reflectionHz: quality === 'high' ? 4 : 2,
        reflectionCameraMoving: cameraMoving,
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

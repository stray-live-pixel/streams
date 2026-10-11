import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import { Plane } from '@babylonjs/core/Maths/math.plane.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { Building } from '../domain/index.js';
import { createWorld } from '../domain/index.js';
import { beachInfluence, environmentLayout, shorelineRadius } from './environment.js';
import type { Board } from './types.js';
import { ISLAND_SPREAD } from './space.js';

export const WATER_LEVEL = -0.68;
export const SHORE_TEXTURE_SIZE = 512;
const shaderNoise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;
const waveCode = `
float heightAt(vec2 p){
 float uneven=noise(p*.24+seed)*2.3;
 return sin(dot(p,vec2(.93,.36))*1.35+time*.44+uneven)*.062
 +sin(dot(p,vec2(-.42,.91))*2.05-time*.31+uneven*.6)*.035
 +(noise(p*.65+vec2(time*.05,-time*.03)+seed)-.5)*.035;
}`;
export const waterVertex = `precision highp float;
attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;uniform mat4 world;uniform float time;uniform float seed;uniform sampler2D coastSampler;
varying vec3 vPosition;varying vec3 vWorldPosition;varying vec2 vPaintPosition;varying vec4 vClip;
${shaderNoise}${waveCode}
void main(){
 vec3 p=position;
 // Одинаковое смещение общих вершин: грани качаются без разрывов между ними.
 vec2 shoreline=texture2D(coastSampler,(position.xz+18.0)/48.0).rg;
 float distance=(shoreline.r-shoreline.g)*2.0;
 // The long offshore waves lose height as they run into the shallows.
 p.y+=heightAt(position.xz)*mix(.22,1.0,smoothstep(-.2,1.3,distance));
 p.x+=sin(position.z*.75+time*.43+seed)*.035;
 p.z+=cos(position.x*.67-time*.37+seed)*.035;
 vPosition=p;vWorldPosition=(world*vec4(p,1.0)).xyz;vPaintPosition=position.xz;
 vClip=worldViewProjection*vec4(p,1.0);gl_Position=vClip;
}`;
export const waterFragment = `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
precision highp float;
varying vec3 vPosition;varying vec3 vWorldPosition;varying vec2 vPaintPosition;varying vec4 vClip;
uniform float time;uniform float seed;uniform float daylight;uniform float reflectionStrength;
uniform vec3 eyePosition;uniform vec3 lightDirection;uniform sampler2D coastSampler;uniform sampler2D reflectionSampler;uniform sampler2D paintedNatureSampler;uniform sampler2D seabedSampler;
uniform sampler2D gouacheSampler;
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
 const float cell=.18;
 vec2 i=floor(p/cell)*cell,f=fract(p/cell);
 float a=shoreAt(i),b=shoreAt(i+vec2(cell,0)),c=shoreAt(i+vec2(0,cell)),d=shoreAt(i+vec2(cell,cell));
 return f.x+f.y<1.0 ? a+(b-a)*f.x+(c-a)*f.y
 : d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);
}
// Three scales share the same current: broad washes, broken angular crests,
// and a few bright flecks. Their coverage is local, never a uniform coast band.
vec2 foamBrush(vec2 p){
 vec2 turned=mat2(.84,-.54,.54,.84)*p;
 float mass=angularNoise(p*2.7+seed)*.65+angularNoise(turned*5.1+seed+17.0)*.35;
 float cuts=angularNoise(turned*9.3+seed+31.0);
 float body=smoothstep(.36,.57,mass)*(1.0-smoothstep(.55,.75,cuts)*.83);
 float crest=1.0-smoothstep(.032,.09,abs(mass-.49));
 return vec2(body,crest*(.3+.7*smoothstep(.25,.52,cuts)));
}
vec3 waterPaint(vec2 p,vec2 tile){
 vec2 uv=abs(fract(p*.5)*2.0-1.0);
 return texture2D(gouacheSampler,(tile+mix(vec2(.035),vec2(.965),uv))*.5,.45).rgb;
}
void main(){
 vec2 p=vPosition.xz;
 // Continuous, low-amplitude lighting never reveals the water tessellation.
 // Pigment coordinates are attached to the undeformed mesh, not the screen.
 vec3 normal=normalize(vec3(.05*cos(p.x*.7+time*.31),1.0,.04*sin(p.y*.8-time*.25)));
 float signedCoast=angularShore(p);
 float coast=max(0.0,signedCoast);
 float beach=texture2D(coastSampler,(p+18.0)/48.0).b;
 beach=smoothstep(.2,.85,beach);
 vec2 warp=vec2(noise(vPaintPosition*.23),noise(vPaintPosition.yx*.19+13.7));
 vec2 brushUV=mat2(.8,-.6,.6,.8)*vPaintPosition*.19+warp*.65+vec2(seed*.013,.37);
 vec3 deep=waterPaint(brushUV,vec2(0.0,1.0));
 vec3 crossing=waterPaint(mat2(0.0,1.0,-1.0,0.0)*brushUV*.57+vec2(.71,.19),vec2(0.0,1.0));
 deep=mix(deep,crossing,.34)*1.16+vec3(.015,.05,.05);
 vec3 shallow=waterPaint(brushUV*.83+vec2(.29,.63),vec2(1.0,1.0))*1.10;
 vec3 color=mix(shallow,deep,smoothstep(.0,2.6,coast));
 // Water over pale sand reads as clear, shallow water. The depth colour
 // absorbs the seabed gradually; opaque deep water still hides everything.
 float depth=max(0.0,signedCoast+.15);
 vec2 drift=p+vec2(angularNoise(p*.7),angularNoise(p.yx*.9));
 float sandWash=angularNoise(drift*1.65);
 vec3 painted=texture2D(paintedNatureSampler,(vec2(1.0,1.0)+mix(vec2(.025),vec2(.975),abs(fract(vWorldPosition.xz*.095)*2.0-1.0)))/vec2(3.0,2.0)).rgb;
 vec3 bottom=painted*vec3(.84,.92,.86)*(.97+sandWash*.06);
 vec3 lagoon=mix(bottom,vec3(.26,.83,.73),1.0-exp(-depth*1.12));
 // A small cached view of the actual terrain preserves its painted sand,
 // submerged stone and their shadows under the transparent shallows.
 vec2 screenUV=vClip.xy/vClip.w*.5+.5;
 vec4 seabed=texture2D(seabedSampler,screenUV+normal.xz*.002);
 vec3 transmitted=mix(seabed.rgb*vec3(.80,1.09,1.10),vec3(.15,.72,.72),1.0-exp(-depth*.85));
 lagoon=mix(lagoon,transmitted,seabed.a*.85);
 color=mix(color,lagoon,beach*exp(-depth*.46));
 // Actual drowned boulders show through rocky shallows as muted turquoise
 // shapes, not only through sandy coves. The water still hides distant land.
 float clearRock=(1.0-beach)*seabed.a*exp(-depth*1.25)*.62;
 color=mix(color,transmitted,clearRock);
 float diffuse=.90+.10*max(0.0,dot(normal,lightDirection));
 color*=diffuse*mix(.30,1.0,daylight);
 vec3 view=normalize(eyePosition-vWorldPosition);
 float fresnel=pow(1.0-max(0.0,dot(view,normal)),3.0);
 vec2 uv=vClip.xy/vClip.w*.5+.5+normal.xz*.012;
 vec4 reflected=texture2D(reflectionSampler,uv);
 reflected+=texture2D(reflectionSampler,uv+vec2(.003,0));
 reflected+=texture2D(reflectionSampler,uv-vec2(.003,0));reflected/=3.0;
 color=mix(color,reflected.rgb,reflectionStrength*(.45+fresnel)*reflected.a*(1.0-beach*.72));
 // Широкий мягкий отблеск оставляет главным цвет граней, без зеркального блеска.
 float glow=pow(max(0.0,dot(reflect(-lightDirection,normal),view)),8.0);
 color+=vec3(.70,.90,.83)*glow*.018*daylight;
 // Медленные нерегулярные фронты идут к берегу. Все контуры линейные,
 // поэтому прибой огибает скалы ломаными лентами, без гладких окружностей.
 float slowTime=time/3.0;
 float broken=angularNoise(p*2.2+seed);
 float localRhythm=angularNoise(p*.62+seed);
 float surge=sin(slowTime*.92+localRhythm*6.28)*.5+.5;
 float ragged=(angularNoise(p*5.4+vec2(slowTime*.12,0.0)+seed)-.5)*.17;
 // Broad sheets cling to the feet of rocks. Their outer edges break into
 // angular fragments, then dissolve instead of drawing nested contour rings.
 float washWidth=.07+surge*.16+localRhythm*.08;
 float sheet=clamp((washWidth+ragged-signedCoast)/.032,0.0,1.0);
 vec2 driftFoam=p+vec2(slowTime*.035,-slowTime*.025);
 vec2 brush=foamBrush(driftFoam);
 sheet*=brush.x*smoothstep(.08,.35,broken)*.72;
 float frontDistance=.24+(.5-surge*.5)*(.55+localRhythm*.3);
 float front=clamp((.035-abs(coast-frontDistance-ragged))/.022,0.0,1.0);
 front*=smoothstep(.42,.64,broken)*clamp((.9-coast)/.4,0.0,1.0)*.85;
 float lace=brush.y*(1.0-smoothstep(.07,washWidth+.14,coast))*smoothstep(.20,.38,broken);
 float foam=max(max(sheet,front),lace*.80);
 // Two waves leave patches of wash on the wet sand. Their broken leading
 // strokes are subordinate to the filled foam, not closed polygon outlines.
 float run=fract(slowTime*.075+localRhythm*.16);
 float reach=mix(.82,-.19,run)+(angularNoise(p*2.8)-.5)*.25;
 float wave=(1.0-smoothstep(.018,.06,abs(signedCoast-reach)))*smoothstep(.30,.52,broken);
 float veil=smoothstep(reach-.34,reach-.29,signedCoast)*(1.0-smoothstep(reach+.015,reach+.045,signedCoast));
 float life=smoothstep(0.0,.16,run)*(1.0-smoothstep(.7,1.0,run));
 float secondRun=fract(run+.51);
 float secondReach=mix(.85,-.2,secondRun)+(angularNoise(p*3.5+seed)-.5)*.2;
 float secondLife=smoothstep(.05,.18,secondRun)*(1.0-smoothstep(.72,1.0,secondRun));
 float secondWave=(1.0-smoothstep(.015,.05,abs(signedCoast-secondReach)))*smoothstep(.38,.57,broken);
 float secondVeil=smoothstep(secondReach-.28,secondReach-.24,signedCoast)*(1.0-smoothstep(secondReach+.01,secondReach+.035,signedCoast));
 float beachFoam=max((wave*.95+veil*brush.x*.28)*life,(secondWave*.78+secondVeil*brush.x*.24)*secondLife)*(.72+broken*.28);
 float afterwash=(1.0-smoothstep(.06,.18,signedCoast))*(brush.x*.30+brush.y*.55);
 foam=mix(foam,max(beachFoam,afterwash),beach);
 // Sparse angular caustics drift beneath the surface rather than forming
 // a reflective glare that would obscure the underwater sand.
 color+=vec3(.12,.19,.12)*brush.y*exp(-abs(signedCoast-.6)*1.5)*.20*daylight;
 vec3 foamColor=mix(vec3(.34,.46,.58),vec3(.91,.975,.91),daylight);
 color=mix(color,foamColor,clamp(foam,0.0,1.0)*.89);
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
  const rocks = environmentLayout(board, buildings).filter(
    (o) => o.y < -0.2 && o.y > -1.25 && o.scale > 0.35,
  );
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
      // The distance channels saturate in open water; fade the cove mask before
      // that point so a shallow sandy tint cannot continue to the ocean edge.
      const shallowBeach =
        beachInfluence(angle, world.seed) * Math.max(0, Math.min(1, (2 - distance) / 0.65));
      data[index + 2] = Math.round(shallowBeach * 255);
      data[index + 3] = 255;
    }
  return data;
}

export function createOcean(
  scene: Scene,
  camera: Camera,
  natureTexture: Texture,
  gouacheTexture: Texture,
) {
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
  const seabed = new RenderTargetTexture('painted-seabed', 512, scene, false);
  seabed.clearColor = new Color4(0, 0, 0, 0);
  seabed.refreshRate = 0;
  seabed.activeCamera = camera;
  scene.customRenderTargets.push(seabed);
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
      samplers: [
        'coastSampler',
        'reflectionSampler',
        'paintedNatureSampler',
        'seabedSampler',
        'gouacheSampler',
      ],
    },
  );
  material.backFaceCulling = false;
  mesh.material = material;
  material.setTexture('reflectionSampler', reflection);
  material.setTexture('paintedNatureSampler', natureTexture);
  material.setTexture('gouacheSampler', gouacheTexture);
  material.setTexture('seabedSampler', seabed);
  material.setFloat('seed', 0);
  material.setFloat('time', 0);
  material
    .setFloat('daylight', 1)
    .setFloat('reflectionStrength', 0.055)
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
      seabed.renderList = [island];
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
        seabed.resetRefreshCounter();
        lastReflection = clockSeconds;
      }
    },
    setQuality(value: 'high' | 'low') {
      if (value === quality) return;
      quality = value;
      waterGeometry(value === 'high').applyToMesh(mesh);
      reflection.resize(value === 'high' ? 256 : 128);
      seabed.resize(value === 'high' ? 512 : 256);
      lastReflection = -100;
    },
    invalidate() {
      lastReflection = -100;
      reflection.resetRefreshCounter();
      seabed.resetRefreshCounter();
    },
    get diagnostics() {
      return {
        time,
        triangles: mesh.getTotalIndices() / 3,
        vertices: mesh.getTotalVertices(),
        reflectionSize: reflection.getSize().width,
        seabedSize: seabed.getSize().width,
        reflectionUpdates: reflections,
        reflectionHz: quality === 'high' ? 4 : 2,
        reflectionCameraMoving: cameraMoving,
        shoreTextureSize: SHORE_TEXTURE_SIZE,
      };
    },
    dispose() {
      field?.dispose();
      reflection.dispose();
      seabed.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

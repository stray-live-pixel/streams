import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';

export type TimeOfDay = 'auto' | 'dawn' | 'day' | 'dusk' | 'night';
export const timeModes: TimeOfDay[] = ['auto', 'dawn', 'day', 'dusk', 'night'];
export const DAY_CYCLE_SECONDS = 240;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function daylightState(seconds: number, mode: TimeOfDay = 'auto') {
  const fixed = { dawn: 0.025, day: 0.145, dusk: 0.475, night: 0.69 };
  const phase =
    mode === 'auto' ? (((seconds / DAY_CYCLE_SECONDS + 0.145) % 1) + 1) % 1 : fixed[mode];
  const angle = phase * Math.PI * 2;
  const sun = new Vector3(Math.cos(angle) * 0.866, Math.sin(angle), Math.cos(angle) * 0.5);
  const daylight = clamp((sun.y + 0.13) / 0.45);
  const twilight = clamp(1 - Math.abs(sun.y) / 0.38);
  const label =
    sun.y < -0.13 ? 'Ночь' : sun.y < 0.3 ? (Math.cos(angle) > 0 ? 'Рассвет' : 'Закат') : 'День';
  return { phase, sun, daylight, twilight, label };
}

const skyVertex = `precision highp float;
attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 vDirection;
void main(){vDirection=normalize(position);gl_Position=worldViewProjection*vec4(position,1.0);}`;
const skyFragment = `precision highp float;
varying vec3 vDirection; uniform float daylight; uniform float twilight; uniform vec3 sunDirection;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec3 dir=normalize(vDirection);float h=clamp(dir.y,0.0,1.0);
 vec3 night=mix(vec3(.09,.13,.22),vec3(.025,.05,.12),h);
 vec3 day=mix(vec3(.72,.83,.79),vec3(.27,.58,.74),pow(h,.6));
 vec3 color=mix(night,day,daylight);
 color+=vec3(.32,.13,.035)*twilight*pow(1.0-h,3.0);
 float halo=pow(max(0.0,dot(dir,sunDirection)),220.0);
 color+=vec3(1.0,.63,.25)*halo*.3*daylight;
 vec2 starUV=vec2(atan(dir.z,dir.x),asin(dir.y))*180.0;
 float stars=step(.997,hash(floor(starUV)))*pow(max(0.0,1.0-length(fract(starUV)-.5)*2.0),4.0);
 color+=stars*(1.0-daylight)*.75*step(.08,dir.y);
 gl_FragColor=vec4(color,1.0);
}`;

export function createLighting(scene: Scene, camera: Camera, onLabel: (label: string) => void) {
  const sunlight = new DirectionalLight('sunlight', new Vector3(-1, -1, -0.4), scene);
  const ambient = new HemisphericLight('sky-light', Vector3.Up(), scene);
  ambient.groundColor = new Color3(0.36, 0.32, 0.23);
  sunlight.autoUpdateExtends = false;
  sunlight.orthoLeft = -11;
  sunlight.orthoRight = 11;
  sunlight.orthoTop = 11;
  sunlight.orthoBottom = -11;
  sunlight.shadowMinZ = 1;
  sunlight.shadowMaxZ = 75;
  const shadows = new ShadowGenerator(2048, sunlight);
  shadows.usePercentageCloserFiltering = true;
  // The broad island frustum needs enough texels for the small pine tiers.
  // A 5×5 comparison filter softens their silhouettes without losing contact.
  shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadows.bias = 0.0008;
  shadows.normalBias = 0.025;
  shadows.setDarkness(0.12);
  shadows.getShadowMap()!.refreshRate = 0;
  const sky = CreateSphere('sky-dome', { diameter: 600, segments: 12 }, scene);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  const skyMaterial = new ShaderMaterial(
    'sky-atmosphere',
    scene,
    { vertexSource: skyVertex, fragmentSource: skyFragment },
    {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'daylight', 'twilight', 'sunDirection'],
    },
  );
  skyMaterial.backFaceCulling = false;
  skyMaterial.disableDepthWrite = true;
  sky.material = skyMaterial;
  function body(name: string, color: Color3, diameter: number) {
    const mesh = CreateSphere(name, { diameter, segments: 20 }, scene);
    const material = new StandardMaterial(name + '-emission', scene);
    material.disableLighting = true;
    material.emissiveColor = color;
    material.diffuseColor = color;
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
  const sun = body('sun-disc', new Color3(1, 0.86, 0.49), 2.5);
  const moon = body('moon-disc', new Color3(0.73, 0.82, 1), 1.8);
  let mode: TimeOfDay = 'auto',
    current = daylightState(0),
    lastShadow = -100,
    lastLabel = '';
  let quality: 'high' | 'low' = 'high';
  return {
    update(seconds: number) {
      current = daylightState(seconds, mode);
      const { daylight, twilight } = current;
      const direction = current.sun.y > -0.04 ? current.sun : current.sun.scale(-1);
      sunlight.direction.copyFrom(direction.scale(-1));
      sunlight.position.copyFrom(new Vector3(6, 0, 6).add(direction.scale(35)));
      sunlight.intensity = (0.28 + 0.64 * daylight) * (1 - 0.14 * twilight);
      sunlight.diffuse = Color3.Lerp(
        new Color3(0.5, 0.64, 0.92),
        Color3.Lerp(new Color3(1, 0.98, 0.85), new Color3(1, 0.62, 0.3), twilight),
        daylight,
      );
      ambient.intensity = 0.5 + 0.3 * daylight;
      ambient.diffuse = Color3.Lerp(
        new Color3(0.42, 0.52, 0.78),
        new Color3(1, 0.99, 0.93),
        daylight,
      );
      ambient.groundColor = Color3.Lerp(
        new Color3(0.24, 0.31, 0.45),
        new Color3(0.59, 0.55, 0.37),
        daylight,
      );
      skyMaterial
        .setFloat('daylight', daylight)
        .setFloat('twilight', twilight)
        .setVector3('sunDirection', current.sun);
      sun.position.copyFrom(camera.position.add(current.sun.scale(170)));
      moon.position.copyFrom(camera.position.subtract(current.sun.scale(170)));
      sun.setEnabled(current.sun.y > -0.12);
      moon.setEnabled(current.sun.y < 0.12);
      if (seconds - lastShadow > (quality === 'high' ? 0.25 : 0.5)) {
        shadows.getShadowMap()!.resetRefreshCounter();
        lastShadow = seconds;
      }
      const label = `${mode === 'auto' ? 'Авто · ' : ''}${current.label}`;
      if (label !== lastLabel) {
        onLabel(label);
        lastLabel = label;
      }
      return current;
    },
    setCasters(meshes: Mesh[]) {
      shadows.getShadowMap()!.renderList = meshes;
      shadows.getShadowMap()!.resetRefreshCounter();
    },
    cycle() {
      mode = timeModes[(timeModes.indexOf(mode) + 1) % timeModes.length];
      lastLabel = '';
      lastShadow = -100;
    },
    reset() {
      mode = 'auto';
      lastShadow = -100;
    },
    setQuality(value: 'high' | 'low') {
      quality = value;
      shadows.mapSize = value === 'high' ? 2048 : 1024;
      shadows.filteringQuality =
        value === 'high' ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
      lastShadow = -100;
    },
    get state() {
      return { ...current, mode };
    },
    isReady() {
      return shadows.getShadowMap()!.isReadyForRendering();
    },
    invalidate() {
      shadows.getShadowMap()!.resetRefreshCounter();
    },
    get lookDirection() {
      return current.sun.y >= 0 ? current.sun : current.sun.scale(-1);
    },
    get reflectionExclusions() {
      return [sky, sun, moon];
    },
    get diagnostics() {
      return {
        mode,
        label: current.label,
        phase: current.phase,
        daylight: current.daylight,
        sunPosition: sun.position.asArray(),
        sunEnabled: sun.isEnabled(),
        shadowSize: quality === 'high' ? 2048 : 1024,
        shadowFilter: quality === 'high' ? 'PCF 5×5' : 'PCF 3×3',
        shadowRefreshHz: quality === 'high' ? 4 : 2,
      };
    },
    dispose() {
      shadows.dispose();
    },
  };
}

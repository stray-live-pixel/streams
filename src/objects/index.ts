import builtIn from './templates.json';
import { singleCell, validFootprint, type Tile, type FootprintCatalog } from '../domain/index.js';

export type Triple = [number, number, number];
export interface ObjectPart {
  id: string;
  asset: string;
  position: Triple;
  rotation: Triple;
  scale: Triple;
  tint?: Triple;
}
export interface ObjectTemplates {
  version: 1;
  objects: Record<string, ObjectPart[]>;
  settings?: Record<string, ObjectSettings>;
}
export interface ObjectSettings {
  scale: number;
  footprint: Tile[];
}
export const editableObjectIds = [
  ...Array.from({ length: 4 }, (_, i) => `game/house/${i}`),
  'game/shop/0',
  'game/shop/1',
  'game/farm/0',
  'game/hall/0',
  'game/road/0',
  'game/port',
  'game/beacon',
  'game/ship',
  'game/fountain',
  'game/lantern',
];
export const builtInObjectTemplates: unknown = builtIn;
export const footprintObjectIds = editableObjectIds.filter(
  (id) => /^game\/(house|shop|farm|hall|road)\//.test(id) || id === 'game/port',
);
export const defaultObjectSettings = (): ObjectSettings => ({ scale: 1, footprint: singleCell() });
let templates: ObjectTemplates = { version: 1, objects: {} };
let revision = 0;
export const objectTemplateRevision = () => revision;
export const objectTemplate = (id: string) => templates.objects[id];
export const copyParts = (parts: ObjectPart[]): ObjectPart[] => structuredClone(parts);
export const objectSettings = (id: string): ObjectSettings =>
  structuredClone(templates.settings?.[id] ?? defaultObjectSettings());
export const objectFootprints = (): FootprintCatalog =>
  Object.fromEntries(
    Object.entries(templates.settings ?? {})
      .filter(([id]) => footprintObjectIds.includes(id))
      .map(([id, settings]) => [id, structuredClone(settings.footprint)]),
  );
export function scaleObjectParts(parts: ObjectPart[], scale: number): ObjectPart[] {
  return parts.map((part) => ({
    ...structuredClone(part),
    position: part.position.map((n) => n * scale) as Triple,
    scale: part.scale.map((n) => n * scale) as Triple,
  }));
}

/** Проверяем весь импорт до изменения памяти или сохранения. Город здесь не хранится. */
export function parseObjectTemplates(value: unknown, assets: ReadonlySet<string>): ObjectTemplates {
  const fail = (): never => {
    throw new Error('Некорректный файл объектов: проверьте версию, детали и числовые параметры.');
  };
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('objects' in value) ||
    !value.objects ||
    typeof value.objects !== 'object' ||
    Array.isArray(value.objects)
  )
    return fail();
  const result: ObjectTemplates = { version: 1, objects: {} };
  if ('settings' in value && value.settings !== undefined) {
    if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings))
      return fail();
    result.settings = {};
    for (const [id, setting] of Object.entries(value.settings)) {
      if (
        !editableObjectIds.includes(id) ||
        !setting ||
        typeof setting !== 'object' ||
        !('scale' in setting) ||
        typeof setting.scale !== 'number' ||
        !Number.isFinite(setting.scale) ||
        setting.scale < 0.1 ||
        setting.scale > 3 ||
        !('footprint' in setting) ||
        !validFootprint(setting.footprint) ||
        (!footprintObjectIds.includes(id) && setting.footprint.length !== 1)
      )
        return fail();
      const footprint: Tile[] = structuredClone(setting.footprint);
      result.settings[id] = {
        scale: setting.scale,
        footprint: footprint.sort((a, b) => a.z - b.z || a.x - b.x),
      };
    }
  }
  for (const [id, parts] of Object.entries(value.objects)) {
    if (!editableObjectIds.includes(id) || !Array.isArray(parts) || parts.length > 200)
      return fail();
    const seen = new Set<string>();
    result.objects[id] = parts.map((part: unknown) => {
      if (
        !part ||
        typeof part !== 'object' ||
        !('id' in part) ||
        typeof part.id !== 'string' ||
        !part.id ||
        part.id.length > 100 ||
        seen.has(part.id) ||
        !('asset' in part) ||
        typeof part.asset !== 'string' ||
        !assets.has(part.asset)
      )
        return fail();
      seen.add(part.id);
      const tuple = (key: 'position' | 'rotation' | 'scale' | 'tint'): Triple => {
        if (!(key in part)) return fail();
        const v = (part as Record<string, unknown>)[key];
        if (
          !Array.isArray(v) ||
          v.length !== 3 ||
          !v.every(
            (n) =>
              typeof n === 'number' &&
              Number.isFinite(n) &&
              Math.abs(n) <= (key === 'tint' ? 255 : 100),
          )
        )
          return fail();
        if (
          (key === 'scale' && v.some((n) => n < 0.01)) ||
          (key === 'tint' && v.some((n) => n < 0))
        )
          return fail();
        return [...v] as Triple;
      };
      return {
        id: part.id,
        asset: part.asset,
        position: tuple('position'),
        rotation: tuple('rotation'),
        scale: tuple('scale'),
        ...('tint' in part ? { tint: tuple('tint') } : {}),
      };
    });
  }
  return result;
}
/** Только память сцены. Источник сохранения — файл проекта, а не браузер. */
export function setObjectTemplates(next: ObjectTemplates) {
  templates = structuredClone(next);
  revision++;
}

import builtIn from './templates.json';

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
let templates: ObjectTemplates = { version: 1, objects: {} };
let revision = 0;
export const objectTemplateRevision = () => revision;
export const objectTemplate = (id: string) => templates.objects[id];
export const copyParts = (parts: ObjectPart[]): ObjectPart[] => structuredClone(parts);

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

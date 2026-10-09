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
export const objectStorageKey = 'ostrov-object-templates-v1';
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
export function createObjectStore(storage: () => Storage, assets: ReadonlySet<string>) {
  let warning = '';
  templates = parseObjectTemplates(builtIn, assets);
  try {
    const saved = storage().getItem(objectStorageKey);
    if (saved)
      templates.objects = {
        ...templates.objects,
        ...parseObjectTemplates(JSON.parse(saved), assets).objects,
      };
  } catch {
    warning = 'Не удалось прочитать локальные объекты. Доступны исходные композиции.';
  }
  revision++;
  function commit(next: ObjectTemplates) {
    const checked = parseObjectTemplates(next, assets);
    // При переполнении хранилища рабочая композиция остаётся несохранённым черновиком.
    storage().setItem(objectStorageKey, JSON.stringify(checked));
    templates = checked;
    revision++;
  }
  return {
    warning,
    save(id: string, parts: ObjectPart[]) {
      commit({ version: 1, objects: { ...templates.objects, [id]: parts } });
    },
    import(text: string) {
      const incoming = parseObjectTemplates(JSON.parse(text), assets);
      commit({ version: 1, objects: { ...templates.objects, ...incoming.objects } });
      return Object.keys(incoming.objects);
    },
    export() {
      return JSON.stringify(templates, null, 2);
    },
  };
}
export type ObjectStore = ReturnType<typeof createObjectStore>;

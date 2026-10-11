import harbor from './quiet-harbor.json';

/** Fixed map definitions. Keys above uint32 cannot collide with legacy random seeds. */
export const DEFAULT_MAP = harbor;
export const MAPS = [DEFAULT_MAP] as const;
export const mapScale = (key: number) => (key === DEFAULT_MAP.key ? DEFAULT_MAP.size / 12 : 1);
export const mapCenter = (key: number) => 6 * mapScale(key);

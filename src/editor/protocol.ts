import type { ObjectTemplates } from '../objects/index.js';

export interface ProjectSnapshot {
  config: ObjectTemplates;
  revision: string;
  commit: string;
  branch: string;
}
export interface SaveResult extends ProjectSnapshot {
  changed: boolean;
  buildError?: string;
}

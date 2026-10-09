import {
  copyParts,
  editableObjectIds,
  type ObjectPart,
  type ObjectStore,
} from '../objects/index.js';
import icons from '../../.generated/workshop-icons.json';

export interface ObjectBrowserOptions {
  objects: readonly { id: string; name: string; group: string; source: string }[];
  store: ObjectStore;
  createDefaultParts(id: string): ObjectPart[];
  create(canvas: HTMLCanvasElement): {
    select(id: string): { triangles: number; size: number[] };
    getParts(id: string): ObjectPart[];
    setParts(
      parts: ObjectPart[],
      id: string | null,
      fit?: boolean,
    ): { triangles: number; size: number[] };
    bindEditor(select: (id: string | null) => void, change: (parts: ObjectPart[]) => void): void;
    setMode(mode: 'position' | 'rotation' | 'scale'): void;
    setSnap(value: boolean): void;
    attach(id: string | null): void;
    rotate(direction: number): void;
    zoom(direction: number): void;
    resetCamera(): void;
    dispose(): void;
  };
}
interface Draft {
  parts: ObjectPart[];
  saved: string;
  past: ObjectPart[][];
  future: ObjectPart[][];
}

/** UI хранит черновики; сцена — меши, хранилище — только проверенные композиции. */
export function createObjectBrowser(
  document: Document,
  options: ObjectBrowserOptions,
  onToggle: (open: boolean) => void,
) {
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = get<HTMLDialogElement>('objects-dialog');
  const search = get<HTMLInputElement>('objects-search');
  const group = get<HTMLSelectElement>('objects-group');
  const list = get('objects-list');
  const signal = new AbortController();
  let preview: ReturnType<ObjectBrowserOptions['create']> | undefined;
  let isOpen = false;
  let selected = options.objects[0]?.id;
  let target = selected;
  let selectedPart: string | null = null;
  let filtered = [...options.objects];
  const drafts = new Map<string, Draft>();
  const icon = (name: keyof typeof icons) => icons[name];
  for (const node of dialog.querySelectorAll<HTMLElement>('[data-icon]'))
    node.innerHTML = icon(node.dataset.icon as keyof typeof icons);
  for (const name of [...new Set(options.objects.map((entry) => entry.group))]) {
    const option = document.createElement('option');
    option.value = option.textContent = name;
    group.append(option);
  }
  const project = get<HTMLSelectElement>('object-project');
  for (const object of options.objects.filter((o) => editableObjectIds.includes(o.id))) {
    const option = document.createElement('option');
    option.value = object.id;
    option.textContent = object.name;
    project.append(option);
  }
  const draft = () => (selected ? drafts.get(selected) : undefined);
  const dirty = (item: Draft) => JSON.stringify(item.parts) !== item.saved;
  const status = (text: string) => {
    get('object-save-status').textContent = text;
  };
  function stats(result: { triangles: number; size: number[] }) {
    get('object-stats').textContent =
      `${result.triangles.toLocaleString('ru-RU')} треугольников · ${result.size.map((n) => n.toFixed(2)).join(' × ')} м`;
  }
  function renderInspector() {
    const item = draft();
    const part = item?.parts.find((p) => p.id === selectedPart);
    get('object-inspector').hidden = !item;
    get('object-asset-actions').hidden = !!item;
    get<HTMLButtonElement>('object-add').disabled =
      !selected || selected.startsWith('game/') || !target;
    get<HTMLButtonElement>('object-save').disabled = !item || !dirty(item);
    get<HTMLButtonElement>('object-undo').disabled = !item?.past.length;
    get<HTMLButtonElement>('object-redo').disabled = !item?.future.length;
    get<HTMLButtonElement>('object-duplicate').disabled = !part;
    get<HTMLButtonElement>('object-delete').disabled = !part;
    get<HTMLFieldSetElement>('object-transform').disabled = !part;
    get('object-transform-empty').hidden = !!part;
    get('object-parts-count').textContent = `${item?.parts.length ?? 0} деталей`;
    const layers = get('object-parts');
    layers.replaceChildren();
    for (const [index, entry] of (item?.parts ?? []).entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.part = entry.id;
      button.setAttribute('aria-pressed', String(entry.id === selectedPart));
      const mark = document.createElement('span');
      mark.innerHTML = icon('box');
      const text = document.createElement('span');
      text.textContent = `${index + 1}. ${entry.asset.split('/').at(-1)}`;
      button.append(mark, text);
      layers.append(button);
    }
    for (const key of ['position', 'rotation', 'scale'] as const) {
      for (let axis = 0; axis < 3; axis++) {
        get<HTMLInputElement>(`part-${key}-${axis}`).value = part
          ? String(Number((part[key][axis] * (key === 'rotation' ? 180 / Math.PI : 1)).toFixed(3)))
          : '';
      }
    }
    if (item) status(dirty(item) ? 'Есть несохранённые изменения' : 'Все изменения сохранены');
    else status('Просмотр детали · добавьте её в выбранную постройку');
  }
  function draw(fit = false) {
    const item = draft();
    if (item && preview) stats(preview.setParts(item.parts, selectedPart, fit));
    renderInspector();
  }
  function selectPart(id: string | null) {
    selectedPart = id;
    preview?.attach(id);
    renderInspector();
  }
  function change(parts: ObjectPart[], nextPart = selectedPart) {
    const item = draft();
    if (!item || JSON.stringify(item.parts) === JSON.stringify(parts)) return;
    item.past.push(copyParts(item.parts));
    if (item.past.length > 100) item.past.shift();
    item.future = [];
    item.parts = copyParts(parts);
    selectedPart = nextPart;
    draw();
  }
  function select(id: string) {
    const object = options.objects.find((o) => o.id === id);
    if (!object || !preview) return;
    selected = id;
    selectedPart = null;
    get('object-title').textContent = object.name;
    get('object-source').textContent = object.source;
    get('object-error').textContent = '';
    try {
      if (editableObjectIds.includes(id)) {
        target = id;
        project.value = id;
        if (!drafts.has(id)) {
          const parts = preview.getParts(id);
          drafts.set(id, { parts, saved: JSON.stringify(parts), past: [], future: [] });
        }
        draw(true);
      } else {
        stats(preview.select(id));
        renderInspector();
      }
    } catch (error) {
      get('object-error').textContent =
        'Не удалось показать объект. Выберите другой или откройте мастерскую заново.';
      console.error(error);
    }
    for (const button of list.querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(button.dataset.object === id));
    const index = filtered.findIndex((entry) => entry.id === selected);
    get<HTMLButtonElement>('object-previous').disabled = index <= 0;
    get<HTMLButtonElement>('object-next').disabled = index < 0 || index >= filtered.length - 1;
  }
  function filter() {
    const query = search.value.trim().toLocaleLowerCase('ru-RU');
    filtered = options.objects.filter(
      (entry) =>
        (!group.value || entry.group === group.value) &&
        `${entry.name} ${entry.source}`.toLocaleLowerCase('ru-RU').includes(query),
    );
    list.replaceChildren();
    for (const entry of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.object = entry.id;
      const mark = document.createElement('span');
      mark.innerHTML = icon(entry.id.startsWith('game/') ? 'house' : 'box');
      const text = document.createElement('span');
      text.textContent = entry.name;
      button.append(mark, text);
      list.append(button);
    }
    get('objects-count').textContent = `${filtered.length} из ${options.objects.length} объектов`;
    get('objects-empty').hidden = filtered.length > 0;
    select(
      filtered.some((entry) => entry.id === selected) ? selected! : (filtered[0]?.id ?? selected!),
    );
  }
  const listen = (id: string, action: () => void) =>
    get(id).addEventListener('click', action, { signal: signal.signal });
  function save() {
    const item = draft();
    if (!item || !selected) return;
    try {
      options.store.save(selected, item.parts);
      item.saved = JSON.stringify(item.parts);
      renderInspector();
      status('Сохранено · постройка обновлена в игре');
    } catch {
      status('Не удалось сохранить в браузере. Экспортируйте JSON, чтобы сохранить работу в файл.');
    }
  }
  function history(redo: boolean) {
    const item = draft();
    if (!item) return;
    const source = redo ? item.future : item.past;
    const next = source.pop();
    if (!next) return;
    (redo ? item.past : item.future).push(copyParts(item.parts));
    item.parts = next;
    selectedPart = next.some((p) => p.id === selectedPart) ? selectedPart : null;
    draw();
  }
  function finishClose() {
    if (!isOpen) return;
    isOpen = false;
    preview?.dispose();
    preview = undefined;
    onToggle(false);
    get('menu-objects').focus();
  }
  function close() {
    dialog.close();
    finishClose();
  }
  dialog.addEventListener('close', finishClose, { signal: signal.signal });
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      close();
    },
    { signal: signal.signal },
  );
  listen('objects-close', close);
  listen('object-save', save);
  listen('object-undo', () => history(false));
  listen('object-redo', () => history(true));
  listen('object-left', () => preview?.rotate(-1));
  listen('object-right', () => preview?.rotate(1));
  listen('object-zoom-in', () => preview?.zoom(1));
  listen('object-zoom-out', () => preview?.zoom(-1));
  listen('object-reset', () => preview?.resetCamera());
  listen('object-return', () => {
    if (target) select(target);
  });
  listen('object-library', () => {
    group.value = 'Fantasy Town · детали';
    search.value = '';
    filter();
    search.focus();
  });
  listen('object-add', () => {
    const asset = selected;
    if (!target || !asset || asset.startsWith('game/')) return;
    select(target);
    const item = draft();
    if (!item) return;
    if (item.parts.length >= 200) {
      status('Достигнут предел: 200 деталей на постройку.');
      return;
    }
    const id = crypto.randomUUID();
    change(
      [...item.parts, { id, asset, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
      id,
    );
  });
  listen('object-duplicate', () => {
    const item = draft(),
      part = item?.parts.find((p) => p.id === selectedPart);
    if (!item || !part) return;
    if (item.parts.length >= 200) {
      status('Достигнут предел: 200 деталей на постройку.');
      return;
    }
    const next = copyParts([part])[0];
    next.id = crypto.randomUUID();
    next.position[0] = Math.min(100, next.position[0] + 0.1);
    change([...item.parts, next], next.id);
  });
  listen('object-delete', () => {
    const item = draft();
    if (item && selectedPart)
      change(
        item.parts.filter((p) => p.id !== selectedPart),
        null,
      );
  });
  listen('object-original', () => {
    if (!selected || !preview) return;
    const item = draft();
    if (item) change(options.createDefaultParts(selected), null);
  });
  listen('object-export', () => {
    const config = JSON.parse(options.store.export()) as { objects: Record<string, ObjectPart[]> };
    for (const [id, item] of drafts) if (dirty(item)) config.objects[id] = item.parts;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'templates.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Файл templates.json экспортирован, включая текущие изменения');
  });
  listen('object-import', () => get<HTMLInputElement>('object-import-file').click());
  get<HTMLInputElement>('object-import-file').addEventListener(
    'change',
    async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('Файл слишком большой (максимум 2 МБ).');
        const imported = options.store.import(await file.text());
        for (const id of imported) drafts.delete(id);
        if (selected && preview) select(selected);
        status('Конфигурация импортирована и сохранена');
      } catch (error) {
        status(error instanceof Error ? error.message : 'Не удалось импортировать файл.');
      }
      input.value = '';
    },
    { signal: signal.signal },
  );
  for (const mode of ['position', 'rotation', 'scale'] as const)
    listen(`object-mode-${mode}`, () => {
      preview?.setMode(mode);
      for (const button of dialog.querySelectorAll('[data-mode]'))
        button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.mode === mode));
    });
  get<HTMLInputElement>('object-snap').addEventListener(
    'change',
    () => preview?.setSnap(get<HTMLInputElement>('object-snap').checked),
    { signal: signal.signal },
  );
  get('object-parts').addEventListener(
    'click',
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-part]');
      if (button) selectPart(button.dataset.part!);
    },
    { signal: signal.signal },
  );
  for (const key of ['position', 'rotation', 'scale'] as const)
    for (let axis = 0; axis < 3; axis++) {
      const input = get<HTMLInputElement>(`part-${key}-${axis}`);
      input.addEventListener(
        'change',
        () => {
          const item = draft();
          const value = Number(input.value);
          if (!item || !input.value.trim() || !input.checkValidity() || !Number.isFinite(value)) {
            renderInspector();
            return;
          }
          const parts = copyParts(item.parts),
            part = parts.find((p) => p.id === selectedPart);
          if (part) {
            part[key][axis] = value * (key === 'rotation' ? Math.PI / 180 : 1);
            change(parts);
          }
        },
        { signal: signal.signal },
      );
    }
  project.addEventListener('change', () => select(project.value), { signal: signal.signal });
  for (const [id, direction] of [
    ['object-previous', -1],
    ['object-next', 1],
  ] as const)
    listen(id, () => {
      const next = filtered[filtered.findIndex((entry) => entry.id === selected) + direction];
      if (next) select(next.id);
    });
  search.addEventListener('input', filter, { signal: signal.signal });
  group.addEventListener('change', filter, { signal: signal.signal });
  list.addEventListener(
    'click',
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-object]');
      if (button) select(button.dataset.object!);
    },
    { signal: signal.signal },
  );
  dialog.addEventListener(
    'keydown',
    (event) => {
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        history(event.shiftKey);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        get<HTMLButtonElement>('object-delete').click();
      }
    },
    { signal: signal.signal },
  );
  return {
    open() {
      if (isOpen) return;
      isOpen = true;
      dialog.showModal();
      onToggle(true);
      try {
        preview = options.create(get<HTMLCanvasElement>('object-canvas'));
        preview.bindEditor(selectPart, (parts) => change(parts));
        const activeMode = dialog.querySelector<HTMLElement>('[data-mode][aria-pressed="true"]')
          ?.dataset.mode;
        if (activeMode === 'position' || activeMode === 'rotation' || activeMode === 'scale')
          preview.setMode(activeMode);
        preview.setSnap(get<HTMLInputElement>('object-snap').checked);
        const previous = selected;
        filter();
        if (previous) select(previous);
        if (options.store.warning) status(options.store.warning);
      } catch (error) {
        get('object-error').textContent =
          '3D недоступно. Включите аппаратное ускорение и WebGL в браузере.';
        console.error(error);
      }
    },
    dispose() {
      preview?.dispose();
      signal.abort();
    },
  };
}

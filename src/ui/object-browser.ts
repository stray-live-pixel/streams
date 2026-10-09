export interface ObjectBrowserOptions {
  objects: readonly { id: string; name: string; group: string; source: string }[];
  create(canvas: HTMLCanvasElement): {
    select(id: string): { triangles: number; size: number[] };
    rotate(direction: number): void;
    zoom(direction: number): void;
    resetCamera(): void;
    dispose(): void;
  };
}

/** Только каталог и намерения пользователя; геометрией и WebGL владеет scene. */
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
  let filtered = [...options.objects];
  const groups = [...new Set(options.objects.map((entry) => entry.group))];
  for (const name of groups) {
    const option = document.createElement('option');
    option.value = option.textContent = name;
    group.append(option);
  }
  function select(id: string) {
    const object = options.objects.find((object) => object.id === id);
    if (!object) return;
    selected = id;
    get('object-title').textContent = object.name;
    get('object-source').textContent = object.source;
    get('object-error').textContent = '';
    try {
      const result = preview?.select(id);
      get('object-stats').textContent = result
        ? `${result.triangles.toLocaleString('ru-RU')} треугольников · Размер: ${result.size.map((n) => n.toFixed(2)).join(' × ')}`
        : '';
    } catch (error) {
      get('object-error').textContent =
        'Не удалось показать объект. Выберите другой или откройте просмотр заново.';
      console.error(error);
    }
    for (const button of list.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.object === id));
    }
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
      button.textContent = entry.name;
      list.append(button);
    }
    get('objects-count').textContent = `${filtered.length} из ${options.objects.length} объектов`;
    get('objects-empty').hidden = filtered.length > 0;
    // Пустой поиск не скрывает уже выбранную модель: её можно продолжать рассматривать.
    select(
      filtered.some((entry) => entry.id === selected) ? selected! : (filtered[0]?.id ?? selected!),
    );
  }
  const listen = (id: string, action: () => void) =>
    get(id).addEventListener('click', action, { signal: signal.signal });
  function close() {
    dialog.close();
    finishClose();
  }
  function finishClose() {
    if (!isOpen) return;
    isOpen = false;
    preview?.dispose();
    preview = undefined;
    onToggle(false);
    get('menu-objects').focus();
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
  listen('object-left', () => preview?.rotate(-1));
  listen('object-right', () => preview?.rotate(1));
  listen('object-zoom-in', () => preview?.zoom(1));
  listen('object-zoom-out', () => preview?.zoom(-1));
  listen('object-reset', () => preview?.resetCamera());
  for (const [id, direction] of [
    ['object-previous', -1],
    ['object-next', 1],
  ] as const) {
    listen(id, () => {
      const index = filtered.findIndex((entry) => entry.id === selected);
      const next = filtered[index + direction];
      if (next) select(next.id);
    });
  }
  search.addEventListener('input', filter, { signal: signal.signal });
  list.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.object) select(target.dataset.object);
    },
    { signal: signal.signal },
  );
  group.addEventListener('change', filter, { signal: signal.signal });
  return {
    open() {
      if (isOpen) return;
      isOpen = true;
      dialog.showModal();
      onToggle(true);
      try {
        preview = options.create(get<HTMLCanvasElement>('object-canvas'));
        filter();
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

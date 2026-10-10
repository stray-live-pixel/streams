import type { GameModel, CommandHandler } from '../domain/index.js';
import { LETTERS, CHAPTERS } from './letters.js';
import art from '../../.generated/card-art.json';
import cameraIcons from '../../.generated/camera-icons.json';
import type { CameraAction } from '../scene/index.js';
export { createMenu } from './menu.js';
export { fitGameViewport } from './viewport.js';
/**
 * DOM — только представление. Этот модуль сообщает о намерениях пользователя,
 * но не списывает монеты, не заселяет дома и не пишет сохранения.
 */
export function createUI(
  document: Document,
  onCommand: CommandHandler,
  onCamera: (action: CameraAction | 'home', pressed?: boolean) => void,
  onSky: (action: 'time' | 'look') => void = () => {},
) {
  // Типизированные помощники отделяют обязательную разметку от необязательных данных.
  function $<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Отсутствует элемент #${id}`);
    return element as T;
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let initialized = false;
  const listen = (id: string, callback: () => void) =>
    $(id).addEventListener('click', callback, { signal: controller.signal });
  listen('time-of-day', () => onSky('time'));
  listen('look-at-sky', () => onSky('look'));
  listen('next-day', () => onCommand({ type: 'next-day' }));
  listen('coach-action', () => onCommand({ type: 'continue' }));
  listen('help', () => $<HTMLDialogElement>('help-dialog').showModal());
  listen('close-help', () => $<HTMLDialogElement>('help-dialog').close());
  const cameraButtons = [
    ['rotate-left', 'left'],
    ['rotate-right', 'right'],
    ['zoom-in', 'zoomIn'],
    ['zoom-out', 'zoomOut'],
  ] as const;
  for (const [id, action] of cameraButtons) {
    const button = $<HTMLButtonElement>(id);
    button.innerHTML = cameraIcons[action];
    const hold = () => {
      button.dataset.pressed = 'true';
      onCamera(action, true);
    };
    const release = () => {
      delete button.dataset.pressed;
      onCamera(action, false);
    };
    button.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        button.focus({ preventScroll: true });
        button.setPointerCapture(event.pointerId);
        hold();
      },
      { signal: controller.signal },
    );
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      button.addEventListener(event, release, { signal: controller.signal });
    button.addEventListener(
      'keydown',
      (event) => {
        if (!['Space', 'Enter'].includes(event.code)) return;
        event.preventDefault();
        if (!event.repeat) hold();
      },
      { signal: controller.signal },
    );
    button.addEventListener(
      'keyup',
      (event) => {
        if (['Space', 'Enter'].includes(event.code)) {
          event.preventDefault();
          release();
        }
      },
      { signal: controller.signal },
    );
    // Синтетический click от вспомогательных технологий тоже даёт плавный шаг.
    button.addEventListener(
      'click',
      (event) => {
        if (event.detail === 0) {
          hold();
          release();
        }
      },
      { signal: controller.signal },
    );
    button.addEventListener('blur', release, { signal: controller.signal });
    window.addEventListener('blur', release, { signal: controller.signal });
  }
  $('home').innerHTML = cameraIcons.home;
  listen('home', () => onCamera('home'));
  listen('light-beacon', () => onCommand({ type: 'light-beacon' }));
  listen('read-ending', () => $<HTMLDialogElement>('ending-dialog').showModal());
  const leaveEnding = () => {
    $<HTMLDialogElement>('ending-dialog').close();
    onCommand({ type: 'continue-city' });
  };
  listen('continue-city', leaveEnding);
  $<HTMLDialogElement>('ending-dialog').addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      leaveEnding();
    },
    { signal: controller.signal },
  );
  function render(model: GameModel) {
    const { stats, step, busy, selected, required } = model;
    if (!initialized) {
      for (const [index, choice] of model.choices.entries()) {
        const button = document.createElement('button');
        button.className = 'build';
        button.dataset.type = choice.type;
        // Источник разметки — только упакованные локальные картинки и статический каталог.
        button.innerHTML = `<span class="card-number">${index || '⚓'}</span><span aria-hidden="true" class="card-art ${choice.type}">${art[choice.type]}</span><b>${choice.name}</b><small>${'desc' in choice ? choice.desc : ''}<br>${'detail' in choice ? choice.detail : ''}</small><span class="price">${choice.cost ? choice.cost + ' монет' : 'Бесплатно'}</span>`;
        button.addEventListener(
          'click',
          () => onCommand({ type: 'select', building: choice.type }),
          { signal: controller.signal },
        );
        $('buildings').append(button);
      }
      initialized = true;
    }
    $('money').textContent = model.money.toLocaleString('ru-RU');
    $('pop').textContent = String(model.pop);
    $('food').textContent = model.food.toLocaleString('ru-RU');
    $('income').textContent = `+${stats.income} / день`;
    $('foodflow').textContent = `${stats.foodNet >= 0 ? '+' : ''}${stats.foodNet} / день`;
    $('foodflow').classList.toggle('warning', stats.foodNet < 0);
    $('day-label').textContent = busy ? 'Корабль у причала…' : `День ${model.day} · тихая погода`;
    $<HTMLButtonElement>('next-day').disabled = !model.canNextDay;
    $('next-day').classList.toggle('nudge', step === 4);
    $('next-day').hidden = ![4, 6].includes(step);
    $('steps').hidden = [0, 5, 6].includes(step);
    [...$('steps').children].forEach((el, i) => el.classList.toggle('done', i < model.progress));
    $('step-label').textContent =
      step === 6
        ? model.won
          ? 'Цель достигнута'
          : `Летопись · день ${model.day}`
        : step === 0
          ? 'Письмо с острова'
          : step === 5
            ? 'Обучение пройдено'
            : `Шаг ${model.progress} из 5`;
    if (step !== 6) {
      const [title, text, instruction] = LETTERS[step]!;
      $('coach-title').textContent = title;
      $('coach-text').textContent = text;
      $('instruction').textContent = required
        ? selected === required
          ? selected === 'port'
            ? 'Двигайте причал вдоль берега: береговая часть на суше, настил над водой.'
            : 'Выберите любой свободный участок. Жители прибудут утром, если для них есть места.'
          : `Выберите «${model.choices.find((c) => c.type === required)!.name}» внизу экрана.`
        : instruction;
    } else {
      const [chapter, title, letter] = CHAPTERS[model.story.chapter];
      $('step-label').textContent = chapter;
      $('coach-title').textContent = title;
      $('coach-text').textContent = letter;
      $('instruction').textContent = model.won
        ? 'Можно продолжать строить. Маяк останется гореть.'
        : stats.foodNet < 0
          ? `Нужна ещё ферма: не хватает ${-stats.foodNet} еды в день.`
          : !model.story.settled
            ? stats.capacity > model.pop
              ? 'В домах есть места. Следующий корабль придёт утром.'
              : 'Постройте ещё дом. Новые соседи прибудут утром.'
            : !model.story.funded
              ? 'Город готов. Соберите доход следующих дней на маяк.'
              : 'Всё готово. Зажгите маяк — это последний шаг нашей истории.';
    }
    document.querySelector('.coach')!.classList.toggle('freeplay', step === 6);
    $('mission').hidden = step !== 6;
    const goals = [model.story.settled, model.story.supplied, model.story.funded];
    $('mission-progress').textContent = model.won
      ? 'Завершено ✦'
      : `${goals.filter(Boolean).length} / 3`;
    const goal = (id: string, complete: boolean, label: string) => {
      $(id).textContent = `${complete ? '✓' : '○'} ${label}`;
      $(id).classList.toggle('complete', complete);
    };
    goal(
      'goal-people',
      model.story.settled,
      `Жители: ${model.pop} / ${model.story.populationGoal}`,
    );
    goal(
      'goal-food',
      model.story.supplied,
      `Еда: ${stats.foodNet >= 0 ? '+' : ''}${stats.foodNet} в день (нужно ≥ 0)`,
    );
    goal(
      'goal-money',
      model.story.funded || model.won,
      model.won
        ? 'Маяк построен'
        : `На маяк: ${Math.min(model.money, model.story.beaconCost)} / ${model.story.beaconCost} монет`,
    );
    $('light-beacon').hidden = model.won;
    $<HTMLButtonElement>('light-beacon').disabled = !model.story.canFinish || busy;
    $('read-ending').hidden = !model.won;
    const ending = $<HTMLDialogElement>('ending-dialog');
    if (!model.won) ending.close();
    if (model.won) {
      $('ending-stats').textContent =
        `Маяк зажжён на ${model.completedDay}-й день · Сейчас в городе: ${model.pop} жителей`;
      if (!model.endingSeen && !busy && !ending.open) ending.showModal();
    }
    if (selected === 'road')
      $('instruction').textContent =
        'Прокладывайте улицы кликами по участкам. Повторный клик убирает дорогу. Деревянный настил бесплатный; здания работают и без дорог.';
    $('coach-action').hidden = ![0, 5].includes(step);
    $<HTMLButtonElement>('coach-action').disabled = busy;
    $('coach-action').textContent = step === 0 ? 'Начнём нашу историю →' : 'Остаюсь на острове →';
    for (const choice of model.choices) {
      const button = document.querySelector<HTMLButtonElement>(`[data-type="${choice.type}"]`)!;
      button.hidden = !choice.visible;
      button.disabled = !choice.enabled;
      button.classList.toggle('active', selected === choice.type);
      button.classList.toggle('nudge', required === choice.type && !selected);
      button.setAttribute('aria-pressed', String(selected === choice.type));
    }
    $('build-controls').hidden = step === 0;
    $('hint').textContent = selected ? 'Выберите участок на карте.' : 'Выберите постройку.';
  }
  return {
    render,
    setTimeLabel(label: string) {
      $('time-of-day').textContent = label;
      $('game-screen').dataset.dark = String(label.includes('Ночь'));
    },
    notify(text: string) {
      $('toast').textContent = text;
      $('toast').classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => $('toast').classList.remove('show'), 3200);
    },
    saveStatus(text: string) {
      $('save-note').textContent = text;
    },
    dispose() {
      controller.abort();
      clearTimeout(timer);
    },
  };
}

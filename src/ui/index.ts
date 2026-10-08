import type { GameModel, CommandHandler } from '../domain/index.js';
import { LETTERS } from './letters.js';
import art from '../../.generated/card-art.json';
/**
 * DOM — только представление. Этот модуль сообщает о намерениях пользователя,
 * но не списывает монеты, не заселяет дома и не пишет сохранения.
 */
export function createUI(
  document: Document,
  onCommand: CommandHandler,
  onCamera: (action: 'left' | 'right' | 'home') => void,
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
  listen('next-day', () => onCommand({ type: 'next-day' }));
  listen('coach-action', () => onCommand({ type: 'continue' }));
  listen('help', () => $<HTMLDialogElement>('help-dialog').showModal());
  listen('close-help', () => $<HTMLDialogElement>('help-dialog').close());
  listen('restart', () => {
    $<HTMLDialogElement>('help-dialog').close();
    $<HTMLDialogElement>('reset-dialog').showModal();
  });
  listen('reset-progress', () => $<HTMLDialogElement>('reset-dialog').showModal());
  listen('cancel-reset', () => $<HTMLDialogElement>('reset-dialog').close());
  listen('confirm-reset', () => {
    $<HTMLDialogElement>('reset-dialog').close();
    onCommand({ type: 'reset' });
  });
  listen('rotate-left', () => onCamera('left'));
  listen('rotate-right', () => onCamera('right'));
  listen('home', () => onCamera('home'));
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
            ? 'Выберите свободный участок на берегу. Подходящие места подсвечены.'
            : 'Выберите любой свободный участок. Жители прибудут утром, если для них есть места.'
          : `Выберите «${model.choices.find((c) => c.type === required)!.name}» внизу экрана.`
        : instruction;
    } else {
      $('coach-title').textContent = model.won
        ? 'Теперь это наш дом.'
        : `${stats.pop} соседей у моря`;
      $('coach-text').textContent = model.won
        ? 'Вы построили город и обеспечили его едой. Можно продолжать в своём темпе.'
        : model.journal ||
          'В гавани хватит места для пятидесяти соседей. Давайте строить так, чтобы каждому достались крыша и хлеб.';
      $('instruction').textContent = !stats.fed
        ? 'Еды не хватит на следующий день. Постройте ферму: без еды магазины не принесут доход.'
        : stats.foodNet < 0
          ? `Запас еды уменьшается на ${-stats.foodNet} в день. Добавьте ферму.`
          : model.money < 100
            ? 'Нажмите «Следующий день», чтобы накопить монеты.'
            : 'Еды хватает. Можно построить ещё один дом.';
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

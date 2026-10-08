import type { CityState, BuildingType, Command, GameEvent } from './types.js';
import { BUILDINGS, BUILD_ORDER, ARRIVALS_PER_DAY } from './catalog.js';
import { initialState, restoreState } from './state.js';
import { storyProgress, BEACON_COST } from './story.js';
import { calculate } from './economy.js';
import { isLand, shoreDirection } from './world.js';
import {
  STEP,
  requiredBuilding,
  tutorialProgress,
  canAdvanceDay,
  isChoiceVisible,
  isChoiceAllowed,
  afterConstruction,
} from './tutorial.js';
/**
 * Чёрный ящик правил игры. Снаружи доступны только dispatch, snapshot, serialize.
 * Команды — обычные объекты. Событие arrival просит сцену показать рейс,
 * но сама экономика ничего не знает о кадрах, DOM и графической библиотеке.
 */
export function createGame(saved: CityState | null = null) {
  let state = saved ? restoreState(saved) : initialState();
  let selected: BuildingType | null = null;
  let busy = false;
  function snapshot() {
    return {
      ...structuredClone(state),
      stats: calculate(state),
      story: storyProgress(state),
      selected,
      busy,
      required: requiredBuilding(state.step),
      progress: tutorialProgress(state.step),
      canNextDay: !busy && !(state.won && !state.endingSeen) && canAdvanceDay(state.step),
      choices: BUILD_ORDER.map((type) => ({
        type,
        ...BUILDINGS[type],
        visible: isChoiceVisible(type, state.step),
        enabled:
          !(state.won && !state.endingSeen) &&
          isChoiceAllowed(type, state, busy) &&
          state.money >= BUILDINGS[type].cost,
      })),
    };
  }
  function dispatch(command: Command) {
    const events: GameEvent[] = [];
    let changed = false;
    const say = (text: string) => events.push({ type: 'notice', text });
    if (command.type === 'reset') {
      state = initialState();
      selected = null;
      busy = false;
      changed = true;
      events.push({ type: 'reset-view' });
      say('Прогресс сброшен. Начнём новый город!');
    } else if (command.type === 'continue-city' && state.won) {
      state.endingSeen = true;
      changed = true;
    } else if (state.won && !state.endingSeen) {
      // Пока игрок читает эпилог, горячие клавиши не меняют город за окном.
      return { changed, events };
    } else if (command.type === 'light-beacon') {
      if (!busy && storyProgress(state).canFinish) {
        state.money -= BEACON_COST;
        state.won = true;
        state.completedDay = state.day;
        state.endingSeen = false;
        selected = null;
        changed = true;
      } else say('Для маяка нужны 50 жителей, еда для всех каждый день и 300 монет.');
    } else if (command.type === 'arrival-finished') {
      busy = false;
    } else if (command.type === 'continue' && !busy) {
      if (state.step === STEP.WELCOME) {
        state.step = STEP.PORT;
        changed = true;
      } else if (state.step === STEP.DONE) {
        state.step = STEP.FREE;
        changed = true;
      }
    } else if (command.type === 'select') {
      if (command.building === null) selected = null;
      else if (
        Object.hasOwn(BUILDINGS, command.building) &&
        isChoiceAllowed(command.building, state, busy)
      ) {
        if (state.money < BUILDINGS[command.building].cost)
          say('Накопите монеты кнопкой «Следующий день».');
        else selected = command.building;
      }
    } else if (command.type === 'build') {
      const { x, z } = command;
      if (!selected) say('Сначала выберите постройку внизу.');
      else if (isLand(x, z) && isChoiceAllowed(selected, state, busy)) {
        const old = state.buildings.find((b) => b.x === x && b.z === z);
        const definition = BUILDINGS[selected];
        if (selected === 'port' && !shoreDirection(x, z))
          say('Порту нужен выход к морю. Выберите подсвеченный участок.');
        else if (old && old.t !== 'road') say('Здесь уже есть здание. Выберите другое место.');
        else if (state.money < definition.cost)
          say('Недостаточно монет. Перейдите к следующему дню.');
        else {
          if (old) state.buildings.splice(state.buildings.indexOf(old), 1);
          if (!(selected === 'road' && old)) state.buildings.push({ x, z, t: selected });
          state.money -= definition.cost;
          changed = true;
          // Дорога остаётся выбранной: игрок обычно кладёт несколько участков подряд.
          if (selected !== 'road') {
            say(`${definition.name}: строительство завершено.`);
            afterConstruction(state, selected);
            selected = null;
          }
        }
      }
    } else if (command.type === 'next-day' && !busy && canAdvanceDay(state.step)) {
      const port = state.buildings.find((b) => b.t === 'port');
      const before = calculate(state);
      const count = port ? Math.min(ARRIVALS_PER_DAY, Math.max(0, before.capacity - state.pop)) : 0;
      state.pop += count;
      // Прибывшие участвуют в экономике этого утра, как в исходной игре.
      const stats = calculate(state);
      state.money += stats.income;
      state.food = Math.max(0, state.food + stats.foodNet);
      state.day++;
      state.journal = `Утро ${state.day}. ${count ? `Корабль привёз ${count} новых соседей. ` : 'Свободных мест для новых соседей нет. '}Доход: ${stats.income} монет.`;
      if (state.step === STEP.DAY) state.step = STEP.DONE;
      changed = true;
      if (count && port) {
        busy = true;
        events.push({ type: 'arrival', count, port: { ...port } });
      }
      say(
        count
          ? `Корабль прибывает! На борту ${count} новых жителей.`
          : `День ${state.day}: +${stats.income} монет.`,
      );
    }
    return { changed, events };
  }
  // Возвращается копия. Даже ошибочный код интерфейса не может менять город напрямую.
  return Object.freeze({ dispatch, snapshot, serialize: () => structuredClone(state) });
}

export type GameModel = ReturnType<ReturnType<typeof createGame>['snapshot']>;

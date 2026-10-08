/** Единственное место для настройки стоимости и производительности зданий. */
export const BUILDINGS = Object.freeze({
  house: Object.freeze({
    name: 'Дом',
    cost: 100,
    desc: 'Место для 10 жителей',
    detail: 'Заселение с корабля',
    capacity: 10,
  }),
  farm: Object.freeze({
    name: 'Ферма',
    cost: 120,
    desc: '+20 еды в день',
    detail: 'Кормит 20 жителей',
    food: 20,
  }),
  shop: Object.freeze({
    name: 'Магазин',
    cost: 150,
    desc: '+40 монет в день',
    detail: 'Если все накормлены',
    income: 40,
  }),
  port: Object.freeze({
    name: 'Порт',
    cost: 0,
    desc: 'Встречает новых жителей',
    detail: 'У воды · бесплатно',
  }),
  road: Object.freeze({
    name: 'Дорога',
    cost: 0,
    desc: 'Деревянные улицы',
    detail: 'Для красоты · бесплатно',
  }),
  hall: Object.freeze({ name: 'Ратуша', cost: 0, income: 20 }),
});
export const BUILD_ORDER = Object.freeze(['port', 'house', 'farm', 'shop', 'road']);
export const ARRIVALS_PER_DAY = 10;
export const POPULATION_GOAL = 50;

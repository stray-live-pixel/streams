/** Контракт города: это данные и намерения, не классы графического движка. */
export type BuildingType = 'hall' | 'house' | 'farm' | 'shop' | 'road' | 'port';
export interface Tile {
  x: number;
  z: number;
}
export interface Building extends Tile {
  t: BuildingType;
  footprint?: Tile[];
  /** Retains valid pre-coordinate-save placements at the old island boundary. */
  legacy?: true;
}
export interface CityState {
  version: number;
  islandSeed: number;
  pop: number;
  money: number;
  food: number;
  day: number;
  step: number;
  won: boolean;
  endingSeen: boolean;
  completedDay?: number;
  buildings: Building[];
  resumeStep?: number;
  journal?: string;
}
/** Объединение не позволяет отправить build без координат или неизвестный тип здания. */
export type Command =
  | { type: 'select'; building: BuildingType | null }
  | { type: 'build'; x: number; z: number }
  | {
      type:
        'continue' | 'next-day' | 'reset' | 'arrival-finished' | 'light-beacon' | 'continue-city';
    };
export interface Arrival {
  type: 'arrival';
  count: number;
  port: Tile;
}
export type GameEvent = Arrival | { type: 'notice'; text: string } | { type: 'reset-view' };
export type CommandHandler = (command: Command) => void;

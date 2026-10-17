import type { Dir } from './geometry';

export type VehicleKind = 'player' | 'car' | 'motorcycle' | 'truck' | 'bus' | 'tow';

export const VEHICLE_LENGTH: Readonly<Record<VehicleKind, number>> = {
  player: 2,
  car: 2,
  motorcycle: 1,
  truck: 3,
  bus: 3,
  tow: 2,
};

export interface CellRef {
  floor: number;
  x: number;
  y: number;
}

/** A border cell plus the outward direction you leave the floor through. */
export interface EdgeRef extends CellRef {
  dir: Dir;
}

export interface FloorDef {
  width: number;
  height: number;
  /** Blocked cells (pillars, booths) as [x, y]. */
  walls?: [number, number][];
}

/**
 * A vehicle in a level file. (x, y) is the cell with the smallest x/y the vehicle covers.
 * `facing` is where its nose points; the axis of `facing` is the axis it slides on.
 */
export interface VehicleDef {
  id: string;
  kind: VehicleKind;
  floor: number;
  x: number;
  y: number;
  facing: Dir;
}

/**
 * A ramp joins two border cells on different floors. Sliding out of `a` in `a.dir`
 * enters `b` heading away from `b.dir`, and the reverse.
 */
export interface RampDef {
  a: EdgeRef;
  b: EdgeRef;
}

/** Level file format (JSON). */
export interface LevelDef {
  id: string;
  name?: string;
  floors: FloorDef[];
  /** The player wins when any of its cells covers this cell. Must be on floor 0. */
  exit: EdgeRef;
  ramps?: RampDef[];
  vehicles: VehicleDef[];
  /** Crane power-ups available (0 or more). */
  cranes?: number;
  /** Minimum moves, filled in by the solver/generator. */
  par?: number;
}

/** Dynamic position of one vehicle. */
export interface VehicleState {
  floor: number;
  x: number;
  y: number;
  facing: Dir;
}

/** Everything that changes during play. Vehicle order matches the level's vehicle list. */
export interface GameState {
  vehicles: VehicleState[];
  cranesLeft: number;
}

export interface SlideMove {
  type: 'slide';
  vehicle: string;
  dir: Dir;
  /** Cells travelled by the vehicle's front. */
  distance: number;
}

export interface CraneMove {
  type: 'crane';
  vehicle: string;
  floor: number;
  x: number;
  y: number;
}

export type Move = SlideMove | CraneMove;

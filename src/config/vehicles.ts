// Vehicle catalogue. All brands/models are FICTIONAL. Values are gameplay-tuned approximations
// of real vehicle classes (not data for any specific real vehicle).
import { rupees } from '../economy/money';

export type VehicleCategory = 'two_wheeler' | 'three_wheeler' | 'car' | 'commercial' | 'bus' | 'service';
export type BodyStyle =
  | 'scooter' | 'motorcycle' | 'sportbike' | 'auto' | 'hatchback' | 'sedan' | 'suv' | 'luxury'
  | 'sports' | 'taxi' | 'bus' | 'truck' | 'van' | 'pickup' | 'ambulance' | 'police';
export type EngineSound = 'scooter' | 'bike' | 'sportbike' | 'auto' | 'car' | 'car_big' | 'sports' | 'diesel' | 'electric';
export type HornType = 'bike' | 'car' | 'auto' | 'air';
export type PlateType = 'private' | 'commercial' | 'electric';

export interface VehicleSpec {
  id: string;
  name: string;
  brand: string;
  category: VehicleCategory;
  body: BodyStyle;
  length: number; width: number; height: number; wheelbase: number;
  wheelRadius: number;
  mass: number;
  topSpeedKmh: number;
  /** Peak longitudinal acceleration (m/s^2) at low speed. */
  accel: number;
  brake: number;
  steerMax: number; // radians
  grip: number; // lateral grip multiplier (1 = average car)
  fuel: 'petrol' | 'cng' | 'diesel' | 'electric';
  tankLitres: number;
  litresPer100km: number;
  price: number; // paise
  seats: number;
  engine: EngineSound;
  horn: HornType;
  plate: PlateType;
  colors: string[];
  /** Gear ratios used only to derive RPM for audio. */
  gears: number;
}

export const VEHICLES: Record<string, VehicleSpec> = {
  chetak_scooter: {
    id: 'chetak_scooter', name: 'Chetna 110 (old)', brand: 'Kesari', category: 'two_wheeler', body: 'scooter',
    length: 1.8, width: 0.7, height: 1.15, wheelbase: 1.27, wheelRadius: 0.27, mass: 210,
    topSpeedKmh: 78, accel: 3.0, brake: 6.5, steerMax: 0.62, grip: 0.95, fuel: 'petrol', tankLitres: 5.3,
    litresPer100km: 2.2, price: rupees(38000), seats: 2, engine: 'scooter', horn: 'bike', plate: 'private',
    colors: ['#b8c7cf', '#e8e2cf', '#9c2a2a', '#2f5d8a'], gears: 1,
  },
  kesari_raftaar: {
    id: 'kesari_raftaar', name: 'Raftaar 110', brand: 'Kesari', category: 'two_wheeler', body: 'motorcycle',
    length: 2.0, width: 0.75, height: 1.08, wheelbase: 1.26, wheelRadius: 0.32, mass: 230,
    topSpeedKmh: 92, accel: 3.4, brake: 7.0, steerMax: 0.6, grip: 1.0, fuel: 'petrol', tankLitres: 9.8,
    litresPer100km: 1.6, price: rupees(68000), seats: 2, engine: 'bike', horn: 'bike', plate: 'private',
    colors: ['#141414', '#7a1414', '#1d3f73', '#4a4a4a'], gears: 4,
  },
  tejas_r200: {
    id: 'tejas_r200', name: 'Tejas R200', brand: 'Tejas', category: 'two_wheeler', body: 'sportbike',
    length: 2.02, width: 0.8, height: 1.1, wheelbase: 1.36, wheelRadius: 0.32, mass: 250,
    topSpeedKmh: 135, accel: 5.4, brake: 8.5, steerMax: 0.55, grip: 1.15, fuel: 'petrol', tankLitres: 12,
    litresPer100km: 2.9, price: rupees(165000), seats: 2, engine: 'sportbike', horn: 'bike', plate: 'private',
    colors: ['#e05a12', '#0e0e0e', '#f2f2f2', '#1b5fd1'], gears: 6,
  },
  vayu_ezip: {
    id: 'vayu_ezip', name: 'E-Zip', brand: 'Vayu', category: 'two_wheeler', body: 'scooter',
    length: 1.85, width: 0.72, height: 1.15, wheelbase: 1.3, wheelRadius: 0.27, mass: 190,
    topSpeedKmh: 80, accel: 3.8, brake: 6.8, steerMax: 0.62, grip: 1.0, fuel: 'electric', tankLitres: 3.2,
    litresPer100km: 3.0, price: rupees(115000), seats: 2, engine: 'electric', horn: 'bike', plate: 'electric',
    colors: ['#f4f4f0', '#18b39b', '#e8c22c', '#232323'], gears: 1,
  },
  auto_rickshaw: {
    id: 'auto_rickshaw', name: 'Tri-Star CNG', brand: 'Sahyadri', category: 'three_wheeler', body: 'auto',
    length: 2.65, width: 1.3, height: 1.75, wheelbase: 2.0, wheelRadius: 0.24, mass: 650,
    topSpeedKmh: 55, accel: 1.9, brake: 5.0, steerMax: 0.55, grip: 0.8, fuel: 'cng', tankLitres: 8,
    litresPer100km: 3.5, price: rupees(285000), seats: 3, engine: 'auto', horn: 'auto', plate: 'commercial',
    colors: ['#151515'], gears: 4,
  },
  rajhans_pixie: {
    id: 'rajhans_pixie', name: 'Pixie LXi', brand: 'Rajhans', category: 'car', body: 'hatchback',
    length: 3.65, width: 1.62, height: 1.52, wheelbase: 2.38, wheelRadius: 0.29, mass: 880,
    topSpeedKmh: 145, accel: 2.9, brake: 8.0, steerMax: 0.6, grip: 1.0, fuel: 'petrol', tankLitres: 32,
    litresPer100km: 5.2, price: rupees(485000), seats: 5, engine: 'car', horn: 'car', plate: 'private',
    colors: ['#d8d8d4', '#b51e1e', '#20406e', '#7d7f80', '#1c1c1c', '#e3dccb'], gears: 5,
  },
  rajhans_avanti: {
    id: 'rajhans_avanti', name: 'Avanti VX', brand: 'Rajhans', category: 'car', body: 'sedan',
    length: 4.4, width: 1.73, height: 1.48, wheelbase: 2.6, wheelRadius: 0.31, mass: 1150,
    topSpeedKmh: 175, accel: 3.4, brake: 8.5, steerMax: 0.58, grip: 1.05, fuel: 'petrol', tankLitres: 42,
    litresPer100km: 6.1, price: rupees(1050000), seats: 5, engine: 'car', horn: 'car', plate: 'private',
    colors: ['#f0f0ee', '#3b3f44', '#5a1a1a', '#16365e', '#a8a9a6'], gears: 6,
  },
  gajraj_x7: {
    id: 'gajraj_x7', name: 'Gajraj X7', brand: 'Gajraj', category: 'car', body: 'suv',
    length: 4.6, width: 1.86, height: 1.82, wheelbase: 2.75, wheelRadius: 0.36, mass: 1750,
    topSpeedKmh: 170, accel: 3.3, brake: 8.0, steerMax: 0.55, grip: 0.98, fuel: 'diesel', tankLitres: 57,
    litresPer100km: 8.0, price: rupees(1650000), seats: 7, engine: 'car_big', horn: 'car', plate: 'private',
    colors: ['#ffffff', '#111111', '#7b6a4f', '#6b0f0f', '#33475b'], gears: 6,
  },
  aurum_sline: {
    id: 'aurum_sline', name: 'S-Line 450', brand: 'Aurum', category: 'car', body: 'luxury',
    length: 5.0, width: 1.9, height: 1.47, wheelbase: 2.95, wheelRadius: 0.34, mass: 1900,
    topSpeedKmh: 240, accel: 5.0, brake: 9.5, steerMax: 0.55, grip: 1.15, fuel: 'petrol', tankLitres: 66,
    litresPer100km: 9.5, price: rupees(7800000), seats: 5, engine: 'car_big', horn: 'car', plate: 'private',
    colors: ['#0b0b0d', '#e9e9ea', '#22303f', '#6e6f72'], gears: 8,
  },
  vega_gt: {
    id: 'vega_gt', name: 'Vega GT', brand: 'Vega', category: 'car', body: 'sports',
    length: 4.45, width: 1.95, height: 1.24, wheelbase: 2.62, wheelRadius: 0.34, mass: 1500,
    topSpeedKmh: 290, accel: 7.5, brake: 11, steerMax: 0.52, grip: 1.35, fuel: 'petrol', tankLitres: 64,
    litresPer100km: 13, price: rupees(32000000), seats: 2, engine: 'sports', horn: 'car', plate: 'private',
    colors: ['#c8102e', '#f3c300', '#0d0d0d', '#e8e8e8', '#0a4fa3'], gears: 7,
  },
  padma_taxi: {
    id: 'padma_taxi', name: 'Padma Taxi', brand: 'Pratap', category: 'car', body: 'taxi',
    length: 4.1, width: 1.6, height: 1.5, wheelbase: 2.45, wheelRadius: 0.3, mass: 1000,
    topSpeedKmh: 120, accel: 2.4, brake: 7.0, steerMax: 0.58, grip: 0.92, fuel: 'cng', tankLitres: 40,
    litresPer100km: 7.0, price: rupees(520000), seats: 4, engine: 'car', horn: 'car', plate: 'commercial',
    colors: ['#111111'], gears: 4,
  },
  mbt_bus: {
    id: 'mbt_bus', name: 'MBT City Bus', brand: 'Dhruv', category: 'bus', body: 'bus',
    length: 11.2, width: 2.55, height: 3.2, wheelbase: 5.9, wheelRadius: 0.5, mass: 11000,
    topSpeedKmh: 70, accel: 1.2, brake: 5.0, steerMax: 0.6, grip: 0.9, fuel: 'diesel', tankLitres: 200,
    litresPer100km: 30, price: rupees(4500000), seats: 42, engine: 'diesel', horn: 'air', plate: 'commercial',
    colors: ['#b3201b'], gears: 5,
  },
  dhruv_truck: {
    id: 'dhruv_truck', name: 'Dhruv 1109', brand: 'Dhruv', category: 'commercial', body: 'truck',
    length: 7.2, width: 2.3, height: 3.0, wheelbase: 4.2, wheelRadius: 0.48, mass: 7000,
    topSpeedKmh: 80, accel: 1.3, brake: 5.0, steerMax: 0.6, grip: 0.9, fuel: 'diesel', tankLitres: 160,
    litresPer100km: 20, price: rupees(2100000), seats: 2, engine: 'diesel', horn: 'air', plate: 'commercial',
    colors: ['#f2b51b', '#2a6fb5', '#c2421b', '#2f8b3a'], gears: 5,
  },
  vayu_van: {
    id: 'vayu_van', name: 'Cargo Van', brand: 'Vayu', category: 'commercial', body: 'van',
    length: 4.3, width: 1.7, height: 1.95, wheelbase: 2.6, wheelRadius: 0.3, mass: 1400,
    topSpeedKmh: 115, accel: 2.3, brake: 7.0, steerMax: 0.58, grip: 0.92, fuel: 'cng', tankLitres: 45,
    litresPer100km: 8, price: rupees(620000), seats: 2, engine: 'car', horn: 'car', plate: 'commercial',
    colors: ['#f4f4f2', '#d8d4c8', '#3c6e9e'], gears: 5,
  },
  gajraj_pickup: {
    id: 'gajraj_pickup', name: 'Gajraj Pickup', brand: 'Gajraj', category: 'commercial', body: 'pickup',
    length: 4.9, width: 1.8, height: 1.85, wheelbase: 3.0, wheelRadius: 0.36, mass: 1800,
    topSpeedKmh: 120, accel: 2.4, brake: 7.0, steerMax: 0.55, grip: 0.95, fuel: 'diesel', tankLitres: 60,
    litresPer100km: 9, price: rupees(850000), seats: 2, engine: 'car_big', horn: 'car', plate: 'commercial',
    colors: ['#ffffff', '#2d2d2d', '#8a1f1f'], gears: 5,
  },
  ambulance: {
    id: 'ambulance', name: 'Ambulance 108', brand: 'Vayu', category: 'service', body: 'ambulance',
    length: 4.9, width: 1.85, height: 2.3, wheelbase: 3.0, wheelRadius: 0.33, mass: 2200,
    topSpeedKmh: 120, accel: 2.4, brake: 7.0, steerMax: 0.55, grip: 0.95, fuel: 'diesel', tankLitres: 60,
    litresPer100km: 10, price: rupees(1800000), seats: 4, engine: 'car_big', horn: 'air', plate: 'commercial',
    colors: ['#f6f6f4'], gears: 5,
  },
  police_jeep: {
    id: 'police_jeep', name: 'Police Patrol', brand: 'Gajraj', category: 'service', body: 'police',
    length: 4.4, width: 1.8, height: 1.9, wheelbase: 2.7, wheelRadius: 0.35, mass: 1800,
    topSpeedKmh: 140, accel: 2.8, brake: 8.0, steerMax: 0.55, grip: 0.95, fuel: 'diesel', tankLitres: 55,
    litresPer100km: 9, price: rupees(1500000), seats: 5, engine: 'car_big', horn: 'car', plate: 'commercial',
    colors: ['#e9e9e6'], gears: 5,
  },
};

/** Vehicles sold at the in-game showroom / used-vehicle dealer. */
export const SHOWROOM_STOCK = ['kesari_raftaar', 'vayu_ezip', 'tejas_r200', 'rajhans_pixie', 'rajhans_avanti', 'gajraj_x7', 'aurum_sline', 'vega_gt'];

/** Traffic mix weights (Indian metro: two-wheelers dominate). */
export const TRAFFIC_MIX: [string, number][] = [
  ['kesari_raftaar', 22], ['chetak_scooter', 14], ['vayu_ezip', 5], ['tejas_r200', 3],
  ['auto_rickshaw', 18], ['rajhans_pixie', 12], ['rajhans_avanti', 7], ['gajraj_x7', 5],
  ['padma_taxi', 6], ['vayu_van', 3], ['gajraj_pickup', 2], ['dhruv_truck', 2], ['aurum_sline', 1],
];

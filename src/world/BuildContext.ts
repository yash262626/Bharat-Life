// Shared state passed to all world-building modules.
import * as THREE from 'three';
import { GeoBatch } from './geom';
import { MaterialLib } from './materials';
import { CollisionWorld } from './Collision';
import { Rng } from '../core/math';
import { Rect, rectsOverlap } from './layout';

export interface LightSpot { x: number; y: number; z: number; kind: 'street' | 'shop' | 'tube' | 'flood' }
export interface Interactable {
  id: string;
  kind: 'shop' | 'atm' | 'door' | 'bed' | 'desk' | 'wardrobe' | 'garage' | 'npc' | 'ticket' | 'gate' | 'pump' | 'bench' | 'hospital' | 'showroom' | 'realestate' | 'interior_exit' | 'train_door';
  x: number; y: number; z: number;
  radius: number;
  label: string;
  data?: Record<string, unknown>;
}

export class BuildContext {
  batch = new GeoBatch(140);
  reserved: Rect[] = [];
  lights: LightSpot[] = [];
  interactables: Interactable[] = [];
  /** Named anchor points (spawn points, mission targets). */
  anchors = new Map<string, { x: number; y: number; z: number; heading?: number }>();
  /** Dynamic objects (animated) that must live outside merged batches. */
  dynamic = new THREE.Group();
  /** Footpath parking slots for parked two-wheelers etc. */
  parking: { x: number; z: number; heading: number }[] = [];
  /** Standing spots for stationary NPCs: vendors, guards, shopkeepers. */
  npcSpots: { x: number; y: number; z: number; heading: number; role: string; name?: string; shopId?: string }[] = [];
  /** Parked vehicles (rendered by the VehicleInstancer). lean = side-stand roll for two-wheelers. */
  parkedVehicles: { type: string; color: string; x: number; y: number; z: number; heading: number; lean: number }[] = [];
  /** Benches where pedestrians / player can sit. */
  benches: { x: number; y: number; z: number; heading: number }[] = [];

  constructor(public mats: MaterialLib, public col: CollisionWorld, public rng: Rng) {}

  isReserved(r: Rect, pad = 0) {
    return this.reserved.some((q) => rectsOverlap(q, r, pad));
  }
  reserve(r: Rect) { this.reserved.push(r); }
}

export const C = (hex: string | number) => new THREE.Color(hex);

// Third-person orbit camera with collision avoidance, chase camera for vehicles and a first-person
// driving view. Smoothly blends between targets.
import * as THREE from 'three';
import { Input } from '../core/Input';
import { CollisionWorld } from '../world/Collision';
import { clamp, damp, dampAngle } from '../core/math';

export type CamMode = 'onfoot' | 'vehicle' | 'firstperson' | 'train' | 'free';

export class CameraRig {
  yaw = Math.PI; // camera looks towards this yaw (0 = +z)
  pitch = 0.18;
  distance = 4.2;
  mode: CamMode = 'onfoot';
  sensitivity = 1;
  invertY = false;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private dist = 4.2;
  private initialised = false;
  private autoTimer = 0;

  constructor(public camera: THREE.PerspectiveCamera, private col: CollisionWorld) {}

  setMode(m: CamMode) {
    this.mode = m;
    this.distance = m === 'vehicle' ? 6.5 : m === 'train' ? 3.0 : 4.2;
  }

  /**
   * target: focus point (player chest / vehicle centre); heading: target yaw used for auto-follow;
   * speed: target speed (auto-align behind vehicles); size: vehicle length for chase distance.
   */
  update(dt: number, input: Input, target: THREE.Vector3, heading: number, speed: number, size = 1) {
    const sens = 0.0024 * this.sensitivity;
    const mdx = input.mouseDX, mdy = input.mouseDY;
    if (mdx || mdy) this.autoTimer = 1.5;
    this.yaw -= mdx * sens;
    this.pitch = clamp(this.pitch + mdy * sens * (this.invertY ? -1 : 1), -0.6, 1.2);
    if (input.wheel) this.distance = clamp(this.distance + input.wheel * 0.6, 2.2, this.mode === 'vehicle' ? 16 : 9);
    this.autoTimer -= dt;

    if (this.mode === 'firstperson') {
      // driver's eye: look ahead along the vehicle heading; mouse can look around
      if (this.autoTimer <= 0) this.yaw = dampAngle(this.yaw, heading, 4, dt);
      this.camera.position.copy(target);
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch * 0.5), -Math.sin(this.pitch * 0.5) - 0.05, Math.cos(this.yaw) * Math.cos(this.pitch * 0.5));
      this.camera.lookAt(target.clone().add(dir));
      this.camera.fov = damp(this.camera.fov, 70, 4, dt);
      this.camera.updateProjectionMatrix();
      this.initialised = false;
      return;
    }

    if (this.mode === 'vehicle' && this.autoTimer <= 0 && Math.abs(speed) > 2) {
      // swing behind the vehicle when moving (reverse: look forward)
      this.yaw = dampAngle(this.yaw, speed >= 0 ? heading : heading + Math.PI * 0, 2.5, dt);
      this.pitch = damp(this.pitch, 0.22, 2, dt);
    }
    const want = this.mode === 'vehicle' ? Math.max(this.distance, size * 1.25 + 2.5) : this.distance;
    // camera sits behind the look direction
    const back = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const pivot = target.clone();
    if (this.mode === 'onfoot') {
      // over-the-shoulder offset to the right
      pivot.x += -Math.cos(this.yaw) * 0.45;
      pivot.z += Math.sin(this.yaw) * 0.45;
    }
    // collision: pull the camera in if geometry is between pivot and camera
    const hit = this.col.raycast(pivot.x, pivot.y, pivot.z, back.x, back.y, back.z, want + 0.3);
    const d = Math.min(want, hit - 0.35);
    this.dist = d < this.dist ? d : damp(this.dist, d, 3, dt);
    const camPos = pivot.clone().addScaledVector(back, Math.max(0.6, this.dist));
    const ground = this.col.groundHeight(camPos.x, camPos.z, camPos.y) + 0.25;
    if (camPos.y < ground) camPos.y = ground;
    if (!this.initialised) { this.pos.copy(camPos); this.look.copy(pivot); this.initialised = true; }
    const lam = this.mode === 'vehicle' ? 10 : 18;
    this.pos.lerp(camPos, 1 - Math.exp(-lam * dt));
    this.look.lerp(pivot, 1 - Math.exp(-lam * 1.4 * dt));
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    const fovTarget = this.mode === 'vehicle' ? 60 + clamp(Math.abs(speed) * 0.35, 0, 14) : 58;
    this.camera.fov = damp(this.camera.fov, fovTarget, 3, dt);
    this.camera.updateProjectionMatrix();
  }

  /** Snap behind a heading (after teleport / entering vehicle). */
  snapBehind(heading: number) {
    this.yaw = heading;
    this.initialised = false;
  }
}

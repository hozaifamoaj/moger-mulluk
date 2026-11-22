// M9 / §11: stylised top-down sprites, generated procedurally at boot time
// instead of loaded from image files (see docs/progress.md's M9 entry for
// why — no image-generation tool is available in this environment, and
// generating textures in code avoids adding any licensed/CC0 binary assets
// to a now-public repo). Every texture is sized exactly from VEHICLES /
// TRAFFIC / PEDESTRIAN in src/sim/config.ts (rule 13: sizes don't change).
//
// Orientation: heading 0 moves toward -y (src/sim/vehicle.ts), and Phaser
// draws a sprite's texture unrotated at rotation 0 with its top edge toward
// -y. So every vehicle texture below is drawn "front" (headlights/nose) at
// y=0, matching the rectangle convention it replaces.
import Phaser from 'phaser';
import { PEDESTRIAN, TRAFFIC, VEHICLES } from '../sim/config';
import type { PlayableVehicleId, TrafficVehicleType } from '../sim/types';

export const PLAYER_TEXTURE: Record<PlayableVehicleId, string> = {
  car: 'sprite-player-car',
  motorcycle: 'sprite-player-motorcycle',
};

export const TRAFFIC_TEXTURE: Record<TrafficVehicleType, string> = {
  car: 'sprite-traffic-car',
  bus: 'sprite-traffic-bus',
  rickshaw: 'sprite-traffic-rickshaw',
  cng: 'sprite-traffic-cng',
  motorcycle: 'sprite-traffic-motorcycle',
  parked: 'sprite-traffic-parked',
};

export const PEDESTRIAN_TEXTURE = {
  waiting: 'sprite-ped-waiting',
  walking: 'sprite-ped-walking',
  overbridge: 'sprite-ped-overbridge',
} as const;

interface CarPalette {
  body: number;
  glass: number;
  light: number;
}

const PLAYER_CAR_PALETTE: CarPalette = { body: 0xe6e6e6, glass: 0x33475c, light: 0xfff2a8 };
const TRAFFIC_CAR_PALETTE: CarPalette = { body: 0x5588ff, glass: 0x1f2c3d, light: 0xfff2a8 };
const PARKED_PALETTE: CarPalette = { body: 0x7a7a7a, glass: 0x4a4a4a, light: 0x7a7a7a };

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function drawCar(g: Phaser.GameObjects.Graphics, key: string, w: number, l: number, palette: CarPalette, lightsOn: boolean): void {
  g.clear();
  g.fillStyle(palette.body, 1);
  g.fillRoundedRect(0, 0, w, l, Math.min(w, l) * 0.18);
  g.fillStyle(palette.glass, 1);
  g.fillRoundedRect(w * 0.15, l * 0.12, w * 0.7, l * 0.18, 2); // windshield (front)
  g.fillRoundedRect(w * 0.15, l * 0.78, w * 0.7, l * 0.12, 2); // rear glass
  if (lightsOn) {
    g.fillStyle(palette.light, 1);
    g.fillCircle(w * 0.2, l * 0.05, w * 0.1);
    g.fillCircle(w * 0.8, l * 0.05, w * 0.1);
  }
  g.generateTexture(key, w, l);
}

interface MotoPalette {
  body: number;
  light: number;
  seat: number;
}

const PLAYER_MOTO_PALETTE: MotoPalette = { body: 0xe6e6e6, light: 0xfff2a8, seat: 0x2a2a2a };
const TRAFFIC_MOTO_PALETTE: MotoPalette = { body: 0xff5577, light: 0xfff2a8, seat: 0x2a2a2a };

function drawMotorcycle(g: Phaser.GameObjects.Graphics, key: string, w: number, l: number, palette: MotoPalette): void {
  g.clear();
  g.fillStyle(palette.body, 1);
  g.fillRoundedRect(w * 0.2, l * 0.08, w * 0.6, l * 0.84, w * 0.2);
  g.fillStyle(palette.seat, 1);
  g.fillRect(w * 0.3, l * 0.55, w * 0.4, l * 0.3);
  g.fillStyle(palette.light, 1);
  g.fillCircle(w * 0.5, l * 0.1, w * 0.3);
  g.generateTexture(key, w, l);
}

function drawBus(g: Phaser.GameObjects.Graphics, key: string, w: number, l: number): void {
  g.clear();
  g.fillStyle(0xffaa33, 1);
  g.fillRoundedRect(0, 0, w, l, Math.min(w, l) * 0.12);
  g.fillStyle(0xcc3333, 1); // painted stripe, common on Dhaka buses
  g.fillRect(0, l * 0.44, w, l * 0.07);
  g.fillStyle(0x224477, 1);
  g.fillRoundedRect(w * 0.18, l * 0.03, w * 0.64, l * 0.08, 2); // windshield
  const windowCount = 6;
  const span = l * 0.32;
  const start = l * 0.56;
  for (let i = 0; i < windowCount; i++) {
    const y = start + (span / windowCount) * i;
    g.fillRoundedRect(w * 0.1, y, w * 0.16, l * (span / windowCount) * 0.6, 1);
    g.fillRoundedRect(w * 0.74, y, w * 0.16, l * (span / windowCount) * 0.6, 1);
  }
  g.generateTexture(key, w, l);
}

function drawRickshaw(g: Phaser.GameObjects.Graphics, key: string, w: number, l: number): void {
  g.clear();
  g.fillStyle(0x111111, 1); // wheels peeking from under the canopy
  g.fillCircle(w * 0.08, l * 0.62, w * 0.14);
  g.fillCircle(w * 0.92, l * 0.62, w * 0.14);
  g.fillStyle(0x33cc88, 1); // painted canopy over the passenger seat (rear)
  g.fillEllipse(w / 2, l * 0.62, w * 0.98, l * 0.58);
  g.fillStyle(0x225533, 1); // driver's seat/frame (front)
  g.fillRoundedRect(w * 0.3, l * 0.04, w * 0.4, l * 0.3, 3);
  g.generateTexture(key, w, l);
}

function drawCng(g: Phaser.GameObjects.Graphics, key: string, w: number, l: number): void {
  g.clear();
  g.fillStyle(0x1f9e52, 1); // green three-wheeler body
  g.fillRoundedRect(w * 0.04, l * 0.16, w * 0.92, l * 0.8, Math.min(w, l) * 0.12);
  g.fillTriangle(w * 0.18, l * 0.16, w * 0.82, l * 0.16, w * 0.5, 0); // tapered nose
  g.fillStyle(0x111111, 1); // black roof patch
  g.fillRoundedRect(w * 0.14, l * 0.22, w * 0.72, l * 0.34, 2);
  g.generateTexture(key, w, l);
}

function drawPedestrian(g: Phaser.GameObjects.Graphics, key: string, color: number): void {
  g.clear();
  const r = PEDESTRIAN.radius;
  g.fillStyle(darken(color, 0.65), 1); // shoulders (top-down shadow ring)
  g.fillCircle(r, r, r);
  g.fillStyle(color, 1); // head
  g.fillCircle(r, r, r * 0.6);
  g.generateTexture(key, r * 2, r * 2);
}

/**
 * Generates every texture used by GameScene into Phaser's shared
 * TextureManager. Runs once at Boot, before Menu/Game use any of these
 * keys — cheap one-time work, not inside the game loop (rule 10).
 */
export function buildSprites(scene: Phaser.Scene): void {
  const g = scene.make.graphics({});

  drawCar(g, PLAYER_TEXTURE.car, VEHICLES.car.width, VEHICLES.car.length, PLAYER_CAR_PALETTE, true);
  drawMotorcycle(g, PLAYER_TEXTURE.motorcycle, VEHICLES.motorcycle.width, VEHICLES.motorcycle.length, PLAYER_MOTO_PALETTE);

  drawCar(g, TRAFFIC_TEXTURE.car, TRAFFIC.car.width, TRAFFIC.car.length, TRAFFIC_CAR_PALETTE, true);
  drawCar(g, TRAFFIC_TEXTURE.parked, TRAFFIC.parked.width, TRAFFIC.parked.length, PARKED_PALETTE, false);
  drawMotorcycle(g, TRAFFIC_TEXTURE.motorcycle, TRAFFIC.motorcycle.width, TRAFFIC.motorcycle.length, TRAFFIC_MOTO_PALETTE);
  drawBus(g, TRAFFIC_TEXTURE.bus, TRAFFIC.bus.width, TRAFFIC.bus.length);
  drawRickshaw(g, TRAFFIC_TEXTURE.rickshaw, TRAFFIC.rickshaw.width, TRAFFIC.rickshaw.length);
  drawCng(g, TRAFFIC_TEXTURE.cng, TRAFFIC.cng.width, TRAFFIC.cng.length);

  drawPedestrian(g, PEDESTRIAN_TEXTURE.waiting, 0xffcc00);
  drawPedestrian(g, PEDESTRIAN_TEXTURE.walking, 0xff9966);
  drawPedestrian(g, PEDESTRIAN_TEXTURE.overbridge, 0xaaaaaa);

  g.destroy();
}

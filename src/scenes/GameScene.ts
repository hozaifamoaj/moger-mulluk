import Phaser from 'phaser';
import { DISPLAY, ROAD, SIM, VEHICLES, VEHICLE_COLLISION, PEDESTRIAN, HORN } from '../sim/config';
import { computeRoadEdges } from '../sim/road';
import { Sim } from '../sim/sim';
import { RouteMap, validateSegments } from '../sim/map';
import { KeyboardInput } from '../ui/KeyboardInput';
import type { SimEvent, TrafficVehicleType } from '../sim/types';

const MAP_URL = 'assets/maps/m4-demo.json';

// Greybox placeholder colors (rule 13: replaced by sprites in M9). Sizes and
// positions come from src/sim/config.ts, not from these.
const COLORS = {
  footpath: 0x3a3f33,
  carriageway: 0x24262b,
  divider: 0x7a6a2a,
  laneMarking: 0xdddddd,
  car: 0xe0e0e0,
  trafficCar: 0x5588ff,
  trafficBus: 0xffaa33,
  trafficRickshaw: 0x33cc88,
  trafficCng: 0x33cccc,
  trafficMotorcycle: 0xff5577,
  trafficParked: 0x888888,
  healthBarBg: 0x222222,
  healthBarFill: 0x55cc55,
  healthBarFillLow: 0xcc5555,
  nearMissText: '#ffee66',
  fineText: '#ff6666',
  pedestrianHitText: '#ff3333',
  hornText: '#66ccff',
  pedestrianWaiting: 0xffcc00,
  pedestrianWalking: 0xff9966,
  pedestrianOverbridge: 0xaaaaaa,
  overbridgeBand: 0x3a3a3a,
  hornBarBg: 0x222222,
  hornBarReady: 0x66ccff,
  hornBarCharging: 0x555555,
} as const;
const LANE_MARKING = { dash: 40, gap: 40, width: 3 } as const;
const CAMERA_PLAYER_SCREEN_FRACTION = 0.7; // §build-plan M2: car sits at ~70% of screen height
const HEALTH_BAR = { x: 8, y: 90, width: 150, height: 14 } as const;
const HORN_BAR = { x: 8, y: HEALTH_BAR.y + HEALTH_BAR.height + 6, width: 150, height: 10 } as const;
const BLINK_INTERVAL_MS = 100; // §8.1: player sprite blinks while invulnerable
// §6: overbridge is a cosmetic-only structure (never collidable, §6/§8) drawn
// as a translucent band spanning the full road width at the crossing's y.
const OVERBRIDGE_VISUAL = { thickness: 24, alpha: 0.5, depth: 50 } as const;

// §3.2 Controls: on-screen reminder of the keyboard bindings. Touch buttons
// (gas/brake/steer/horn, bottom corners per spec) replace this in M7; until
// then nothing else on screen shows the player which key does what.
const CONTROLS_HINT_TEXT = 'W/↑ Gas   S/↓ Brake   A/D or ←/→ Steer   Space Horn';

export class GameScene extends Phaser.Scene {
  private sim!: Sim;
  private map!: RouteMap;
  private input_!: KeyboardInput;
  private car!: Phaser.GameObjects.Rectangle;
  private trafficRects!: Phaser.GameObjects.Rectangle[];
  private pedestrianCircles!: Phaser.GameObjects.Arc[];
  private healthBarFill!: Phaser.GameObjects.Rectangle;
  private hornBarFill!: Phaser.GameObjects.Rectangle;
  private debugText!: Phaser.GameObjects.Text;
  private debugVisible = true;
  private accumulatorMs = 0;

  constructor() {
    super('Game');
  }

  preload(): void {
    this.load.json('map', MAP_URL);
  }

  create(): void {
    this.map = this.loadMap();

    const seed = Date.now();
    this.sim = new Sim(seed, this.map);
    this.input_ = new KeyboardInput(this);

    this.drawRoad();
    this.drawOverbridges();

    this.trafficRects = this.sim.state.traffic.map(() =>
      this.add.rectangle(0, 0, 1, 1, COLORS.trafficCar).setOrigin(0.5).setVisible(false),
    );

    this.pedestrianCircles = this.sim.state.pedestrians.map(() =>
      this.add.circle(0, 0, PEDESTRIAN.radius, COLORS.pedestrianWaiting).setVisible(false),
    );

    this.car = this.add
      .rectangle(this.sim.state.player.x, this.sim.state.player.y, VEHICLES.car.width, VEHICLES.car.length, COLORS.car)
      .setOrigin(0.5);

    this.add
      .rectangle(HEALTH_BAR.x, HEALTH_BAR.y, HEALTH_BAR.width, HEALTH_BAR.height, COLORS.healthBarBg)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.healthBarFill = this.add
      .rectangle(HEALTH_BAR.x, HEALTH_BAR.y, HEALTH_BAR.width, HEALTH_BAR.height, COLORS.healthBarFill)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    this.add
      .rectangle(HORN_BAR.x, HORN_BAR.y, HORN_BAR.width, HORN_BAR.height, COLORS.hornBarBg)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.hornBarFill = this.add
      .rectangle(HORN_BAR.x, HORN_BAR.y, HORN_BAR.width, HORN_BAR.height, COLORS.hornBarReady)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    this.debugText = this.add
      .text(8, 8, '', { fontSize: '16px', color: '#ffffff', backgroundColor: '#000000a0', padding: { x: 6, y: 4 } })
      .setScrollFactor(0)
      .setDepth(1000);

    this.add
      .text(DISPLAY.width / 2, DISPLAY.height - 8, CONTROLS_HINT_TEXT, {
        fontSize: '15px',
        color: '#ffffffcc',
        backgroundColor: '#000000a0',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    this.input.keyboard?.addKey('F1').on('down', () => {
      this.debugVisible = !this.debugVisible;
      this.debugText.setVisible(this.debugVisible);
    });

    this.applyCamera();
  }

  update(_time: number, deltaMs: number): void {
    this.accumulatorMs += Math.min(deltaMs, SIM.maxFrameDeltaMs);
    const stepMs = SIM.stepSeconds * 1000;

    const events: SimEvent[] = [];
    while (this.accumulatorMs >= stepMs) {
      events.push(...this.sim.step(SIM.stepSeconds, this.input_.read()));
      this.accumulatorMs -= stepMs;
    }

    this.handleEvents(events);
    this.render();
  }

  private handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'nearMiss') this.showFloatingText('Near miss!', COLORS.nearMissText);
      if (event.type === 'fine') this.showFloatingText('Fine!', COLORS.fineText);
      // §8: the actual fail-state halt (timer stop, Results screen) is M6's
      // job; this scene only acknowledges the hit happened.
      if (event.type === 'pedestrianHit') this.showFloatingText('Pedestrian hit!', COLORS.pedestrianHitText);
      if (event.type === 'hornUsed') this.showFloatingText('Honk!', COLORS.hornText);
    }
  }

  // §8 / §9: floating acknowledgement text for a near miss or fine, tweened up and out.
  private showFloatingText(message: string, color: string): void {
    const { player } = this.sim.state;
    const text = this.add
      .text(player.x, player.y - VEHICLES.car.length, message, { fontSize: '18px', color })
      .setOrigin(0.5)
      .setDepth(900);

    this.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 800,
      onComplete: () => text.destroy(),
    });
  }

  private render(): void {
    const { player } = this.sim.state;
    this.car.setPosition(player.x, player.y);
    this.car.setRotation(player.heading);
    this.car.setAlpha(this.blinkAlpha());

    this.renderTraffic();
    this.renderPedestrians();
    this.renderHealthBar();
    this.renderHornBar();
    this.applyCamera();

    if (this.debugVisible) {
      this.debugText.setText(
        [
          `speed: ${player.speed.toFixed(0)} px/s`,
          `fps: ${this.game.loop.actualFps.toFixed(0)}`,
          `seed: ${this.sim.seed}`,
          `step: ${this.sim.state.stepCount}`,
        ].join('\n'),
      );
    }
  }

  // §8.1: player sprite blinks on/off every BLINK_INTERVAL_MS while invulnerable.
  private blinkAlpha(): number {
    if (this.sim.state.invulnerability <= 0) return 1;
    return Math.floor(this.time.now / BLINK_INTERVAL_MS) % 2 === 0 ? 1 : 0.3;
  }

  private renderTraffic(): void {
    const traffic = this.sim.state.traffic;
    for (let i = 0; i < traffic.length; i++) {
      const vehicle = traffic[i];
      const rect = this.trafficRects[i];
      rect.setVisible(vehicle.active);
      if (!vehicle.active) continue;

      rect.setPosition(vehicle.x, vehicle.y);
      rect.setSize(vehicle.width, vehicle.length);
      rect.setFillStyle(this.trafficColor(vehicle.type));
    }
  }

  // §6: waiting-passenger, footpath-waiting/walking, and overbridge
  // pedestrians each get a distinct color so their state reads at a glance;
  // overbridge users are also drawn above everything else (depth), since
  // they're physically elevated and never a collision target.
  private renderPedestrians(): void {
    const pedestrians = this.sim.state.pedestrians;
    for (let i = 0; i < pedestrians.length; i++) {
      const ped = pedestrians[i];
      const circle = this.pedestrianCircles[i];
      circle.setVisible(ped.active);
      if (!ped.active) continue;

      circle.setPosition(ped.x, ped.y);
      if (ped.usesOverbridge) {
        circle.setFillStyle(COLORS.pedestrianOverbridge);
        circle.setDepth(OVERBRIDGE_VISUAL.depth + 1);
      } else {
        circle.setFillStyle(ped.phase === 'waiting' ? COLORS.pedestrianWaiting : COLORS.pedestrianWalking);
        circle.setDepth(0);
      }
    }
  }

  // §3.3: fills as the horn recharges, so the player can see at a glance
  // whether honking again is available.
  private renderHornBar(): void {
    const fraction = 1 - this.sim.state.hornCooldown / HORN.cooldownSeconds;
    const ready = this.sim.state.hornCooldown <= 0;
    this.hornBarFill.setSize(HORN_BAR.width * Math.max(0, Math.min(1, fraction)), HORN_BAR.height);
    this.hornBarFill.setFillStyle(ready ? COLORS.hornBarReady : COLORS.hornBarCharging);
  }

  private trafficColor(type: TrafficVehicleType): number {
    switch (type) {
      case 'bus':
        return COLORS.trafficBus;
      case 'rickshaw':
        return COLORS.trafficRickshaw;
      case 'cng':
        return COLORS.trafficCng;
      case 'motorcycle':
        return COLORS.trafficMotorcycle;
      case 'parked':
        return COLORS.trafficParked;
      default:
        return COLORS.trafficCar;
    }
  }

  private renderHealthBar(): void {
    const fraction = Math.max(0, this.sim.state.player.health / VEHICLES.car.health);
    this.healthBarFill.setSize(HEALTH_BAR.width * fraction, HEALTH_BAR.height);
    this.healthBarFill.setFillStyle(
      fraction < VEHICLE_COLLISION.lowHealthThreshold ? COLORS.healthBarFillLow : COLORS.healthBarFill,
    );
  }

  private applyCamera(): void {
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = this.sim.state.player.y - DISPLAY.height * CAMERA_PLAYER_SCREEN_FRACTION;
  }

  // §7.2/§7.3: each segment draws at its own lane width (e.g. the 3-to-2-lane
  // merge), using RouteMap.segmentRanges rather than the flat ROAD.length
  // prototype cross-section.
  private drawRoad(): void {
    const graphics = this.add.graphics();

    for (const { topY, bottomY, segment } of this.map.segmentRanges) {
      const edges = computeRoadEdges(segment.lanes);
      const height = topY - bottomY;

      const band = (left: number, right: number, color: number) => {
        graphics.fillStyle(color, 1);
        graphics.fillRect(left, bottomY, right - left, height);
      };

      band(edges.roadLeftX, edges.footpathPlayerRightX, COLORS.footpath);
      band(edges.footpathPlayerRightX, edges.dividerLeftX, COLORS.carriageway);
      band(edges.dividerLeftX, edges.dividerRightX, COLORS.divider);
      band(edges.dividerRightX, edges.footpathOppositeLeftX, COLORS.carriageway);
      band(edges.footpathOppositeLeftX, edges.roadRightX, COLORS.footpath);

      graphics.fillStyle(COLORS.laneMarking, 1);
      for (let lane = 1; lane < segment.lanes; lane++) {
        const x = edges.footpathPlayerRightX + ROAD.laneWidth * lane - LANE_MARKING.width / 2;
        for (let y = bottomY; y < topY; y += LANE_MARKING.dash + LANE_MARKING.gap) {
          graphics.fillRect(x, y, LANE_MARKING.width, LANE_MARKING.dash);
        }
      }
    }
  }

  // §6: a translucent band spanning the full road width at each overbridge
  // crossing's y, drawn above traffic/pedestrians (depth) to read as a
  // structure above the road rather than a marking on it.
  private drawOverbridges(): void {
    const graphics = this.add.graphics().setDepth(OVERBRIDGE_VISUAL.depth);

    for (const crossing of this.map.crossings) {
      if (!crossing.overbridge) continue;

      const edges = computeRoadEdges(this.map.laneCountAt(crossing.y));
      graphics.fillStyle(COLORS.overbridgeBand, OVERBRIDGE_VISUAL.alpha);
      graphics.fillRect(
        edges.roadLeftX,
        crossing.y - OVERBRIDGE_VISUAL.thickness / 2,
        edges.roadRightX - edges.roadLeftX,
        OVERBRIDGE_VISUAL.thickness,
      );
    }
  }

  // §7.3: load, parse and validate the map JSON. A throwaway demo map for
  // M4 (docs/progress.md) — the real Mohakhali-to-Banani route arrives M6.
  private loadMap(): RouteMap {
    const raw = this.cache.json.get('map');
    const result = validateSegments(raw);
    if (!result.valid) {
      throw new Error(`Invalid map data (${MAP_URL}): ${result.errors.join('; ')}`);
    }
    return new RouteMap(result.segments);
  }
}

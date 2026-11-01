import Phaser from 'phaser';
import { DISPLAY, ROAD, SIM, VEHICLES, VEHICLE_COLLISION } from '../sim/config';
import { computeRoadEdges } from '../sim/road';
import { Sim } from '../sim/sim';
import { KeyboardInput } from '../ui/KeyboardInput';
import type { SimEvent } from '../sim/types';

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
  healthBarBg: 0x222222,
  healthBarFill: 0x55cc55,
  healthBarFillLow: 0xcc5555,
  nearMissText: '#ffee66',
} as const;
const LANE_MARKING = { dash: 40, gap: 40, width: 3 } as const;
const CAMERA_PLAYER_SCREEN_FRACTION = 0.7; // §build-plan M2: car sits at ~70% of screen height
const HEALTH_BAR = { x: 8, y: 90, width: 150, height: 14 } as const;
const BLINK_INTERVAL_MS = 100; // §8.1: player sprite blinks while invulnerable

// §3.2 Controls: on-screen reminder of the keyboard bindings. Touch buttons
// (gas/brake/steer/horn, bottom corners per spec) replace this in M7; until
// then nothing else on screen shows the player which key does what.
const CONTROLS_HINT_TEXT = 'W/↑ Gas   S/↓ Brake   A/D or ←/→ Steer   Space Horn';

export class GameScene extends Phaser.Scene {
  private sim!: Sim;
  private input_!: KeyboardInput;
  private car!: Phaser.GameObjects.Rectangle;
  private trafficRects!: Phaser.GameObjects.Rectangle[];
  private healthBarFill!: Phaser.GameObjects.Rectangle;
  private debugText!: Phaser.GameObjects.Text;
  private debugVisible = true;
  private accumulatorMs = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    const seed = Date.now();
    this.sim = new Sim(seed, ROAD.length);
    this.input_ = new KeyboardInput(this);

    this.drawRoad();

    this.trafficRects = this.sim.state.traffic.map(() =>
      this.add.rectangle(0, 0, 1, 1, COLORS.trafficCar).setOrigin(0.5).setVisible(false),
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
      if (event.type === 'nearMiss') this.showNearMissText();
    }
  }

  // §8: floating acknowledgement text for a near miss, tweened up and out.
  private showNearMissText(): void {
    const { player } = this.sim.state;
    const text = this.add
      .text(player.x, player.y - VEHICLES.car.length, 'Near miss!', { fontSize: '18px', color: COLORS.nearMissText })
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
    this.renderHealthBar();
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
      rect.setFillStyle(vehicle.type === 'bus' ? COLORS.trafficBus : COLORS.trafficCar);
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

  private drawRoad(): void {
    const edges = computeRoadEdges();
    const graphics = this.add.graphics();

    const band = (left: number, right: number, color: number) => {
      graphics.fillStyle(color, 1);
      graphics.fillRect(left, 0, right - left, ROAD.length);
    };

    band(edges.roadLeftX, edges.footpathPlayerRightX, COLORS.footpath);
    band(edges.footpathPlayerRightX, edges.dividerLeftX, COLORS.carriageway);
    band(edges.dividerLeftX, edges.dividerRightX, COLORS.divider);
    band(edges.dividerRightX, edges.footpathOppositeLeftX, COLORS.carriageway);
    band(edges.footpathOppositeLeftX, edges.roadRightX, COLORS.footpath);

    graphics.fillStyle(COLORS.laneMarking, 1);
    for (let lane = 1; lane < ROAD.playerLanes; lane++) {
      const x = edges.footpathPlayerRightX + ROAD.laneWidth * lane - LANE_MARKING.width / 2;
      for (let y = 0; y < ROAD.length; y += LANE_MARKING.dash + LANE_MARKING.gap) {
        graphics.fillRect(x, y, LANE_MARKING.width, LANE_MARKING.dash);
      }
    }
  }
}

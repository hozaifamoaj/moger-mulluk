import Phaser from 'phaser';
import { DISPLAY, ROAD, SIM, VEHICLES } from '../sim/config';
import { computeRoadEdges } from '../sim/road';
import { Sim } from '../sim/sim';
import { KeyboardInput } from '../ui/KeyboardInput';

// Greybox placeholder colors (rule 13: replaced by sprites in M9). Sizes and
// positions come from src/sim/config.ts, not from these.
const COLORS = {
  footpath: 0x3a3f33,
  carriageway: 0x24262b,
  divider: 0x7a6a2a,
  laneMarking: 0xdddddd,
  car: 0xe0e0e0,
} as const;
const LANE_MARKING = { dash: 40, gap: 40, width: 3 } as const;
const CAMERA_PLAYER_SCREEN_FRACTION = 0.7; // §build-plan M2: car sits at ~70% of screen height

export class GameScene extends Phaser.Scene {
  private sim!: Sim;
  private input_!: KeyboardInput;
  private car!: Phaser.GameObjects.Rectangle;
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
    this.car = this.add
      .rectangle(this.sim.state.player.x, this.sim.state.player.y, VEHICLES.car.width, VEHICLES.car.length, COLORS.car)
      .setOrigin(0.5);

    this.debugText = this.add
      .text(8, 8, '', { fontSize: '16px', color: '#ffffff', backgroundColor: '#000000a0', padding: { x: 6, y: 4 } })
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

    while (this.accumulatorMs >= stepMs) {
      this.sim.step(SIM.stepSeconds, this.input_.read());
      this.accumulatorMs -= stepMs;
    }

    this.render();
  }

  private render(): void {
    const { player } = this.sim.state;
    this.car.setPosition(player.x, player.y);
    this.car.setRotation(player.heading);
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

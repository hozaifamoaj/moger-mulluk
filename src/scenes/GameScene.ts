import Phaser from 'phaser';
import { DISPLAY, ROAD, RUN, SIM, VEHICLES, VEHICLE_COLLISION, HORN } from '../sim/config';
import { computeRoadEdges } from '../sim/road';
import { Sim } from '../sim/sim';
import { RouteMap, validateSegments } from '../sim/map';
import { KeyboardInput } from '../ui/KeyboardInput';
import { TouchInput } from '../ui/TouchInput';
import { getSettings, type Language } from '../settings';
import { FONT_FAMILY, t } from '../ui/strings';
import { PEDESTRIAN_TEXTURE, PLAYER_TEXTURE, TRAFFIC_TEXTURE } from '../ui/sprites';
import { AudioDirector } from '../ui/audioDirector';
import type { FailReason, PlayableVehicleId, SimEvent, VehicleConfig } from '../sim/types';

const MAP_URL = 'assets/maps/mohakhali-banani.json';

// §3.5: a brief non-interactive delay before the sim starts stepping — the
// timer (which only advances inside Sim.step) correctly doesn't count it.
const COUNTDOWN_SECONDS = 3;

// Road/HUD colors. Vehicle and pedestrian visuals are sprites from
// src/ui/sprites.ts (rule 13) — sizes and positions come from
// src/sim/config.ts, not from here.
const COLORS = {
  footpath: 0x3a3f33,
  carriageway: 0x24262b,
  divider: 0x7a6a2a,
  laneMarking: 0xdddddd,
  healthBarBg: 0x222222,
  healthBarFill: 0x55cc55,
  healthBarFillLow: 0xcc5555,
  nearMissText: '#ffee66',
  fineText: '#ff6666',
  pedestrianHitText: '#ff3333',
  hornText: '#66ccff',
  overbridgeBand: 0x3a3a3a,
  hornBarBg: 0x222222,
  hornBarReady: 0x66ccff,
  hornBarCharging: 0x555555,
} as const;
const LANE_MARKING = { dash: 40, gap: 40, width: 3 } as const;
const CAMERA_PLAYER_SCREEN_FRACTION = 0.7; // §build-plan M2: car sits at ~70% of screen height
// §10.1 HUD layout: top-left (score/speed, health), top-center (timer),
// top-right (pause), top edge (route progress bar).
const PROGRESS_BAR = { height: 6 } as const;
const HUD_TEXT_Y = PROGRESS_BAR.height + 6;
const HEALTH_BAR = { x: 8, y: HUD_TEXT_Y + 26, width: 150, height: 14 } as const;
const HORN_BAR = { x: 8, y: HEALTH_BAR.y + HEALTH_BAR.height + 6, width: 150, height: 10 } as const;
const BLINK_INTERVAL_MS = 100; // §8.1: player sprite blinks while invulnerable
// §6: overbridge is a cosmetic-only structure (never collidable, §6/§8) drawn
// as a translucent band spanning the full road width at the crossing's y.
const OVERBRIDGE_VISUAL = { thickness: 24, alpha: 0.5, depth: 50 } as const;
// M9 / §11 audio: presentation-only cosmetic thresholds (not sim rules, so
// kept here rather than src/sim/config.ts, matching COLORS/HEALTH_BAR above).
const AUDIO = {
  brakeMinSpeed: 15, // px/s: below this, pressing brake is a stop, not a squeal
  bellRangePx: 140, // px from the player a rickshaw must be within to ring
  bellCooldownMinMs: 4000,
  bellCooldownMaxMs: 8000,
} as const;

export interface GameSceneData {
  vehicleId?: PlayableVehicleId;
}

export class GameScene extends Phaser.Scene {
  private sim!: Sim;
  private map!: RouteMap;
  private vehicleId!: PlayableVehicleId;
  private vehicleConfig!: VehicleConfig;
  private language!: Language;
  private keyboardInput!: KeyboardInput;
  private touchInput: TouchInput | null = null;
  private car!: Phaser.GameObjects.Sprite;
  private trafficSprites!: Phaser.GameObjects.Sprite[];
  private pedestrianSprites!: Phaser.GameObjects.Sprite[];
  private rickshawBellCooldownMs!: number[];
  private audio!: AudioDirector;
  private wasBraking = false;
  private healthBarFill!: Phaser.GameObjects.Rectangle;
  private hornBarFill!: Phaser.GameObjects.Rectangle;
  private debugText!: Phaser.GameObjects.Text;
  private debugVisible = false;
  private accumulatorMs = 0;
  private isPaused = false;
  private countdownRemaining = COUNTDOWN_SECONDS;
  private countdownText!: Phaser.GameObjects.Text;
  private scoreSpeedText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private progressBarFill!: Phaser.GameObjects.Rectangle;
  private ended = false;

  constructor() {
    super('Game');
  }

  preload(): void {
    this.load.json('map', MAP_URL);
  }

  create(data: GameSceneData): void {
    // Phaser scene instances persist across restarts (scene.start('Game') on
    // an already-created scene reuses the instance), so fields with
    // non-falsy defaults must be reset explicitly here.
    this.isPaused = false;
    this.ended = false;
    this.countdownRemaining = COUNTDOWN_SECONDS;
    this.accumulatorMs = 0;
    this.wasBraking = false;
    this.vehicleId = data?.vehicleId ?? 'car';
    this.vehicleConfig = VEHICLES[this.vehicleId];
    this.language = getSettings().language;

    const language = this.language;

    this.map = this.loadMap();

    const seedParam = new URLSearchParams(window.location.search).get('seed');
    const seed = seedParam !== null && seedParam !== '' ? Number(seedParam) : Date.now();
    this.sim = new Sim(seed, this.map, this.map.totalLength, this.vehicleId);
    this.keyboardInput = new KeyboardInput(this);
    this.touchInput = this.sys.game.device.input.touch ? new TouchInput(this) : null;

    this.drawRoad();
    this.drawOverbridges();

    this.trafficSprites = this.sim.state.traffic.map(() =>
      this.add.sprite(0, 0, TRAFFIC_TEXTURE.car).setOrigin(0.5).setVisible(false),
    );
    this.rickshawBellCooldownMs = this.sim.state.traffic.map(() => this.randomBellCooldown());

    this.pedestrianSprites = this.sim.state.pedestrians.map(() =>
      this.add.sprite(0, 0, PEDESTRIAN_TEXTURE.waiting).setOrigin(0.5).setVisible(false),
    );

    this.car = this.add
      .sprite(this.sim.state.player.x, this.sim.state.player.y, PLAYER_TEXTURE[this.vehicleId])
      .setOrigin(0.5);

    // M9 / §11: procedurally synthesised audio (src/ui/audioDirector.ts).
    // GameScene's instance persists across restarts, so the continuous
    // engine/ambience nodes are torn down on shutdown and restarted fresh
    // each create(); 'pause'/'resume' cover both the Pause menu and the
    // tab-hidden case (main.ts calls scene.pause()/resume() for both).
    this.audio = new AudioDirector(getSettings().sound);
    this.audio.resume();
    this.audio.start();
    this.events.on('pause', () => this.audio.suspend());
    this.events.on('resume', () => this.audio.resume());
    this.events.once('shutdown', () => this.audio.teardown());

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

    this.add
      .rectangle(0, 0, DISPLAY.width, PROGRESS_BAR.height, COLORS.healthBarBg)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.progressBarFill = this.add
      .rectangle(0, 0, 0, PROGRESS_BAR.height, COLORS.hornBarReady)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    this.scoreSpeedText = this.add
      .text(8, HUD_TEXT_Y, '', {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#000000a0',
        padding: { x: 6, y: 4 },
        fontFamily: FONT_FAMILY,
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.timerText = this.add
      .text(DISPLAY.width / 2, HUD_TEXT_Y, '', {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#000000a0',
        padding: { x: 8, y: 4 },
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    const pauseButton = this.add
      .text(DISPLAY.width - 8, HUD_TEXT_Y, t('pause', language), {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#000000a0',
        padding: { x: 8, y: 4 },
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    pauseButton.on('pointerup', () => this.pauseGame());

    this.countdownText = this.add
      .text(DISPLAY.width / 2, DISPLAY.height / 2, '', { fontSize: '96px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000);

    this.input.keyboard?.addKey('ESC').on('down', () => this.pauseGame());
    this.input.keyboard?.addKey('P').on('down', () => this.pauseGame());

    this.debugText = this.add
      .text(8, 76, '', { fontSize: '16px', color: '#ffffff', backgroundColor: '#000000a0', padding: { x: 6, y: 4 } })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(this.debugVisible);

    // §3.2 Controls: on-screen reminder of the keyboard bindings, shown only
    // on non-touch devices (touch players see the on-screen buttons directly).
    if (!this.touchInput) {
      this.add
        .text(DISPLAY.width / 2, DISPLAY.height - 8, t('controlsHint', language), {
          fontSize: '15px',
          color: '#ffffffcc',
          backgroundColor: '#000000a0',
          padding: { x: 8, y: 4 },
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5, 1)
        .setScrollFactor(0)
        .setDepth(1000);
    }

    this.input.keyboard?.addKey('F1').on('down', () => {
      this.debugVisible = !this.debugVisible;
      this.debugText.setVisible(this.debugVisible);
    });

    this.applyCamera();
  }

  update(_time: number, deltaMs: number): void {
    if (this.countdownRemaining > 0) {
      this.countdownRemaining -= deltaMs / 1000;
      this.countdownText.setText(this.countdownRemaining > 0 ? Math.ceil(this.countdownRemaining).toString() : 'GO!');
      this.render();
      return;
    }
    if (this.countdownText.text !== '') this.countdownText.setText('');

    this.accumulatorMs += Math.min(deltaMs, SIM.maxFrameDeltaMs);
    const stepMs = SIM.stepSeconds * 1000;

    const events: SimEvent[] = [];
    while (this.accumulatorMs >= stepMs) {
      events.push(...this.sim.step(SIM.stepSeconds, this.readInput()));
      this.accumulatorMs -= stepMs;
    }

    this.handleBrakeAudio();
    this.handleEvents(events);
    this.render();
  }

  // §3.2: keyboard and touch are both always-live `Input` readers; whichever
  // one the player is using has its buttons/keys down, the other reads all
  // zero/false, so a straightforward OR merge needs no "active device" state.
  private readInput() {
    const keyboard = this.keyboardInput.read();
    if (!this.touchInput) return keyboard;

    const touch = this.touchInput.read();
    return {
      throttle: (keyboard.throttle || touch.throttle) as 0 | 1,
      brake: (keyboard.brake || touch.brake) as 0 | 1,
      steer: (keyboard.steer !== 0 ? keyboard.steer : touch.steer) as -1 | 0 | 1,
      horn: keyboard.horn || touch.horn,
    };
  }

  private handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'nearMiss') this.showFloatingText(t('nearMiss', this.language), COLORS.nearMissText);
      if (event.type === 'fine') this.showFloatingText(t('fine', this.language), COLORS.fineText);
      if (event.type === 'pedestrianHit') this.showFloatingText(t('pedestrianHit', this.language), COLORS.pedestrianHitText);
      if (event.type === 'hornUsed') {
        this.showFloatingText(t('honk', this.language), COLORS.hornText);
        this.audio.playHorn(this.vehicleId);
      }
      if (event.type === 'vehicleCollision') this.audio.playCrash(event.collisionClass === 'scrape' ? 'light' : 'heavy');
      if (event.type === 'finish') this.endRun('win');
      if (event.type === 'fail') this.endRun('fail', event.failReason);
    }
  }

  // M9 / §11: a one-shot brake squeal on the rising edge of the brake input,
  // not every frame it's held — read once here, separately from the sim
  // steps' own input reads, since this is a cosmetic trigger, not a sim rule.
  private handleBrakeAudio(): void {
    const braking = this.readInput().brake === 1;
    if (braking && !this.wasBraking && Math.abs(this.sim.state.player.speed) > AUDIO.brakeMinSpeed) {
      this.audio.playBrake();
    }
    this.wasBraking = braking;
  }

  private randomBellCooldown(): number {
    return AUDIO.bellCooldownMinMs + Math.random() * (AUDIO.bellCooldownMaxMs - AUDIO.bellCooldownMinMs);
  }

  // §3.5: hands off to the Results screen with everything it needs to
  // render the outcome; the sim itself has already frozen (runStatus !==
  // 'playing' makes further step() calls no-ops).
  private endRun(outcome: 'win' | 'fail', failReason?: FailReason): void {
    if (this.ended) return;
    this.ended = true;

    const { score, elapsedSeconds, nearMissCount, collisionCount, fineCount, stars } = this.sim.state;
    this.scene.start('Results', {
      outcome,
      failReason: failReason ?? null,
      score,
      durationSeconds: elapsedSeconds,
      nearMissCount,
      collisionCount,
      fineCount,
      stars,
      seed: this.sim.seed,
      vehicleId: this.vehicleId,
    });
  }

  // §3.5 Paused state: a launched overlay scene, not a sim-side flag — the
  // sim simply isn't stepped while paused, so elapsed time (and therefore
  // the timer) correctly doesn't advance.
  private pauseGame(): void {
    if (this.isPaused || this.countdownRemaining > 0 || this.ended) return;
    this.isPaused = true;
    this.scene.pause();
    this.scene.launch('Pause');
  }

  // Read by PauseScene's Restart button so the chosen vehicle survives a restart.
  get currentVehicleId(): PlayableVehicleId {
    return this.vehicleId;
  }

  // Called by PauseScene's Resume button after it resumes this scene.
  resumeFromPause(): void {
    this.isPaused = false;
  }

  // §8 / §9: floating acknowledgement text for a near miss or fine, tweened up and out.
  private showFloatingText(message: string, color: string): void {
    const { player } = this.sim.state;
    const text = this.add
      .text(player.x, player.y - this.vehicleConfig.length, message, { fontSize: '18px', color, fontFamily: FONT_FAMILY })
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

    this.audio.setEngineIntensity(Math.abs(player.speed) / this.vehicleConfig.maxSpeed);
    this.renderTraffic();
    this.renderPedestrians();
    this.renderHealthBar();
    this.renderHornBar();
    this.renderHud();
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
    const { player, traffic } = this.sim.state;
    const frameDeltaMs = this.game.loop.delta;
    for (let i = 0; i < traffic.length; i++) {
      const vehicle = traffic[i];
      const sprite = this.trafficSprites[i];
      sprite.setVisible(vehicle.active);
      if (!vehicle.active) continue;

      sprite.setPosition(vehicle.x, vehicle.y);
      sprite.setTexture(TRAFFIC_TEXTURE[vehicle.type]);

      // M9 / §11: an occasional rickshaw bell, cosmetic only — a presentation-
      // side per-slot cooldown, since the sim has no concept of "has rung".
      if (vehicle.type === 'rickshaw') {
        this.rickshawBellCooldownMs[i] -= frameDeltaMs;
        if (this.rickshawBellCooldownMs[i] <= 0 && Math.abs(vehicle.y - player.y) < AUDIO.bellRangePx) {
          this.audio.playBell();
          this.rickshawBellCooldownMs[i] = this.randomBellCooldown();
        }
      }
    }
  }

  // §6: waiting-passenger, footpath-waiting/walking, and overbridge
  // pedestrians each use a distinct sprite so their state reads at a glance;
  // overbridge users are also drawn above everything else (depth), since
  // they're physically elevated and never a collision target.
  private renderPedestrians(): void {
    const pedestrians = this.sim.state.pedestrians;
    for (let i = 0; i < pedestrians.length; i++) {
      const ped = pedestrians[i];
      const sprite = this.pedestrianSprites[i];
      sprite.setVisible(ped.active);
      if (!ped.active) continue;

      sprite.setPosition(ped.x, ped.y);
      if (ped.usesOverbridge) {
        sprite.setTexture(PEDESTRIAN_TEXTURE.overbridge);
        sprite.setDepth(OVERBRIDGE_VISUAL.depth + 1);
      } else {
        sprite.setTexture(ped.phase === 'waiting' ? PEDESTRIAN_TEXTURE.waiting : PEDESTRIAN_TEXTURE.walking);
        sprite.setDepth(0);
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

  // §10.1 HUD: score/speed (top-left), countdown timer (top-center), and
  // route progress (top edge bar, fraction of distance travelled so far).
  private renderHud(): void {
    const { player, score } = this.sim.state;
    this.scoreSpeedText.setText(
      `${t('scoreLabel', this.language)}: ${Math.round(score)}   ${t('speedLabel', this.language)}: ${Math.abs(player.speed).toFixed(0)} px/s`,
    );

    const secondsLeft = Math.max(0, RUN.timeLimitSeconds - this.sim.state.elapsedSeconds);
    this.timerText.setText(Math.ceil(secondsLeft).toString());

    const fraction = Math.max(0, Math.min(1, (this.map.totalLength - player.y) / this.map.totalLength));
    this.progressBarFill.setSize(DISPLAY.width * fraction, PROGRESS_BAR.height);
  }

  private renderHealthBar(): void {
    const fraction = Math.max(0, this.sim.state.player.health / this.vehicleConfig.health);
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

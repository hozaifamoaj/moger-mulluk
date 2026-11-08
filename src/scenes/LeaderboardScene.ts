import Phaser from 'phaser';
import { DISPLAY, VEHICLES } from '../sim/config';
import type { PlayableVehicleId } from '../sim/types';
import { getClient } from '../online/client';
import { queryRank, queryTop50 } from '../online/leaderboard';
import { getAllBests } from '../vehicles';
import { getSettings, type Language } from '../settings';
import { FONT_FAMILY, t } from '../ui/strings';

const VEHICLE_IDS: PlayableVehicleId[] = ['car', 'motorcycle'];
const LIST_AREA = { top: 260, bottom: DISPLAY.height - 90, rowHeight: 28 } as const;

// §10.2 Leaderboard: top 50 per vehicle, the player's own best rank, and a
// short offline message if Supabase can't be reached. "Own rank" is derived
// from the local mm.best score for that vehicle (see queryRank's comment) —
// no sign-in is needed just to read the board, since `leaderboard`'s RLS
// policy grants select to anon.
export class LeaderboardScene extends Phaser.Scene {
  private language!: Language;
  private vehicle: PlayableVehicleId = 'car';
  private tabButtons = new Map<PlayableVehicleId, Phaser.GameObjects.Text>();
  private statusText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private destroyed = false;

  constructor() {
    super('Leaderboard');
  }

  create(): void {
    this.destroyed = false;
    const { language } = getSettings();
    this.language = language;
    const centerX = DISPLAY.width / 2;

    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x111317, 1).setOrigin(0, 0);
    this.add
      .text(centerX, 100, t('leaderboard', language), { fontSize: '36px', color: '#ffffff', fontFamily: FONT_FAMILY })
      .setOrigin(0.5);

    this.tabButtons.clear();
    const tabWidth = 160;
    let tabX = centerX - (tabWidth * VEHICLE_IDS.length) / 2 + tabWidth / 2;
    for (const id of VEHICLE_IDS) {
      const button = this.add
        .text(tabX, 170, VEHICLES[id].name, {
          fontSize: '20px',
          color: '#ffffff',
          backgroundColor: '#2a2a2a',
          padding: { x: 16, y: 8 },
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      button.on('pointerup', () => this.selectVehicle(id));
      this.tabButtons.set(id, button);
      tabX += tabWidth;
    }

    this.rankText = this.add
      .text(centerX, 215, '', { fontSize: '18px', color: '#ffee66', fontFamily: FONT_FAMILY })
      .setOrigin(0.5);
    this.statusText = this.add
      .text(centerX, LIST_AREA.top + 20, '', { fontSize: '18px', color: '#999999', fontFamily: FONT_FAMILY })
      .setOrigin(0.5);

    this.listContainer = this.add.container(0, LIST_AREA.top);
    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff).fillRect(0, LIST_AREA.top, DISPLAY.width, LIST_AREA.bottom - LIST_AREA.top);
    maskShape.setVisible(false);
    this.listContainer.setMask(maskShape.createGeometryMask());

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      const visibleHeight = LIST_AREA.bottom - LIST_AREA.top;
      const contentHeight = this.listContainer.length * LIST_AREA.rowHeight;
      const minY = LIST_AREA.top - Math.max(0, contentHeight - visibleHeight);
      this.listContainer.y = Phaser.Math.Clamp(this.listContainer.y - dy * 0.5, minY, LIST_AREA.top);
    });

    const back = this.add
      .text(centerX, DISPLAY.height - 40, t('back', language), {
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#444444',
        padding: { x: 20, y: 8 },
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('Menu'));

    this.events.once('shutdown', () => {
      this.destroyed = true;
    });

    this.selectVehicle('car');
  }

  private selectVehicle(id: PlayableVehicleId): void {
    this.vehicle = id;
    for (const [vid, button] of this.tabButtons) {
      button.setBackgroundColor(vid === id ? '#2a7a4f' : '#2a2a2a');
    }
    void this.loadLeaderboard(id);
  }

  private async loadLeaderboard(vehicle: PlayableVehicleId): Promise<void> {
    this.listContainer.removeAll(true);
    this.listContainer.y = LIST_AREA.top;
    this.rankText.setText('');

    const client = getClient();
    if (!client) {
      this.statusText.setText(t('leaderboardUnavailable', this.language));
      return;
    }

    this.statusText.setText(t('leaderboardLoading', this.language));
    const rows = await queryTop50(client, vehicle);
    if (this.destroyed || this.vehicle !== vehicle) return;

    if (!rows) {
      this.statusText.setText(t('leaderboardUnavailable', this.language));
      return;
    }

    this.statusText.setText('');
    rows.forEach((row, index) => {
      const text = this.add.text(20, index * LIST_AREA.rowHeight, `${index + 1}. ${row.nickname} — ${row.score}`, {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      });
      this.listContainer.add(text);
    });

    const localBest = getAllBests()[vehicle];
    if (!localBest) return;

    const rank = await queryRank(client, vehicle, localBest.score);
    if (this.destroyed || this.vehicle !== vehicle) return;
    if (rank !== null) this.rankText.setText(`${t('rankLabel', this.language)}: #${rank}`);
  }
}

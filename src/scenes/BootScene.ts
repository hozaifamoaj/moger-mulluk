import Phaser from 'phaser';
import { getClient } from '../online/client';
import { flushPending } from '../online/pending';
import { buildSprites } from '../ui/sprites';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // M9 / rule 13: textures are generated once here, before Menu/Game use
    // any of their keys (shared across scenes via Phaser's TextureManager).
    buildSprites(this);

    // §12.7 failure handling: queued scores are retried once at launch.
    // Fire-and-forget — the menu must never wait on the network (rule 12).
    const client = getClient();
    if (client) void flushPending(client);

    this.scene.start('Menu');
  }
}

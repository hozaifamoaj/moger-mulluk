import Phaser from 'phaser';
import { getClient } from '../online/client';
import { flushPending } from '../online/pending';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // §12.7 failure handling: queued scores are retried once at launch.
    // Fire-and-forget — the menu must never wait on the network (rule 12).
    const client = getClient();
    if (client) void flushPending(client);

    this.scene.start('Menu');
  }
}

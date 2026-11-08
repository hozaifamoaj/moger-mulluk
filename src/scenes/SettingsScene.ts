import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';
import { getSettings, setSettings, type Settings } from '../settings';
import { showIdentityPrompt } from '../ui/identityPrompt';
import { FONT_FAMILY, t } from '../ui/strings';

// §10.2 Settings: sound, language and nickname.
export class SettingsScene extends Phaser.Scene {
  private settings!: Settings;
  private soundButton!: Phaser.GameObjects.Text;
  private languageButton!: Phaser.GameObjects.Text;
  private nicknameButton!: Phaser.GameObjects.Text;
  private backButton!: Phaser.GameObjects.Text;

  constructor() {
    super('Settings');
  }

  create(): void {
    this.settings = getSettings();
    const centerX = DISPLAY.width / 2;

    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x111317, 1).setOrigin(0, 0);
    this.add
      .text(centerX, 150, t('settings', this.settings.language), {
        fontSize: '36px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.soundButton = this.makeButton(320, '', () => {
      this.settings = { ...this.settings, sound: !this.settings.sound };
      setSettings(this.settings);
      this.refresh();
    });

    this.languageButton = this.makeButton(400, '', () => {
      this.settings = { ...this.settings, language: this.settings.language === 'en' ? 'bn' : 'en' };
      setSettings(this.settings);
      this.refresh();
    });

    this.nicknameButton = this.makeButton(480, '', () => void this.changeNickname());

    this.backButton = this.makeButton(600, '', () => this.scene.start('Menu'));

    this.refresh();
  }

  private refresh(): void {
    const { sound, language, nickname } = this.settings;
    this.soundButton.setText(`${t('soundLabel', language)}: ${sound ? t('on', language) : t('off', language)}`);
    this.languageButton.setText(`${t('languageLabel', language)}: ${language === 'en' ? 'English' : 'বাংলা'}`);
    this.nicknameButton.setText(`${t('nicknameLabel', language)}: ${nickname ?? t('noNickname', language)}`);
    this.backButton.setText(t('back', language));
  }

  private async changeNickname(): Promise<void> {
    const { language, nickname } = this.settings;
    const result = await showIdentityPrompt({
      title: t('nicknameChangeTitle', language),
      nicknameLabel: t('nicknameLabel', language),
      confirmLabel: t('confirm', language),
      skipLabel: t('skip', language),
      errorMessages: {
        tooShort: t('nicknameTooShort', language),
        tooLong: t('nicknameTooLong', language),
        blocked: t('nicknameBlocked', language),
      },
      needsNickname: true,
      needsCaptcha: false,
      initialNickname: nickname ?? undefined,
    });
    if (!result || result.nickname === null) return;

    this.settings = { ...this.settings, nickname: result.nickname };
    setSettings(this.settings);
    this.refresh();
  }

  private makeButton(y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const centerX = DISPLAY.width / 2;
    return this.add
      .text(centerX, y, label, {
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: '#2a7a4f',
        padding: { x: 24, y: 10 },
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
  }
}

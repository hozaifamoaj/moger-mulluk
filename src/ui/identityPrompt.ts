import { validateNickname, type NicknameError } from '../online/nickname';
import { renderTurnstile } from '../online/turnstile';
import { FONT_FAMILY } from './strings';

export interface IdentityPromptOptions {
  title: string;
  nicknameLabel: string;
  confirmLabel: string;
  skipLabel: string;
  errorMessages: Record<NicknameError, string>;
  needsNickname: boolean;
  needsCaptcha: boolean;
  initialNickname?: string;
}

export interface IdentityPromptResult {
  nickname: string | null;
  captchaToken: string | null;
}

function buttonStyle(primary: boolean): string {
  return `padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; color: #fff; background: ${
    primary ? '#2a7a4f' : '#444444'
  };`;
}

// A real HTML overlay rather than a Phaser scene: Phaser has no native text
// input, and this is the only place in the game that needs one (the
// Turnstile widget is DOM-only too, by Cloudflare's own design). Resolves
// `null` if the player skips, otherwise whatever of {nickname, captchaToken}
// was actually asked for.
export function showIdentityPrompt(options: IdentityPromptOptions): Promise<IdentityPromptResult | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: ${FONT_FAMILY};`;

    const card = document.createElement('div');
    card.style.cssText =
      'background: #1b1d22; color: #fff; padding: 24px; border-radius: 8px; width: 320px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);';

    const title = document.createElement('div');
    title.textContent = options.title;
    title.style.cssText = 'font-size: 18px; font-weight: bold;';
    card.appendChild(title);

    let input: HTMLInputElement | null = null;
    const error = document.createElement('div');
    error.style.cssText = 'color: #ff8080; font-size: 13px; min-height: 16px;';

    if (options.needsNickname) {
      const label = document.createElement('label');
      label.textContent = options.nicknameLabel;
      label.style.cssText = 'font-size: 14px;';
      card.appendChild(label);

      input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 16;
      input.value = options.initialNickname ?? '';
      input.style.cssText =
        'padding: 8px; font-size: 16px; border-radius: 4px; border: 1px solid #444; background: #111; color: #fff;';
      card.appendChild(input);
      card.appendChild(error);
    }

    let captchaToken: string | null = null;
    let cleanupTurnstile = () => {};
    if (options.needsCaptcha) {
      const widgetContainer = document.createElement('div');
      card.appendChild(widgetContainer);
      cleanupTurnstile = renderTurnstile(widgetContainer, (token) => {
        captchaToken = token;
        updateConfirmState();
      });
    }

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;';

    const skip = document.createElement('button');
    skip.textContent = options.skipLabel;
    skip.style.cssText = buttonStyle(false);

    const confirm = document.createElement('button');
    confirm.textContent = options.confirmLabel;
    confirm.style.cssText = buttonStyle(true);

    buttons.appendChild(skip);
    buttons.appendChild(confirm);
    card.appendChild(buttons);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    function updateConfirmState(): void {
      let nicknameOk = true;
      if (options.needsNickname && input) {
        const err: NicknameError | null = validateNickname(input.value);
        error.textContent = err ? options.errorMessages[err] : '';
        nicknameOk = err === null;
      }
      const captchaOk = !options.needsCaptcha || captchaToken !== null;
      const disabled = !(nicknameOk && captchaOk);
      confirm.toggleAttribute('disabled', disabled);
      confirm.style.opacity = disabled ? '0.5' : '1';
      confirm.style.cursor = disabled ? 'default' : 'pointer';
    }

    function cleanup(): void {
      cleanupTurnstile();
      document.body.removeChild(backdrop);
    }

    input?.addEventListener('input', updateConfirmState);
    skip.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    confirm.addEventListener('click', () => {
      if (confirm.hasAttribute('disabled')) return;
      const nickname = options.needsNickname && input ? input.value.trim() : null;
      cleanup();
      resolve({ nickname, captchaToken });
    });

    updateConfirmState();
    input?.focus();
  });
}

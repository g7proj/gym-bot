import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TelegramModal from './TelegramModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('TelegramModal', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('renders unlinked flow, generates deep link, and exposes native Telegram anchor', () => {
    const onGenerateLink = jest.fn();
    const onCheckStatus = jest.fn();

    act(() => {
      root.render(
        <TelegramModal
          open
          onClose={jest.fn()}
          connection={null}
          deepLinkUrl=""
          loading={false}
          onGenerateLink={onGenerateLink}
          onCheckStatus={onCheckStatus}
          onDisconnect={jest.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Not linked');
    const generateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Generate Telegram link'),
    );
    expect(generateBtn).toBeDefined();
    act(() => {
      generateBtn.click();
    });
    expect(onGenerateLink).toHaveBeenCalledTimes(1);

    // Re-render with generated deep link URL.
    act(() => {
      root.render(
        <TelegramModal
          open
          onClose={jest.fn()}
          connection={null}
          deepLinkUrl="https://t.me/gymbot_test_bot?start=abc123token"
          loading={false}
          onGenerateLink={onGenerateLink}
          onCheckStatus={onCheckStatus}
          onDisconnect={jest.fn()}
        />,
      );
    });

    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor.getAttribute('href')).toBe('https://t.me/gymbot_test_bot?start=abc123token');
    expect(anchor.textContent).toContain('Open in Telegram');

    const checkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Check status'),
    );
    act(() => {
      checkBtn.click();
    });
    expect(onCheckStatus).toHaveBeenCalledTimes(1);
  });

  test('renders connected state with username and triggers disconnect', () => {
    const onDisconnect = jest.fn();

    act(() => {
      root.render(
        <TelegramModal
          open
          onClose={jest.fn()}
          connection={{ telegramUsername: '@mario', enabled: true }}
          deepLinkUrl=""
          loading={false}
          onGenerateLink={jest.fn()}
          onCheckStatus={jest.fn()}
          onDisconnect={onDisconnect}
        />,
      );
    });

    expect(container.textContent).toContain('Connected');
    expect(container.textContent).toContain('@mario');

    const disconnectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Disconnect'),
    );
    act(() => {
      disconnectBtn.click();
    });
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});

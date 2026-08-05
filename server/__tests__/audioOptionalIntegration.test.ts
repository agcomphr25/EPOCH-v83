import { afterEach, describe, expect, it, vi } from 'vitest';

const constructor = vi.fn();
vi.mock('openai', () => ({
  default: class OpenAI {
    constructor(options: unknown) {
      constructor(options);
    }
  },
  toFile: vi.fn(),
}));

describe('optional audio integration', () => {
  afterEach(() => {
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    vi.clearAllMocks();
  });

  it('does not instantiate an external client merely by importing the module', async () => {
    const audio = await import('../replit_integrations/audio/client');
    expect(audio.AUDIO_INTEGRATION_UNAVAILABLE).toBe(
      'AUDIO_INTEGRATION_UNAVAILABLE'
    );
    expect(constructor).not.toHaveBeenCalled();
  });

  it('fails an invoked audio operation safely without credentials or secret details', async () => {
    const audio = await import('../replit_integrations/audio/client');
    await expect(
      audio.speechToText(Buffer.from('synthetic'), 'wav')
    ).rejects.toMatchObject({
      code: 'AUDIO_INTEGRATION_UNAVAILABLE',
      statusCode: 503,
      message: 'Audio integration is unavailable',
    });
    expect(constructor).not.toHaveBeenCalled();
  });
});

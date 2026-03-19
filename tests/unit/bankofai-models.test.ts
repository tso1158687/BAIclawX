import { describe, expect, it } from 'vitest';
import { pickPreferredBankOfAiModelId } from '@/lib/bankofai-models';

describe('BANK OF AI model selection', () => {
  it('prefers MiniMax-M2.5 when available', () => {
    expect(
      pickPreferredBankOfAiModelId([
        { id: 'gpt-5.2', displayName: 'GPT-5.2' },
        { id: 'MiniMax-M2.5', displayName: 'MiniMax M2.5' },
        { id: 'gpt-5', displayName: 'GPT-5' },
      ]),
    ).toBe('MiniMax-M2.5');
  });

  it('falls back to the first model when MiniMax-M2.5 is unavailable', () => {
    expect(
      pickPreferredBankOfAiModelId([
        { id: 'deepseek-chat', displayName: 'DeepSeek Chat' },
        { id: 'qwen-max', displayName: 'Qwen Max' },
      ]),
    ).toBe('deepseek-chat');
  });
});

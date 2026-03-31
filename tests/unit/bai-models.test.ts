import { describe, expect, it } from 'vitest';
import { pickPreferredBaiModelId } from '@/lib/bai-models';

describe('BAI model selection', () => {
  it('prefers MiniMax-M2.5 when available', () => {
    expect(
      pickPreferredBaiModelId([
        { id: 'gpt-5.2', displayName: 'GPT-5.2' },
        { id: 'MiniMax-M2.5', displayName: 'MiniMax M2.5' },
        { id: 'gpt-5', displayName: 'GPT-5' },
      ]),
    ).toBe('MiniMax-M2.5');
  });

  it('falls back to the first model when MiniMax-M2.5 is unavailable', () => {
    expect(
      pickPreferredBaiModelId([
        { id: 'deepseek-chat', displayName: 'DeepSeek Chat' },
        { id: 'qwen-max', displayName: 'Qwen Max' },
      ]),
    ).toBe('deepseek-chat');
  });
});

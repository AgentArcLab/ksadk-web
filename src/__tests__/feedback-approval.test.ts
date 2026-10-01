import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedback } from '../hooks/useFeedback.js';
import { useMessageStore } from '../stores/message.js';
import type { Message } from '../components/chat/types.js';
import type { ApiFacade } from '../core/api/types.js';

const approvalMessage: Message = {
  id: 'message-1',
  role: 'model',
  content: '',
  timestamp: 1,
  tools: {
    shell: {
      name: 'shell',
      args: '{}',
      status: 'paused',
      approvalRequestId: 'approval-1',
      approvalStatus: 'pending',
    },
  },
  blocks: [{
    id: 'tool-1',
    type: 'tool',
    toolName: 'shell',
    args: '{}',
    status: 'paused',
    extra: { approvalRequestId: 'approval-1', approvalStatus: 'pending' },
  }],
};

function probe(options: {
  isStreaming: boolean;
  submitDraft: ReturnType<typeof vi.fn>;
}) {
  let actions!: ReturnType<typeof useFeedback>;
  function Probe() {
    actions = useFeedback({
      agentId: 'agent-1',
      currentSessionId: 'session-1',
      isStreaming: options.isStreaming,
      api: {} as ApiFacade,
      submitDraft: options.submitDraft,
    });
    return null;
  }
  renderToString(createElement(Probe));
  return actions;
}

describe('legacy approval dispatch result', () => {
  beforeEach(() => {
    useMessageStore.getState().setMessages([approvalMessage]);
  });

  it('returns false and leaves the approval untouched while streaming', async () => {
    const submitDraft = vi.fn().mockResolvedValue(true);
    const actions = probe({ isStreaming: true, submitDraft });

    await expect(actions.respondToApproval({
      approvalRequestId: 'approval-1',
      approve: true,
    })).resolves.toBe(false);
    expect(submitDraft).not.toHaveBeenCalled();
    expect(useMessageStore.getState().messages[0].tools?.shell.approvalStatus).toBe('pending');
  });

  it('does not patch the transcript when the resume launch is rejected', async () => {
    const submitDraft = vi.fn().mockResolvedValue(false);
    const actions = probe({ isStreaming: false, submitDraft });

    await expect(actions.respondToApproval({
      approvalRequestId: 'approval-1',
      approve: false,
    })).resolves.toBe(false);
    expect(submitDraft).toHaveBeenCalledOnce();
    expect(useMessageStore.getState().messages[0].tools?.shell.approvalStatus).toBe('pending');
  });

  it('patches the transcript only after the resume launch is accepted', async () => {
    const submitDraft = vi.fn().mockResolvedValue(true);
    const actions = probe({ isStreaming: false, submitDraft });

    await expect(actions.respondToApproval({
      approvalRequestId: 'approval-1',
      approve: true,
    })).resolves.toBe(true);
    expect(useMessageStore.getState().messages[0].tools?.shell).toMatchObject({
      approvalStatus: 'approved',
      status: 'running',
    });
  });
});

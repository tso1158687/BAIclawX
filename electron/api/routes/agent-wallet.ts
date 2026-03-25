import type { IncomingMessage, ServerResponse } from 'http';
import {
  createAgentWalletFromTronImport,
  deleteAgentWallet,
  listAgentWallets,
  validateTronPrivateKeyForBankOfAi,
} from '../../services/agent-wallet/agent-wallet-service';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson, sendNoContent } from '../route-utils';

export async function handleAgentWalletRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  void _ctx;

  if (url.pathname === '/api/agent-wallets' && req.method === 'GET') {
    try {
      const wallets = await listAgentWallets();
      sendJson(res, 200, { success: true, wallets });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/agent-wallets/validate-private-key' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ privateKey?: string; bankOfAiAccountId?: string }>(req);
      const privateKey = body.privateKey?.trim() ?? '';
      const bankOfAiAccountId = body.bankOfAiAccountId?.trim() ?? '';
      if (!privateKey || !bankOfAiAccountId) {
        sendJson(res, 400, { success: false, error: 'Missing privateKey or bankOfAiAccountId' });
        return true;
      }
      const result = await validateTronPrivateKeyForBankOfAi(privateKey, bankOfAiAccountId);
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/agent-wallets' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        privateKey?: string;
        masterPassword?: string;
        bankOfAiAccountId?: string;
      }>(req);
      const privateKey = body.privateKey?.trim() ?? '';
      const masterPassword = body.masterPassword ?? '';
      const bankOfAiAccountId = body.bankOfAiAccountId?.trim() ?? '';
      if (!privateKey || !masterPassword || !bankOfAiAccountId) {
        sendJson(res, 400, { success: false, error: 'Missing privateKey, masterPassword, or bankOfAiAccountId' });
        return true;
      }
      const wallet = await createAgentWalletFromTronImport({
        privateKeyHex: privateKey,
        masterPassword,
        bankOfAiAccountId,
      });
      sendJson(res, 200, { success: true, wallet });
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      const codeMap: Record<string, number> = {
        WEAK_MASTER_PASSWORD: 400,
        VALIDATION_FORMAT: 400,
        VALIDATION_NOT_TRON: 400,
        VALIDATION_MISMATCH: 400,
        VALIDATION_NO_API_KEY: 400,
        WALLET_ALREADY_EXISTS: 409,
        MASTER_PASSWORD_INCORRECT: 401,
      };
      const prefix = message.replace(/^Error:\s*/, '');
      const status = codeMap[prefix] ?? 500;
      sendJson(res, status, { success: false, error: prefix });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/agent-wallets/') && req.method === 'DELETE') {
    const suffix = url.pathname.slice('/api/agent-wallets/'.length).split('/').filter(Boolean)[0];
    if (!suffix) {
      sendJson(res, 400, { success: false, error: 'Missing wallet id' });
      return true;
    }
    const walletId = decodeURIComponent(suffix);
    try {
      await deleteAgentWallet(walletId);
      sendNoContent(res);
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}

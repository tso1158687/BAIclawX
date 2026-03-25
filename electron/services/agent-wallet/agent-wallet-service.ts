/**
 * AgentWallet storage using @bankofai/agent-wallet (TRON, local_secure + encrypted secrets).
 */
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ConfigWalletProvider,
  SecureKVStore,
  TronSigner,
  type SecretLoaderFn,
} from '@bankofai/agent-wallet';
import { fetchBankOfAiLinkedTronAddress } from './bankofai-tron-verify';
import { getApiKey } from '../../utils/secure-storage';
import { getProviderAccount } from '../providers/provider-store';

const KV_PWD_FILE = 'kv-password.bin';
const KV_PWD_PLAIN_FILE = 'kv-password.plain.txt';
const WALLET_META_FILE = 'wallet_meta.json';
const WALLETS_CONFIG_FILENAME = 'wallets_config.json';

const TRON_NETWORK = 'tron';
/** Legacy wallets created before TRON migration */
const LEGACY_EVM_NETWORK = 'eip155:1';

function getWalletRoot(): string {
  return path.join(app.getPath('userData'), 'agent-wallet');
}

function walletsConfigPath(): string {
  return path.join(getWalletRoot(), WALLETS_CONFIG_FILENAME);
}

function ensureWalletDir(): void {
  fs.mkdirSync(getWalletRoot(), { recursive: true });
}

function readKvPassword(): string {
  ensureWalletDir();
  const root = getWalletRoot();
  const encPath = path.join(root, KV_PWD_FILE);
  const plainPath = path.join(root, KV_PWD_PLAIN_FILE);

  if (fs.existsSync(encPath)) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'OS secure storage is unavailable but an encrypted wallet password file exists. '
        + 'Enable keychain/secret service or remove agent-wallet/kv-password.bin after backup.',
      );
    }
    const buf = fs.readFileSync(encPath);
    return safeStorage.decryptString(buf);
  }

  if (fs.existsSync(plainPath)) {
    return fs.readFileSync(plainPath, 'utf8').trim();
  }

  throw new Error('Agent wallet vault is not initialized');
}

/**
 * Persist the user-chosen master password (first-time vault setup from the wizard).
 */
export function persistUserMasterPassword(password: string): void {
  ensureWalletDir();
  const root = getWalletRoot();
  const encPath = path.join(root, KV_PWD_FILE);
  const plainPath = path.join(root, KV_PWD_PLAIN_FILE);
  if (fs.existsSync(plainPath)) {
    try {
      fs.unlinkSync(plainPath);
    } catch {
      // ignore
    }
  }
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(encPath, safeStorage.encryptString(password));
  } else {
    fs.writeFileSync(plainPath, password, 'utf8');
    try {
      fs.chmodSync(plainPath, 0o600);
    } catch {
      // ignore
    }
  }
}

export function isStrongMasterPassword(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

const secretLoader: SecretLoaderFn = (configDir, password, secretRef) => {
  const kv = new SecureKVStore(configDir, password);
  return kv.loadSecret(secretRef);
};

function getProvider(): ConfigWalletProvider {
  const password = readKvPassword();
  return new ConfigWalletProvider(getWalletRoot(), password, {
    network: TRON_NETWORK,
    secretLoader,
  });
}

function ensureKvInitialized(): void {
  ensureWalletDir();
  const password = readKvPassword();
  const root = getWalletRoot();
  const masterPath = path.join(root, 'master.json');
  const kv = new SecureKVStore(root, password);
  if (!fs.existsSync(masterPath)) {
    kv.initMaster();
  } else {
    kv.verifyPassword();
  }
}

type WalletMeta = Record<string, { label?: string }>;

function metaPath(): string {
  return path.join(getWalletRoot(), WALLET_META_FILE);
}

function loadWalletMeta(): WalletMeta {
  try {
    const raw = fs.readFileSync(metaPath(), 'utf8');
    const parsed = JSON.parse(raw) as WalletMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveWalletMeta(meta: WalletMeta): void {
  ensureWalletDir();
  fs.writeFileSync(metaPath(), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

export function decodeTronPrivateKeyHex(raw: string): Uint8Array {
  const normalized = raw.trim().replace(/^0x/i, '');
  if (normalized.length !== 64 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error('INVALID_TRON_PRIVATE_KEY_FORMAT');
  }
  return Uint8Array.from(Buffer.from(normalized, 'hex'));
}

export async function deriveTronAddressFromPrivateKey(privateKeyHex: string): Promise<string> {
  const bytes = decodeTronPrivateKeyHex(privateKeyHex);
  const signer = new TronSigner(bytes, TRON_NETWORK);
  return signer.getAddress();
}

export type ValidateTronKeyResult = {
  ok: boolean;
  errorCode?: 'FORMAT' | 'NOT_TRON' | 'MISMATCH' | 'NO_API_KEY';
  derivedAddress?: string;
  /** When true, BANK OF AI did not return a linked address — binding is not enforced */
  bindingSkipped?: boolean;
};

export async function validateTronPrivateKeyForBankOfAi(
  privateKeyHex: string,
  bankOfAiAccountId: string,
): Promise<ValidateTronKeyResult> {
  let derivedAddress: string;
  try {
    derivedAddress = await deriveTronAddressFromPrivateKey(privateKeyHex);
  } catch {
    return { ok: false, errorCode: 'FORMAT' };
  }

  if (!derivedAddress.startsWith('T')) {
    return { ok: false, errorCode: 'NOT_TRON', derivedAddress };
  }

  const apiKey = await getApiKey(bankOfAiAccountId);
  if (!apiKey) {
    return { ok: false, errorCode: 'NO_API_KEY' };
  }

  const account = await getProviderAccount(bankOfAiAccountId);
  const baseUrl = (account?.baseUrl?.trim() || 'https://api.bankofai.io/v1').replace(/\/$/, '');

  const expected = await fetchBankOfAiLinkedTronAddress(apiKey, baseUrl);
  if (!expected) {
    return { ok: true, derivedAddress, bindingSkipped: true };
  }

  if (expected !== derivedAddress) {
    return { ok: false, errorCode: 'MISMATCH', derivedAddress };
  }

  return { ok: true, derivedAddress, bindingSkipped: false };
}

export interface AgentWalletListItem {
  id: string;
  address: string;
  network: string;
  isActive: boolean;
  label?: string;
}

async function resolveWalletAddress(
  provider: ConfigWalletProvider,
  id: string,
): Promise<{ address: string; network: string } | null> {
  try {
    const wallet = await provider.getWallet(id, TRON_NETWORK);
    const address = await wallet.getAddress();
    return { address, network: TRON_NETWORK };
  } catch {
    try {
      const wallet = await provider.getWallet(id, LEGACY_EVM_NETWORK);
      const address = await wallet.getAddress();
      return { address, network: LEGACY_EVM_NETWORK };
    } catch (err) {
      console.warn(`[agent-wallet] Failed to load wallet ${id}:`, err);
      return null;
    }
  }
}

export async function listAgentWallets(): Promise<AgentWalletListItem[]> {
  if (!fs.existsSync(walletsConfigPath())) {
    return [];
  }

  ensureKvInitialized();
  const provider = getProvider();
  const meta = loadWalletMeta();
  const rows = provider.listWallets();
  const out: AgentWalletListItem[] = [];

  for (const [id, , isActive] of rows) {
    const resolved = await resolveWalletAddress(provider, id);
    if (!resolved) continue;
    out.push({
      id,
      address: resolved.address,
      network: resolved.network,
      isActive,
      label: meta[id]?.label,
    });
  }

  return out;
}

export interface CreateTronAgentWalletInput {
  privateKeyHex: string;
  masterPassword: string;
  bankOfAiAccountId: string;
}

export async function createAgentWalletFromTronImport(
  input: CreateTronAgentWalletInput,
): Promise<AgentWalletListItem> {
  if (!isStrongMasterPassword(input.masterPassword)) {
    throw new Error('WEAK_MASTER_PASSWORD');
  }

  const validation = await validateTronPrivateKeyForBankOfAi(
    input.privateKeyHex,
    input.bankOfAiAccountId,
  );
  if (!validation.ok) {
    throw new Error(`VALIDATION_${validation.errorCode ?? 'FORMAT'}`);
  }
  if (!validation.derivedAddress) {
    throw new Error('VALIDATION_FORMAT');
  }

  const walletRoot = getWalletRoot();
  const hasPwdFile =
    fs.existsSync(path.join(walletRoot, KV_PWD_FILE))
    || fs.existsSync(path.join(walletRoot, KV_PWD_PLAIN_FILE));

  if (!hasPwdFile) {
    persistUserMasterPassword(input.masterPassword);
  } else {
    try {
      const kvCheck = new SecureKVStore(walletRoot, input.masterPassword);
      kvCheck.verifyPassword();
    } catch {
      throw new Error('MASTER_PASSWORD_INCORRECT');
    }
  }

  ensureKvInitialized();

  const provider = getProvider();
  if (provider.listWallets().length > 0) {
    throw new Error('WALLET_ALREADY_EXISTS');
  }

  const walletId = `aw_${randomUUID().replace(/-/g, '')}`;
  const password = readKvPassword();
  const kv = new SecureKVStore(walletRoot, password);
  const pkBytes = decodeTronPrivateKeyHex(input.privateKeyHex);
  kv.saveSecret(walletId, pkBytes);

  provider.ensureStorage();
  provider.addWallet(
    walletId,
    { type: 'local_secure', params: { secret_ref: walletId } },
    { setActiveIfMissing: true },
  );

  const wallet = await provider.getWallet(walletId, TRON_NETWORK);
  const address = await wallet.getAddress();

  return {
    id: walletId,
    address,
    network: TRON_NETWORK,
    isActive: provider.getActiveId() === walletId,
  };
}

export async function deleteAgentWallet(walletId: string): Promise<void> {
  if (!fs.existsSync(walletsConfigPath())) {
    return;
  }
  ensureKvInitialized();
  const provider = getProvider();
  provider.removeWallet(walletId);

  const meta = loadWalletMeta();
  if (meta[walletId]) {
    delete meta[walletId];
    saveWalletMeta(meta);
  }
}

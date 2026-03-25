/**
 * Web3 / AgentWallet settings — horizontal card layout (Host API).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Shield, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { hostApiFetch } from '@/lib/host-api';
import { toUserMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { trackUiEvent } from '@/lib/telemetry';
import { useProviderStore } from '@/stores/providers';
import { hasConfiguredCredentials, pickPreferredAccount } from '@/lib/provider-accounts';
import { CreateAgentWalletWizard } from './CreateAgentWalletWizard';

type AgentWalletRow = {
  id: string;
  address: string;
  network: string;
  isActive: boolean;
  label?: string;
};

export function Web3Settings() {
  const { t } = useTranslation('settings');
  const accounts = useProviderStore((s) => s.accounts);
  const statuses = useProviderStore((s) => s.statuses);
  const defaultAccountId = useProviderStore((s) => s.defaultAccountId);
  const providersLoading = useProviderStore((s) => s.loading);
  const refreshProviderSnapshot = useProviderStore((s) => s.refreshProviderSnapshot);

  const [wallets, setWallets] = useState<AgentWalletRow[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [providersReady, setProvidersReady] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentWalletRow | null>(null);

  const statusById = useMemo(
    () => new Map(statuses.map((s) => [s.id, s])),
    [statuses],
  );

  const bankOfAiAccount = useMemo(
    () => pickPreferredAccount(accounts, defaultAccountId, 'bankofai', statusById),
    [accounts, defaultAccountId, statusById],
  );

  const bankOfAiAccountId = bankOfAiAccount?.id ?? '';

  const hasBankOfAiKey = useMemo(
    () =>
      accounts.some(
        (a) => a.vendorId === 'bankofai' && hasConfiguredCredentials(a, statusById.get(a.id)),
      ),
    [accounts, statusById],
  );

  const displayWallet = useMemo(() => {
    if (wallets.length === 0) return null;
    return wallets.find((w) => w.isActive) ?? wallets[0];
  }, [wallets]);

  const refreshWallets = useCallback(async () => {
    try {
      const data = await hostApiFetch<{ success: boolean; wallets?: AgentWalletRow[] }>(
        '/api/agent-wallets',
      );
      setWallets(data.wallets ?? []);
    } catch (error) {
      toast.error(`${t('web3.loadFailed')}: ${toUserMessage(error)}`);
      setWallets([]);
    } finally {
      setWalletsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    void refreshProviderSnapshot().finally(() => {
      if (!cancelled) setProvidersReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshProviderSnapshot]);

  useEffect(() => {
    void refreshWallets();
  }, [refreshWallets]);

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success(t('web3.copied'));
    } catch (error) {
      toast.error(String(error));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await hostApiFetch(`/api/agent-wallets/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      toast.success(t('web3.deleteSuccess'));
      trackUiEvent('settings.agent_wallet_deleted');
      setDeleteTarget(null);
      await refreshWallets();
    } catch (error) {
      toast.error(`${t('web3.deleteFailed')}: ${toUserMessage(error)}`);
    }
  };

  const loading = walletsLoading || providersLoading || !providersReady;
  const canOpenWizard = providersReady && hasBankOfAiKey && Boolean(bankOfAiAccountId) && !walletsLoading;

  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground tracking-tight mb-4">
        {t('web3.sectionTitle')}
      </h2>

      <div
        className={cn(
          'rounded-2xl border border-black/[0.08] dark:border-white/[0.1]',
          'bg-white dark:bg-card shadow-sm',
          'flex flex-col gap-4 px-5 py-4 sm:px-6 sm:flex-row sm:items-center',
        )}
      >
        <div className="flex items-center gap-4 min-w-0 sm:flex-1">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] dark:bg-white/[0.06]">
          <Wallet className="h-6 w-6 text-foreground" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-foreground leading-tight">
            {t('web3.agentWalletTitle')}
          </p>
          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              {t('common:status.loading')}
            </div>
          ) : !displayWallet ? (
            <p className="mt-1 text-[13px] text-muted-foreground">{t('web3.notCreatedSubtitle')}</p>
          ) : (
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <span className="text-[13px] font-mono text-muted-foreground truncate">
                {displayWallet.address}
              </span>
              <button
                type="button"
                onClick={() => void copyAddress(displayWallet.address)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                aria-label={t('web3.copyAddress')}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        </div>

        <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2 sm:pl-2">
          {!displayWallet && !loading ? (
            <Button
              type="button"
              onClick={() => setShowWizard(true)}
              disabled={!canOpenWizard}
              className={cn(
                'rounded-full h-10 px-5 gap-2 font-medium shadow-sm',
                'bg-[#0a84ff] hover:bg-[#007aff] text-white',
                'disabled:opacity-50 disabled:pointer-events-none',
              )}
            >
              <Shield className="h-4 w-4 text-white" strokeWidth={2} />
              {t('web3.createWallet')}
            </Button>
          ) : null}

          {displayWallet && !loading ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteTarget(displayWallet)}
              className="rounded-full h-10 px-5 gap-2 font-medium shadow-sm"
            >
              <Shield className="h-4 w-4" strokeWidth={2} />
              {t('web3.deleteWallet')}
            </Button>
          ) : null}
        </div>
      </div>

      {providersReady && !displayWallet && !walletsLoading && !hasBankOfAiKey ? (
        <p className="mt-2 text-right text-[13px] text-red-600 dark:text-red-500 leading-snug max-w-full sm:ml-[25%]">
          {t('web3.bankOfAiKeyWarning')}
        </p>
      ) : null}

      {showWizard && bankOfAiAccountId ? (
        <CreateAgentWalletWizard
          open={showWizard}
          bankOfAiAccountId={bankOfAiAccountId}
          onClose={() => setShowWizard(false)}
          onSuccess={refreshWallets}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('web3.deleteConfirmTitle')}
        message={deleteTarget ? t('web3.deleteConfirmMessage', { id: deleteTarget.id }) : ''}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

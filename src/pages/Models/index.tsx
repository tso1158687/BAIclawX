import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ProvidersSettings } from '@/components/settings/ProvidersSettings';
import { trackUiEvent } from '@/lib/telemetry';

export function Models() {
  const { t } = useTranslation(['dashboard', 'settings']);

  useEffect(() => {
    trackUiEvent('models.page_viewed');
  }, []);

  return (
    <div className="flex flex-col -m-6 dark:bg-background h-[calc(100vh-2.5rem)] overflow-hidden">
      <div className="w-full max-w-5xl mx-auto flex flex-col h-full p-10 pt-16">
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-12 shrink-0 gap-4">
          <div>
            <h1
              className="text-5xl md:text-6xl font-serif text-foreground mb-3 font-normal tracking-tight"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {t('dashboard:models.title')}
            </h1>
            <p className="text-[17px] text-foreground/70 font-medium">
              {t('dashboard:models.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0 -mr-2">
          <ProvidersSettings />
        </div>
      </div>
    </div>
  );
}

export default Models;

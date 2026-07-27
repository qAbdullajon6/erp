import { createFileRoute } from '@tanstack/react-router';
import { SettingsView } from '@/components/platform/settings-view';

export const Route = createFileRoute('/platform/settings/')({
  head: () => ({ meta: [{ title: 'Settings — Platform Console' }] }),
  component: PlatformSettingsPage,
});

function PlatformSettingsPage() {
  return <SettingsView />;
}

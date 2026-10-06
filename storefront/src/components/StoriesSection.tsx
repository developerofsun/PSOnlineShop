import { apiGet } from '@/lib/api';
import type { StoryGroup } from '@/lib/types';
import StoriesBar from './StoriesBar';

/** Server wrapper: fetches the active story groups and renders nothing when there are none. */
export default async function StoriesSection({ locale }: { locale: string }) {
  const groups = await apiGet<StoryGroup[]>(`/api/content/stories?lang=${locale}`, 30);
  if (!groups || groups.length === 0) return null;
  return <StoriesBar groups={groups} />;
}

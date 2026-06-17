import { getNotificationFeed, type NotificationFeed } from '@arther/db';
import { ShellTopBar } from '../../components/ShellTopBar';
import { getSupabaseServer } from '../../lib/supabase/server';

/**
 * The shell frame: persistent top bar + the mode's region layout below
 * (Handoff 02 §1). Only the content area inside each mode scrolls. The top bar
 * carries the C3.4 notification centre, fed here from the signed-in member's feed.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  let feed: NotificationFeed = { items: [], unreadCount: 0 };
  const supabase = await getSupabaseServer();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      try {
        feed = await getNotificationFeed(supabase);
      } catch {
        // a transient feed read never blocks the shell
      }
    }
  }

  return (
    <div className="ui-app">
      <ShellTopBar notifications={feed.items} unreadCount={feed.unreadCount} />
      {children}
    </div>
  );
}

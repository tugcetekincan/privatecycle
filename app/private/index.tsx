import PrivateGate from '@/components/PrivateGate';
import PrivateCalendar from '@/components/PrivateCalendar';

/**
 * Private intimacy calendar. The route lives outside the tab navigator so
 * there is no tab-bar entry; the gate always renders first and only mounts the
 * calendar after the PIN is verified.
 */
export default function PrivateRoute() {
  return (
    <PrivateGate>
      <PrivateCalendar />
    </PrivateGate>
  );
}

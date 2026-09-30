import type { ReactNode } from 'react';
import { Modal, Platform } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

/**
 * A layer above everything, including the full player, queue and lyrics screens.
 *
 * On iOS this is a FullWindowOverlay: a view added straight to the window, so no view
 * controller is presented. RN's Modal presents one from the root controller, which is
 * already presenting the player while it's open; that left an invisible layer that ate
 * every touch until the app was restarted. Elsewhere a transparent Modal does the job.
 *
 * Mount it only while something is showing: each mount goes on top of whatever the window
 * holds at that moment.
 */
export function TopLayer({ children, onRequestClose }: { children: ReactNode; onRequestClose?: () => void }) {
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay unstable_accessibilityContainerViewIsModal={!!onRequestClose}>{children}</FullWindowOverlay>;
  }
  if (!onRequestClose) return children;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

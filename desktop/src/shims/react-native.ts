// The one piece of react-native the shared code the desktop uses asks for: AppState ("the app
// came back to the front"), answered from the window's visibility (hidden in the tray =
// background).
type AppStateStatus = 'active' | 'background';
type Listener = (state: AppStateStatus) => void;

const status = (): AppStateStatus => (document.visibilityState === 'visible' ? 'active' : 'background');

export const AppState = {
  get currentState(): AppStateStatus {
    return status();
  },
  addEventListener(_type: 'change', listener: Listener) {
    const on = () => listener(status());
    document.addEventListener('visibilitychange', on);
    return { remove: () => document.removeEventListener('visibilitychange', on) };
  },
};

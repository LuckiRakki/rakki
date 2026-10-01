// The phone's connection (Wi-Fi, cellular, none) for anything that needs to react to it:
// downloads wait for Wi-Fi unless allowed on cellular.
import * as Network from 'expo-network';
import { create } from 'zustand';

export const useNetwork = create<{ connected: boolean; cellular: boolean }>(() => ({
  connected: true,
  cellular: false,
}));

function apply(state: Network.NetworkState) {
  useNetwork.setState({
    connected: state.isConnected !== false,
    cellular: state.type === Network.NetworkStateType.CELLULAR,
  });
}

void Network.getNetworkStateAsync()
  .then(apply)
  .catch(() => {});

try {
  Network.addNetworkStateListener(apply);
} catch {
  // Not available on this platform (web preview).
}

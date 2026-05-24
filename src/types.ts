export type BridgeStatus = 'stopped' | 'connecting' | 'playing' | 'paused' | 'error';

export interface StationData {
  slug: string | null;
  kind: 'station' | 'media' | null;
  streamUrl: string | null;
  name: string | null;
  image: string | null;
  host: string | null;
  description?: string | null;
  online: boolean | null;
  listeners: number | null;
  fetchedAt: string | null;
  apiReachable: boolean;
}

export interface AudioState {
  percent: number | null;
  muted: boolean | null;
  error: string | null;
}

export interface AppStatus {
  bridge: { status: BridgeStatus; errorMessage: string | null; streamUrl: string | null };
  station: StationData;
  audio: AudioState;
  active: string;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'plant-pal-care-v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHECK_INTERVAL_DAYS = 7;
const DAMP_SOIL_RECHECK_DAYS = 2;

interface PlantCareState {
  lastWateredAt: number;
  lastSoilCheckAt: number | null;
  sensorHost: string;
  sensorConnected: boolean;
  moisturePercent: number | null;
  lastReadingAt: number | null;
}

interface PlantCareContextValue extends PlantCareState {
  isReady: boolean;
  nextCheckAt: number;
  setSensorHost: (host: string) => void;
  connectSensor: (host: string) => Promise<number>;
  refreshSensor: () => Promise<number>;
  disconnectSensor: () => void;
  logWatering: () => void;
  logSoilCheck: () => void;
}

const PlantCareContext = createContext<PlantCareContextValue | null>(null);

function makeInitialState(): PlantCareState {
  return {
    lastWateredAt: Date.now() - DEFAULT_CHECK_INTERVAL_DAYS * DAY_MS,
    lastSoilCheckAt: null,
    sensorHost: '',
    sensorConnected: false,
    moisturePercent: null,
    lastReadingAt: null,
  };
}

function getNextCheckAt(state: PlantCareState): number {
  if (state.lastSoilCheckAt && state.lastSoilCheckAt > state.lastWateredAt) {
    return state.lastSoilCheckAt + DAMP_SOIL_RECHECK_DAYS * DAY_MS;
  }
  return state.lastWateredAt + DEFAULT_CHECK_INTERVAL_DAYS * DAY_MS;
}

function normalizeHost(value: string): string {
  const host = value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    throw new Error('Enter the board’s local IP address, such as 192.168.1.42.');
  }
  return host;
}

export function PlantCareProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlantCareState>(makeInitialState);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted || !stored) return;
        const parsed = JSON.parse(stored) as Partial<PlantCareState>;
        if (
          typeof parsed.lastWateredAt === 'number' &&
          Number.isFinite(parsed.lastWateredAt)
        ) {
          setData({
            ...makeInitialState(),
            ...parsed,
            sensorConnected: false,
          });
        }
      })
      .catch(() => {
        // Continue with a fresh local care schedule if saved state is unreadable.
      })
      .finally(() => {
        if (mounted) setIsReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {
      // Plant care remains usable for this session if local persistence fails.
    });
  }, [data, isReady]);

  const setSensorHost = (host: string) => {
    setData((previous) => ({ ...previous, sensorHost: host }));
  };

  const connectSensor = async (host: string): Promise<number> => {
    const normalizedHost = normalizeHost(host);
    setData((previous) => ({ ...previous, sensorHost: normalizedHost }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`http://${normalizedHost}/api/status`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`The board replied with status ${response.status}.`);
      }

      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) {
        throw new Error('The board returned an unreadable response.');
      }
      const payload = body as {
        moisturePercent?: unknown;
        moisture?: unknown;
      };
      const rawMoisture = payload.moisturePercent ?? payload.moisture;
      const moisture = Number(rawMoisture);
      if (!Number.isFinite(moisture) || moisture < 0 || moisture > 100) {
        throw new Error(
          'No moisture percentage found. The board should return moisturePercent from 0 to 100.',
        );
      }

      setData((previous) => ({
        ...previous,
        sensorHost: normalizedHost,
        sensorConnected: true,
        moisturePercent: Math.round(moisture),
        lastReadingAt: Date.now(),
      }));
      return Math.round(moisture);
    } catch (error) {
      setData((previous) => ({
        ...previous,
        sensorHost: normalizedHost,
        sensorConnected: false,
      }));
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('No reply after 7 seconds. Check the board and Wi-Fi.');
      }
      if (error instanceof TypeError) {
        throw new Error(
          'Could not reach the board. Check that your phone and ESP32 are on the same Wi-Fi.',
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const refreshSensor = () => connectSensor(data.sensorHost);

  const disconnectSensor = () => {
    setData((previous) => ({ ...previous, sensorConnected: false }));
  };

  const logWatering = () => {
    setData((previous) => ({
      ...previous,
      lastWateredAt: Date.now(),
      lastSoilCheckAt: null,
    }));
  };

  const logSoilCheck = () => {
    setData((previous) => ({ ...previous, lastSoilCheckAt: Date.now() }));
  };

  const nextCheckAt = getNextCheckAt(data);
  const value = useMemo(
    () => ({
      ...data,
      isReady,
      nextCheckAt,
      setSensorHost,
      connectSensor,
      refreshSensor,
      disconnectSensor,
      logWatering,
      logSoilCheck,
    }),
    [data, isReady, nextCheckAt],
  );

  return (
    <PlantCareContext.Provider value={value}>
      {children}
    </PlantCareContext.Provider>
  );
}

export function usePlantCare() {
  const context = useContext(PlantCareContext);
  if (!context) {
    throw new Error('usePlantCare must be used within PlantCareProvider');
  }
  return context;
}

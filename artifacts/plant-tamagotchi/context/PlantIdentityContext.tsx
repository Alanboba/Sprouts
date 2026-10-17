import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'plant-pal-identity-v1';

export interface PlantIdentity {
  commonName: string;
  scientificName: string;
  confidence: number | null;
  confirmedAt: number;
}

interface PlantIdentityContextValue {
  identity: PlantIdentity | null;
  isReady: boolean;
  error: string | null;
  saveIdentity: (identity: Omit<PlantIdentity, 'confirmedAt'>) => Promise<void>;
}

const PlantIdentityContext = createContext<PlantIdentityContextValue | null>(null);

function isPlantIdentity(value: unknown): value is PlantIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.commonName === 'string' &&
    typeof entry.scientificName === 'string' &&
    (entry.confidence === null ||
      (typeof entry.confidence === 'number' &&
        Number.isFinite(entry.confidence) &&
        entry.confidence >= 0 &&
        entry.confidence <= 1)) &&
    typeof entry.confirmedAt === 'number' &&
    Number.isFinite(entry.confirmedAt)
  );
}

export function PlantIdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<PlantIdentity | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted || !stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (!isPlantIdentity(parsed)) {
          throw new Error('Saved plant identification is invalid.');
        }
        setIdentity(parsed);
      })
      .catch(() => {
        if (mounted) {
          setError("Saved plant details couldn't be loaded. Try restarting the app.");
        }
      })
      .finally(() => {
        if (mounted) setIsReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const saveIdentity = useCallback(
    async (entry: Omit<PlantIdentity, 'confirmedAt'>) => {
      const commonName = entry.commonName.trim().slice(0, 100);
      const scientificName = entry.scientificName.trim().slice(0, 120);
      if (!commonName) throw new Error('Enter a common plant name before saving.');
      const next: PlantIdentity = {
        commonName,
        scientificName,
        confidence:
          typeof entry.confidence === 'number' &&
          Number.isFinite(entry.confidence) &&
          entry.confidence >= 0 &&
          entry.confidence <= 1
            ? entry.confidence
            : null,
        confirmedAt: Date.now(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setIdentity(next);
      setError(null);
    },
    [],
  );

  const value = useMemo(
    () => ({ identity, isReady, error, saveIdentity }),
    [identity, isReady, error, saveIdentity],
  );

  return (
    <PlantIdentityContext.Provider value={value}>
      {children}
    </PlantIdentityContext.Provider>
  );
}

export function usePlantIdentity() {
  const context = useContext(PlantIdentityContext);
  if (!context) {
    throw new Error('usePlantIdentity must be used within PlantIdentityProvider');
  }
  return context;
}

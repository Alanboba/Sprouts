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
import { DAY_MS, DEFAULT_CHECK_INTERVAL_DAYS } from './plant-care-schedule';

const STORAGE_KEY = 'plant-pal-profiles-v1';
const LEGACY_IDENTITY_KEY = 'plant-pal-identity-v1';
const LEGACY_CARE_KEY = 'plant-pal-care-v1';
const FIRST_PLANT_ID = 'plant-default';

export interface PlantIdentity {
  commonName: string;
  scientificName: string;
  confidence: number | null;
  confirmedAt: number;
}

export interface PlantProfile extends PlantIdentity {
  id: string;
  lastWateredAt: number | null;
  lastSoilCheckAt: number | null;
}

interface PlantProfilesData {
  plants: PlantProfile[];
  activePlantId: string;
}

interface PlantIdentityContextValue {
  identity: PlantProfile | null;
  plants: PlantProfile[];
  isReady: boolean;
  error: string | null;
  saveIdentity: (identity: Omit<PlantIdentity, 'confirmedAt'>) => Promise<void>;
  addPlant: (identity: Pick<PlantIdentity, 'commonName' | 'scientificName'>) => Promise<void>;
  selectPlant: (plantId: string) => Promise<void>;
  logWatering: () => Promise<void>;
  logSoilCheck: () => Promise<void>;
}

const PlantIdentityContext = createContext<PlantIdentityContextValue | null>(null);

function isPlantProfile(value: unknown): value is PlantProfile {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.commonName === 'string' &&
    typeof entry.scientificName === 'string' &&
    (entry.confidence === null ||
      (typeof entry.confidence === 'number' &&
        Number.isFinite(entry.confidence) &&
        entry.confidence >= 0 &&
        entry.confidence <= 1)) &&
    typeof entry.confirmedAt === 'number' &&
    Number.isFinite(entry.confirmedAt) &&
    (entry.lastWateredAt === null ||
      (typeof entry.lastWateredAt === 'number' &&
        Number.isFinite(entry.lastWateredAt))) &&
    (entry.lastSoilCheckAt === null ||
      (typeof entry.lastSoilCheckAt === 'number' &&
        Number.isFinite(entry.lastSoilCheckAt)))
  );
}

function readProfileData(value: unknown): PlantProfilesData | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (
    !Array.isArray(entry.plants) ||
    entry.plants.length === 0 ||
    !entry.plants.every(isPlantProfile) ||
    typeof entry.activePlantId !== 'string'
  ) {
    return null;
  }
  const plants = entry.plants as PlantProfile[];
  if (!plants.some((plant) => plant.id === entry.activePlantId)) return null;
  return { plants, activePlantId: entry.activePlantId };
}

function readLegacyObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function makeFirstProfile(
  identityData: Record<string, unknown>,
  careData: Record<string, unknown>,
): PlantProfile {
  const commonName =
    typeof identityData.commonName === 'string' && identityData.commonName.trim()
      ? identityData.commonName.trim().slice(0, 100)
      : 'Pothos';
  const scientificName =
    typeof identityData.scientificName === 'string'
      ? identityData.scientificName.trim().slice(0, 120)
      : '';
  const confidence =
    typeof identityData.confidence === 'number' &&
    Number.isFinite(identityData.confidence) &&
    identityData.confidence >= 0 &&
    identityData.confidence <= 1
      ? identityData.confidence
      : null;

  return {
    id: FIRST_PLANT_ID,
    commonName,
    scientificName,
    confidence,
    confirmedAt:
      typeof identityData.confirmedAt === 'number' &&
      Number.isFinite(identityData.confirmedAt)
        ? identityData.confirmedAt
        : 0,
    lastWateredAt:
      typeof careData.lastWateredAt === 'number' &&
      Number.isFinite(careData.lastWateredAt)
        ? careData.lastWateredAt
        : Date.now() - DEFAULT_CHECK_INTERVAL_DAYS * DAY_MS,
    lastSoilCheckAt:
      typeof careData.lastSoilCheckAt === 'number' &&
      Number.isFinite(careData.lastSoilCheckAt)
        ? careData.lastSoilCheckAt
        : null,
  };
}

export function PlantIdentityProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlantProfilesData>({
    plants: [],
    activePlantId: '',
  });
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (stored) => {
        if (!mounted) return;
        if (stored) {
          let saved: PlantProfilesData | null = null;
          try {
            saved = readProfileData(JSON.parse(stored) as unknown);
          } catch {
            saved = null;
          }
          if (saved) {
            setData(saved);
            return;
          }
          setError('Plant profiles could not be read. Your original plant was restored.');
        }

        const [legacyIdentity, legacyCare] = await Promise.all([
          AsyncStorage.getItem(LEGACY_IDENTITY_KEY),
          AsyncStorage.getItem(LEGACY_CARE_KEY),
        ]);
        const initial: PlantProfilesData = {
          plants: [
            makeFirstProfile(
              readLegacyObject(legacyIdentity),
              readLegacyObject(legacyCare),
            ),
          ],
          activePlantId: FIRST_PLANT_ID,
        };
        setData(initial);
        try {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        } catch {
          setError('Plant profiles could not be saved on this device.');
        }
      })
      .catch(() => {
        if (mounted) {
          setError('Plant profiles could not be loaded. Try restarting the app.');
        }
      })
      .finally(() => {
        if (mounted) setIsReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (next: PlantProfilesData) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setData(next);
    setError(null);
  }, []);

  const saveIdentity = useCallback(
    async (entry: Omit<PlantIdentity, 'confirmedAt'>) => {
      const active = data.plants.find((plant) => plant.id === data.activePlantId);
      if (!active) throw new Error('Choose a plant before saving its name.');
      const commonName = entry.commonName.trim().slice(0, 100);
      const scientificName = entry.scientificName.trim().slice(0, 120);
      if (!commonName) throw new Error('Enter a common plant name before saving.');
      const next: PlantProfilesData = {
        ...data,
        plants: data.plants.map((plant) =>
          plant.id === active.id
            ? {
                ...plant,
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
              }
            : plant,
        ),
      };
      await persist(next);
    },
    [data, persist],
  );

  const addPlant = useCallback(
    async (entry: Pick<PlantIdentity, 'commonName' | 'scientificName'>) => {
      const commonName = entry.commonName.trim().slice(0, 100);
      if (!commonName) throw new Error('Enter a common plant name first.');
      const id = `plant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const nextPlant: PlantProfile = {
        id,
        commonName,
        scientificName: entry.scientificName.trim().slice(0, 120),
        confidence: null,
        confirmedAt: Date.now(),
        lastWateredAt: null,
        lastSoilCheckAt: null,
      };
      await persist({
        plants: [...data.plants, nextPlant],
        activePlantId: id,
      });
    },
    [data.plants, persist],
  );

  const selectPlant = useCallback(
    async (plantId: string) => {
      if (!data.plants.some((plant) => plant.id === plantId)) {
        throw new Error('That plant could not be found.');
      }
      if (data.activePlantId === plantId) return;
      await persist({ ...data, activePlantId: plantId });
    },
    [data, persist],
  );

  const updateActivePlant = useCallback(
    async (update: (plant: PlantProfile) => PlantProfile) => {
      const active = data.plants.find((plant) => plant.id === data.activePlantId);
      if (!active) throw new Error('Choose a plant first.');
      await persist({
        ...data,
        plants: data.plants.map((plant) =>
          plant.id === active.id ? update(plant) : plant,
        ),
      });
    },
    [data, persist],
  );

  const logWatering = useCallback(
    () =>
      updateActivePlant((plant) => ({
        ...plant,
        lastWateredAt: Date.now(),
        lastSoilCheckAt: null,
      })),
    [updateActivePlant],
  );

  const logSoilCheck = useCallback(
    () =>
      updateActivePlant((plant) => ({ ...plant, lastSoilCheckAt: Date.now() })),
    [updateActivePlant],
  );

  const identity =
    data.plants.find((plant) => plant.id === data.activePlantId) ??
    data.plants[0] ??
    null;
  const value = useMemo(
    () => ({
      identity,
      plants: data.plants,
      isReady,
      error,
      saveIdentity,
      addPlant,
      selectPlant,
      logWatering,
      logSoilCheck,
    }),
    [
      identity,
      data.plants,
      isReady,
      error,
      saveIdentity,
      addPlant,
      selectPlant,
      logWatering,
      logSoilCheck,
    ],
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

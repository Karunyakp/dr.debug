import React, { useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { Compass, ExternalLink, MapPin, Navigation, ShieldAlert } from 'lucide-react';
import type { EmergencyReferral, HospitalFacility } from '../types/kairos';

interface HospitalMarkerProps {
  hospital: HospitalFacility;
  selected: boolean;
  onSelect: (h: HospitalFacility) => void;
}

const HospitalAdvancedMarker: React.FC<HospitalMarkerProps> = ({
  hospital,
  selected,
  onSelect,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const pinColor = !hospital.acceptingEmergencies || hospital.icuAvailable === 0
    ? '#DC2626'
    : '#119655';
  const borderColor = !hospital.acceptingEmergencies || hospital.icuAvailable === 0
    ? '#991B1B'
    : '#0B3B2D';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: hospital.lat, lng: hospital.lng }}
        title={hospital.name}
        onClick={() => onSelect(hospital)}
      >
        <Pin background={pinColor} borderColor={borderColor} glyphColor="#FFFFFF" />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={() => onSelect(hospital)}>
          <div className="p-1 text-left">
            <p className="font-semibold text-sm text-[#0B3B2D]">{hospital.name}</p>
            <p className="text-xs text-slate-600 mt-0.5">{hospital.area}</p>
            <p className="text-xs font-mono tabular-nums mt-1.5 text-slate-800">
              ICU: {hospital.icuAvailable}/{hospital.icuTotal} · Gen: {hospital.generalAvailable}/{hospital.generalTotal}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {hospital.acceptingEmergencies ? 'Accepting Emergency Referrals' : 'Emergency Diversion Active'}
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface MapPanelProps {
  hospitals: HospitalFacility[];
  activeReferral?: EmergencyReferral | null;
  selectedHospitalId?: string;
  onSelectHospital?: (hospitalId: string) => void;
  title?: string;
  heightClass?: string;
}

export const MapPanel: React.FC<MapPanelProps> = ({
  hospitals,
  activeReferral,
  selectedHospitalId,
  onSelectHospital,
  title = 'Hospital & Transfer Corridor Map',
  heightClass = 'h-[340px]',
}) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [quotaReached, setQuotaReached] = useState(false);
  const [focusedHospital, setFocusedHospital] = useState<HospitalFacility | null>(
    () => hospitals.find((h) => h.hospitalId === selectedHospitalId) ?? hospitals[0] ?? null
  );

  useEffect(() => {
    if (selectedHospitalId) {
      const match = hospitals.find((h) => h.hospitalId === selectedHospitalId);
      if (match) setFocusedHospital(match);
    }
  }, [hospitals, selectedHospitalId]);

  useEffect(() => {
    if (!apiKey) {
      fetch('/api/maps/config')
        .then((r) => r.json())
        .then((data: { hasMapsKey?: boolean; mapsApiKey?: string }) => {
          if (data.hasMapsKey && data.mapsApiKey) {
            setApiKey(data.mapsApiKey);
          }
        })
        .catch(() => {
          // Keep clean fallback view
        });
    }
  }, [apiKey]);

  useEffect(() => {
    const onQuota = () => setQuotaReached(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const center = focusedHospital
    ? { lat: focusedHospital.lat, lng: focusedHospital.lng }
    : { lat: 12.9716, lng: 77.69 };

  const directionsUrl = focusedHospital
    ? `https://www.google.com/maps/dir/?api=1&destination=${focusedHospital.lat},${focusedHospital.lng}`
    : 'https://www.google.com/maps';

  const canRenderLiveGoogleMap = Boolean(apiKey && !quotaReached);

  return (
    <div className="bg-kairos-surface border border-kairos-border rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-kairos-border-subtle flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-kairos-forest-ink">{title}</h3>
          <p className="text-xs text-kairos-muted">
            Facility locator &amp; transfer overview (follow local emergency protocols)
          </p>
        </div>
        {focusedHospital && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-kairos-emerald-ink hover:text-kairos-forest-ink whitespace-nowrap shrink-0"
          >
            <Navigation className="w-3.5 h-3.5" />
            Open Directions
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className={`relative w-full ${heightClass} bg-kairos-mint-soft`}>
        {canRenderLiveGoogleMap ? (
          <APIProvider apiKey={apiKey} libraries={['marker']} language="en" region="IN">
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultZoom={11}
              defaultCenter={center}
              gestureHandling="greedy"
              disableDefaultUI={false}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              {hospitals.map((h) => (
                <HospitalAdvancedMarker
                  key={h.hospitalId}
                  hospital={h}
                  selected={focusedHospital?.hospitalId === h.hospitalId}
                  onSelect={(hosp) => {
                    setFocusedHospital(hosp);
                    onSelectHospital?.(hosp.hospitalId);
                  }}
                />
              ))}
              {activeReferral?.ambulanceLocation && (
                <AdvancedMarker
                  position={activeReferral.ambulanceLocation}
                  title={activeReferral.ambulanceUnitName || 'Active Ambulance'}
                >
                  <div className="px-2.5 py-1 rounded-lg bg-[#0B3B2D] text-white text-[11px] font-semibold shadow-md border border-[#119655] whitespace-nowrap">
                    {activeReferral.ambulanceUnitName || 'Ambulance'} · {activeReferral.ambulanceEtaMin ?? 4}m
                  </div>
                </AdvancedMarker>
              )}
            </GoogleMap>
          </APIProvider>
        ) : (
          /* Clean interactive Bengaluru Hospital Corridor Map Fallback */
          <div className="w-full h-full relative p-5 flex flex-col justify-between bg-gradient-to-br from-[#EAF5EF] via-[#F4FAF7] to-[#E2F1E9] dark:from-[#081C15] dark:via-[#0B231B] dark:to-[#0F2F24]">
            <svg
              viewBox="0 0 640 280"
              className="absolute inset-0 w-full h-full opacity-50 dark:opacity-35 pointer-events-none"
              aria-hidden="true"
            >
              <path d="M 40 230 Q 190 190 340 140 T 600 60" stroke="#9FC7B3" className="dark:stroke-[#235945]" strokeWidth="3" fill="none" strokeDasharray="6 6" />
              <path d="M 90 40 Q 250 110 420 175 T 590 220" stroke="#C0DDD0" className="dark:stroke-[#1B4636]" strokeWidth="2" fill="none" />
              <circle cx="340" cy="140" r="78" stroke="#CBE3D6" className="dark:stroke-[#1B4636]" strokeWidth="1" fill="none" />
              <circle cx="340" cy="140" r="140" stroke="#D8EAE0" className="dark:stroke-[#163A2C]" strokeWidth="1" fill="none" />
            </svg>

            <div className="relative z-10 flex items-center justify-between text-xs text-kairos-forest-ink/85">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Compass className="w-3.5 h-3.5 text-kairos-emerald-ink" />
                Bengaluru &amp; Rural Corridor · Interactive Facility Map
              </span>
              {quotaReached && (
                <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-medium">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Corridor Fallback Active
                </span>
              )}
            </div>

            <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 my-auto">
              {hospitals.map((h) => {
                const isSelected = focusedHospital?.hospitalId === h.hospitalId;
                const isFull = !h.acceptingEmergencies || h.icuAvailable === 0;
                return (
                  <button
                    key={h.hospitalId}
                    type="button"
                    onClick={() => {
                      setFocusedHospital(h);
                      onSelectHospital?.(h.hospitalId);
                    }}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-kairos-forest text-white border-kairos-forest'
                        : 'bg-kairos-surface/95 text-kairos-forest-ink border-kairos-border hover:border-kairos-emerald'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold truncate">{h.name}</span>
                      <MapPin
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected
                            ? 'text-kairos-gold'
                            : isFull
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-kairos-emerald-ink'
                        }`}
                      />
                    </div>
                    <p
                      className={`text-[11px] mt-1 font-mono tabular-nums ${
                        isSelected ? 'text-emerald-100' : 'text-kairos-muted'
                      }`}
                    >
                      ICU {h.icuAvailable}/{h.icuTotal} · {h.distanceKm} km
                    </p>
                  </button>
                );
              })}
            </div>

            {activeReferral && (
              <div className="relative z-10 bg-kairos-forest text-white rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium">
                  Active Transfer: {activeReferral.ambulanceUnitName || 'Ambulance KA-01'} → {activeReferral.targetHospitalName}
                </span>
                <span className="font-mono tabular-nums text-emerald-200">
                  Stage: {activeReferral.ambulanceStatus.replace('_', ' ')} · ETA {activeReferral.ambulanceEtaMin ?? 4} min
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

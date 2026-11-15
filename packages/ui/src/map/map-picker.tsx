'use client';

import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { loadMapLibre, type MapLibreModule } from './load-maplibre';
import { type LngLat, pickedPoint, POINT_ZOOM, UAE_VIEW } from './map-model';
import { MAP_STYLE_URL } from './tiles';

type MapState = 'loading' | 'ready' | 'error';

/**
 * A point on a map (FR-DAT-03, FR-DAT-04): a click sets the marker and reports the point; the
 * marker follows value, so it moves when the longitude and latitude fields change. The map opens on
 * the point, or on the UAE. The fields beside it are the keyboard way to set a point (NFR-14), and
 * they keep working when the map cannot load: the error state offers Retry.
 *
 * maplibre-gl is loaded only when this component mounts (load-maplibre.ts). The attribution is
 * MapLibre's control, never collapsed (NFR-15).
 */
export function MapPicker({
  value,
  onPick,
  disabled = false,
  label,
}: {
  value: LngLat | null;
  onPick: (point: LngLat) => void;
  disabled?: boolean;
  /** Names the map for screen readers. */
  label: string;
}) {
  const t = useTranslations('map');
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const library = useRef<MapLibreModule | null>(null);
  const [state, setState] = useState<MapState>('loading');
  const [attempt, setAttempt] = useState(0);
  // The map's click handler is set once; these keep it reading the latest props.
  const latest = useRef({ onPick, disabled, value });
  latest.current = { onPick, disabled, value };

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | null = null;
    setState('loading');
    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        library.current = maplibre;
        const start = latest.current.value;
        created = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE_URL,
          ...(start ? { center: [start.lng, start.lat], zoom: POINT_ZOOM } : { bounds: UAE_VIEW }),
          attributionControl: false,
          cooperativeGestures: false,
          dragRotate: false,
        });
        created.touchZoomRotate.disableRotation();
        created.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        created.addControl(new maplibre.AttributionControl({ compact: false }), 'bottom-right');
        let styleLoaded = false;
        created.once('style.load', () => {
          styleLoaded = true;
        });
        created.once('load', () => {
          if (!cancelled) setState('ready');
        });
        // A style that cannot be fetched or read: the map cannot work. A tile that fails later
        // leaves the rest of the map usable, so it is not an error here.
        created.on('error', () => {
          if (!styleLoaded && !cancelled) setState('error');
        });
        created.on('click', (event) => {
          if (latest.current.disabled) return;
          latest.current.onPick(pickedPoint(event.lngLat));
        });
        map.current = created;
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
      marker.current = null;
      map.current = null;
      created?.remove();
    };
  }, [attempt]);

  // The marker follows the value: a click, or the fields.
  useEffect(() => {
    const current = map.current;
    const maplibre = library.current;
    if (state !== 'ready' || !current || !maplibre) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = new maplibre.Marker({ color: '#0b6e4f' })
        .setLngLat([value.lng, value.lat])
        .addTo(current);
    } else {
      marker.current.setLngLat([value.lng, value.lat]);
    }
    if (!current.getBounds().contains([value.lng, value.lat])) {
      current.easeTo({ center: [value.lng, value.lat] });
    }
  }, [value, state]);

  return (
    <div className="reih-map" data-state={state} data-disabled={disabled ? 'true' : undefined}>
      <div
        ref={container}
        className="reih-map-canvas"
        role="group"
        aria-label={label}
        aria-busy={state === 'loading'}
        hidden={state === 'error'}
      />
      {state === 'loading' && (
        <p role="status" className="reih-muted reih-map-note">
          {t('loading')}
        </p>
      )}
      {state === 'ready' && (
        <p className="reih-hint reih-map-note">{disabled ? t('readOnly') : t('clickHint')}</p>
      )}
      {state === 'error' && (
        <div role="alert" className="reih-alert" data-tone="error">
          <p>{t('error')}</p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            {t('retry')}
          </button>
        </div>
      )}
    </div>
  );
}

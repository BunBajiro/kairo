"use client";
import {useCallback, useEffect, useRef, useState} from 'react';
import {Link2, Radio, RefreshCw, Users, SlidersHorizontal} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {useKairo} from './context';
import {setUniverseRequest,takeUniverseRequest} from './universe-requests.mjs';
import {api} from './model';
import {PowerBlocSettings} from './power-bloc-settings';
import {UniverseOperationsSettings} from './universe-operations-settings';
import {MapperPreferencesPanel} from './mapper-preferences-controls';
import {UniverseConnections} from './universe-connections';
import type {UniverseAtlas, UniverseIntel} from './universe-types';
import './universe.css';
import './universe-settings.css';

type SettingsSection = 'connections' | 'power-blocs' | 'sources' | 'mapper';
function initialSection(): SettingsSection {
  try {
    const requested = takeUniverseRequest('kairo-universe-settings-tab');
    if (requested === 'power-blocs' || requested === 'sources' || requested === 'mapper') return requested;
  } catch {}
  return 'connections';
}

/** One home for Universe configuration; tab switches preserve unfinished forms. */
export function UniverseSettings() {
  const {character, boot, navigate} = useKairo();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  // Mount on first visit, then hide rather than unmount. This keeps unfinished
  // forms intact without paying for every tab's initial reads up front.
  const [visited, setVisited] = useState(() => new Set<SettingsSection>([section]));
  const [atlas, setAtlas] = useState<UniverseAtlas | null>(null);
  const [intel, setIntel] = useState<UniverseIntel | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const atlasCache = useRef<UniverseAtlas | null>(null);
  const atlasRevision = useRef(boot.datasetRevision);
  const load = useCallback(async () => {
    if (atlasRevision.current !== boot.datasetRevision) {atlasCache.current = null; atlasRevision.current = boot.datasetRevision;}
    const request = ++sequence.current;
    setBusy(true);
    try {
      const [staticData, intelligence] = await Promise.all([
        atlasCache.current ? Promise.resolve(atlasCache.current) : api('/universe/static?v=' + encodeURIComponent(boot.datasetRevision || boot.version)),
        api('/universe?character=' + character),
      ]);
      if (request !== sequence.current) return;
      atlasCache.current = staticData;
      setAtlas(staticData);
      setIntel(intelligence);
      setError('');
    } catch (error) {
      if (request === sequence.current) setError(error instanceof Error ? error.message : 'Universe data could not be loaded.');
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }, [character, boot.version, boot.datasetRevision]);
  const hasConnections = visited.has('connections');
  useEffect(() => {
    if (!hasConnections) return;
    void load();
    return () => { sequence.current++; };
  }, [hasConnections, load]);
  const openSystem = (id: number) => {
    const system = atlas?.systems.find(system => system.system_id === id);
    if (!system) return;
    setUniverseRequest('kairo-system-lookup', system.name);
    navigate('universe-kspace');
  };
  return <div className="universe-module universe-settings-page">
    <Tabs value={section} onValueChange={value => {
      const next = value as SettingsSection;
      setSection(next);
      setVisited(current => new Set([...current, next]));
    }}>
      <TabsList className="page-tabs" aria-label="Universe settings sections">
        <TabsTrigger value="connections"><Link2 size={17}/>Connections & pins</TabsTrigger>
        <TabsTrigger value="power-blocs"><Users size={17}/>Power blocs</TabsTrigger>
        <TabsTrigger value="mapper"><SlidersHorizontal size={17}/>Mapper preferences</TabsTrigger>
        <TabsTrigger value="sources"><Radio size={17}/>Sources & alerts</TabsTrigger>
      </TabsList>
      {hasConnections && <TabsContent value="connections" forceMount hidden={section !== 'connections'}>
        {error && <div className="universe-error" role="alert"><span>{error}</span><Button variant="outline" disabled={busy} onClick={() => void load()}>Retry</Button></div>}
        {atlas && intel ? <>
          <div className="universe-settings-network-tools"><Button variant="ghost" disabled={busy} aria-label="Refresh navigation networks" onClick={() => void load()}><RefreshCw size={16} className={busy ? 'animate-spin' : undefined}/>{busy ? 'Refreshing…' : 'Refresh networks'}</Button></div>
          <UniverseConnections atlas={atlas} intel={intel} reload={load} onSelect={openSystem}/>
        </> : !error && <p role="status" className="meta">Loading navigation networks…</p>}
      </TabsContent>}
      {visited.has('power-blocs') && <TabsContent value="power-blocs" forceMount hidden={section !== 'power-blocs'}><PowerBlocSettings/></TabsContent>}
      {visited.has('mapper') && <TabsContent value="mapper" forceMount hidden={section !== 'mapper'}><MapperPreferencesPanel/></TabsContent>}
      {visited.has('sources') && <TabsContent value="sources" forceMount hidden={section !== 'sources'}><UniverseOperationsSettings/></TabsContent>}
    </Tabs>
  </div>;
}

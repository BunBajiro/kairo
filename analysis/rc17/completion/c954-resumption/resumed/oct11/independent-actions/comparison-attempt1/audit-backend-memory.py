#!/usr/bin/env python3
"""Offline arithmetic/semantic audit of an already extracted Actions evidence ZIP.

Usage: python audit-backend-memory.py /absolute/path/to/evidence
Writes only sibling CI-BACKEND-MEMORY-AUDIT.json by default.
Pass --write-review to regenerate the sibling CI-BACKEND-MEMORY-REVIEW.md.
Never imports application code, runs a benchmark, downloads evidence, or rewrites raw files.
"""
import argparse
import hashlib
import json
import math
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

RC16 = '57c8dcc7fbd8fc2b62129498d1819050c78381a1'
CURRENT = '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'
OLD = '239794774320fcdebaa1d76ce8a77c5c25cfc48c'
ORDER = ['baseline-1', 'candidate-1', 'candidate-2', 'baseline-2']
COUNTS = Counter()
CHECKS = []
INVENTORY = {}


def check(ok, label):
    if not ok:
        raise AssertionError(label)
    COUNTS['passedAssertions'] += 1


def equal(actual, expected, label):
    if isinstance(expected, dict):
        check(isinstance(actual, dict) and actual.keys() == expected.keys(), label + ': keys')
        for k, v in expected.items():
            equal(actual[k], v, label + '.' + str(k))
    elif isinstance(expected, list):
        check(isinstance(actual, list) and len(actual) == len(expected), label + ': length')
        for i, (a, b) in enumerate(zip(actual, expected)):
            equal(a, b, label + '[' + str(i) + ']')
    elif isinstance(expected, (float, int)) and not isinstance(expected, bool):
        check(isinstance(actual, (int, float)) and not isinstance(actual, bool)
              and math.isfinite(actual) and math.isclose(actual, expected, rel_tol=1e-12, abs_tol=1e-9), label)
    else:
        check(actual == expected, label)


def read(rel):
    p = EVIDENCE / rel
    raw = p.read_bytes()
    INVENTORY[rel] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    return json.loads(raw) if p.suffix == '.json' else raw.decode()


def pct(a, b):
    return (b / a - 1) * 100 if a else None


def compare(values_a, values_b, **labels):
    unit = labels.get('unit')
    pairs = [{'baseline': a, 'candidate': b, 'delta': b-a, 'percent': pct(a, b), 'increased': b > a}
             for a, b in zip(values_a, values_b)]
    a, b = statistics.mean(values_a), statistics.mean(values_b)
    return dict(labels, pairs=pairs, baselineMean=a, candidateMean=b, changeOfMeanPercent=pct(a, b),
                baselineRange=[min(values_a), max(values_a)], candidateRange=[min(values_b), max(values_b)],
                anyPairIncreased=any(p['increased'] for p in pairs), bothPairsIncreased=all(p['increased'] for p in pairs),
                bothPairsOver10PercentAnd1Ms=unit == 'ms' and all(p['delta'] > 1 and p['percent'] is not None and p['percent'] > 10 for p in pairs))


def dist(d, label, expected_n=10):
    samples = d['samples']
    check(len(samples) == expected_n and all(math.isfinite(x) and x >= 0 for x in samples), label + ': samples')
    s = sorted(samples)
    expected = {'samples': samples, 'p50': s[math.ceil(len(s)*.5)-1], 'p95': s[math.ceil(len(s)*.95)-1], 'min': s[0], 'max': s[-1]}
    equal(d, expected, label)
    COUNTS['backendSamples'] += len(samples)
    COUNTS['backendDistributionValues'] += 4
    return expected


def numeric_leaves(d, path=''):
    if isinstance(d, dict):
        for k, v in d.items():
            if k in ('samples', 'tickAudit', 'networkAttempts'):
                continue
            yield from numeric_leaves(v, path + ('.' if path else '') + k)
    elif isinstance(d, (int, float)) and not isinstance(d, bool):
        yield path, d


def unit_for(path):
    if any(k in path for k in ['latencyMs', 'cpuMs', 'elapsedMs', 'DelayP95Ms', 'DelayMaxMs', 'startupMs']):
        return 'ms'
    if 'cpuPercentOneCore' in path:
        return '% one core'
    if 'Bytes' in path or '.memory.' in path or path.endswith(('rss', 'heapUsed', 'heapTotal', 'external', 'arrayBuffers')):
        return 'bytes'
    return 'ratio' if 'Utilization' in path else 'count'


def backend(lane, baseline, candidate):
    reports = {n: read(f'{lane}/{n}/backend.json') for n in ORDER}
    provenance = read(f'{lane}/provenance.json')
    summary = read(f'{lane}/summary.json')
    equal(read(f'{lane}/comparison.json'), summary, lane + ': comparison JSON')
    check(provenance['complete'] and provenance['endVerified'], lane + ': completion')
    equal(provenance['order'], ORDER, lane + ': ABBA')
    equal([provenance['source'][x]['commit'] for x in ['baseline', 'candidate']], [baseline, candidate], lane + ': sources')
    env = reports['baseline-1']['environment']
    settings = reports['baseline-1']['settings']
    equal({k:settings[k] for k in ['iterations','warmups','idleSeconds']}, {'iterations':10,'warmups':3,'idleSeconds':35}, lane + ': bounded workload')
    semantics, distributions, meters, extended, rows = [], [], [], [], []
    by_run = {}
    for name, r in reports.items():
        check(r['complete'], lane + name + ': complete')
        equal(r['environment']['commit'], baseline if name.startswith('baseline') else candidate, lane + name + ': commit')
        check(r['environment']['dirty'] is False, lane + name + ': clean')
        equal({k:v for k,v in r['environment'].items() if k != 'commit'}, {k:v for k,v in env.items() if k != 'commit'}, lane + name + ': environment')
        equal(r['settings'], settings, lane + name + ': settings')
        equal([p['profile'] for p in r['profiles']], ['typical', 'stress'], lane + name + ': profiles')
        md = read(f'{lane}/{name}/backend.md')
        for p in r['profiles']:
            profile = p['profile']
            equal([o['name'] for o in p['operations']], ['opsec','state','journey','session','market_browse','market_report','imports_warm','imports_after_write'], lane + name + ': operation names')
            by_run[name, profile] = p
            w = p['workload']
            fields = ['version', 'profile', 'characters', 'assets', 'events', 'visits', 'combat', 'sessions', 'marketTypes']
            definition = {k:w[k] for k in fields}
            fingerprint = hashlib.sha256(json.dumps(definition, separators=(',', ':')).encode()).hexdigest()
            equal(w['fingerprint'], fingerprint, lane + name + profile + ': workload fingerprint')
            equal(definition, {k:reports['baseline-1']['profiles'][0 if profile == 'typical' else 1]['workload'][k] for k in fields}, lane + name + profile + ': counts')
            feed = p['feedStateValidation']
            if r['environment']['commit'] != OLD:
                check(feed['passed'] and feed['applicable'] and feed['storms'] == 0 and feed['points'] == 2384 and feed['sourceStatus'] == 'ready', lane + name + profile + ': feeds')
            else:
                check(feed['applicable'] is False, lane + name + profile + ': old feed N/A')
            prep = w.get('discoveryPreparation')
            if prep:
                equal(prep['expectedMemberships'], 100, lane + name + profile + ': discovery count')
                check(prep['available'] == (r['environment']['commit'] == CURRENT), lane + name + profile + ': discovery availability')
                equal(prep['seededMemberships'], 100 if prep['available'] else None, lane + name + profile + ': discovery seeded')
            semantics.append({'run': name, 'profile': profile, 'workload': w, 'feedStateValidation': feed})
            for op in p['operations']:
                equal(op['iterations'], settings['iterations'], lane + name + ': iterations')
                equal(op['warmups'], settings['warmups'], lane + name + ': warmups')
                equal(op['networkAttempts'], 0, lane + name + ': operation network')
                for metric in ['latencyMs', 'cpuMs']:
                    distributions.append({'run':name, 'profile':profile, 'operation':op['name'], 'metric':metric,
                                          'recomputed':dist(op[metric], lane + name + profile + op['name'] + metric)})
                line = f"| {profile} / {op['name']} | {op['latencyMs']['p50']:.2f} | {op['latencyMs']['p95']:.2f} | {op['responseBytes']/1024:.1f} |"
                check(line in md, lane + name + ': displayed operation')
                COUNTS['backendDisplayedOperationRows'] += 1
            distributions.append({'run':name, 'profile':profile, 'operation':'state_http', 'metric':'latencyMs',
                                  'recomputed':dist(p['http']['latencyMs'], lane + name + profile + 'http')})
            for meter_name, meter in [('idle', p['idle']), ('http.server', p['http']['server'])]:
                equal(meter['cpuPercentOneCore'], 100 * meter['cpuMs'] / meter['elapsedMs'], lane + name + profile + meter_name + ': CPU')
                equal(meter['networkAttempts'], 0, lane + name + ': meter network')
                tick = meter['tickAudit']
                check(tick['rejections'] == [] and tick['calls'] == tick['successes'], lane + name + ': successful ticks')
                check(tick['calls'] > 0 if tick['applicable'] else tick['calls'] == 0, lane + name + ': tick applicability')
                meters.append({'run':name, 'profile':profile, 'meter':meter_name, 'raw':meter})
                COUNTS['backendMetersChecked'] += 1
            idle = p['idle']
            text = f"{profile} idle: {idle['cpuPercentOneCore']:.2f}% of one core over {idle['elapsedMs']/1000:.1f} s; RSS {idle['rssAfterBytes']/1048576:.1f} MiB; event loop p95 {idle['eventLoopDelayP95Ms']:.2f} ms."
            check(text in md, lane + name + ': displayed idle')
    def add(profile, metric, unit, getter):
        rows.append(compare([getter(by_run[f'baseline-{i}',profile]) for i in (1,2)], [getter(by_run[f'candidate-{i}',profile]) for i in (1,2)], profile=profile, metric=metric, unit=unit))
    for profile in ['typical', 'stress']:
        for metric, unit, getter in [('idle_cpu','% one core',lambda p:p['idle']['cpuPercentOneCore']), ('idle_rss','MiB',lambda p:p['idle']['rssAfterBytes']/1048576), ('idle_loop_max','ms',lambda p:p['idle']['eventLoopDelayMaxMs']), ('idle_loop_p95','ms',lambda p:p['idle']['eventLoopDelayP95Ms']), ('startKairo_startup','ms',lambda p:p['startupMs']), ('state_http','ms',lambda p:p['http']['latencyMs']['p50']), ('state_http_p95','ms',lambda p:p['http']['latencyMs']['p95'])]:
            add(profile, metric, unit, getter)
        for op in by_run['baseline-1',profile]['operations']:
            name = op['name']
            for suffix, unit, getter in [('', 'ms',lambda o:o['latencyMs']['p50']), ('_p95','ms',lambda o:o['latencyMs']['p95']), ('_cpu_p50','ms',lambda o:o['cpuMs']['p50']), ('_payload','KiB',lambda o:o['responseBytes']/1024)]:
                add(profile, name + suffix, unit, lambda p, n=name, g=getter:g(next(o for o in p['operations'] if o['name']==n)))
        values = {}
        for run in ORDER:
            p = by_run[run,profile]
            values[run] = {'startupMs':p['startupMs']}
            for k in ['idle','http']:
                values[run].update(dict(numeric_leaves(p[k], k)))
            for op in p['operations']:
                values[run].update(dict(numeric_leaves({k:v for k,v in op.items() if k not in ['iterations','warmups']}, 'operations.'+op['name'])))
        for metric in values['baseline-1']:
            extended.append(compare([values[f'baseline-{i}'][metric] for i in (1,2)], [values[f'candidate-{i}'][metric] for i in (1,2)], profile=profile, metric=metric, unit=unit_for(metric)))
        for run in ORDER:
            equal(sorted(values[run]), sorted(values['baseline-1']), lane + run + ': numeric metric coverage')
    check(len(rows) == len(summary['backend']) == 78, lane + ': all summary rows')
    for row, stored in zip(rows, summary['backend']):
        expected = {k:row[k] for k in ['profile','metric','unit','baselineRange','candidateRange','changeOfMeanPercent']}
        expected['pairs'] = [{k:p[k] for k in ['baseline','candidate','delta','percent']} for p in row['pairs']]
        expected['consistentLatencyRegressionOver10PercentAnd1Ms'] = row['bothPairsOver10PercentAnd1Ms']
        equal(stored, expected, lane + row['profile'] + row['metric'] + ': summary row')
    equal(summary['settings'], settings, lane + ': summary settings')
    check(summary['complete'] and summary['database'] == {} and summary['databaseSummary'] == [], lane + ': no database lane')
    md = read(f'{lane}/summary.md')
    equal(read(f'{lane}/comparison.md'), md, lane + ': comparison Markdown')
    for row in rows:
        if row['metric'].endswith(('_payload','_p95','_cpu_p50')):
            continue
        fmt = lambda xs: '–'.join(f'{v:.2f}' for v in xs)
        line = f"| {row['profile']} / {row['metric']} ({row['unit']}) | {fmt(row['baselineRange'])} | {fmt(row['candidateRange'])} | {row['changeOfMeanPercent']:+.1f}% |"
        check(line in md, lane + ': displayed summary')
        COUNTS['backendDisplayedSummaryRows'] += 1
    COUNTS['backendSummaryRows'] += len(rows)
    COUNTS['backendExtendedMetricRows'] += len(extended)
    return {'comparison':{'baseline':baseline,'candidate':candidate}, 'environment':env, 'settings':settings, 'provenance':provenance,
            'semantics':semantics, 'distributions':distributions, 'meterChecks':meters, 'summaryRows':rows, 'allNumericMetricRows':extended,
            'requestCounts':{'profilesPerRun':2,'runs':4,'directOperationsPerProfile':8,'warmupsPerOperation':3,'measuredPerOperation':10,'directCallsTotal':832,'httpPageBootstrapRequests':8,'httpStateWarmups':24,'httpStateMeasured':80,'externalNetworkAttempts':0,
                             'interpretation':'Counts derived from archived iterations/warmups and pinned harness loop; server CPU includes HTTP warmups. Timed HTTP samples exclude three warmups and occur after idle and all direct operations.'},
            'adverseSummaryIndices':{'anyPairIncreased':[i for i,r in enumerate(rows) if r['anyPairIncreased']], 'bothPairsIncreased':[i for i,r in enumerate(rows) if r['bothPairsIncreased']], 'bothPairsOver10PercentAnd1Ms':[i for i,r in enumerate(rows) if r['bothPairsOver10PercentAnd1Ms']]}}


def memory():
    run = read('memory/memory-all-completed.json')
    equal(read('memory/memory-all-run.json'), run, 'memory progress/completion')
    summary = read('memory/memory-summary.json')
    check(run['complete'] and run['endVerified'] and len(run['results'])==14, 'memory: completion')
    equal(summary['runManifestSha256'], INVENTORY['memory/memory-all-completed.json']['sha256'], 'memory summary manifest hash')
    equal(summary['runManifestFile'], 'memory-all-completed.json', 'memory summary manifest')
    equal(summary['runId'], run['runId'], 'memory summary run ID')
    mem = defaultdict(list)
    sessions = defaultdict(list)
    session_cpu = defaultdict(list)
    markers, timings, diagnostics, fixtures, workers = [], [], [], defaultdict(list), []
    source_manifests = {b: read(f'memory/{b}-source.json') for b in ['baseline','candidate']}
    for row in run['results']:
        file = 'memory/' + row['result']
        s = read(file)
        equal(INVENTORY[file]['sha256'], row['sha256'], file + ': worker hash')
        check(row['complete'] and row['exitCode']==0 and s['complete'] and s['endVerified'], file + ': complete')
        equal(s['environment'], summary['environment'], file + ': environment')
        equal(s['sourceCommit'], RC16 if s['build']=='baseline' else CURRENT, file + ': source commit')
        equal(s['sourceFingerprint'], run['sources'][s['build']]['fingerprint'], file + ': source fingerprint')
        check(s['sourceDirty'] is False and s['networkAttempts']==0 and row['networkAttempts']==0, file + ': clean/offline')
        workers.append({'file':file, 'sha256':row['sha256'], 'build':s['build'], 'mode':s['mode'], 'sourceCommit':s['sourceCommit'], 'sourceFingerprint':s['sourceFingerprint'], 'methodology':s['methodology'], 'harness':s['harness'], 'fixture':s.get('fixture'), 'completed':s.get('completed')})
        if 'markers' in s:
            equal(s['fixture'], {'pilots':4,'noSync':True,'publicActivityRows':0,'liveSessions':0,'mapNodes':0}, file + ': fixture')
            equal(s['completed'], {'universeState':124,'jspaceState':124,'lightDetails':9490,'celestialDetails':384,'coreRecreationCycles':10} if s['mode']=='retention' else dict.fromkeys(['universeState','jspaceState','lightDetails','celestialDetails','coreRecreationCycles'],0), file + ': work')
            for marker in s['markers']:
                mem[s['mode'],s['build'],marker['name']].append(marker)
                markers.append({'file':file,'marker':marker})
                check(marker['nativeContextCount']==1 and marker['detachedContextCount']==0, file + ': context counts')
                if 'distinctSystems' in marker:
                    equal(marker['distinctSystems'], 8490, file + ': atlas count')
                if 'sourceLruLimit' in marker:
                    equal(marker['sourceLruLimit'], 48, file + ': source LRU bound')
                COUNTS['memoryMarkerObservations'] += 1
        else:
            check(len(s['results'])==5, file + ': five fixtures')
            for f in s['results']:
                key = tuple(f['fixture'][k] for k in ['visits','pilots','olderVisits'])
                fixtures[key].append({'file':file, **{k:f[k] for k in ['fixture','discoveryPreparation','routeLength','groupCount','routeBytes','semantic']}})
                equal(f['routeLength'], key[0], file + ': route length')
                equal(f['discoveryPreparation']['expectedMemberships'], key[1]*100, file + ': discovery expected')
                equal(f['discoveryPreparation']['seededMemberships'], key[1]*100 if s['build']=='candidate' else None, file + ': discovery seeded')
                for op in f['operations']:
                    if s['mode']=='timings':
                        check(len(op['samples'])==7, file + ': seven samples')
                        for sample in op['samples']:
                            check(all(math.isfinite(sample[k]) and sample[k]>=0 for k in ['wallMs','cpuMs']), file + ': finite timing')
                        median = statistics.median(x['wallMs'] for x in op['samples'])
                        cpu = statistics.median(x['cpuMs'] for x in op['samples'])
                        equal(median, op['medianMs'], file + ': median')
                        sessions[(s['build'],*key,op['name'])].append(median)
                        session_cpu[(s['build'],*key,op['name'])].append(cpu)
                        timings.append({'file':file, 'fixture':list(key), 'operation':op['name'], 'samples':op['samples'], 'wallMedianMs':median, 'cpuMedianMs':cpu})
                        COUNTS['sessionTimingSamples'] += 7
                        COUNTS['sessionMedians'] += 1
                    else:
                        equal(op['repetitions'], 3, file + ': diagnostics repetitions')
                        visit_rows = sum(v['rows'] for sql,v in op['sql'].items() if re.search(r'\b(?:from|join)\s+visits\b',sql,re.I))
                        equal(visit_rows, op['visitRows'], file + ': diagnostic visit sum')
                        expected = 0 if s['build']=='candidate' and op['name']=='actual_live_sync_cache_hit' else 3*key[0]*(key[1] if op['name']=='actual_live_sync_cache_hit' else 1)
                        equal(visit_rows, expected, file + ': visits contract')
                        diagnostics.append({'file':file, 'build':s['build'],'fixture':list(key),'operation':op['name'],'raw':op,'queryPlan':f.get('referenceWindowQueryPlan')})
                        COUNTS['sessionDiagnosticRows'] += 1
    expected_memory = []
    for (mode,build,marker), values in mem.items():
        check(len(values)==2, 'memory: two markers')
        item = {'mode':mode, 'build':build, 'marker':marker,'independentRuns':2,'observations':values}
        for metric in ['rss','heapUsed','heapTotal','external','arrayBuffers']:
            item[metric] = statistics.median(v[metric] for v in values)
            COUNTS['memorySummaryAggregates'] += 1
        if mode=='ordinary':
            item['phaseElapsedMs'] = statistics.median(v['sincePreviousMarkerMs'] for v in values)
            COUNTS['memorySummaryAggregates'] += 1
        expected_memory.append(item)
    equal(summary['memory'], expected_memory, 'all memory summary rows')
    expected_sessions = [{'build':k[0],'visits':k[1],'pilots':k[2],'olderVisits':k[3],'operation':k[4],'medianMs':statistics.median(v),'perRunMediansMs':v} for k,v in sessions.items()]
    equal(summary['sessions'], expected_sessions, 'all session summary rows')
    equal(summary['sourceCommits'], {'baseline':RC16,'candidate':CURRENT}, 'memory summary source commits')
    equal(summary['semanticFixtureComparisons'], 5, 'summary semantic count')
    equal(run['semanticFixtureComparisons'], 5, 'completion semantic count')
    semantic_rows = []
    for key, observations in fixtures.items():
        check(len(observations)==6, 'six session workers')
        for x in observations[1:]:
            for k in ['fixture','routeLength','groupCount','routeBytes','semantic']:
                equal(x[k], observations[0][k], 'session semantics ' + str(key) + k)
        semantic_rows.append({'fixture':list(key),'observations':observations,'matchedFields':['fixture','routeLength','groupCount','routeBytes','semantic']})
    memory_rows = []
    for (mode,build,marker), a in mem.items():
        if build!='baseline':
            continue
        b = mem[mode,'candidate',marker]
        numeric_fields = [k for k,v in a[0].items() if isinstance(v,(int,float)) and not isinstance(v,bool)]
        for metric in numeric_fields:
            memory_rows.append(compare([x[metric] for x in a],[x[metric] for x in b],mode=mode,marker=marker,metric=metric,unit='ms' if metric=='sincePreviousMarkerMs' else 'count' if metric.endswith('Count') or metric in ['distinctSystems','sourceLruLimit'] else 'bytes'))
    session_rows = []
    for k,a in sessions.items():
        if k[0]!='baseline':
            continue
        for metric, values in [('wallMedianMs',sessions),('cpuMedianMs',session_cpu)]:
            session_rows.append(compare(values[k],values[('candidate',*k[1:])],visits=k[1],pilots=k[2],olderVisits=k[3],operation=k[4],metric=metric,unit='ms'))
    retention_growth = []
    for build in ['baseline','candidate']:
        start = mem['retention',build,'core_closed_reference_released']
        for end_name in ['recreate_use_close_cycle_1','recreate_use_close_cycle_5','recreate_use_close_cycle_10','store_closed_reference_released']:
            end = mem['retention',build,end_name]
            retention_growth.append({'build':build,'from':'core_closed_reference_released','to':end_name,'heapGrowthBytes':[y['heapUsed']-x['heapUsed'] for x,y in zip(start,end)],'rssGrowthBytes':[y['rss']-x['rss'] for x,y in zip(start,end)]})
    COUNTS['memorySummaryRows'] = len(expected_memory)
    COUNTS['memoryMetricRows'] = len(memory_rows)
    COUNTS['sessionSummaryRows'] = len(expected_sessions)
    COUNTS['sessionMetricRows'] = len(session_rows)
    return {'sourceCommits':summary['sourceCommits'],'environment':summary['environment'],'completionManifestSha256':summary['runManifestSha256'],'workers':workers,'rawMarkers':markers,'summaryRows':expected_memory,'metricRows':memory_rows,'sessionTimingRows':timings,'sessionMetricRows':session_rows,'sessionSummaryRows':expected_sessions,'diagnostics':diagnostics,'semantics':semantic_rows,'retentionGrowth':retention_growth,
            'requestCounts':{'timingCalls':600,'timingMeasuredCalls':420,'diagnosticCalls':90,'externalNetworkAttempts':0,'interpretation':'Four timing workers × five fixtures × three operations × (three warmups + seven measured); two diagnostic workers × five fixtures × three operations × three invocations. SQL returned rows and combat group counts are separate from external requests.'},
            'adverseMemoryIndices':{'anyPairIncreased':[i for i,r in enumerate(memory_rows) if r['anyPairIncreased']],'bothPairsIncreased':[i for i,r in enumerate(memory_rows) if r['bothPairsIncreased']],'bothPairsOver10PercentAnd1Ms':[i for i,r in enumerate(memory_rows) if r['bothPairsOver10PercentAnd1Ms']]},
            'adverseSessionIndices':{'anyPairIncreased':[i for i,r in enumerate(session_rows) if r['anyPairIncreased']],'bothPairsIncreased':[i for i,r in enumerate(session_rows) if r['bothPairsIncreased']],'bothPairsOver10PercentAnd1Ms':[i for i,r in enumerate(session_rows) if r['bothPairsOver10PercentAnd1Ms']]}}


def review(a):
    current = a['backendCurrent']['summaryRows']
    legacy = a['backendLegacyCorrected']['summaryRows']
    mem = a['memory']['metricRows']
    def table(rows, label_fields):
        lines = ['| Metric | Baseline mean | Candidate mean | Pair deltas | Mean change | Joint marker |','|---|---:|---:|---|---:|---|']
        for r in rows:
            title = ' / '.join(str(r[k]) for k in label_fields)
            deltas = ' / '.join(f"{p['delta']:+.6f}" for p in r['pairs'])
            pc = 'undefined (zero baseline)' if r['changeOfMeanPercent'] is None else f"{r['changeOfMeanPercent']:+.2f}%"
            lines.append(f"| {title} ({r['unit']}) | {r['baselineMean']:.6f} | {r['candidateMean']:.6f} | {deltas} | {pc} | {'yes' if r['bothPairsOver10PercentAnd1Ms'] else 'no'} |")
        return '\n'.join(lines)
    key_metrics = ['startKairo_startup','idle_cpu','idle_rss','state_http','state_http_p95','state','state_p95','session','session_p95','session_payload']
    lines = ['# CI backend and memory arithmetic review','',
        '**Arithmetic and scoped semantic checks pass; a repeated current-source ongoing state HTTP tail cost remains.** This is an offline review of the original Actions 38176821997 evidence, collected October 11, 2026. No benchmark or application runtime was rerun. Numeric validity is not a blanket performance pass or release approval.','',
        f"Current comparison: RC16 `{RC16}` → `{CURRENT}`. Historical corrected comparison: 0.7.3 `{OLD}` → RC16 `{RC16}`. These are separate ABBA lanes; historical startup/idle costs are not attributed to the current change.",'',
        '## Current RC16 → 70cd','',
        '**Typical state HTTP p95 increases in both pairs: 12.504122→17.454456 ms (+4.950334 ms, +39.5896%) and 10.678834→15.130395 ms (+4.451561 ms, +41.6858%).** Both exceed the existing joint +1 ms and +10% marker. This is an ongoing warm-operation observation: three HTTP warmups are excluded, and HTTP runs after the 35-second idle window and direct operations. It cannot be relabelled as startup or first-use cost. Ten measured HTTP samples make p95 the maximum under the harness nearest-rank rule; two runs do not establish a distribution or cause.','',
        table([r for r in current if r['metric'] in key_metrics], ['profile','metric']),'',
        'All 78 current summary rows, every pair and every adverse flag are retained in the JSON, along with unsummarized CPU p95/min/max, per-operation memory snapshots, HTTP server CPU/loop/RSS, and raw distributions. Larger response payloads are observations and do not by themselves establish the cause of timing differences.','',
        '## Historical corrected 0.7.3 → RC16','',
        table([r for r in legacy if r['metric'] in ['startKairo_startup','idle_cpu','idle_rss','idle_loop_max','state_http_p95'] or r['bothPairsOver10PercentAnd1Ms']], ['profile','metric']),'',
        'The older baseline has no Universe collector; its feed/tick applicability is explicitly false. RC16/current observations have successful real ticks, no rejected ticks, corrected storms fixtures and zero blocked external attempts. All 78 historical rows and unsummarized metrics remain separate in the JSON.','',
        '## Memory and sessions','',
        table([r for r in mem if (r['mode']=='ordinary' and r['metric']=='sincePreviousMarkerMs') or (r['metric']=='heapUsed' and r['marker'] in ['core_created','core_closed_reference_released','recreate_use_close_cycle_10'])], ['mode','marker','metric']),'',
        table([r for r in a['memory']['sessionMetricRows'] if r['metric']=='wallMedianMs'], ['visits','pilots','olderVisits','operation']),'',
        'Ordinary snapshots/phase intervals and forced-GC retention are separate. The ordinary store-opening interval includes four-pilot seeding; it is not first Assets open. Forced-GC rows intentionally retain process/module singletons after closure. Cycle growth and every memory pair remain recorded; these finite observations are not a no-leak proof. All 100 marker observations have one native context and zero detached contexts.','',
        'Five fixture definitions, route/group hashes, route lengths, route byte counts and combat group counts agree across all six session workers. Discovery preparation is explicitly checked. Every candidate live-sync cache-hit diagnostic returns zero visit rows; baseline totals are 300/3,000/30,000/300/12,000 across three calls. CPU medians and all 420 wall/CPU sample records are retained separately. The SQL evidence measures returned rows, not pages scanned; diagnostics are not timing runs. Semantic hash equality covers only system/time/duration/active route fields and combat groups. Hash bodies and complete decoded HTTP outputs are not archived.','',
        '## Reproduction and scope','',
        'Run `python audit-backend-memory.py /absolute/path/to/extracted/evidence`. The script reads raw files, recomputes distributions and summaries, and writes only its sibling JSON audit; optional `--write-review` also regenerates this review. It does not invoke a harness or import application code. Floating comparisons use relative tolerance 1e-12 and absolute tolerance 1e-9; stored raw values and unrounded recomputations remain in the JSON. Adverse flags retain every positive pair, while the joint marker uses strict >1 ms and >10% in both pairs. Larger numeric values can be contextual (for example measured duration or allocator residency), so an increase flag alone is not a defect diagnosis.','',
        f"Coverage: {COUNTS['backendSamples']} backend samples; {COUNTS['backendDistributionValues']} recomputed distribution values; {COUNTS['backendSummaryRows']} summary rows; {COUNTS['backendExtendedMetricRows']} exhaustive numeric comparison rows; {COUNTS['backendMetersChecked']} CPU/tick meters; {COUNTS['backendDisplayedSummaryRows']} displayed summary rows; {COUNTS['backendDisplayedOperationRows']} displayed operation rows; {COUNTS['memoryMarkerObservations']} marker observations; {COUNTS['memorySummaryRows']} memory summaries/{COUNTS['memorySummaryAggregates']} aggregates; {COUNTS['sessionTimingSamples']} session sample records/{COUNTS['sessionMedians']} medians; {COUNTS['sessionSummaryRows']} session summaries; {COUNTS['sessionDiagnosticRows']} diagnostic rows. All 14 memory worker hashes agree with the immutable completion record. Full input hashes are recorded for this scoped audit.",'',
        'Node v24.19.0, Linux x64, AMD EPYC 9V45, four logical CPUs. Backend workloads match count fingerprints within each lane. Backend fixture assertions and archived settings supply bounded semantic evidence, not full cross-version HTTP equivalence. No database workers exist in these lanes. Journey is the preserved cold compatibility reader; active lifetime Journey logging/UI is retired. The parent review owns ZIP/source/runner envelope validation and remaining acceptance lanes; this review makes no causal source attribution and does not replace that envelope.','']
    return '\n'.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence', type=Path, help='Already-extracted evidence directory from original verified Actions ZIP')
    parser.add_argument('--write-review', action='store_true', help='Also regenerate the sibling Markdown review')
    args = parser.parse_args()
    EVIDENCE = args.evidence.resolve()
    result = {'schemaVersion':1,'scope':'Offline Actions 38176821997 backend/current, corrected historical backend, memory/session raw arithmetic and scoped semantics','backendCurrent':backend('backend',RC16,CURRENT),'backendLegacyCorrected':backend('legacy-corrected',OLD,RC16),'memory':memory()}
    result.update(complete=True, counts=dict(COUNTS), inputFiles=INVENTORY,
                  method={'percent':'100*(candidate/baseline-1); null if baseline zero','backendQuantiles':'nearest rank ceil(n*q)-1; p50 is fifth and p95 tenth for n=10','sessionMedian':'fourth ordered wall sample out of seven; mean of two run medians in aggregate','memorySummary':'median of two ABBA run markers, equivalent to their mean','pairs':'backend baseline-1/candidate-1 then baseline-2/candidate-2; memory/session baseline-1/candidate-2 then baseline-4/candidate-3','indices':'zero based','adverse':'all numeric increases retained; strict joint >1 ms AND >10% in both pairs; no statistical confidence or causality asserted','floatComparison':{'relativeTolerance':1e-12,'absoluteTolerance':1e-9}},
                  limitations=['Two repetitions per source on one hosted runner; descriptive comparisons, not confidence intervals.','HTTP p95 is maximum of ten measured after-warmup samples and is not startup.','Backend semantic evidence is fixture assertions and settings; complete decoded HTTP equality is not claimed.','Session hash bodies are not archived; recorded route/group hash equality has limited field coverage.','SQL counts represent returned rows, not pages scanned.','RSS is allocator residency; finite retained-heap cycles are not a no-leak proof.','No benchmark/runtime rerun, source changes, causal attribution, or release approval.'])
    dest = Path(__file__).resolve().parent
    (dest/'CI-BACKEND-MEMORY-AUDIT.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    if args.write_review:
        (dest/'CI-BACKEND-MEMORY-REVIEW.md').write_text(review(result))
    print(json.dumps({'complete':True,'counts':dict(COUNTS),'currentJointSignals':[(r['profile'],r['metric']) for r in result['backendCurrent']['summaryRows'] if r['bothPairsOver10PercentAnd1Ms']],'legacyJointSignals':[(r['profile'],r['metric']) for r in result['backendLegacyCorrected']['summaryRows'] if r['bothPairsOver10PercentAnd1Ms']],'memoryJointSignals':[(r['mode'],r['marker']) for r in result['memory']['metricRows'] if r['bothPairsOver10PercentAnd1Ms']]}))

#!/usr/bin/env python3
"""Offline-only audit of original CI 38176821997 mixed/restart/maps-browser JSON.

Usage: python audit-mixed-restart.py /path/to/extracted/evidence [--output-dir DIR]
No application imports, runtime execution, benchmark reruns, network, or git writes.
All numeric leaves are inventoried and checked finite; every derived mixed metric
and summary field is compared exactly, with no rounding/tolerance suppression.
Primitive instrument readings cannot be independently remeasured from this archive.
"""
import argparse
import collections
import datetime
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlparse

RUN = '38176821997'
COMMIT = '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'
URL = 'https://github.com/BunBajiro/kairo/actions/runs/' + RUN
FILES = ['mixed/mixed.json', 'mixed/mixed-summary.json', 'restart-candidate.json',
         'maps-browser/result.json', 'maps-browser/source-manifest.json',
         'candidate-source.json', 'run-provenance.json']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    # The provenance arrays contain strings and integer file sizes only. This is
    # byte-equivalent to JSON.stringify for their actual, validated input domain.
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()


def leaves(value, prefix=''):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from leaves(child, prefix + '/' + key.replace('~', '~0').replace('/', '~1'))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from leaves(child, prefix + '/' + str(index))
    else:
        yield prefix, value


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def stats(values):
    values = sorted(values)
    return {'n': len(values),
            'p50': values[math.ceil(len(values) * .5) - 1] if values else None,
            'p95': values[math.ceil(len(values) * .95) - 1] if values else None,
            'max': values[-1] if values else None}


def millis(value):
    return round(datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)


class Audit:
    def __init__(self):
        self.counts = collections.Counter()
        self.differences = []
        self.numeric_comparisons = []
        self.notes = []

    def check(self, path, actual, expected=True, group='semantic'):
        self.counts[group] += 1
        equal = type(actual) is type(expected) and actual == expected
        if is_number(actual) and is_number(expected):
            equal = actual == expected
        if not equal:
            self.differences.append({'path': path, 'actual': actual, 'expected': expected, 'group': group})
        return equal

    def compare(self, path, actual, expected, group):
        if isinstance(expected, dict):
            self.check(path + '/keys', sorted(actual), sorted(expected), group)
            for key in expected:
                if key in actual:
                    self.compare(path + '/' + key, actual[key], expected[key], group)
        elif isinstance(expected, list):
            self.check(path + '/length', len(actual), len(expected), group)
            for index, (left, right) in enumerate(zip(actual, expected)):
                self.compare(path + '/' + str(index), left, right, group)
        else:
            equal = self.check(path, actual, expected, group)
            if is_number(expected):
                self.numeric_comparisons.append({'path': path, 'recorded': actual, 'recomputed': expected, 'equal': equal})


def audit(evidence):
    a = Audit()
    data = {name: json.loads((evidence / name).read_text()) for name in FILES}
    inventory = {}
    for name, value in data.items():
        numbers = [(path, item) for path, item in leaves(value) if is_number(item)]
        groups = collections.Counter(re.sub(r'/\d+(?=/|$)', '/*', path) for path, _ in numbers)
        inventory[name] = {'numericLeaves': len(numbers), 'numericFieldFamilies': dict(sorted(groups.items())),
                           'numericInventorySha256': sha(encoded(numbers))}
        for path, item in numbers:
            a.check(name + path + '/finite', math.isfinite(item), group='all_numeric_finite')
    m, summary, restart, browser, manifest, candidate, provenance = [data[name] for name in FILES]
    a.check('run-provenance/runUrl', provenance['runUrl'], URL, 'provenance')
    a.check('run-provenance/runAttempt', provenance['runAttempt'], '1', 'provenance')
    a.check('run-provenance/candidateCommit', provenance['candidateCommit'], COMMIT, 'provenance')
    source_results = []
    for name, src in [('candidate-source.json', candidate), ('maps-browser/source-manifest.json', manifest)]:
        fingerprint = sha(encoded({'files': src['files'], 'builtFiles': src['builtFiles']}))
        a.check(name + '/fingerprint', src['fingerprint'], fingerprint, 'provenance')
        a.check(name + '/sourceCommit', src['sourceCommit'], COMMIT, 'provenance')
        a.check(name + '/dirty', src['dirty'], False, 'provenance')
        a.check(name + '/status', src['status'], '', 'provenance')
        a.check(name + '/filePathsUnique', len({x['path'] for x in src['files']}), len(src['files']), 'provenance')
        source_results.append({'file': name, 'sourceFiles': len(src['files']), 'builtFiles': len(src['builtFiles']), 'recomputedFingerprint': fingerprint})
    a.check('source-manifests/fingerprintMatch', manifest['fingerprint'], candidate['fingerprint'], 'provenance')
    for name, result in [('mixed', m), ('maps-browser', browser)]:
        for key, value in [('sourceCommit', COMMIT), ('sourceFingerprint', candidate['fingerprint']), ('sourceDirty', False)]:
            a.check(name + '/' + key, result[key], value, 'provenance')
    a.check('mixed/environment/runUrl', m['environment']['runUrl'], URL, 'provenance')
    for name, digest in m['harnessHashes'].items():
        a.check('mixed/harnessHashes/' + name, digest, provenance['harnessSha256']['analysis/rc17/harness/' + name], 'provenance')
    for key in ['complete', 'endVerified']:
        a.check('mixed/' + key, m[key])
    a.check('mixed/order', [r['name'] for r in m['runs']], ['quiet-1', 'loaded-1', 'loaded-2', 'quiet-2'])
    a.check('mixed/settings/order', m['settings']['order'], [r['name'] for r in m['runs']])
    a.check('mixed/settings/nominalWindowMs', m['settings']['nominalWindowMs'], 28000)
    a.check('mixed/settings/protocolOnly', m['settings']['protocolOnly'])
    for key, expected in [('providerLatencyMs', 50), ('assetsLatencyMs', 250), ('commonStatePollMs', 2000), ('commonStreamPollMs', 1000),
                          ('loadedNavigationOffsetsMs', [2000, 8000, 14000, 20000]), ('loadedBurstOffsetsMs', [4000, 10000, 16000, 24000]),
                          ('providerPhases', [{'atMs': 0, 'mode': 'fresh-highsec'}, {'atMs': 2000, 'mode': 'fresh-hostile'},
                                              {'atMs': 8000, 'mode': 'fresh-highsec'}, {'atMs': 14000, 'mode': 'unavailable-503'},
                                              {'atMs': 20000, 'mode': 'recovered-highsec'}])]:
        a.check('mixed/settings/' + key, m['settings'][key], expected)
    rebuilt_runs, mixed_details = [], []
    for i, r in enumerate(m['runs']):
        p = 'mixed/runs/' + str(i)
        server, requests, sse = r['server'], r['requests'], r['sse']
        for key, expected in [('pilots', 2), ('assetsPerPilot', 20000), ('events', 50000), ('visits', 2000), ('activeSessions', 1),
                              ('maps', 8), ('nodesPerMap', 100), ('navigationStops', 50), ('streamWidgets', 10)]:
            a.check(p + '/fixture/' + key, r['fixture'][key], expected)
        discovery = r['fixture']['discoveryPreparation']
        a.check(p + '/fixture/discoveryAvailable', discovery['available'])
        a.check(p + '/fixture/discoveryExpectedMemberships', discovery['expectedMemberships'], 100)
        a.check(p + '/fixture/discoverySeededMemberships', discovery['seededMemberships'], discovery['expectedMemberships'])
        a.check(p + '/loaded', r['loaded'], r['name'].startswith('loaded'))
        a.check(p + '/complete', r['complete'])
        for key in ['taskFailures', 'unsafeEmissions']:
            a.check(p + '/' + key, r[key], [])
        a.check(p + '/stderr', r['stderr'], '')
        a.check(p + '/cleanupErrorAbsent', 'cleanupError' not in r)
        a.check(p + '/requestCount', len(requests), 92 if r['loaded'] else 56)
        labels = collections.Counter(x['label'] for x in requests)
        expected_labels = {'dashboard-state-42': 14, 'dashboard-state-43': 14, 'stream-state': 28}
        if r['loaded']:
            expected_labels.update({'navigation': 4, 'map-before-edit': 4, 'map-edit': 4, 'map-burst': 24})
        a.check(p + '/requestLabels', dict(labels), expected_labels)
        for j, req in enumerate(requests):
            q = p + '/requests/' + str(j)
            a.check(q + '/status', req['status'], 200)
            a.check(q + '/errorAbsent', 'error' not in req)
            a.check(q + '/bytesPositiveInteger', isinstance(req['bytes'], int) and req['bytes'] > 0)
            a.check(q + '/latencyNonnegative', req['latencyMs'] >= 0)
            a.check(q + '/finishedAfterDispatch', req['finishedAt'] >= req['dispatchedAt'])
            if req['label'] == 'navigation':
                a.check(q + '/segments', req['segments'], 50)
                a.check(q + '/routeSystemsPositive', req['routeSystems'] > 0)
            schedule = None
            if req['label'].startswith('dashboard-state'):
                schedule = list(range(0, 28000, 2000))
            elif req['label'] == 'stream-state':
                schedule = list(range(0, 28000, 1000))
            elif req['label'] == 'navigation':
                schedule = m['settings']['loadedNavigationOffsetsMs']
            else:
                schedule = m['settings']['loadedBurstOffsetsMs']
            a.check(q + '/scheduledOffsetAllowed', req['scheduledAt'] - r['startedAt'] in schedule)
        for label in ['dashboard-state-42', 'dashboard-state-43', 'stream-state', 'navigation', 'map-before-edit', 'map-edit']:
            offsets = sorted(x['scheduledAt'] - r['startedAt'] for x in requests if x['label'] == label)
            expected = list(range(0, 28000, 2000)) if label.startswith('dashboard') else list(range(0, 28000, 1000)) if label == 'stream-state' else m['settings']['loadedNavigationOffsetsMs'] if label == 'navigation' and r['loaded'] else m['settings']['loadedBurstOffsetsMs'] if r['loaded'] else []
            a.check(p + '/schedule/' + label, offsets, expected)
        states = [x for x in sse if x['client'] == 'obs-protocol' and x['type'] == 'state']
        metrics = {
            'requestLatencyMs': stats([x['latencyMs'] for x in requests]),
            'commonDashboardMs': stats([x['latencyMs'] for x in requests if x['label'].startswith('dashboard-state')]),
            'commonStreamMs': stats([x['latencyMs'] for x in requests if x['label'] == 'stream-state']),
            'navigationMs': stats([x['latencyMs'] for x in requests if x['label'] == 'navigation']),
            'dispatchLatenessMs': stats([x['dispatchedAt'] - x['scheduledAt'] for x in requests]),
            'streamStateDeliveryMs': stats([x['receivedAt'] - x['serverTime'] for x in states if is_number(x.get('serverTime'))]),
            'streamStateEvents': len(states), 'sseBytes': sum(x['bytes'] for x in sse),
            'observedWindowMs': r['observationEnd'] - r['startedAt']}
        a.compare(p + '/metrics', r['metrics'], metrics, 'mixed_raw_metrics')
        a.check(p + '/server/startedAt', server['startedAt'], r['startedAt'])
        a.check(p + '/server/endedAfterObservation', server['endedAt'] >= r['observationEnd'])
        for key, expected in [('forbiddenAttempts', 0), ('unexpected', []), ('inflight', 0), ('activeSessions', 1), ('sseClients', {'dashboard': 1, 'stream': 1})]:
            a.check(p + '/server/' + key, server[key], expected)
        for key in ['inflight', 'forbiddenAttempts']:
            a.check(p + '/cleanup/' + key, r['cleanup'][key], 0)
        a.check(p + '/cleanup/closeMsNonnegative', r['cleanup']['closeMs'] >= 0)
        for key, value in server['coreHealth']['events'].items():
            a.check(p + '/server/coreHealth/events/' + key, value, [] if key == 'recentErrors' else 0)
        a.check(p + '/server/coreHealth/syncing', server['coreHealth']['syncing'], [])
        esi = [x for x in server['transport'] if x['host'] == 'esi.evetech.net']
        for key, expected in [('active', 0), ('queued', 0), ('errorUntil', 0), ('requests', len(esi)), ('cacheHits', 0),
                              ('coalesced', 0), ('notModified', 0), ('failed', sum(x['status'] >= 400 for x in esi))]:
            a.check(p + '/server/coreHealth/esi/' + key, server['coreHealth']['esi'][key], expected)
        a.check(p + '/server/bindingsRange', 0 <= server['unchangedBindings'] <= server['bindingUpdates'])
        meter = server['meter']
        # Match the original arithmetic order by restoring integer CPU microseconds.
        cpu = round(meter['cpuMs'] * 1000) / meter['elapsedMs'] / 10
        a.compare(p + '/server/meter/cpuPercentOneCore', meter['cpuPercentOneCore'], cpu, 'mixed_meter_arithmetic')
        a.check(p + '/server/meter/nonnegative', all(v >= 0 for v in meter.values()))
        a.check(p + '/server/meter/eventLoopUtilizationRange', 0 <= meter['eventLoopUtilization'] <= 1)
        a.check(p + '/server/meter/eventLoopOrder', meter['eventLoopDelayMaxMs'] >= meter['eventLoopDelayP95Ms'])
        a.check(p + '/server/meter/peakRssRange', meter['peakRssBytes'] >= max(meter['rssBeforeBytes'], meter['rssAfterBytes']))
        for label, client in [('dashboard', 'dashboard'), ('stream', 'obs-protocol')]:
            selected = [x for x in sse if x['client'] == client]
            expected = {'label': client, 'bytes': sum(x['bytes'] for x in selected), 'events': len(selected), 'unexpectedEnd': False, 'error': None}
            a.compare(p + '/sseStatus/' + label, r['sseStatus'][label], expected, 'mixed_sse_accounting')
        for j, event in enumerate(sse):
            a.check(p + '/sse/' + str(j) + '/bytesPositiveInteger', isinstance(event['bytes'], int) and event['bytes'] > 0)
            if 'serverTime' in event:
                a.check(p + '/sse/' + str(j) + '/receiptAfterEmission', event['receivedAt'] >= event['serverTime'])
        duplicates = sum(left['hash'] == right['hash'] for left, right in zip(states, states[1:]))
        a.compare(p + '/streamDuplicateStates', r['streamDuplicateStates'], duplicates, 'mixed_sse_accounting')
        unsafe = [x for x in server['protection'] if not x['hidden'] and
                  (x['state'] != 'highsec' or x['sourceStatus'] != 'ready' or x['sourceSystemId'] != 30000142 or x['sourceAgeMs'] >= 30000 or x['validUntil'] <= x['at'])]
        a.compare(p + '/unsafeEmissions', r['unsafeEmissions'], unsafe, 'mixed_opsec')
        clock_differences = []
        for j, protection in enumerate(server['protection']):
            q = p + '/protection/' + str(j)
            age_delta = protection['sourceAgeMs'] - (protection['at'] - millis(protection['sourceUpdatedAt']))
            a.check(q + '/ageClockReadRange', 0 <= age_delta <= 1)
            if age_delta:
                clock_differences.append({'path': q + '/sourceAgeMs', 'recordedAgeMs': protection['sourceAgeMs'],
                                          'timestampDerivedAgeMs': protection['at'] - millis(protection['sourceUpdatedAt']), 'differenceMs': age_delta})
            if 'validUntil' in protection:
                a.compare(q + '/validUntil', protection['validUntil'], millis(protection['sourceUpdatedAt']) + 30000, 'mixed_opsec_arithmetic')
            a.check(q + '/knownSourceSystem', protection['sourceSystemId'] in [30000142, 30000209])
            a.check(q + '/failClosedStates', protection['state'] not in ['hostile', 'unknown'] or protection['hidden'])
        wire = []
        for event in states:
            if event['serverTime'] >= r['startedAt'] and not event['opsec']['hidden']:
                prior = [x for x in server['protection'] if x['at'] <= event['serverTime']]
                accepted = prior[-1] if prior else None
                wire.append({'serverTime': event['serverTime'], 'receivedAt': event['receivedAt'],
                             'acceptedAt': accepted['at'] if accepted else None,
                             'valid': bool(accepted and not accepted['hidden'] and accepted['sourceStatus'] == 'ready' and accepted['state'] == 'highsec' and accepted['validUntil'] > event['serverTime'])})
        a.compare(p + '/wireUnhideValidation', r['wireUnhideValidation'], wire, 'mixed_opsec')
        a.check(p + '/wireUnhideValidation/allValid', bool(wire) and all(x['valid'] for x in wire))
        for j, call in enumerate(server['transport']):
            a.check(p + '/transport/' + str(j) + '/seq', call['seq'], j + 1)
            a.compare(p + '/transport/' + str(j) + '/elapsedMs', call['elapsedMs'], call['responseAt'] - call['requestAt'], 'mixed_transport_arithmetic')
            a.check(p + '/transport/' + str(j) + '/elapsedNonnegative', call['elapsedMs'] >= 0)
            a.check(p + '/transport/' + str(j) + '/allowedHost', call['host'] in ['esi.evetech.net', 'r2z2.zkillboard.com'])
        for j, location in enumerate(server['locations']):
            q = p + '/locations/' + str(j)
            calls = [x for x in server['transport'] if x.get('characterId') == location['characterId'] and x['responseAt'] <= location['at']]
            call = calls[-1]
            a.check(q + '/status', location['status'], 'stale' if call['status'] == 503 else 'ready')
            a.check(q + '/systemId', location['systemId'], call['systemId'])
            a.check(q + '/freshnessInterval', millis(location['expiresAt']) - millis(location['updatedAt']), 1000)
            if location['status'] == 'ready':
                a.check(q + '/updatedAtMatchesResponse', millis(location['updatedAt']), call['responseAt'])
            else:
                a.check(q + '/errorStatus', location['errorStatus'], call['status'])
        selected = [x for x in server['transport'] if x.get('characterId') == 42]
        a.check(p + '/location503', any(x['status'] == 503 for x in selected))
        a.check(p + '/recovery200', any(x['phase'] == 'recovered-highsec' and x['status'] == 200 for x in selected))
        a.check(p + '/hostileHidden', any(x['state'] == 'hostile' and x['hidden'] for x in server['protection']))
        a.check(p + '/unavailableHidden', any(x['state'] == 'unknown' and x['hidden'] for x in server['protection']))
        transitions = []
        for phase, opsec, status in [('fresh-hostile', 'hostile', 'ready'), ('fresh-highsec', 'highsec', 'ready'), ('unavailable', 'unknown', 'stale'), ('recovered-highsec', 'highsec', 'ready')]:
            call = next(x for x in selected if x['phase'] == phase and x['requestAt'] >= r['startedAt'] + (8000 if phase == 'fresh-highsec' else 0))
            stored = next(x for x in server['locations'] if x['characterId'] == 42 and x['at'] >= call['responseAt'] and x['status'] == status)
            emitted = next(x for x in server['protection'] if x['at'] >= stored['at'] and x['state'] == opsec)
            received = next(x for x in states if x['serverTime'] >= emitted['at'] and x['opsec']['state'] == opsec)
            a.check(p + '/transition/' + phase + '/hidden', received['opsec']['hidden'], opsec != 'highsec')
            transitions.append({'phase': phase, 'opsec': opsec, 'requestOffsetMs': call['requestAt'] - r['startedAt'],
                'providerResponseMs': call['responseAt'] - call['requestAt'], 'commitOffsetMs': stored['at'] - r['startedAt'],
                'commitToProtectionMs': emitted['at'] - stored['at'], 'protectionToWireReceiptMs': received['receivedAt'] - emitted['at'],
                'commitToWireReceiptMs': received['receivedAt'] - stored['at']})
        # Raw state samples are snapshots, not independent measurements of the same call.
        snapshots = [r['initial'], *server['samples'], server['final']]
        for j, sample in enumerate(snapshots):
            s = p + '/stateSnapshots/' + str(j)
            a.check(s + '/pilot', sample['selectedPilot'], 42)
            a.check(s + '/locationAgeNonnegative', sample['locationAgeMs'] >= 0)
            age_delta = sample['locationAgeMs'] - (sample['at'] - millis(sample['updatedAt']))
            a.check(s + '/ageClockReadRange', 0 <= age_delta <= 1)
            if age_delta:
                clock_differences.append({'path': s + '/locationAgeMs', 'recordedAgeMs': sample['locationAgeMs'],
                                          'timestampDerivedAgeMs': sample['at'] - millis(sample['updatedAt']), 'differenceMs': age_delta})
            a.check(s + '/freshnessInterval', millis(sample['expiresAt']) - millis(sample['updatedAt']), 1000)
            if not sample['hidden']:
                a.check(s + '/safeVisible', sample['opsec'] == 'highsec' and sample['locationStatus'] == 'ready' and sample['systemId'] == 30000142 and sample['validUntil'] > sample['at'])
        previous, repeated, freshness = {}, 0, 0
        for event in sse:
            if event['client'] == 'dashboard' and event['type'] == 'snapshot':
                snap = event['snapshot']; key = (event['characterId'], snap['key']); old = previous.get(key)
                if old and old['dataHash'] == snap['dataHash']:
                    repeated += 1
                    freshness += any(old.get(k) != snap.get(k) for k in ['updatedAt', 'expiresAt', 'status'])
                previous[key] = snap
        rebuilt_runs.append({'name': r['name'], 'loaded': r['loaded'], 'cpuPercentOneCore': meter['cpuPercentOneCore'],
            'loopMaxMs': meter['eventLoopDelayMaxMs'], 'loopP95Ms': meter['eventLoopDelayP95Ms'], 'observerLoopMaxMs': r['observerLoopMaxMs'],
            'requestCount': len(requests), 'commonDashboardMs': metrics['commonDashboardMs'], 'commonStreamMs': metrics['commonStreamMs'],
            'navigationMs': metrics['navigationMs'], 'bindings': {'calls': server['bindingUpdates'], 'unchanged': server['unchangedBindings']},
            'stream': {'stateEvents': len(states), 'unchangedContent': duplicates,
                       'unchangedEncodedBytes': sum(right['bytes'] for left, right in zip(states, states[1:]) if left['hash'] == right['hash']),
                       'encodedBytes': sum(x['bytes'] for x in sse if x['client'] == 'obs-protocol')},
            'dashboard': {'encodedBytes': sum(x['bytes'] for x in sse if x['client'] == 'dashboard'),
                          'repeatedDataSnapshots': repeated, 'changedFreshnessSnapshots': freshness},
            'actualLocationCalls': len(selected), 'transitions': transitions, 'cleanup': r['cleanup']})
        mixed_details.append({'name': r['name'], 'httpRequests': len(requests), 'httpStatusCounts': dict(collections.Counter(str(x['status']) for x in requests)),
            'observedWindowMs': metrics['observedWindowMs'], 'nominalWindowMs': m['settings']['nominalWindowMs'],
            'windowDifferenceMs': metrics['observedWindowMs'] - m['settings']['nominalWindowMs'],
            'serverEpochWindowMs': server['endedAt'] - server['startedAt'], 'serverMonotonicWindowMs': meter['elapsedMs'],
            'stateSamples': len(server['samples']), 'sseEvents': len(sse), 'requestLabels': dict(labels),
            'workerCleanup': r['cleanup'], 'workerExitRecord': None, 'metricsRecomputed': metrics})
        mixed_details[-1]['separateClockReadDifferences'] = clock_differences
    rebuilt_summary = {'schemaVersion': 1, 'sourceCommit': m['sourceCommit'], 'settings': m['settings'], 'runs': rebuilt_runs, 'complete': True}
    a.compare('mixed-summary', summary, rebuilt_summary, 'mixed_summary_all_fields')

    a.check('restart/sourceCommit', restart['sourceCommit'], COMMIT, 'provenance')
    a.check('restart/sourceWorkingTree', restart['sourceWorkingTree'], [''], 'provenance')
    candidate_by_path = {x['path']: x for x in candidate['files']}
    a.check('restart/sourceCount', len(restart['sources']), 92, 'provenance')
    for source in restart['sources']:
        a.check('restart/source/' + source['path'], source['sha256'], candidate_by_path[source['path']]['sha256'], 'provenance')
    for harness in restart['harnesses']:
        a.check('restart/harness/' + harness['path'], harness['sha256'], provenance['harnessSha256']['analysis/rc17/harness/' + harness['path']], 'provenance')
    for key, records in [('Source', restart['sources']), ('Harness', restart['harnesses'])]:
        digest = sha(encoded(records))
        for when in ['before', 'after']:
            a.check('restart/' + when + key + 'Digest', restart[when + key + 'Digest'], digest, 'provenance')
    for key in ['sourcesAndHarnessesUnchanged', 'completed']:
        a.check('restart/' + key, restart[key])
    a.check('restart/labels', [x['label'] for x in restart['scenarios']], ['drain-accepted', 'drain-semantic-after-http'])
    restart_details = []
    for i, scenario in enumerate(restart['scenarios']):
        p = 'restart/scenarios/' + str(i); trace = scenario['trace']
        for key in ['completed', 'assertionsPassed', 'activeSessionRetained', 'sameCookieAccepted', 'csrfPreserved', 'oldExitedBeforeNewFork', 'distinctPIDs', 'plannedNoticeBeforeClose', 'allOBSStatesProtected']:
            a.check(p + '/' + key, scenario[key])
        for key, expected in [('acceptedGoalStatus', 201), ('acceptedReadStatus', 200), ('newWriteDuringCloseStatus', 503),
                              ('goalRowsRetained', 1), ('goalEventsRetained', 1), ('milestoneEventsRetained', 1),
                              ('postRestartCSRFWriteStatus', 200), ('newGenerationBuild', 9000001), ('retainedGenerationCount', 1),
                              ('sessionSecretOnDatasetDisk', False), ('stderr', []), ('connectionStates', ['restarting', 'refreshing', 'idle']),
                              ('refreshes', ['9000001:9000001:9000001']), ('completions', ['9000001:9000001:9000001'])]:
            a.check(p + '/' + key, scenario[key], expected)
        a.check(p + '/traceOrder', [x['order'] for x in trace], list(range(1, len(trace) + 1)))
        def event(name, generation=1):
            return next(x for x in trace if x['event'] == name and x.get('generation', generation) == generation)
        fork1, fork2, exit1, exit2 = event('fork'), event('fork', 2), event('exit'), event('exit', 2)
        close, persisted, database = event('child:close-started'), event('child:milestone-event-persisted'), event('child:database-closed')
        http, core = event('accepted-http-completed'), event('child:core-close-started')
        a.check(p + '/independentDistinctPIDs', fork1['pid'] != fork2['pid'])
        a.check(p + '/independentExitBeforeFork', exit1['order'] < fork2['order'])
        a.check(p + '/independentNoticeBeforeClose', event('dashboard:dataset-restarting')['order'] < close['order'])
        a.check(p + '/pendingAtClose', sorted(close['pending']), ['accepted-goal', 'accepted-read', 'bus-names'])
        a.check(p + '/semanticType', persisted['semanticType'], 'skill.completed')
        a.check(p + '/persistBeforeDatabaseClose', persisted['order'] < database['order'])
        a.check(p + '/persistAfterDatabaseClose', persisted['afterDatabaseClose'], False)
        a.check(p + '/databaseClosePending', database['pending'], [])
        if scenario['label'] == 'drain-accepted':
            a.check(p + '/semanticBeforeHttp', persisted['order'] < http['order'])
        else:
            a.check(p + '/httpBeforeCoreBeforeSemantic', http['order'] < core['order'] < persisted['order'])
            held = event('child:summary')['summary']
            a.check(p + '/heldDatabaseOpen', held['databaseClosed'], False)
            a.check(p + '/heldBusNames', 'bus-names' in held['pending'])
            a.check(p + '/heldSemanticPending', held['eventWork']['pending'] > 0)
            a.check(p + '/heldBeforeNewFork', event('child:summary')['order'] < fork2['order'])
        for generation in [1, 2]:
            fork, ex = event('fork', generation), event('exit', generation)
            a.check(p + '/exit/' + str(generation) + '/code', ex['code'], 0)
            a.check(p + '/exit/' + str(generation) + '/signal', ex['signal'], None)
            a.check(p + '/exit/' + str(generation) + '/pid', ex['pid'], fork['pid'])
            for row in [x for x in trace if x.get('generation') == generation and 'pid' in x]:
                a.check(p + '/trace/' + str(row['order']) + '/pid', row['pid'], fork['pid'])
            final = event('child:close-returned', generation)['summary']
            for key, expected in [('externalNetworkAttempts', 0), ('unplannedFakeRequests', []), ('pending', []), ('postCloseOperations', []),
                                  ('errors', []), ('databaseClosed', True), ('closeStarted', True), ('exitGraceUsed', False),
                                  ('eventWork', {'pending': 0, 'failures': 0, 'recentErrors': []})]:
                a.check(p + '/final/' + str(generation) + '/' + key, final[key], expected)
            a.check(p + '/final/' + str(generation) + '/beforeExit', event('child:close-returned', generation)['order'] < ex['order'])
        expected_old = dict(event('child:close-returned')['summary']); expected_old['type'] = 'probe-final'
        a.compare(p + '/oldChild', scenario['oldChild'], expected_old, 'restart_old_child_consistency')
        for row in trace:
            if 'afterDatabaseClose' in row:
                a.check(p + '/trace/' + str(row['order']) + '/afterDatabaseClose', row['afterDatabaseClose'], False)
        coordinator = [x['event'].split(':', 1)[1] for x in trace if x['event'].startswith('coordinator:')]
        a.check(p + '/coordinatorMatchesTrace', scenario['connectionStates'], coordinator)
        restart_details.append({'label': scenario['label'], 'traceEvents': len(trace), 'acceptedHTTPCompletedOrder': http['order'],
            'semanticPersistedOrder': persisted['order'], 'coreCloseOrder': core['order'], 'databaseClosedOrder': database['order'],
            'oldExitOrder': exit1['order'], 'replacementForkOrder': fork2['order'], 'exitRecords': [exit1, exit2],
            'reportedRetentionAndHTTP': {k: v for k, v in scenario.items() if k not in ['oldChild', 'trace', 'stderr']}})

    for key in ['featureChecksComplete', 'complete', 'sourceVerified', 'cleanupVerified']:
        a.check('maps-browser/' + key, browser[key])
    a.check('maps-browser/errors', browser['errors'], [])
    a.check('maps-browser/external', browser['external'], [])
    a.check('maps-browser/checkCount', len(browser['checks']), 17)
    a.check('maps-browser/uniqueChecks', len(set(browser['checks'])), len(browser['checks']))
    a.check('maps-browser/browserExit', browser['browserExit'], {'started': True, 'code': 0, 'signal': None, 'closed': True})
    for i, request in enumerate(browser['requests']):
        u = urlparse(request)
        a.check('maps-browser/requests/' + str(i) + '/loopback', u.scheme == 'http' and u.hostname == '127.0.0.1')
    a.check('maps-browser/timeOrder', millis(browser['endedAt']) >= millis(browser['startedAt']))
    summary_numeric = [x for x in a.numeric_comparisons if x['path'].startswith('mixed-summary/')]
    summary_run_numeric = [x for x in summary_numeric if x['path'].startswith('mixed-summary/runs/')]
    raw_metric_numeric = [x for x in a.numeric_comparisons if x['path'].startswith('mixed/runs/') and '/metrics/' in x['path']]
    return {'schemaVersion': 1, 'auditScope': 'Original CI run 38176821997 attempt 1 only; offline artifact arithmetic and semantic evidence audit; no local run substitution.',
        'runUrl': URL, 'candidateCommit': COMMIT,
        'inputs': [{'path': name, 'bytes': (evidence / name).stat().st_size, 'sha256': sha((evidence / name).read_bytes())} for name in FILES],
        'method': {'quantiles': 'Nearest rank: sorted[ceil(n*q)-1], including upper order statistic on p50 and null empty quantiles.',
                   'numericComparison': 'Exact equality; every mismatch retained. The all-numeric inventory excludes booleans.',
                   'clock': 'Observer latency and worker meter are separate monotonic readings; epoch Date.now timestamps have millisecond granularity. No observed window is rounded to nominal.',
                   'limits': ['Primitive recorded CPU, memory, loop-delay, observer latency, counters and payload hashes cannot be independently remeasured without omitted underlying samples/bytes; numeric validity and all available algebra/aggregation are checked.',
                              'Source manifests are internally fingerprinted and cross-matched; this script does not independently fetch or rehash original CI checkout blobs.',
                              'Mixed worker cleanup RPC is present for four workers, but individual worker exit status/signal is not persisted.',
                              'Restart HTTP statuses, persistence row counts, cookie/CSRF, OBS payload protection and disk-secret checks are reported assertions; trace corroborates ordering/cleanup but does not contain original response bodies or dataset files.',
                              'Maps browser records 17 harness assertions, request URLs and clean exit; this audit cannot replay DOM assertions from result.json.',
                              'Loaded/quiet mixed windows change workload on the same candidate and are not RC16/candidate performance comparisons.']},
        'numericCoverage': inventory, 'checkCounts': dict(a.counts), 'checksTotal': sum(a.counts.values()),
        'numericComparisons': a.numeric_comparisons,
        'mixed': {'summaryRunNumericFieldsCompared': len(summary_run_numeric), 'summaryAllNumericFieldsCompared': len(summary_numeric),
                  'rawMetricNumericFieldsCompared': len(raw_metric_numeric), 'rawMetricLeafFieldsCompared': sum(len(list(leaves(r['metrics']))) for r in m['runs']),
                  'requestsTotal': sum(len(r['requests']) for r in m['runs']), 'workersWithCleanupRecords': len(m['runs']),
                  'workerExitRecordsPersisted': 0, 'windows': mixed_details, 'rebuiltSummary': rebuilt_summary},
        'sourceFingerprintChecks': source_results,
        'restart': {'sourceHashesMatchedToCandidateManifest': len(restart['sources']), 'harnessHashesMatchedToRunProvenance': len(restart['harnesses']),
                    'exitRecordsVerified': sum(len(x['exitRecords']) for x in restart_details), 'scenarios': restart_details,
                    'boundaries': restart['boundaries'], 'safetyConclusion': restart['safetyConclusion']},
        'mapsBrowser': {'reportedChecks': browser['checks'], 'requestCount': len(browser['requests']), 'browserExit': browser['browserExit'],
                        'assertionScope': 'Recorded feature assertions and cleanup, not camera performance or human review.'},
        'differences': a.differences, 'differenceCount': len(a.differences), 'pass': not a.differences}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence', type=Path)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    result = audit(args.evidence)
    result['auditScriptSha256'] = sha(Path(__file__).read_bytes())
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / 'CI-MIXED-RESTART-AUDIT.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'pass': result['pass'], 'checks': result['checksTotal'], 'differences': result['differenceCount'],
                      'summaryRunNumericFields': result['mixed']['summaryRunNumericFieldsCompared'],
                      'summaryAllNumericFields': result['mixed']['summaryAllNumericFieldsCompared'],
                      'rawMetricNumericFields': result['mixed']['rawMetricNumericFieldsCompared'],
                      'httpRequests': result['mixed']['requestsTotal'], 'restartExits': result['restart']['exitRecordsVerified']}))
    if not result['pass']:
        print(json.dumps(result['differences'], indent=2))
    raise SystemExit(0 if result['pass'] else 1)


if __name__ == '__main__':
    main()

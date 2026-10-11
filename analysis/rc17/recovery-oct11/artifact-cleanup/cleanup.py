"""Delete only the frozen, authorized superseded test-build artifact identities."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

REPOSITORY = 'BunBajiro/kairo'
WORKFLOW_ID = 354534933
REQUEST_SHA256 = 'af6dd38ed523b35ac9471256536627979744cab4391c0cfe175eab2bbffe6f9c'
RUN_FIELDS = ('id', 'name', 'run_number', 'head_sha', 'head_branch', 'path', 'workflow_id', 'status', 'conclusion', 'created_at')
ARTIFACT_FIELDS = ('id', 'node_id', 'name', 'size_in_bytes', 'digest', 'created_at', 'updated_at', 'expires_at', 'expired', 'workflow_run')
NAMES = {'Kairo-test-build.zip', 'Kairo-test-build.sha256', 'session-interface-check', 'universe-interface-check', 'datasets-interface-check'}
NUMBERS = set(range(25, 65)) - {48, 54}

def require(condition, message):
    if not condition:
        raise ValueError(message)

def identity(value, fields):
    return {key: value[key] for key in fields}

def validate_request(request):
    require(request['schemaVersion'] == 1 and request['repository'] == REPOSITORY, 'Wrong request/repository')
    require(set(request['allowedArtifactNames']) == NAMES, 'Changed artifact-name scope')
    runs = request['runs']
    require(len(runs) == 38 and {r['run_number'] for r in runs} == NUMBERS, 'Changed run-number scope')
    require(len({r['id'] for r in runs}) == len(runs), 'Duplicate run identity')
    for run in runs:
        require(type(run['id']) is int and run['id'] > 0, 'Invalid run ID')
        require(run['name'] == 'Kairo test build' and run['workflow_id'] == WORKFLOW_ID and
                run['path'] == '.github/workflows/test-build.yml' and run['status'] == 'completed', 'Not a completed ordinary test build')
    by_id = {run['id']: run for run in runs}
    artifacts = request['artifacts']
    require(len(artifacts) == 124 and len({a['id'] for a in artifacts}) == len(artifacts), 'Changed artifact count or duplicate ID')
    for artifact in artifacts:
        require(type(artifact['id']) is int and artifact['id'] > 0, 'Invalid artifact ID')
        require(artifact['name'] in NAMES and artifact['expired'] is False, 'Artifact outside authorized name/expiry scope')
        run = by_id[artifact['workflow_run']['id']]
        require(artifact['workflow_run']['head_sha'] == run['head_sha'] and artifact['workflow_run']['head_branch'] == run['head_branch'], 'Artifact/run identity mismatch')
        require(artifact['workflow_run']['repository_id'] == 1363191780 and artifact['workflow_run']['head_repository_id'] == 1363191780, 'Artifact from unexpected repository')
        require(type(artifact['size_in_bytes']) is int and artifact['size_in_bytes'] >= 0, 'Invalid artifact size')
    require(sum(a['size_in_bytes'] for a in artifacts) == 2041005576, 'Changed reviewed byte total')
    return by_id

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None

class Github:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())
    def __call__(self, method, path):
        require(path.startswith('/actions/runs/') or path.startswith('/actions/artifacts/'), 'Unexpected API path')
        request = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + path, method=method,
            headers={'Authorization': 'Bearer ' + self.token, 'Accept': 'application/vnd.github+json',
                     'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Kairo-internal-artifact-cleanup'})
        try:
            with self.opener.open(request, timeout=30) as response:
                body = response.read()
                return response.status, json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            # Never print headers, token or response body. 404 is useful only to
            # prove absence after a successful deletion; callers reject it elsewhere.
            return error.code, None

def read_identity(api, path, expected, fields):
    status, actual = api('GET', path)
    require(status == 200, 'Identity read failed at ' + path + ': HTTP ' + str(status))
    require(identity(actual, fields) == expected, 'Live identity changed at ' + path)

def preflight(request, api):
    validate_request(request)
    for run in request['runs']:
        read_identity(api, '/actions/runs/' + str(run['id']), run, RUN_FIELDS)
    for artifact in request['artifacts']:
        read_identity(api, '/actions/artifacts/' + str(artifact['id']), artifact, ARTIFACT_FIELDS)

def plan(request, request_sha, api):
    preflight(request, api)
    return {'schemaVersion': 1, 'requestSha256': request_sha,
            'sourceCommit': os.environ['GITHUB_SHA'], 'cleanupRun': os.environ['GITHUB_RUN_ID'],
            'repository': REPOSITORY, 'runCount': len(request['runs']),
            'artifactCount': len(request['artifacts']), 'bytes': sum(a['size_in_bytes'] for a in request['artifacts']),
            'preserved': 'All unlisted artifacts, test builds #48/#54/#65, internal performance/release artifacts, all runs and logs',
            'artifacts': request['artifacts']}

def delete(request, request_sha, planned, api, emit):
    require(planned['requestSha256'] == request_sha and planned['sourceCommit'] == os.environ['GITHUB_SHA'] and
            planned['cleanupRun'] == os.environ['GITHUB_RUN_ID'] and planned['repository'] == REPOSITORY,
            'Plan is not from this frozen request/workflow run')
    require(planned['artifacts'] == request['artifacts'], 'Plan targets differ from frozen request')
    # Validate every target again before the first mutation, then each target
    # immediately before its deletion. A mismatch stops and preserves progress.
    receipt = {'schemaVersion': 1, 'requestSha256': request_sha, 'sourceCommit': os.environ['GITHUB_SHA'],
               'cleanupRun': os.environ['GITHUB_RUN_ID'], 'complete': False, 'deleted': [], 'attempts': []}
    try:
        preflight(request, api)
        for artifact in request['artifacts']:
            path = '/actions/artifacts/' + str(artifact['id'])
            read_identity(api, path, artifact, ARTIFACT_FIELDS)
            row = {'id': artifact['id'], 'name': artifact['name'], 'runId': artifact['workflow_run']['id'],
                   'bytes': artifact['size_in_bytes'], 'digest': artifact['digest']}
            receipt['attempts'].append(row)
            emit('DELETE_ATTEMPT', row)
            status, _ = api('DELETE', path)
            row['deleteHttpStatus'] = status
            emit('DELETE_RESULT', row)
            require(status == 204, 'Deletion failed for artifact ' + str(artifact['id']) + ': HTTP ' + str(status))
            status, _ = api('GET', path)
            row['absenceHttpStatus'] = status
            require(status == 404, 'Deletion absence was not confirmed for artifact ' + str(artifact['id']))
            receipt['deleted'].append(dict(row))
            emit('DELETED', row)
        receipt['complete'] = True
    except Exception as error:
        receipt['failure'] = str(error)
    finally:
        receipt['confirmedDeletedCount'] = len(receipt['deleted'])
        receipt['confirmedDeletedBytes'] = sum(a['bytes'] for a in receipt['deleted'])
        emit('FINAL_RECEIPT', receipt)
    return receipt

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['plan', 'delete'])
    parser.add_argument('--request', required=True)
    parser.add_argument('--plan', required=True)
    parser.add_argument('--receipt')
    args = parser.parse_args()
    require(os.environ['GITHUB_REPOSITORY'] == REPOSITORY, 'Wrong execution repository')
    require(os.environ['GITHUB_REF'] == 'refs/heads/perf/rc16-checkpoint-v0.8.0', 'Wrong execution branch')
    data = Path(args.request).read_bytes()
    request = json.loads(data)
    request_sha = hashlib.sha256(data).hexdigest()
    require(request_sha == REQUEST_SHA256, 'Request bytes differ from independently reviewed fixed deletion request')
    api = Github(os.environ['GH_TOKEN'])
    def emit(label, value):
        print(label + ' ' + json.dumps(value, separators=(',', ':')), flush=True)
        if label == 'FINAL_RECEIPT' and args.receipt:
            Path(args.receipt).write_text(json.dumps(value, indent=2) + '\n')
    if args.mode == 'plan':
        planned = plan(request, request_sha, api)
        Path(args.plan).write_text(json.dumps(planned, indent=2) + '\n')
        emit('REVIEWED_DELETION_PLAN', planned)
    else:
        require(args.receipt, 'Receipt destination required')
        receipt = delete(request, request_sha, json.loads(Path(args.plan).read_text()), api, emit)
        require(receipt['complete'], receipt.get('failure', 'Incomplete deletion'))

if __name__ == '__main__':
    main()

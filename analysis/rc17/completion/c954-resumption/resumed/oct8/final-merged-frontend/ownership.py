"""Map a local process group to mounted /proc without crossing PID namespaces."""
import os
from pathlib import Path

class UnknownGroup(RuntimeError):
    pass

def status_ids(text, key):
    return [int(value) for line in text.splitlines() if line.startswith(key + ':') for value in line.split()[1:]]

def select_members(group, records, namespace_inode, depth):
    anchors = {row['host_pgid'] for row in records
        if row.get('namespace_inode') == namespace_inode and len(row['namespace_pgids']) == depth
        and row['namespace_pgids'][-1] == group}
    if len(anchors) != 1:
        raise UnknownGroup('Live local group lacks one trustworthy namespace/host anchor')
    host_group = anchors.pop()
    owned = [row for row in records if row['host_pgid'] == host_group]
    if not owned or any(row['host_sid'] != host_group for row in owned):
        raise UnknownGroup('Owned new-session group has missing or inconsistent session identity')
    return sorted([{'pid': row['pid'], 'state': row['state']} for row in owned], key=lambda row: row['pid'])

class NamespaceCensus:
    def __init__(self, proc=Path('/proc')):
        self.proc = Path(proc)
        status = (self.proc / 'self/status').read_text()
        self.pids = status_ids(status, 'NSpid')
        self.pgids = status_ids(status, 'NSpgid')
        self.namespace_inode = (self.proc / 'self/ns/pid').stat().st_ino
        if not self.pids or self.pids[-1] != os.getpid() or not self.pgids or self.pgids[-1] != os.getpgrp() or len(self.pids) != len(self.pgids):
            raise UnknownGroup('Mounted /proc cannot be reconciled with this process namespace')
        self.depth = len(self.pids)

    @staticmethod
    def exists(group):
        if not isinstance(group, int) or group <= 1:
            raise UnknownGroup('Only positive owned child process groups may be observed')
        try:
            os.killpg(group, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError as error:
            raise UnknownGroup('Local group existence is inaccessible') from error

    def members(self, group):
        if not self.exists(group):
            return []
        records = []
        for directory in self.proc.iterdir():
            if not directory.name.isdigit():
                continue
            try:
                fields = (directory / 'stat').read_text().rsplit(')', 1)[1].split()
                ids = status_ids((directory / 'status').read_text(), 'NSpgid')
                row = {'pid': int(directory.name), 'state': fields[0], 'host_pgid': int(fields[2]), 'host_sid': int(fields[3]), 'namespace_pgids': ids}
                # Only same-depth possible anchors need an inode read. All host
                # group members, including nested namespaces, remain in records.
                if len(ids) == self.depth and ids[-1] == group:
                    row['namespace_inode'] = (directory / 'ns/pid').stat().st_ino
                records.append(row)
            except (FileNotFoundError, ProcessLookupError):
                continue
            except (OSError, ValueError, IndexError) as error:
                raise UnknownGroup('Process census inaccessible or malformed') from error
        # A fast child can exit during the scan; local ESRCH is authoritative.
        if not self.exists(group):
            return []
        return select_members(group, records, self.namespace_inode, self.depth)

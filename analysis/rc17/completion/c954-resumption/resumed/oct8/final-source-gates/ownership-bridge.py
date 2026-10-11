"""Bounded JSON bridge to the unchanged, independently reviewed ownership helper."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'final-merged-frontend'))
from ownership import NamespaceCensus, UnknownGroup

if __name__ == '__main__':
    group = int(sys.argv[1])
    census = NamespaceCensus()
    members = census.members(group)
    exists = census.exists(group)
    if exists and not members:
        raise UnknownGroup('Live local group lacks a trustworthy census')
    print(json.dumps({'exists': exists, 'members': members if exists else []}))

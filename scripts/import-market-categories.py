"""Build Kairo's compact, offline market taxonomy from CCP's JSONL SDE.
Usage: python scripts/import-market-categories.py SDE_DIRECTORY BUILD_NUMBER SOURCE_URL
marketGroups.jsonl and types.jsonl are required from the official archive.
Include npcCorporations.jsonl to refresh the optional NPC ownership seed.
"""
# Offline developer regeneration, not the managed runtime updater. This overwrites
# bundled taxonomy and, only when its input exists, NPC ownership; omitting that
# optional file preserves the previous ownership seed. Volumes are packaged m³.
# Parent integrity is checked before publishing. See docs/UNIVERSE-DATA.md.
import json,sys
from pathlib import Path
source=Path(sys.argv[1]);groups={};volumes={}
for line in (source/'marketGroups.jsonl').open(encoding='utf-8'):
    r=json.loads(line)
    groups[r['_key']]={'id':r['_key'],'parentId':r.get('parentGroupID',0),'name':r['name']['en'],'types':[]}
for line in (source/'types.jsonl').open(encoding='utf-8'):
    r=json.loads(line);group=r.get('marketGroupID')
    if group in groups:
        groups[group]['types'].append(r['_key'])
        if r.get('packagedVolume') is not None:volumes[r['_key']]=r['packagedVolume']
for g in groups.values():
    assert not g['parentId'] or g['parentId'] in groups,g
    g['types'].sort()
output={'build':int(sys.argv[2]),'source':sys.argv[3],'groups':sorted(groups.values(),key=lambda g:g['id']),'volumes':volumes}
path=Path(__file__).resolve().parents[1]/'server/data/market-categories.json'
path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(output,separators=(',',':'),ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'groups':len(groups),'assignedTypes':sum(len(g['types']) for g in groups.values()),'bytes':path.stat().st_size,'roots':[g['name'] for g in groups.values() if not g['parentId']]}))

# Optional NPC ownership seed supplies factions omitted by public corporation ESI.
owners=source/'npcCorporations.jsonl'
if owners.exists():
    rows=[json.loads(line) for line in owners.open(encoding='utf-8')]
    data={'source':sys.argv[3],'build':int(sys.argv[2]),'corporations':{str(r['_key']):{'name':r['name']['en'],'factionId':r.get('factionID',0)} for r in rows}}
    (path.parent/'npc-market-owners.json').write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False)+'\n',encoding='utf-8')

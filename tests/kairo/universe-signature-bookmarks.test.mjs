import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSignatureBookmark, validateBookmarkTemplate, BOOKMARK_DEFAULT } from '../../components/kairo/universe-signature-bookmarks.mjs';

const system = { name: 'J225111', space: 'wormhole', wormhole: { classLabel: 'C4', statics: [{ type: 'P060', destinationClasses: [{ label: 'C1' }] }] } };
const signature = { signature_id: 'ABC-123', type: 'Wormhole', wh_type: 'P060', name: 'Unstable Wormhole', bookmark_index: 27 };

test('bookmark names interpolate reference and observed context without creating endpoints or live claims', () => {
    assert.equal(formatSignatureBookmark(BOOKMARK_DEFAULT, signature, system), 'ABC-123 P060 C1');
    assert.equal(formatSignatureBookmark('{sig_letters} {index} {index_letter} {system} {class} {direction} {spawn_type}', signature, system), 'ABC 27 AA J225111 C4 Out Static');
    assert.equal(formatSignatureBookmark('{sig} {destination} {dest_type}', signature, system, { name: 'J100001', wormhole: { classLabel: 'C2' } }), 'ABC-123 J100001 C2');
    assert.equal(formatSignatureBookmark('{sig} {destination} {dest_type} {type}', { ...signature, wh_type: 'K162' }, system), 'ABC-123 K162');
    assert.equal(formatSignatureBookmark('{name} {description}', { ...signature, name: 'A $& name', notes: 'two\nlines' }, system), 'A $& name two lines');
});

test('bookmark formats reject unknown or malformed tokens and produce bounded plain text', () => {
    assert.throws(() => validateBookmarkTemplate('{missing}'), /Unknown bookmark token/);
    assert.throws(() => validateBookmarkTemplate('{sig'), /matching brace/);
    assert.throws(() => validateBookmarkTemplate('a\nb'), /printable/);
    assert.throws(() => validateBookmarkTemplate(''), /1–240/);
    assert.equal(formatSignatureBookmark('{name}', { name: 'x'.repeat(500) }, system).length, 240);
    assert.equal(formatSignatureBookmark('{name}', { name: '<script>alert(1)</script>' }, system), '<script>alert(1)</script>', 'Plain text is rendered by React/clipboard, never evaluated as HTML');
});

test('all Wanderer token names support bounded labels, explicit chain names and deliberate return holes', () => {
    const value = { ...signature, id: 'sig-a', system_id: 1, bookmark_chain: '121', bookmark_chain_letters: 'A21', temporary_name: 'Entrance', type_reference: { type:'P060', destinationClasses:[{label:'C1'}], maxJumpMassKg:62000000, totalMassKg:500000000 } };
    const connection = { mass:'critical', life_status:'stable', expires_at:'2026-09-25T15:00:00Z' };
    const formatted = formatSignatureBookmark('{chain_index} {chain_index_letters} {temporary_name} {mass} {size} {time_status} {mass_status}',value,system,null,{connection,now:Date.parse('2026-09-25T12:00:00Z')});
    assert.equal(formatted,'121 A21 Entrance 0.5 M 4H Crit');
    assert.equal(formatSignatureBookmark('{sig} {direction} {spawn_type} {dest_type} {mass_status}',value,system,null,{connection,mapping:{direction_outgoing:'→',spawn_static:'S',class_c1:'One',mass_verge:'!'}}),'ABC-123 → S One !');
    assert.equal(formatSignatureBookmark('{index}/{index_letter}/{chain_index}/{chain_index_letters}',{...value,is_return_hole:true},system,null,{returnSymbol:'BACK'}),'BACK/BACK/BACK/BACK');
    assert.equal(formatSignatureBookmark('{index} {index_letter}',{...value,bookmark_index:0},system,null,{startAtZero:true}),'0 A');
    assert.equal(formatSignatureBookmark('{time_status}',value,system,null,{connection,now:Date.parse('2026-09-26T12:00:00Z')}),'Expired');
    assert.equal(formatSignatureBookmark('{time_status}',value,system,null,{connection:{...connection,life_status:'collapsed'}}),'Closed');
    assert.equal(formatSignatureBookmark('{time_status} {mass_status}',value,system),'', 'Reference mass/type never manufactures current conditions');
});

test('class suffixes reflect same-system observations and custom mapping rejects unsafe keys or unbounded labels', async () => {
    const {validateBookmarkMapping} = await import('../../components/kairo/universe-signature-bookmarks.mjs');
    const value={...signature,id:'one',system_id:1}, other={...signature,id:'two',signature_id:'DEF-456',system_id:1};
    const options={signatures:[other,value],systems:new Map()};
    assert.equal(formatSignatureBookmark('{dest_type}{dest_class_index}',value,system,null,options),'C1a');
    assert.equal(formatSignatureBookmark('{dest_type}{dest_class_index}',other,system,null,options),'C1b');
    assert.equal(formatSignatureBookmark('{dest_type}{dest_class_index}',value,system,null,{...options,signatures:[value,{...other,missing:true}]}),'C1');
    assert.throws(()=>validateBookmarkMapping({'made_up':'value'}),/known bookmark label/);
    assert.throws(()=>validateBookmarkMapping(JSON.parse('{"__proto__":"x"}')),/known bookmark label/);
    assert.throws(()=>validateBookmarkMapping({mass_verge:'x'.repeat(33)}),/32 printable/);
    assert.throws(()=>validateBookmarkMapping({mass_verge:'a\nb'}),/32 printable/);
    assert.deepEqual(validateBookmarkMapping({mass_verge:''}),{mass_verge:''},'Empty custom labels intentionally suppress a token');
});

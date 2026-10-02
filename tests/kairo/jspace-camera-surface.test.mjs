import test from 'node:test';
import assert from 'node:assert/strict';
import {paintChainCamera} from '../../components/kairo/jspace-camera-surface.mjs';

function surface() {
    const element = () => ({dataset: {}, style: {}, textContent: '', disabled: false});
    return {root: element(), viewport: element(), world: element(), output: element(), zoomOut: element(), zoomIn: element(), minimap: {attributes: {}, setAttribute(key, value) {this.attributes[key] = value;}}};
}

test('camera keeps world, viewport, controls and overview in the same coordinate system', () => {
    const view = surface();
    paintChainCamera(view, {x: -120, y: 80, zoom: .5}, {width: 900, height: 620}, {min: .5, max: 2});
    assert.equal(view.world.style.transform, 'translate(-120px,80px) scale(0.5)');
    assert.deepEqual(view.minimap.attributes, {x: '240', y: '-160', width: '1800', height: '1240'});
    assert.equal(view.viewport.style.backgroundSize, '20px 20px');
    assert.equal(view.output.textContent, '50%');
    assert.equal(view.zoomOut.disabled, true);
    assert.equal(view.zoomIn.disabled, false);
    paintChainCamera(view, {x: 20, y: 40, zoom: 2}, {width: 400, height: 300}, {min: .5, max: 2});
    assert.equal(view.zoomOut.disabled, false);
    assert.equal(view.zoomIn.disabled, true);
    assert.deepEqual(view.minimap.attributes, {x: '-10', y: '-20', width: '200', height: '150'});
    assert.equal(view.root.dataset.cameraZoom, '2');
});

test('camera paints only its supplied surface and tolerates a collapsed overview', () => {
    const detached = surface(), original = surface();
    detached.minimap = null;
    paintChainCamera(detached, {x: 4, y: 6, zoom: 1}, {width: 500, height: 300}, {min: .1, max: 2});
    assert.equal(detached.world.style.transform, 'translate(4px,6px) scale(1)');
    assert.deepEqual(original.world.style, {});
    assert.deepEqual(original.root.dataset, {});
    assert.doesNotThrow(() => paintChainCamera({}, {x: 0, y: 0, zoom: 1}, {width: 0, height: 0}, {min: .1, max: 2}));
});

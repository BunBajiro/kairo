// Camera owns only transforms and its controls. React owns the map scene.
// Keeping these references explicit also supports a surface in another window.
export function paintChainCamera(surface, camera, size, limits) {
    const {x, y, zoom} = camera;
    if (surface.root) {
        surface.root.dataset.cameraX = String(x);
        surface.root.dataset.cameraY = String(y);
        surface.root.dataset.cameraZoom = String(zoom);
    }
    if (surface.viewport) {
        surface.viewport.dataset.zoom = String(zoom);
        surface.viewport.style.backgroundPosition = `${x}px ${y}px`;
        surface.viewport.style.backgroundSize = `${40 * zoom}px ${40 * zoom}px`;
    }
    if (surface.world) surface.world.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
    if (surface.output) {
        const label = `${Math.round(zoom * 100)}%`;
        if (surface.output.textContent !== label) surface.output.textContent = label;
        surface.output.dataset.zoom = String(zoom);
    }
    if (surface.zoomOut) surface.zoomOut.disabled = zoom <= limits.min + .001;
    if (surface.zoomIn) surface.zoomIn.disabled = zoom >= limits.max - .001;
    if (surface.minimap) {
        for (const [name, value] of Object.entries({x: -x / zoom, y: -y / zoom, width: size.width / zoom, height: size.height / zoom})) {
            surface.minimap.setAttribute(name, String(value));
        }
    }
}

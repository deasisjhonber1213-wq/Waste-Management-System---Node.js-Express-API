function isValidCoordinate(point) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function getRouteGeometry(raw) {
    let parsed = raw;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (err) {
            return { road: [], stops: [] };
        }
    }

    const road = Array.isArray(parsed)
        ? parsed
        : parsed?.road_path || parsed?.road || [];
    const stops = Array.isArray(parsed)
        ? []
        : parsed?.pin_stops || parsed?.pins || [];
    const normalize = points => Array.isArray(points)
        ? points.filter(isValidCoordinate)
            .map(point => ({ lat: Number(point.lat), lng: Number(point.lng) }))
        : [];
    return { road: normalize(road), stops: normalize(stops) };
}

function distanceToSegmentMeters(point, start, end) {
    const latitudeScale = 111320;
    const longitudeScale = latitudeScale * Math.cos(point.lat * Math.PI / 180);
    const px = point.lng * longitudeScale;
    const py = point.lat * latitudeScale;
    const ax = start.lng * longitudeScale;
    const ay = start.lat * latitudeScale;
    const bx = end.lng * longitudeScale;
    const by = end.lat * latitudeScale;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    return Math.hypot(px - (ax + fraction * dx), py - (ay + fraction * dy));
}

function distanceFromRouteMeters(point, road) {
    if (!isValidCoordinate(point) || !road.length) return Infinity;
    if (road.length === 1) return distanceToSegmentMeters(point, road[0], road[0]);
    let nearest = Infinity;
    for (let index = 1; index < road.length; index++) {
        nearest = Math.min(nearest, distanceToSegmentMeters(point, road[index - 1], road[index]));
    }
    return nearest;
}

function isNearRoute(point, raw, radiusMeters = 500) {
    const { road, stops } = getRouteGeometry(raw);
    return distanceFromRouteMeters(point, road) <= radiusMeters ||
        stops.some(stop => distanceToSegmentMeters(point, stop, stop) <= radiusMeters);
}

module.exports = {
    distanceFromRouteMeters,
    getRouteGeometry,
    isNearRoute,
    isValidCoordinate
};

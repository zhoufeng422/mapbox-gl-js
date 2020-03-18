'use strict';

/**
 * @author: zhofueng422
 */
import mvt from '@mapbox/vector-tile';
const vectorTileFeatureTypes = mvt.VectorTileFeature.types;
import Projections from './projections';
import { getProjections } from './mercator_coordinate';

function YzVectorTileFeature(vectorTileFeature) {
    // Public
    this.properties = vectorTileFeature.properties;
    this.extent = vectorTileFeature.extent;
    this.type = vectorTileFeature.type;

    // Private
    this._pbf = vectorTileFeature._pbf;
    this._geometry = vectorTileFeature._geometry;
    this._keys = vectorTileFeature._keys;
    this._values = vectorTileFeature._values;
    this._vectorTileFeature = vectorTileFeature;
}

// YzVectorTileFeature.types = this._vectorTileFeature.types;

YzVectorTileFeature.prototype.loadGeometry = function () {
    return this._vectorTileFeature.loadGeometry();
};

YzVectorTileFeature.prototype.bbox = function () {
    return this._vectorTileFeature.bbox();
};

YzVectorTileFeature.prototype.toGeoJSON = function (x, y, z) {
    var size = this.extent * Math.pow(2, z),
        x0 = this.extent * x,
        y0 = this.extent * y,
        coords = this.loadGeometry(),
        type = vectorTileFeatureTypes[this.type],
        i, j;

    function project(line) {
        const proj = getProjections();
        if (proj && proj.isTransform === true) {
            for (var j = 0; j < line.length; j++) {
                var p = line[j];
                var lnglat = proj.LngLatFromXY((p.x + x0) / size, (p.y + y0) / size);
                line[j] = [lnglat.lng, lnglat.lat];
            }
        }
        else {
            for (var j = 0; j < line.length; j++) {
                var p = line[j], y2 = 180 - (p.y + y0) * 360 / size;
                line[j] = [
                    (p.x + x0) * 360 / size - 180,
                    360 / Math.PI * Math.atan(Math.exp(y2 * Math.PI / 180)) - 90
                ];
            }
        }
    }

    switch (this.type) {
        case 1:
            var points = [];
            for (i = 0; i < coords.length; i++) {
                points[i] = coords[i][0];
            }
            coords = points;
            project(coords);
            break;

        case 2:
            for (i = 0; i < coords.length; i++) {
                project(coords[i]);
            }
            break;

        case 3:
            coords = classifyRings(coords);
            for (i = 0; i < coords.length; i++) {
                for (j = 0; j < coords[i].length; j++) {
                    project(coords[i][j]);
                }
            }
            break;
    }

    if (coords.length === 1) {
        coords = coords[0];
    } else {
        type = 'Multi' + type;
    }

    var result = {
        type: "Feature",
        geometry: {
            type: type,
            coordinates: coords
        },
        properties: this.properties
    };

    if ('id' in this) {
        result.id = this.id;
    }

    return result;
};

function classifyRings(rings) {
    var len = rings.length;

    if (len <= 1) return [rings];

    var polygons = [],
        polygon,
        ccw;

    for (var i = 0; i < len; i++) {
        var area = signedArea(rings[i]);
        if (area === 0) continue;

        if (ccw === undefined) ccw = area < 0;

        if (ccw === area < 0) {
            if (polygon) polygons.push(polygon);
            polygon = [rings[i]];

        } else {
            polygon.push(rings[i]);
        }
    }
    if (polygon) polygons.push(polygon);

    return polygons;
}

function signedArea(ring) {
    var sum = 0;
    for (var i = 0, len = ring.length, j = len - 1, p1, p2; i < len; j = i++) {
        p1 = ring[i];
        p2 = ring[j];
        sum += (p2.x - p1.x) * (p1.y + p2.y);
    }
    return sum;
}

export default YzVectorTileFeature;

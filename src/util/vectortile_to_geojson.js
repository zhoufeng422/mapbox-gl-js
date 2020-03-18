// @flow
import type {GeoJSONGeometry} from '@mapbox/geojson-types';
/**
 * @author: zhoufeng422
 */
import YzVectorTileFeature from '../geo/yzvectortilefeature';

class Feature {
    type: 'Feature';
    _geometry: ?GeoJSONGeometry;
    properties: {};
    id: number | string | void;

    _vectorTileFeature: VectorTileFeature;
    /**
     * @author: zhoufeng422
     */
    _yzvectorTileFeature: YzVectorTileFeature;

    constructor(vectorTileFeature: VectorTileFeature, z: number, x: number, y: number, id: string | number | void) {
        this.type = 'Feature';

        this._vectorTileFeature = vectorTileFeature;
        /**
         * @author: zhoufeng422
         */
        this._yzvectorTileFeature = new YzVectorTileFeature(vectorTileFeature);

        (vectorTileFeature: any)._z = z;
        (vectorTileFeature: any)._x = x;
        (vectorTileFeature: any)._y = y;

        this.properties = vectorTileFeature.properties;
        this.id = id;
    }

    get geometry(): ?GeoJSONGeometry {
        if (this._geometry === undefined) {
            /**
             * @author: zhoufeng422
             */
            this._geometry = this._yzvectorTileFeature.toGeoJSON(
                (this._vectorTileFeature: any)._x,
                (this._vectorTileFeature: any)._y,
                (this._vectorTileFeature: any)._z).geometry;
        }
        return this._geometry;
    }

    set geometry(g: ?GeoJSONGeometry) {
        this._geometry = g;
    }

    toJSON() {
        const json = {
            geometry: this.geometry
        };
        for (const i in this) {
            if (i === '_geometry' || i === '_vectorTileFeature') continue;
            json[i] = (this: any)[i];
        }
        return json;
    }
}

export default Feature;

// @flow

import LngLat from '../geo/lng_lat';
import Point from '@mapbox/point-geometry';

/**
 * @author: zhoufeng422
 */
class Projections {
    latRange: ?[number, number];
    worldSize: number;
    isTransform: boolean;
    defName: string;

    XYFromLngLat(lng: number, lat: number): Point {
        console.log(`lng: ${lng}, lat: ${lat}`);
        throw new Error("Not extends this function !");
    }

    LngLatFromXY(x: number, y: number): LngLat {
        console.log(`x: ${x}, y: ${y}`);
        throw new Error("Not extends this function !");
    }

    /**
     * Transform lnglat to point .
     * @param {*} lnglat The location to project.
     * @param {*} worldSize
     */
    project(lnglat: LngLat, worldSize: number): Point {
        const pt = this.XYFromLngLat(lnglat.lng, lnglat.lat);
        const scale: number = (worldSize || this.worldSize);

        return new Point(scale * pt.x, scale * pt.y);
    }

    /**
     * Transform point to lnglat .
     * @param {*} point The point of the position.
     * @param {*} worldSize
     */
    unproject(point: Point, worldSize: number): LngLat {
        const scale = (worldSize || this.worldSize);
        return this.LngLatFromXY(point.x / scale, point.y / scale);
    }
}

export default Projections;

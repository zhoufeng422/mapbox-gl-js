// @flow

import type Painter from './painter';
import type SourceCache from '../source/source_cache';
import type StyleLayer from '../style/style_layer';
import type {OverscaledTileID} from '../source/tile_id';
import type SymbolBucket from '../data/bucket/symbol_bucket';
import DepthMode from '../gl/depth_mode';
import StencilMode from '../gl/stencil_mode';
import CullFaceMode from '../gl/cull_face_mode';
import {collisionUniformValues, collisionCircleUniformValues} from './program/collision_program';

import {StructArrayLayout2i4, StructArrayLayout3ui6} from '../data/array_types';
import {collisionCircleLayout} from '../data/bucket/symbol_attributes';
import SegmentVector from '../data/segment';
import {mat4} from 'gl-matrix';
import VertexBuffer from '../gl/vertex_buffer';
import IndexBuffer from '../gl/index_buffer';

export default drawCollisionDebug;

let quadVertices: ?StructArrayLayout2i4;
let quadTriangles: ?StructArrayLayout3ui6;

function drawCollisionDebug(painter: Painter, sourceCache: SourceCache, layer: StyleLayer, coords: Array<OverscaledTileID>, translate: [number, number], translateAnchor: 'map' | 'viewport', isText: boolean) {
    const context = painter.context;
    const gl = context.gl;
    const program = painter.useProgram('collisionBox');

    for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];
        const tile = sourceCache.getTile(coord);
        const bucket: ?SymbolBucket = (tile.getBucket(layer): any);
        if (!bucket) continue;
        const buffers = isText ? bucket.textCollisionBox : bucket.iconCollisionBox;
        if (!buffers) continue;
        let posMatrix = coord.posMatrix;
        if (translate[0] !== 0 || translate[1] !== 0) {
            posMatrix = painter.translatePosMatrix(coord.posMatrix, tile, translate, translateAnchor);
        }
        program.draw(context, gl.LINES,
            DepthMode.disabled, StencilMode.disabled,
            painter.colorModeForRenderPass(),
            CullFaceMode.disabled,
            collisionUniformValues(
                posMatrix,
                painter.transform,
                tile),
            layer.id, buffers.layoutVertexBuffer, buffers.indexBuffer,
            buffers.segments, null, painter.transform.zoom, null, null,
            buffers.collisionVertexBuffer);
    }

    if (isText)
        drawCollisionCircles(painter, sourceCache, layer, coords, translate, translateAnchor);
}

function drawCollisionCircles(painter: Painter, sourceCache: SourceCache, layer: StyleLayer, coords: Array<OverscaledTileID>, translate: [number, number], translateAnchor: 'map' | 'viewport') {
    // Collision circle rendering is done by using simple shader batching scheme where dynamic properties of
    // circles are passed to the GPU using shader uniforms. Circles are first encoded into 4-component vectors
    // (center_x, center_y, radius, flag) and then uploaded in batches as "uniform vec4 u_quads[N]".
    // Vertex data is just a collection of incremental index values pointing to the quads-array.
    //
    // If one quad uses 4 vertices then all required values can be deduced from the index value:
    //   int quad_idx = int(vertex.idx / 4);
    //   int corner_idx = int(vertex.idx % 4);
    //
    // OpenGL ES 2.0 spec defines that the maximum number of supported vertex uniform vectors (vec4) should be
    // at least 128. Choosing a safe value 64 for the quad array should leave enough space for rest of the
    // uniform variables.
    const maxQuadsPerDrawCall = 64;

    if (!quadVertices) {
        quadVertices = createQuadVertices(maxQuadsPerDrawCall);
    }
    if (!quadTriangles) {
        quadTriangles = createQuadTriangles(maxQuadsPerDrawCall);
    }

    const context = painter.context;
    const quadVertexBuffer = context.createVertexBuffer(quadVertices, collisionCircleLayout.members, true);
    const quadIndexBuffer = context.createIndexBuffer(quadTriangles, true);

    const quads = new Float32Array(maxQuadsPerDrawCall * 4);

    for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];
        const tile = sourceCache.getTile(coord);
        const bucket: ?SymbolBucket = (tile.getBucket(layer): any);
        if (!bucket) continue;

        const arr = bucket.collisionCircleArray;

        if (!arr.length)
            continue;

        let posMatrix = coord.posMatrix;

        if (translate[0] !== 0 || translate[1] !== 0) {
            posMatrix = painter.translatePosMatrix(coord.posMatrix, tile, translate, translateAnchor);
        }

        // We need to know the projection matrix that was used for projecting collision circles to the screen.
        // This might vary between buckets as the symbol placement is a continous process. This matrix is
        // required for transforming points from previous screen space to the current one
        const batchInvTransform = mat4.create();
        const batchTransform = posMatrix;

        mat4.mul(batchInvTransform, bucket.placementInvProjMatrix, painter.transform.glCoordMatrix);
        mat4.mul(batchInvTransform, batchInvTransform, bucket.placementViewportMatrix);

        let batchIdx = 0;
        let quadOffset = 0;

        while (quadOffset < arr.length) {
            const quadsLeft = arr.length - quadOffset;
            const quadSpaceInBatch = maxQuadsPerDrawCall - batchIdx;
            const batchSize = Math.min(quadsLeft, quadSpaceInBatch);

            // Copy collision circles from the bucket array
            for (let qIdx = quadOffset; qIdx < quadOffset + batchSize; qIdx++) {
                quads[batchIdx * 4 + 0] = arr.float32[qIdx * 4 + 0]; // width
                quads[batchIdx * 4 + 1] = arr.float32[qIdx * 4 + 1]; // height
                quads[batchIdx * 4 + 2] = arr.float32[qIdx * 4 + 2]; // radius
                quads[batchIdx * 4 + 3] = arr.float32[qIdx * 4 + 3]; // collisionFlag
                batchIdx++;
            }

            quadOffset += batchSize;

            if (batchIdx === maxQuadsPerDrawCall) {
                drawBatch(painter, batchTransform, batchInvTransform, quads, batchIdx, layer.id, quadVertexBuffer, quadIndexBuffer);
                batchIdx = 0;
            }
        }

        // Render the leftover batch
        if (batchIdx > 0) {
            drawBatch(painter, batchTransform, batchInvTransform, quads, batchIdx, layer.id, quadVertexBuffer, quadIndexBuffer);
        }
    }

    quadIndexBuffer.destroy();
    quadVertexBuffer.destroy();
}

function drawBatch(painter: Painter, proj: mat4, invPrevProj: mat4, quads: any, numQuads: number, layerId: string, vb: VertexBuffer, ib: IndexBuffer) {
    const context = painter.context;
    const gl = context.gl;
    const circleProgram = painter.useProgram('collisionCircle');

    const uniforms = collisionCircleUniformValues(
        proj,
        invPrevProj,
        quads,
        painter.transform);

    circleProgram.draw(
        context,
        gl.TRIANGLES,
        DepthMode.disabled,
        StencilMode.disabled,
        painter.colorModeForRenderPass(),
        CullFaceMode.disabled,
        uniforms,
        layerId,
        vb,
        ib,
        SegmentVector.simpleSegment(0, 0, numQuads * 4, numQuads * 2),
        null,
        painter.transform.zoom,
        null,
        null,
        null);
}

function createQuadVertices(quadCount: number): StructArrayLayout2i4 {
    const vCount = quadCount * 4;
    const array = new StructArrayLayout2i4();

    array.resize(vCount);
    array._trim();

    // Fill the buffer with an incremental index value (2 per vertex)
    // [0, 0, 1, 1, 2, 2, 3, 3, 4, 4...]
    for (let i = 0; i < vCount; i++) {
        array.int16[i * 2 + 0] = i;
        array.int16[i * 2 + 1] = i;
    }

    return array;
}

function createQuadTriangles(quadCount: number): StructArrayLayout3ui6 {
    const triCount = quadCount * 2;
    const array = new StructArrayLayout3ui6();

    array.resize(triCount);
    array._trim();

    // Two triangles and 4 vertices per quad.
    for (let i = 0; i < triCount; i++) {
        const idx = i * 6;

        array.uint16[idx + 0] = i * 4 + 0;
        array.uint16[idx + 1] = i * 4 + 1;
        array.uint16[idx + 2] = i * 4 + 2;
        array.uint16[idx + 3] = i * 4 + 2;
        array.uint16[idx + 4] = i * 4 + 3;
        array.uint16[idx + 5] = i * 4 + 0;
    }

    return array;
}

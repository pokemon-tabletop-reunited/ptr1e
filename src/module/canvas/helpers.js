/**
 * Measure the minimum distance between two rectangles
 * @param r0      The origin rectangle
 * @param r1      The destination rectangle
 */
function measureDistanceCuboid(r0, r1, {
    token = null,
    target = null,
} = {}, options = {}
) {
    if (!canvas.dimensions) return NaN;

    if (canvas.grid.type !== CONST.GRID_TYPES.SQUARE) {
        return canvas.grid.measureDistance(r0, r1);
    }

    const gridWidth = canvas.grid.sizeX ?? canvas.grid.w;

    const distance = {
        dx: 0,
        dy: 0,
        dz: 0,
    };
    // Return early if the rectangles overlap
    const rectanglesOverlap = [
        [r0, r1],
        [r1, r0],
    ].some(([rA, rB]) => rB.right > rA.left && rB.left < rA.right && rB.bottom > rA.top && rB.top < rA.bottom);
    if (rectanglesOverlap) {
        distance.dx = 0;
        distance.dy = 0;
    } else {
        // Snap the dimensions and position of the rectangle to grid square units
        const snapBounds = (rectangle, { toward }) => {
            const roundLeft = rectangle.left < toward.left ? Math.ceil : Math.floor;
            const roundTop = rectangle.top < toward.top ? Math.ceil : Math.floor;

            const left = roundLeft(rectangle.left / gridWidth) * gridWidth;
            const top = roundTop(rectangle.top / gridWidth) * gridWidth;
            const width = Math.ceil(rectangle.width / gridWidth) * gridWidth;
            const height = Math.ceil(rectangle.height / gridWidth) * gridWidth;

            return new PIXI.Rectangle(left, top, width, height);
        };

        // Find the minimum distance between the rectangles for each dimension
        const r0Snapped = snapBounds(r0, { toward: r1 });
        const r1Snapped = snapBounds(r1, { toward: r0 });
        distance.dx = Math.max(r0Snapped.left - r1Snapped.right, r1Snapped.left - r0Snapped.right, 0) + gridWidth;
        distance.dy = Math.max(r0Snapped.top - r1Snapped.bottom, r1Snapped.top - r0Snapped.bottom, 0) + gridWidth;
    }
    if (token && target && token?.document?.elevation !== target?.document.elevation && token.actor && target.actor) {
        const selfElevation = token.document.elevation;
        const targetElevation = target.document.elevation;

        const [selfWidth, targetWidth] = [token.document.width, target.document.width];

        const gridSize = canvas.dimensions.size;
        const gridDistance = canvas.dimensions.distance;

        const elevation0 = Math.floor((selfElevation / gridDistance) * gridSize);
        const height0 = Math.floor((selfWidth / gridDistance) * gridSize);
        const elevation1 = Math.floor((targetElevation / gridDistance) * gridSize);
        const height1 = Math.floor((targetWidth / gridDistance) * gridSize);

        // simulate xz plane
        const xzPlane = {
            self: new PIXI.Rectangle(r0.x, elevation0, r0.width, height0),
            target: new PIXI.Rectangle(r1.x, elevation1, r1.width, height1),
        };

        // check for overlappig
        const elevationOverlap = [
            [xzPlane.self, xzPlane.target],
            [xzPlane.target, xzPlane.self],
        ].some(([rA, rB]) => rB.bottom > rA.top && rB.top < rA.bottom);
        if (elevationOverlap) {
            distance.dz = 0;
        } else {
            // Snap the dimensions and position of the rectangle to grid square units
            const snapBounds = (rectangle, { toward }) => {
                const roundLeft = rectangle.left < toward.left ? Math.ceil : Math.floor;
                const roundTop = rectangle.top < toward.top ? Math.ceil : Math.floor;

                const left = roundLeft(rectangle.left / gridWidth) * gridWidth;
                const top = roundTop(rectangle.top / gridWidth) * gridWidth;
                const width = Math.ceil(rectangle.width / gridWidth) * gridWidth;
                const height = Math.ceil(rectangle.height / gridWidth) * gridWidth;

                return new PIXI.Rectangle(left, top, width, height);
            };

            // Find the minimum distance between the rectangles for each dimension
            const r0Snapped = snapBounds(xzPlane.self, { toward: xzPlane.target });
            const r1Snapped = snapBounds(xzPlane.target, { toward: xzPlane.self });

            const isUnderground = r1Snapped.bottom < gridWidth && r1Snapped.top < gridWidth
            const isAirborne = r1Snapped.bottom > gridWidth && r1Snapped.top > gridWidth
            distance.location = {
                isUnderground,
                isAirborne,
            }
            distance.dz = Math.max(r0Snapped.top - r1Snapped.bottom, r1Snapped.top - r0Snapped.bottom, 0) + gridWidth;
        }
    } else {
        distance.dz = 0;
    }

    return measureDistanceOnGrid(distance, options);
}

/**
 * Given the distance in each dimension, measure the distance in grid units
 * @param segment A pair of x/y distances constituting the line segment between two points
 */
function measureDistanceOnGrid(segment, options = {}) {
    if (!canvas.dimensions) return NaN;

    const gridSize = canvas.dimensions.size;
    const gridDistance = canvas.dimensions.distance;

    const nx = Math.ceil(Math.abs(segment.dx / gridSize));
    const ny = Math.ceil(Math.abs(segment.dy / gridSize));

    const nz =
        options?.["ignore-Z"] && segment.location?.isUnderground
            ? 0
            : options?.["ignore+Z"] && segment.location?.isAirborne
                ? 0
                : Math.ceil(Math.abs((segment.dz || 0) / gridSize));

    // ingore the lowest difference
    const sortedDistance = [nx, ny, nz].sort((a, b) => a - b);
    // Get the number of straight and diagonal moves
    const squares = {
        doubleDiagonal: sortedDistance[0],
        diagonal: sortedDistance[1] - sortedDistance[0],
        straight: sortedDistance[2] - sortedDistance[1],
    };

    // If a move has a burst range it should ignore doubling diagonals
    if(options.burst) {
        return (squares.doubleDiagonal + squares.diagonal + squares.straight) * gridDistance;
    }

    // Diagonals in PTU pretty much count as 1.5 times a straight
    // for diagonals across the x, y, and z axis count it as 1.75 as a best guess
    const distance = Math.floor(squares.doubleDiagonal * 1.75 + squares.diagonal * 1.5 + squares.straight);

    return distance * gridDistance;
}

/** 
 * Overwriting SquareGrid.prototype.measureDistance
 * Calculate the grid distance between two points following double diagonal rules
 */
function measureDistances(segments, options = {}) {
    if (!options.gridSpaces) return BaseGrid.prototype.measureDistances.call(this, segments, options);

    // Track the total number of diagonals
    let nDiagonal = 0;
    const d = canvas.dimensions;

    // Iterate over measured segments
    return segments.map(s => {
        let r = s.ray;

        // Determine the total distance traveled
        let nx = Math.abs(Math.ceil(r.dx / d.size));
        let ny = Math.abs(Math.ceil(r.dy / d.size));

        // Determine the number of straight and diagonal moves
        let nd = Math.min(nx, ny);
        let ns = Math.abs(ny - nx);
        nDiagonal += nd;

        // Double Diagonal Correction
        let nd10 = Math.floor(nDiagonal / 2) - Math.floor((nDiagonal - nd) / 2);
        let spaces = (nd10 * 2) + (nd - nd10) + ns;
        return spaces * canvas.dimensions.distance;
    });
};


export { measureDistanceCuboid, measureDistanceOnGrid, measureDistances }
// Constants for visualization
const ITEM_VISUAL_SIZE = 8; // Slightly smaller items for denser layouts
const WORKER_VISUAL_SIZE = 10;
const START_POINT_COLOR = "blue";
const ITEM_COLOR = "red";
const WORKER_COLOR = "purple";
const RANDOM_PATH_COLOR = "green";
const OPTIMIZED_PATH_COLOR = "orange";
const AISLE_COLOR = "#D8D8D8"; // Lighter grey for aisles
const SHELF_COLOR = "#B0E0E6"; // Powder blue for shelves, or use an image
const ANIMATION_LINE_OPACITY = "0.9";
const STATIC_LINE_OPACITY = "0.5";
const PIXELS_PER_UNIT = 12; // Can be adjusted based on warehouse size
const ANIMATION_STEP_DELAY = 30;

// Global state variables
let warehouseWidth, warehouseHeight, numItemsToPick, numTotalItems, layoutType;
let numAisles, aisleWidthUnits, shelfDepthUnits;
let allItemLocations = [];
let pickListItems = [];
let startPoint = { x: 0, y: 0, name: "Start" };
let workerElements = { random: null, tsp: null };
let simulationInProgress = false;
let gridCells = []; // To store type of each cell: 'aisle' or 'shelf'

function displayError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    if (elementId.includes("random")) {
        document.getElementById('resultsRandom').querySelectorAll('p:not(.error)').forEach(p => p.textContent = '');
    } else if (elementId.includes("tsp")) {
        document.getElementById('resultsTSP').querySelectorAll('p:not(.error)').forEach(p => p.textContent = '');
    }
}

function clearErrors() {
    document.getElementById('randomError').style.display = 'none';
    document.getElementById('randomError').textContent = '';
    document.getElementById('tspError').style.display = 'none';
    document.getElementById('tspError').textContent = '';
}

function manhattanDistance(point1, point2) {
    // IMPORTANT: This is still direct Manhattan. For true aisle navigation, A* is needed.
    // This simulation relies on items being placed accessibly from aisles.
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
}

/**
 * Initializes the gridCells array, defining each cell as 'aisle' or 'shelf'.
 * Also sets the startPoint.
 */
function defineWarehouseStructure() {
    gridCells = Array(warehouseHeight).fill(null).map(() => Array(warehouseWidth).fill('aisle')); // Default to aisle

    if (layoutType === "random_scatter") {
        // For random_scatter, we might not draw explicit aisles/shelves, or make them all shelves
        // For simplicity, let's treat it as mostly open space, or all potential shelf space
        gridCells = Array(warehouseHeight).fill(null).map(() => Array(warehouseWidth).fill('shelf'));
        startPoint = { x: Math.floor(Math.random() * warehouseWidth), y: Math.floor(Math.random() * warehouseHeight), name: "Start" };
        // Ensure start point is not on an item later
        return;
    }

    const totalShelfBlocks = numAisles + 1; // Shelves can be on outsides too
    const spacePerAisleAndShelf = aisleWidthUnits + shelfDepthUnits * 2; // Aisle + shelves on both sides
    
    // Approximate width taken by all aisles and their adjacent shelves
    // This is a simplified calculation. A more robust one would iterate.
    let currentX = 0;

    // Determine start point based on layout type, ensuring it's in an aisle
    // Default I-shape P&D at the bottom of the first main aisle
    let startAisleIndex = 0; 
    let startXInAisle = Math.floor(aisleWidthUnits / 2); // Middle of the aisle

    if (layoutType === "u_shape") {
        // P&D at the bottom-center, assuming a central aisle or opening
        startAisleIndex = Math.floor(numAisles / 2);
        currentX = startAisleIndex * (aisleWidthUnits + shelfDepthUnits * 2) + shelfDepthUnits; // Start of the central aisle
        if (numAisles % 2 === 0 && numAisles > 0) { // Even aisles, place between middle two
             currentX = (startAisleIndex -1) * (aisleWidthUnits + shelfDepthUnits*2) + shelfDepthUnits + aisleWidthUnits + shelfDepthUnits;
        }
        startPoint = { x: currentX + startXInAisle, y: warehouseHeight - 1, name: "Start" };
    } else if (layoutType === "l_shape") {
        // P&D at a corner, e.g., bottom-left of the first aisle
        startPoint = { x: startXInAisle, y: warehouseHeight - 1, name: "Start" };
    } else { // I-shape (default)
         startPoint = { x: startXInAisle, y: warehouseHeight - 1, name: "Start" };
    }


    currentX = 0;
    for (let i = 0; i < numAisles; i++) {
        // Left shelf block (if not the very first boundary)
        if (i === 0 && shelfDepthUnits > 0) { // Wall-side shelf before first aisle
            for (let d = 0; d < shelfDepthUnits; d++) {
                if (currentX + d < warehouseWidth) {
                    for (let r = 0; r < warehouseHeight; r++) gridCells[r][currentX + d] = 'shelf';
                }
            }
            currentX += shelfDepthUnits;
        }

        // Aisle
        for (let w = 0; w < aisleWidthUnits; w++) {
            if (currentX + w < warehouseWidth) {
                for (let r = 0; r < warehouseHeight; r++) gridCells[r][currentX + w] = 'aisle';
            }
        }
        currentX += aisleWidthUnits;

        // Right shelf block for this aisle
        for (let d = 0; d < shelfDepthUnits; d++) {
            if (currentX + d < warehouseWidth) {
                for (let r = 0; r < warehouseHeight; r++) gridCells[r][currentX + d] = 'shelf';
            }
        }
        currentX += shelfDepthUnits;
    }
    // Final wall-side shelf if space allows and numAisles > 0
    if (numAisles > 0 && currentX < warehouseWidth) {
        for (let x = currentX; x < warehouseWidth; x++) {
            for (let r = 0; r < warehouseHeight; r++) gridCells[r][x] = 'shelf';
        }
    }


    // Specific adjustments for U and L layouts (crude representation)
    if (layoutType === "u_shape" && warehouseHeight > 5) {
        const crossAisleY = Math.floor(warehouseHeight * 0.15); // Top 15% as cross-aisle
        for (let y = 0; y < crossAisleY; y++) {
            for (let x = 0; x < warehouseWidth; x++) {
                 // Only make it an aisle if it's connecting existing vertical aisles' ends
                let isAboveVerticalAisle = false;
                for(let k=0; k<numAisles; ++k) {
                    let aisleStartX = k * (aisleWidthUnits + shelfDepthUnits*2) + ( (k==0)? shelfDepthUnits : shelfDepthUnits*2);
                    if (shelfDepthUnits === 0 && k > 0) aisleStartX = k*aisleWidthUnits;
                    else if(shelfDepthUnits === 0 && k === 0) aisleStartX = 0;


                    if (x >= aisleStartX && x < aisleStartX + aisleWidthUnits) {
                        isAboveVerticalAisle = true;
                        break;
                    }
                }
                if(y < crossAisleY/2 || isAboveVerticalAisle) // Make a thinner cross aisle at the very top
                   gridCells[y][x] = 'aisle';
            }
        }
         // Ensure P&D is at the "opening" of the U
        startPoint = { x: Math.floor(warehouseWidth / 2), y: warehouseHeight - 1, name: "Start" };
        if (gridCells[startPoint.y][startPoint.x] === 'shelf') { // If P&D falls on a shelf, find nearest aisle cell
            for (let dx = 0; dx < aisleWidthUnits + 1; dx++) {
                if (startPoint.x + dx < warehouseWidth && gridCells[startPoint.y][startPoint.x + dx] === 'aisle') { startPoint.x += dx; break; }
                if (startPoint.x - dx >= 0 && gridCells[startPoint.y][startPoint.x - dx] === 'aisle') { startPoint.x -= dx; break; }
            }
        }

    } else if (layoutType === "l_shape" && warehouseWidth > 5 && warehouseHeight > 5) {
        const verticalAisleExtent = Math.floor(warehouseHeight * 0.8);
        const horizontalAisleExtent = Math.floor(warehouseWidth * 0.8);
        // Create a main vertical aisle on the left and a horizontal aisle at the bottom
        for(let y=0; y < verticalAisleExtent; y++) {
            for(let x=0; x < aisleWidthUnits; x++) if(x < warehouseWidth) gridCells[y][x] = 'aisle';
        }
        for(let x=0; x < horizontalAisleExtent; x++) {
            for(let y=warehouseHeight - aisleWidthUnits; y < warehouseHeight; y++) if(y >=0) gridCells[y][x] = 'aisle';
        }
        startPoint = { x: Math.floor(aisleWidthUnits/2), y: warehouseHeight - 1 - Math.floor(aisleWidthUnits/2), name: "Start" };
    }
     // Ensure startPoint is actually an aisle cell
    if (gridCells[startPoint.y][startPoint.x] !== 'aisle') {
        console.warn("Start point initially on shelf, attempting to relocate to nearest aisle cell.");
        // Simple relocation: check right, then left
        let foundAisle = false;
        for(let dx = 0; dx < warehouseWidth; dx++) {
            if(startPoint.x + dx < warehouseWidth && gridCells[startPoint.y][startPoint.x + dx] === 'aisle') {
                startPoint.x = startPoint.x + dx; foundAisle = true; break;
            }
            if(startPoint.x - dx >= 0 && gridCells[startPoint.y][startPoint.x - dx] === 'aisle') {
                startPoint.x = startPoint.x - dx; foundAisle = true; break;
            }
        }
        if (!foundAisle) { // Try moving up/down
             for(let dy = 0; dy < warehouseHeight; dy++) {
                if(startPoint.y + dy < warehouseHeight && gridCells[startPoint.y+dy][startPoint.x] === 'aisle') {
                    startPoint.y = startPoint.y + dy; foundAisle = true; break;
                }
                if(startPoint.y - dy >= 0 && gridCells[startPoint.y-dy][startPoint.x] === 'aisle') {
                    startPoint.y = startPoint.y - dy; foundAisle = true; break;
                }
            }
        }
        if (!foundAisle) console.error("Could not relocate start point to an aisle cell!");
    }
}


function generateItemLocations() {
    allItemLocations = [];
    const usedLocations = new Set();
    defineWarehouseStructure(); // This now also sets startPoint

    usedLocations.add(`${startPoint.x},${startPoint.y}`);

    let shelfCells = [];
    for (let r = 0; r < warehouseHeight; r++) {
        for (let c = 0; c < warehouseWidth; c++) {
            if (gridCells[r][c] === 'shelf') {
                shelfCells.push({ x: c, y: r });
            }
        }
    }

    if (shelfCells.length === 0 && numTotalItems > 0) {
        console.error("No shelf cells defined for item placement!");
        return false;
    }
     if (numTotalItems > shelfCells.length) {
        console.warn(`Requesting ${numTotalItems} items, but only ${shelfCells.length} shelf spots available.`);
        // Potentially reduce numTotalItems or return error
        // For now, we'll just place as many as possible if this happens during picklist generation
    }


    for (let i = 0; i < numTotalItems; i++) {
        if (shelfCells.length === 0) {
            console.warn("Ran out of shelf cells to place items.");
            break; // Stop if no more shelf cells
        }

        let randomShelfIndex, x, y, locationKey;
        let attempts = 0;
        const maxPlacementAttempts = shelfCells.length * 2;


        do {
            attempts++;
            if (attempts > maxPlacementAttempts) {
                 console.warn(`Max attempts to find unused shelf cell for item ${i}.`);
                 // This might happen if shelfCells is small and usedLocations fills up quickly
                 // or if shelfCells itself was depleted.
                 break; 
            }
            randomShelfIndex = Math.floor(Math.random() * shelfCells.length);
            const cell = shelfCells[randomShelfIndex];
            x = cell.x;
            y = cell.y;
            locationKey = `${x},${y}`;
        } while (usedLocations.has(locationKey) && shelfCells.length > usedLocations.size -1 ); // -1 for startPoint

        if (usedLocations.has(locationKey) && attempts > maxPlacementAttempts) {
            continue; // Skip this item if we couldn't place it
        }


        allItemLocations.push({ id: `item-${i}`, x: x, y: y, name: `P${i}` });
        usedLocations.add(locationKey);
        // Optional: remove used shelf cell from list to guarantee uniqueness faster,
        // but this modifies shelfCells array. For now, rely on usedLocations Set.
    }
    return true;
}


function generatePickList() {
    pickListItems = [];
    if (numTotalItems === 0 && numItemsToPick > 0) {
         const msg = `لا يوجد منتجات في المستودع لاختيار ${numItemsToPick} منها.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        return false;
    }
    if (allItemLocations.length === 0 && numItemsToPick > 0) {
        const msg = `لم يتم وضع أي منتجات على الأرفف.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        return false;
    }
    if (numItemsToPick > allItemLocations.length) {
        const msg = `لا يمكن اختيار ${numItemsToPick} منتج، يوجد فقط ${allItemLocations.length} منتج متاح على الأرفف.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        return false;
    }
    if (numItemsToPick === 0) {
        return true;
    }
    const shuffled = [...allItemLocations].sort(() => 0.5 - Math.random());
    pickListItems = shuffled.slice(0, numItemsToPick);
    return true;
}

function calculatePathCost(path) {
    if (!path || path.length === 0) return 0;
    let totalDistance = 0;
    totalDistance += manhattanDistance(startPoint, path[0]);
    for (let i = 0; i < path.length - 1; i++) {
        totalDistance += manhattanDistance(path[i], path[i + 1]);
    }
    totalDistance += manhattanDistance(path[path.length - 1], startPoint);
    return totalDistance;
}

function simulateRandomPicking() {
    if (numItemsToPick === 0) {
        document.getElementById('resultsRandom').style.display = 'block';
        document.getElementById('randomOrderText').textContent = "لا يوجد منتجات لجلبها (عشوائي).";
        document.getElementById('randomDistanceText').textContent = "";
        document.getElementById('randomTimeText').textContent = "";
        return [];
    }
    if (!pickListItems.length) return null;

    const randomPath = [...pickListItems];
    const distance = calculatePathCost(randomPath);
    const time = distance;

    document.getElementById('resultsRandom').style.display = 'block';
    document.getElementById('randomOrderText').textContent = `ترتيب الجلب: Start -> ${randomPath.map(p => p.name).join(' -> ')} -> Start`;
    document.getElementById('randomDistanceText').textContent = `المسافة: ${distance.toFixed(2)} وحدات`;
    document.getElementById('randomTimeText').textContent = `الزمن: ${time.toFixed(2)} وحدات`;
    return randomPath;
}

function getNearestNeighborPath(itemsToVisit, actualStartPoint) {
    if (!itemsToVisit.length) return [];
    let unvisited = [...itemsToVisit];
    let nnPath = [];
    let currentPointForSearch = actualStartPoint;
    while (unvisited.length > 0) {
        let nearestIdxInUnvisited = -1;
        let minDistance = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
            const dist = manhattanDistance(currentPointForSearch, unvisited[i]);
            if (dist < minDistance) {
                minDistance = dist;
                nearestIdxInUnvisited = i;
            }
        }
        const nextPoint = unvisited.splice(nearestIdxInUnvisited, 1)[0];
        nnPath.push(nextPoint);
        currentPointForSearch = nextPoint;
    }
    return nnPath;
}

function twoOptSwap(path, i, k) {
    const newPath = path.slice(0, i);
    const segmentToReverse = path.slice(i, k + 1);
    newPath.push(...segmentToReverse.reverse());
    newPath.push(...path.slice(k + 1));
    return newPath;
}

function apply2Opt(initialPath) {
    if (!initialPath || initialPath.length < 2) return initialPath;
    let bestPath = [...initialPath];
    let bestDistance = calculatePathCost(bestPath);
    let improved = true;
    let iterationCounter = 0;
    const maxIterations = bestPath.length * Math.max(20, bestPath.length * 3);

    while (improved && iterationCounter < maxIterations) {
        improved = false;
        iterationCounter++;
        for (let i = 0; i < bestPath.length - 1; i++) {
            for (let k = i + 1; k < bestPath.length; k++) {
                const newPath = twoOptSwap(bestPath, i, k);
                const newDistance = calculatePathCost(newPath);
                if (newDistance < bestDistance) {
                    bestPath = newPath;
                    bestDistance = newDistance;
                    improved = true;
                    i = -1;
                    break;
                }
            }
            if (improved) break;
        }
    }
    return bestPath;
}

function simulateTSPPicking_Optimized() {
    if (numItemsToPick === 0) {
        document.getElementById('resultsTSP').style.display = 'block';
        document.getElementById('tspOrderText').textContent = "لا يوجد منتجات لجلبها (TSP).";
        document.getElementById('tspDistanceText').textContent = "";
        document.getElementById('tspTimeText').textContent = "";
        return [];
    }
    if (!pickListItems.length) return null;

    if (pickListItems.length === 1) {
        const optimizedPath = [...pickListItems];
        const distance = calculatePathCost(optimizedPath);
        const time = distance;
        document.getElementById('resultsTSP').style.display = 'block';
        document.getElementById('tspOrderText').textContent = `ترتيب الجلب: Start -> ${optimizedPath.map(p => p.name).join(' -> ')} -> Start`;
        document.getElementById('tspDistanceText').textContent = `المسافة: ${distance.toFixed(2)} وحدات`;
        document.getElementById('tspTimeText').textContent = `الزمن: ${time.toFixed(2)} وحدات`;
        return optimizedPath;
    }

    const nnPath = getNearestNeighborPath(pickListItems, startPoint);
    if (!nnPath.length) return null;
    const optimizedPath = apply2Opt(nnPath);
    const distance = calculatePathCost(optimizedPath);
    const time = distance;

    document.getElementById('resultsTSP').style.display = 'block';
    document.getElementById('tspOrderText').textContent = `ترتيب الجلب: Start -> ${optimizedPath.map(p => p.name).join(' -> ')} -> Start`;
    document.getElementById('tspDistanceText').textContent = `المسافة: ${distance.toFixed(2)} وحدات`;
    document.getElementById('tspTimeText').textContent = `الزمن: ${time.toFixed(2)} وحدات`;
    return optimizedPath;
}

function getOrCreateWorkerElement(targetLayoutDiv, mapType) {
    const workerId = `worker-${mapType}`;
    let worker = document.getElementById(workerId);
    if (!worker) {
        worker = document.createElement('div');
        worker.id = workerId;
        worker.className = 'item-dot'; // Base style
        worker.style.backgroundColor = WORKER_COLOR;
        worker.style.width = `${WORKER_VISUAL_SIZE}px`;
        worker.style.height = `${WORKER_VISUAL_SIZE}px`;
        worker.style.zIndex = "100"; // Ensure worker is on top of everything
        worker.style.position = 'absolute';
        targetLayoutDiv.appendChild(worker);
    }
    // Reset position to startPoint
    worker.style.left = `${startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    worker.style.top = `${startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    worker.title = `عامل (${mapType})`;
    worker.style.display = 'block';
    return worker;
}

function drawWarehouse(targetLayoutDiv, mapType) {
    targetLayoutDiv.innerHTML = ''; // Clear previous map content
    targetLayoutDiv.style.width = `${warehouseWidth * PIXELS_PER_UNIT}px`;
    targetLayoutDiv.style.height = `${warehouseHeight * PIXELS_PER_UNIT}px`;
    targetLayoutDiv.style.backgroundColor = AISLE_COLOR; // Default background for areas not explicitly shelves

    // Draw grid cells (aisles/shelves)
    if (layoutType !== "random_scatter") { // Only draw explicit grid for structured layouts
        for (let r = 0; r < warehouseHeight; r++) {
            for (let c = 0; c < warehouseWidth; c++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.style.width = `${PIXELS_PER_UNIT}px`;
                cell.style.height = `${PIXELS_PER_UNIT}px`;
                cell.style.left = `${c * PIXELS_PER_UNIT}px`;
                cell.style.top = `${r * PIXELS_PER_UNIT}px`;
                if (gridCells[r] && gridCells[r][c] === 'shelf') {
                    cell.style.backgroundColor = SHELF_COLOR;
                } else {
                    cell.style.backgroundColor = AISLE_COLOR;
                }
                targetLayoutDiv.appendChild(cell);
            }
        }
    }


    // Draw Start Point (ensure it's on top of grid cells)
    const startDot = document.createElement('div');
    startDot.className = 'item-dot';
    startDot.style.backgroundColor = START_POINT_COLOR;
    startDot.style.width = `${ITEM_VISUAL_SIZE + 4}px`; // Slightly larger
    startDot.style.height = `${ITEM_VISUAL_SIZE + 4}px`;
    startDot.style.left = `${startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    startDot.style.top = `${startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    startDot.style.zIndex = "50";
    startDot.title = `البداية (X:${startPoint.x}, Y:${startPoint.y})`;
    targetLayoutDiv.appendChild(startDot);

    // Draw Pick List Items (ensure they are on top of grid cells)
    pickListItems.forEach(item => {
        const itemDot = document.createElement('div');
        itemDot.className = 'item-dot';
        itemDot.id = `item-vis-${item.id}-${mapType}`; // Unique ID for attaching order numbers
        itemDot.style.backgroundColor = ITEM_COLOR;
        itemDot.style.width = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.height = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.left = `${item.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.style.top = `${item.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.style.zIndex = "50";
        itemDot.title = `${item.name} (X:${item.x}, Y:${item.y})`;
        targetLayoutDiv.appendChild(itemDot);
    });

    // Create or get worker for this map
    workerElements[mapType] = getOrCreateWorkerElement(targetLayoutDiv, mapType);
    if (numItemsToPick === 0 && workerElements[mapType]) {
        workerElements[mapType].style.display = 'none'; // Hide worker if no items to pick
    }
}

function drawItemOrderNumbers(path, pathType, targetLayoutDiv) {
    targetLayoutDiv.querySelectorAll(`.order-number.order-number-${pathType}`).forEach(el => el.remove());

    path.forEach((item, index) => {
        const itemVisElement = document.getElementById(`item-vis-${item.id}-${pathType}`);
        if (itemVisElement) {
            const orderSpan = document.createElement('span');
            orderSpan.className = `order-number order-number-${pathType}`;
            orderSpan.textContent = (index + 1).toString();
            const itemX = parseFloat(itemVisElement.style.left);
            const itemY = parseFloat(itemVisElement.style.top);
            orderSpan.style.left = `${itemX + ITEM_VISUAL_SIZE / 2 - 2}px`;
            orderSpan.style.top = `${itemY - ITEM_VISUAL_SIZE - 2}px`;
            orderSpan.style.color = (pathType === 'random' ? RANDOM_PATH_COLOR : OPTIMIZED_PATH_COLOR);
            targetLayoutDiv.appendChild(orderSpan);
        }
    });
}

function drawStaticLine(x1, y1, x2, y2, color, pathType, targetLayoutDiv, opacity = STATIC_LINE_OPACITY) {
    const line = document.createElement('div');
    line.classList.add('path-line', `static-path-${pathType}`);
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    line.style.width = `${length}px`;
    line.style.backgroundColor = color;
    line.style.opacity = opacity;
    line.style.position = 'absolute';
    line.style.left = `${x1}px`;
    line.style.top = `${y1 - 1.25}px`; // Center line thickness
    line.style.transformOrigin = '0 50%';
    line.style.transform = `rotate(${angle}deg)`;
    targetLayoutDiv.appendChild(line);
}

function drawStaticManhattanPath(p1, p2, pathColor, pathType, targetLayoutDiv) {
    const x_1_px = p1.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const y_1_px = p1.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const x_2_px = p2.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const y_2_px = p2.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;

    if (Math.abs(x_1_px - x_2_px) > 1e-2) { // Horizontal segment
        drawStaticLine(Math.min(x_1_px, x_2_px), y_1_px, Math.max(x_1_px, x_2_px), y_1_px, pathColor, pathType, targetLayoutDiv);
    }
    if (Math.abs(y_1_px - y_2_px) > 1e-2) { // Vertical segment (from end of horizontal to target Y)
        drawStaticLine(x_2_px, Math.min(y_1_px, y_2_px), x_2_px, Math.max(y_1_px, y_2_px), pathColor, pathType, targetLayoutDiv);
    }
}

function drawFullPathWithNumbers(path, pathColor, pathType, targetLayoutDiv) {
    targetLayoutDiv.querySelectorAll(`.static-path-${pathType}`).forEach(el => el.remove());
    targetLayoutDiv.querySelectorAll(`.order-number.order-number-${pathType}`).forEach(el => el.remove());

    if (!path || !path.length) return;

    drawStaticManhattanPath(startPoint, path[0], pathColor, pathType, targetLayoutDiv);
    for (let i = 0; i < path.length - 1; i++) {
        drawStaticManhattanPath(path[i], path[i + 1], pathColor, pathType, targetLayoutDiv);
    }
    drawStaticManhattanPath(path[path.length - 1], startPoint, pathColor, pathType, targetLayoutDiv);
    drawItemOrderNumbers(path, pathType, targetLayoutDiv);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function drawAnimationLine(x1, y1, x2, y2, color, animationPathType, targetLayoutDiv) {
    const line = document.createElement('div');
    line.classList.add('path-line', `anim-path-${animationPathType}`);
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    line.style.width = `${length}px`;
    line.style.backgroundColor = color;
    line.style.opacity = ANIMATION_LINE_OPACITY;
    line.style.position = 'absolute';
    line.style.left = `${x1}px`;
    line.style.top = `${y1 - 1.25}px`;
    line.style.transformOrigin = '0 50%';
    line.style.transform = `rotate(${angle}deg)`;
    targetLayoutDiv.appendChild(line);
}

async function animateSegment(currentPixelX, currentPixelY, targetPixelX, targetPixelY, workerEl, animColor, animPathType, targetLayoutDiv) {
    let tempX = currentPixelX;
    // Animate X movement
    while (Math.abs(tempX - targetPixelX) > PIXELS_PER_UNIT / 10) { // Adjusted threshold
        const stepSize = PIXELS_PER_UNIT / 5; // Control step size
        const actualStepX = Math.sign(targetPixelX - tempX) * Math.min(stepSize, Math.abs(targetPixelX - tempX));
        drawAnimationLine(tempX, currentPixelY, tempX + actualStepX, currentPixelY, animColor, animPathType, targetLayoutDiv);
        tempX += actualStepX;
        workerEl.style.left = `${tempX}px`;
        await sleep(ANIMATION_STEP_DELAY);
    }
    workerEl.style.left = `${targetPixelX}px`; // Snap to final X

    let tempY = currentPixelY;
    // Animate Y movement
    while (Math.abs(tempY - targetPixelY) > PIXELS_PER_UNIT / 10) {
        const stepSize = PIXELS_PER_UNIT / 5;
        const actualStepY = Math.sign(targetPixelY - tempY) * Math.min(stepSize, Math.abs(targetPixelY - tempY));
        drawAnimationLine(targetPixelX, tempY, targetPixelX, tempY + actualStepY, animColor, animPathType, targetLayoutDiv);
        tempY += actualStepY;
        workerEl.style.top = `${tempY}px`;
        await sleep(ANIMATION_STEP_DELAY);
    }
    workerEl.style.top = `${targetPixelY}px`; // Snap to final Y
}


async function animateWorkerMovement(path, workerEl, animationLineColor, animationPathType, targetLayoutDiv) {
    if (!path || !path.length || !workerEl) return;

    targetLayoutDiv.querySelectorAll(`.anim-path-${animationPathType}`).forEach(el => el.remove());

    let currentWorkerPixelX = startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    let currentWorkerPixelY = startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    workerEl.style.left = `${currentWorkerPixelX}px`;
    workerEl.style.top = `${currentWorkerPixelY}px`;
    workerEl.style.display = 'block';

    let fullPathForAnimation = [startPoint, ...path, startPoint];

    for (let i = 0; i < fullPathForAnimation.length - 1; i++) {
        const p1 = fullPathForAnimation[i];
        const p2 = fullPathForAnimation[i + 1];
        const targetPixelX = p2.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
        const targetPixelY = p2.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
        await animateSegment(currentWorkerPixelX, currentWorkerPixelY, targetPixelX, targetPixelY, workerEl, animationLineColor, animationPathType, targetLayoutDiv);
        currentWorkerPixelX = targetPixelX;
        currentWorkerPixelY = targetPixelY;
    }
}

async function startSimulation() {
    if (simulationInProgress) return;
    simulationInProgress = true;
    const startButton = document.getElementById('startButton');
    startButton.disabled = true;

    clearErrors();
    document.getElementById('resultsRandom').style.display = 'none';
    document.getElementById('resultsTSP').style.display = 'none';

    const layoutRandomDiv = document.getElementById('warehouseLayoutRandom');
    const layoutTSPDiv = document.getElementById('warehouseLayoutTSP');
    layoutRandomDiv.innerHTML = ''; // Clear maps before drawing new structure
    layoutTSPDiv.innerHTML = '';


    warehouseWidth = parseInt(document.getElementById('warehouseWidth').value);
    warehouseHeight = parseInt(document.getElementById('warehouseHeight').value);
    numItemsToPick = parseInt(document.getElementById('numItemsToPick').value);
    numTotalItems = parseInt(document.getElementById('numTotalItems').value);
    layoutType = document.getElementById('layoutType').value;
    numAisles = parseInt(document.getElementById('numAisles').value);
    aisleWidthUnits = parseInt(document.getElementById('aisleWidthUnits').value);
    shelfDepthUnits = parseInt(document.getElementById('shelfDepthUnits').value);

    // --- Input Validations ---
    let errorFound = false;
    if (isNaN(warehouseWidth) || isNaN(warehouseHeight) || isNaN(numItemsToPick) || isNaN(numTotalItems) ||
        isNaN(numAisles) || isNaN(aisleWidthUnits) || isNaN(shelfDepthUnits) ||
        warehouseWidth <= 1 || warehouseHeight <= 1 || numItemsToPick < 0 || numTotalItems < 0 ||
        numAisles < 1 || aisleWidthUnits < 1 || shelfDepthUnits < 0 ) { // shelfDepth can be 0 for open space
        displayError('randomError', "الرجاء إدخال قيم صحيحة لجميع حقول الإعدادات.");
        errorFound = true;
    }
    if (!errorFound && numTotalItems > 0 && numTotalItems < numItemsToPick) {
        displayError('randomError', "إجمالي المنتجات يجب أن يكون أكبر أو يساوي عدد المنتجات للجلب.");
        errorFound = true;
    }
    // Rough check for space, more refined check happens in generateItemLocations
    const estimatedMinWidth = numAisles * aisleWidthUnits + (numAisles + 1) * shelfDepthUnits;
    if (!errorFound && layoutType !== "random_scatter" && warehouseWidth < estimatedMinWidth && shelfDepthUnits > 0) {
        displayError('randomError', `عرض المستودع (${warehouseWidth}) قد يكون صغيراً جداً لـ ${numAisles} ممرات بعرض ${aisleWidthUnits} وعمق أرفف ${shelfDepthUnits}. المقترح: ${estimatedMinWidth}`);
        errorFound = true;
    }


    if (errorFound) {
        displayError('tspError', document.getElementById('randomError').textContent); // Show same error for TSP
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }
    // --- End Input Validations ---
    
    if (!generateItemLocations()) { // Defines gridCells, startPoint, and allItemLocations
         const msg = `فشل في توزيع المنتجات. تحقق من أبعاد المستودع وإعدادات الممرات/الأرفف.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }

    if (!generatePickList()) { // Generates pickListItems from allItemLocations
        // Errors displayed within generatePickList
        drawWarehouse(layoutRandomDiv, 'random'); // Draw warehouse structure even if picklist fails
        drawWarehouse(layoutTSPDiv, 'tsp');
        if(workerElements.random) workerElements.random.style.display = 'none';
        if(workerElements.tsp) workerElements.tsp.style.display = 'none';
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }

    drawWarehouse(layoutRandomDiv, 'random');
    drawWarehouse(layoutTSPDiv, 'tsp');

    const randomPath = simulateRandomPicking();
    if (randomPath && randomPath.length > 0) {
        drawFullPathWithNumbers(randomPath, RANDOM_PATH_COLOR, 'random', layoutRandomDiv);
        await animateWorkerMovement(randomPath, workerElements.random, RANDOM_PATH_COLOR, 'random-anim', layoutRandomDiv);
    } else {
        if(workerElements.random) workerElements.random.style.display = 'none';
        layoutRandomDiv.querySelectorAll('.static-path-random, .order-number-random, .anim-path-random-anim').forEach(el => el.remove());
    }

    const optimizedPath = simulateTSPPicking_Optimized();
    if (optimizedPath && optimizedPath.length > 0) {
        drawFullPathWithNumbers(optimizedPath, OPTIMIZED_PATH_COLOR, 'tsp', layoutTSPDiv);
        await animateWorkerMovement(optimizedPath, workerElements.tsp, OPTIMIZED_PATH_COLOR, 'tsp-anim', layoutTSPDiv);
    } else {
         if(workerElements.tsp) workerElements.tsp.style.display = 'none';
        layoutTSPDiv.querySelectorAll('.static-path-tsp, .order-number-tsp, .anim-path-tsp-anim').forEach(el => el.remove());
    }
    
    startButton.disabled = false;
    simulationInProgress = false;
}

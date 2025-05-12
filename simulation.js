// Constants for visualization
const ITEM_VISUAL_SIZE = 10;
const WORKER_VISUAL_SIZE = 12;
const START_POINT_COLOR = "blue";
const ITEM_COLOR = "red";
const WORKER_COLOR = "purple";
const RANDOM_PATH_COLOR = "green";
const OPTIMIZED_PATH_COLOR = "orange";
const ANIMATION_LINE_OPACITY = "0.8";
const STATIC_LINE_OPACITY = "0.4";
const PIXELS_PER_UNIT = 20;
const ANIMATION_STEP_DELAY = 50; // ms per step in animation

// Global state variables
let warehouseWidth, warehouseHeight, numItemsToPick, numTotalItems;
let allItemLocations = [];
let pickListItems = [];
let startPoint = { x: 0, y: 0, name: "Start" };
let workerElement = null; // DOM element for the worker

const layoutDiv = document.getElementById('warehouseLayout');

/**
 * Displays an error message.
 */
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

/**
 * Clears error messages.
 */
function clearErrors() {
    document.getElementById('randomError').textContent = '';
    document.getElementById('randomError').style.display = 'none';
    document.getElementById('tspError').textContent = '';
    document.getElementById('tspError').style.display = 'none';
}

/**
 * Calculates Manhattan distance.
 */
function manhattanDistance(point1, point2) {
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
}

/**
 * Generates random item locations.
 */
function generateItemLocations() {
    allItemLocations = [];
    const usedLocations = new Set();
    usedLocations.add(`${startPoint.x},${startPoint.y}`);

    for (let i = 0; i < numTotalItems; i++) {
        let x, y, locationKey;
        do {
            x = Math.floor(Math.random() * warehouseWidth);
            y = Math.floor(Math.random() * warehouseHeight);
            locationKey = `${x},${y}`;
        } while (usedLocations.has(locationKey));
        allItemLocations.push({ id: `item-${i}`, x: x, y: y, name: `P${i}` });
        usedLocations.add(locationKey);
    }
}

/**
 * Generates a random pick list.
 */
function generatePickList() {
    pickListItems = [];
    if (numItemsToPick > allItemLocations.length) {
        const msg = `لا يمكن اختيار ${numItemsToPick} منتج، يوجد فقط ${allItemLocations.length} منتج متاح.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        return false;
    }
    const shuffled = [...allItemLocations].sort(() => 0.5 - Math.random());
    pickListItems = shuffled.slice(0, numItemsToPick);
    return true;
}

/**
 * Calculates total path cost.
 */
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

/**
 * Simulates random picking.
 */
function simulateRandomPicking() {
    if (!pickListItems.length) return null; // Return null if no items

    const randomPath = [...pickListItems];
    const distance = calculatePathCost(randomPath);
    const time = distance;

    const resultsDiv = document.getElementById('resultsRandom');
    resultsDiv.style.display = 'block';
    document.getElementById('randomOrder').textContent = `ترتيب الجلب العشوائي: Start -> ${randomPath.map(p => p.name).join(' -> ')} -> Start`;
    document.getElementById('randomDistance').textContent = `إجمالي المسافة المقطوعة (عشوائي): ${distance.toFixed(2)} وحدات`;
    document.getElementById('randomTime').textContent = `إجمالي الزمن المستغرق (عشوائي): ${time.toFixed(2)} وحدات زمن`;
    
    return randomPath; // Return the path for animation
}

// --- TSP Optimization: Nearest Neighbor + 2-Opt ---
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
    const maxIterations = bestPath.length * Math.max(10, bestPath.length * 2); // Adjusted maxIterations

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
                     i = -1; // Restart outer loop (Greedy 2-opt)
                     break;
                }
            }
             if (improved) break;
        }
    }
    return bestPath;
}

/**
 * Simulates TSP picking (Nearest Neighbor + 2-Opt).
 */
function simulateTSPPicking_Optimized() {
    if (!pickListItems.length) return null;

    if (pickListItems.length === 1) {
        const optimizedPath = [...pickListItems];
        const distance = calculatePathCost(optimizedPath);
        const time = distance;
        document.getElementById('resultsTSP').style.display = 'block';
        document.getElementById('tspOrder').textContent = `ترتيب الجلب (TSP محسن): Start -> ${optimizedPath.map(p => p.name).join(' -> ')} -> Start`;
        document.getElementById('tspDistance').textContent = `إجمالي المسافة المقطوعة (TSP محسن): ${distance.toFixed(2)} وحدات`;
        document.getElementById('tspTime').textContent = `إجمالي الزمن المستغرق (TSP محسن): ${time.toFixed(2)} وحدات زمن`;
        return optimizedPath;
    }

    const nnPath = getNearestNeighborPath(pickListItems, startPoint);
    if (!nnPath.length) return null;
    const optimizedPath = apply2Opt(nnPath);
    const distance = calculatePathCost(optimizedPath);
    const time = distance;

    const resultsDiv = document.getElementById('resultsTSP');
    resultsDiv.style.display = 'block';
    document.getElementById('tspOrder').textContent = `ترتيب الجلب (TSP - أقرب جار + 2-Opt): Start -> ${optimizedPath.map(p => p.name).join(' -> ')} -> Start`;
    document.getElementById('tspDistance').textContent = `إجمالي المسافة المقطوعة (TSP محسن): ${distance.toFixed(2)} وحدات`;
    document.getElementById('tspTime').textContent = `إجمالي الزمن المستغرق (TSP محسن): ${time.toFixed(2)} وحدات زمن`;
    return optimizedPath; // Return the path for animation
}

// --- Drawing Functions ---

/**
 * Creates or retrieves the worker DOM element.
 */
function getOrCreateWorkerElement() {
    let worker = document.getElementById('worker');
    if (!worker) {
        worker = document.createElement('div');
        worker.id = 'worker';
        worker.className = 'item-dot'; // Reuse item-dot style
        worker.style.backgroundColor = WORKER_COLOR;
        worker.style.width = `${WORKER_VISUAL_SIZE}px`;
        worker.style.height = `${WORKER_VISUAL_SIZE}px`;
        worker.style.zIndex = "10"; // Ensure worker is on top
        worker.style.position = 'absolute'; // Make sure it's absolutely positioned
        layoutDiv.appendChild(worker);
    }
    // Set initial position to startPoint
    worker.style.left = `${startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    worker.style.top = `${startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    worker.title = "العامل";
    return worker;
}


/**
 * Draws the warehouse grid, start point, and selected pick list items.
 */
function drawWarehouse() {
    layoutDiv.innerHTML = ''; // Clear previous drawings (items, static paths, numbers)
    layoutDiv.style.width = `${warehouseWidth * PIXELS_PER_UNIT}px`;
    layoutDiv.style.height = `${warehouseHeight * PIXELS_PER_UNIT}px`;

    const startDot = document.createElement('div');
    startDot.className = 'item-dot';
    startDot.style.backgroundColor = START_POINT_COLOR;
    startDot.style.width = `${ITEM_VISUAL_SIZE + 5}px`;
    startDot.style.height = `${ITEM_VISUAL_SIZE + 5}px`;
    startDot.style.left = `${startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    startDot.style.top = `${startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    startDot.title = `نقطة البداية/النهاية (X:${startPoint.x}, Y:${startPoint.y})`;
    layoutDiv.appendChild(startDot);

    pickListItems.forEach(item => {
        const itemDot = document.createElement('div');
        itemDot.className = 'item-dot';
        itemDot.id = `item-vis-${item.id}`; // ID for attaching order numbers
        itemDot.style.backgroundColor = ITEM_COLOR;
        itemDot.style.width = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.height = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.left = `${item.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.style.top = `${item.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.title = `${item.name} (X:${item.x}, Y:${item.y})`;
        layoutDiv.appendChild(itemDot);
    });
    workerElement = getOrCreateWorkerElement(); // Create/reset worker position
}

/**
 * Draws order numbers next to items for a given path.
 */
function drawItemOrderNumbers(path, pathType) {
    // Clear previous order numbers of this type
    document.querySelectorAll(`.order-number-${pathType}`).forEach(el => el.remove());

    path.forEach((item, index) => {
        const itemVisElement = document.getElementById(`item-vis-${item.id}`);
        if (itemVisElement) {
            const orderSpan = document.createElement('span');
            orderSpan.className = `order-number order-number-${pathType}`;
            orderSpan.textContent = (index + 1).toString();
            orderSpan.style.position = 'absolute';
            orderSpan.style.left = `${parseFloat(itemVisElement.style.left) + ITEM_VISUAL_SIZE / 2 + 2}px`; // Position to the right
            orderSpan.style.top = `${parseFloat(itemVisElement.style.top) - ITEM_VISUAL_SIZE / 2 - 2}px`;   // Position slightly above
            orderSpan.style.fontSize = '10px';
            orderSpan.style.color = (pathType === 'random' ? RANDOM_PATH_COLOR : OPTIMIZED_PATH_COLOR);
            orderSpan.style.fontWeight = 'bold';
            layoutDiv.appendChild(orderSpan);
        }
    });
}

/**
 * Draws a static line segment.
 */
function drawStaticLine(x1, y1, x2, y2, color, pathType, opacity = STATIC_LINE_OPACITY) {
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
    layoutDiv.appendChild(line);
}

/**
 * Draws a static Manhattan path.
 */
function drawStaticManhattanPath(p1, p2, pathColor, pathType) {
    const x_1_px = p1.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const y_1_px = p1.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const x_2_px = p2.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const y_2_px = p2.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;

    if (x_1_px !== x_2_px) {
        drawStaticLine(Math.min(x_1_px, x_2_px), y_1_px, Math.max(x_1_px, x_2_px), y_1_px, pathColor, pathType);
    }
    if (y_1_px !== y_2_px) {
        drawStaticLine(x_2_px, Math.min(y_1_px, y_2_px), x_2_px, Math.max(y_1_px, y_2_px), pathColor, pathType);
    }
}

/**
 * Draws the complete static path and its order numbers.
 */
function drawFullPathWithNumbers(path, pathColor, pathType) {
    // Clear previous static path and numbers of this type
    document.querySelectorAll(`.static-path-${pathType}`).forEach(el => el.remove());
    document.querySelectorAll(`.order-number-${pathType}`).forEach(el => el.remove());

    if (!path || !path.length) return;

    drawStaticManhattanPath(startPoint, path[0], pathColor, pathType);
    for (let i = 0; i < path.length - 1; i++) {
        drawStaticManhattanPath(path[i], path[i + 1], pathColor, pathType);
    }
    drawStaticManhattanPath(path[path.length - 1], startPoint, pathColor, pathType);
    drawItemOrderNumbers(path, pathType); // Draw numbers after path lines
}


// --- Animation Functions ---
/**
 * Helper to pause execution.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Draws a line segment for animation.
 */
function drawAnimationLine(x1, y1, x2, y2, color, animationPathType) {
    // Similar to drawStaticLine but with different class for clearing
    const line = document.createElement('div');
    line.classList.add('path-line', `anim-path-${animationPathType}`); // Animation specific class

    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

    line.style.width = `${length}px`;
    line.style.backgroundColor = color;
    line.style.opacity = ANIMATION_LINE_OPACITY; // Animation lines can be more opaque
    line.style.position = 'absolute';
    line.style.left = `${x1}px`;
    line.style.top = `${y1 - 1.25}px`;
    line.style.transformOrigin = '0 50%';
    line.style.transform = `rotate(${angle}deg)`;
    layoutDiv.appendChild(line);
}


/**
 * Animates the worker moving along a single Manhattan segment.
 */
async function animateSegment(currentPixelX, currentPixelY, targetPixelX, targetPixelY, workerEl, animColor, animPathType) {
    // Animate X movement
    let tempX = currentPixelX;
    while (Math.abs(tempX - targetPixelX) > 1e-2) { // Use a small epsilon for float comparison
        const nextX = tempX + Math.sign(targetPixelX - tempX) * (PIXELS_PER_UNIT / 4); // Move quarter unit
        drawAnimationLine(tempX, currentPixelY, nextX, currentPixelY, animColor, animPathType);
        tempX = (Math.sign(targetPixelX - tempX) > 0) ? Math.min(nextX, targetPixelX) : Math.max(nextX, targetPixelX);
        workerEl.style.left = `${tempX}px`;
        await sleep(ANIMATION_STEP_DELAY / 2);
    }
    workerEl.style.left = `${targetPixelX}px`; // Snap to final X

    // Animate Y movement
    let tempY = currentPixelY;
    while (Math.abs(tempY - targetPixelY) > 1e-2) {
        const nextY = tempY + Math.sign(targetPixelY - tempY) * (PIXELS_PER_UNIT / 4);
        drawAnimationLine(targetPixelX, tempY, targetPixelX, nextY, animColor, animPathType);
        tempY = (Math.sign(targetPixelY - tempY) > 0) ? Math.min(nextY, targetPixelY) : Math.max(nextY, targetPixelY);
        workerEl.style.top = `${tempY}px`;
        await sleep(ANIMATION_STEP_DELAY / 2);
    }
    workerEl.style.top = `${targetPixelY}px`; // Snap to final Y
}


/**
 * Animates the worker's movement along the given path.
 */
async function animateWorkerMovement(path, workerEl, animationLineColor, animationPathType) {
    if (!path || !path.length) return;

    // Clear previous animation lines of this type
    document.querySelectorAll(`.anim-path-${animationPathType}`).forEach(el => el.remove());

    // Reset worker to start point visually
    let currentWorkerPixelX = startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    let currentWorkerPixelY = startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    workerEl.style.left = `${currentWorkerPixelX}px`;
    workerEl.style.top = `${currentWorkerPixelY}px`;

    let fullPathForAnimation = [startPoint, ...path, startPoint];

    for (let i = 0; i < fullPathForAnimation.length - 1; i++) {
        const p1 = fullPathForAnimation[i];
        const p2 = fullPathForAnimation[i+1];

        const targetPixelX = p2.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
        const targetPixelY = p2.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;

        await animateSegment(currentWorkerPixelX, currentWorkerPixelY, targetPixelX, targetPixelY, workerEl, animationLineColor, animationPathType);
        
        currentWorkerPixelX = targetPixelX;
        currentWorkerPixelY = targetPixelY;
    }
}


/**
 * Main function to start the simulation.
 */
async function startSimulation() { // Made async to await animations
    clearErrors();
    document.getElementById('resultsRandom').style.display = 'none';
    document.getElementById('resultsTSP').style.display = 'none';
    // Clear all old paths and numbers
    document.querySelectorAll('.path-line').forEach(el => el.remove());
    document.querySelectorAll('.order-number').forEach(el => el.remove());


    warehouseWidth = parseInt(document.getElementById('warehouseWidth').value);
    warehouseHeight = parseInt(document.getElementById('warehouseHeight').value);
    numItemsToPick = parseInt(document.getElementById('numItemsToPick').value);
    numTotalItems = parseInt(document.getElementById('numTotalItems').value);

    // --- Input Validations ---
    if (isNaN(warehouseWidth) || isNaN(warehouseHeight) || isNaN(numItemsToPick) || isNaN(numTotalItems) ||
        warehouseWidth <= 0 || warehouseHeight <= 0 || numItemsToPick < 0 || numTotalItems <= 0) { // numItemsToPick can be 0
        const msg = "الرجاء إدخال قيم صحيحة وموجبة (أو صفر لعدد المنتجات للجلب).";
        displayError('randomError', msg);
        displayError('tspError', msg);
        return;
    }
    if (numTotalItems < numItemsToPick) {
        const msg = "إجمالي عدد المنتجات يجب أن يكون أكبر من أو يساوي عدد المنتجات المطلوب جلبها.";
        displayError('randomError', msg);
        displayError('tspError', msg);
        return;
    }
    if (numTotalItems > (warehouseWidth * warehouseHeight) - 1) {
        const msg = `لا يمكن توزيع ${numTotalItems} منتج في مستودع ${warehouseWidth}x${warehouseHeight}.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        return;
    }
    // --- End Input Validations ---

    startPoint = { x: Math.floor(warehouseWidth / 2), y: warehouseHeight - 1, name: "Start" };

    generateItemLocations();
    if (!generatePickList()) {
        drawWarehouse(); // Draw warehouse even if picklist fails
        if (workerElement) workerElement.style.display = 'none'; // Hide worker if no picklist
        return;
    }
     if (workerElement) workerElement.style.display = 'block';


    drawWarehouse(); // Draws items and resets worker position

    // --- Random Path Simulation ---
    const randomPath = simulateRandomPicking();
    if (randomPath && randomPath.length > 0) {
        drawFullPathWithNumbers(randomPath, RANDOM_PATH_COLOR, 'random');
        await animateWorkerMovement(randomPath, workerElement, RANDOM_PATH_COLOR, 'random-anim');
    } else if (numItemsToPick > 0) { // If picklist had items but path failed (should not happen with current logic)
         document.getElementById('resultsRandom').style.display = 'block'; // Show error if any
    } else { // No items to pick for random
        document.getElementById('resultsRandom').style.display = 'block';
        document.getElementById('randomOrder').textContent = "لا يوجد منتجات لجلبها بالطريقة العشوائية.";
        document.getElementById('randomDistance').textContent = "";
        document.getElementById('randomTime').textContent = "";
    }


    // --- Optimized TSP Path Simulation ---
    if (numItemsToPick > 0) {
        const optimizedPath = simulateTSPPicking_Optimized();
        if (optimizedPath && optimizedPath.length > 0) {
            drawFullPathWithNumbers(optimizedPath, OPTIMIZED_PATH_COLOR, 'tsp');
            await animateWorkerMovement(optimizedPath, workerElement, OPTIMIZED_PATH_COLOR, 'tsp-anim');
        } else {
             document.getElementById('resultsTSP').style.display = 'block'; // Show error if any
        }
    } else { // No items to pick for TSP
        document.getElementById('resultsTSP').style.display = 'block';
        document.getElementById('tspOrder').textContent = "لا يوجد منتجات لجلبها بطريقة TSP.";
        document.getElementById('tspDistance').textContent = "";
        document.getElementById('tspTime').textContent = "";
    }
}

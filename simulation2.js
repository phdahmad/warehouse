// Constants for visualization
const ITEM_VISUAL_SIZE = 10;
const WORKER_VISUAL_SIZE = 12;
const START_POINT_COLOR = "blue";
const ITEM_COLOR = "red";
const WORKER_COLOR = "purple";
const RANDOM_PATH_COLOR = "green";
const OPTIMIZED_PATH_COLOR = "orange";
const ANIMATION_LINE_OPACITY = "0.9";
const STATIC_LINE_OPACITY = "0.5";
const PIXELS_PER_UNIT = 15; // Adjusted for potentially larger warehouse dimensions
const ANIMATION_STEP_DELAY = 35; // ms per step in animation

// Global state variables
let warehouseWidth, warehouseHeight, numItemsToPick, numTotalItems, layoutType;
let allItemLocations = [];
let pickListItems = [];
let startPoint = { x: 0, y: 0, name: "Start" };
let workerElements = { random: null, tsp: null };
let simulationInProgress = false; // Flag to prevent multiple concurrent simulations


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
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
}

/**
 * Generates item locations based on the selected warehouse layout.
 */
function generateItemLocations() {
    allItemLocations = [];
    const usedLocations = new Set();

    // Define startPoint based on layout (more refined placement)
    switch (layoutType) {
        case "u_shape":
            startPoint = { x: Math.floor(warehouseWidth / 2), y: warehouseHeight - 1, name: "Start" }; // Base of U
            break;
        case "i_shape":
            startPoint = { x: Math.floor(warehouseWidth / 2), y: warehouseHeight - 1, name: "Start" }; // One end of I
            break;
        case "l_shape":
            startPoint = { x: 1, y: warehouseHeight - 2, name: "Start" }; // Corner of L (approx)
            break;
        case "random_scatter":
        default:
            startPoint = { x: Math.floor(Math.random() * warehouseWidth), y: Math.floor(Math.random() * warehouseHeight), name: "Start" };
            break;
    }
    usedLocations.add(`${startPoint.x},${startPoint.y}`);

    for (let i = 0; i < numTotalItems; i++) {
        let x, y, locationKey;
        let attempts = 0;
        const maxAttempts = warehouseWidth * warehouseHeight * 2; // Prevent infinite loop

        do {
            attempts++;
            if (attempts > maxAttempts) {
                console.warn("Max attempts reached for placing an item. Warehouse might be too full for this layout.");
                // Potentially skip this item or handle error
                return false; // Indicate failure to place all items
            }

            switch (layoutType) {
                case "u_shape":
                    // Concentrate items along two vertical arms and a connecting base, avoiding center too much
                    const armWidth = Math.max(1, Math.floor(warehouseWidth / 4));
                    const side = Math.random() < 0.5 ? 'left' : 'right';
                    if (side === 'left') {
                        x = Math.floor(Math.random() * armWidth);
                    } else {
                        x = warehouseWidth - 1 - Math.floor(Math.random() * armWidth);
                    }
                    y = Math.floor(Math.random() * (warehouseHeight - 2)); // Keep some space from start
                    break;
                case "i_shape":
                    // Concentrate items along a central corridor
                    const corridorWidth = Math.max(1, Math.floor(warehouseWidth / 2));
                    x = Math.floor(warehouseWidth / 2 - corridorWidth / 2 + Math.random() * corridorWidth);
                    y = Math.floor(Math.random() * (warehouseHeight -1)); // Allow full height except start row if at bottom
                    break;
                case "l_shape":
                    // Concentrate items along a vertical and a horizontal arm
                    const legChoice = Math.random();
                    if (legChoice < 0.5) { // Vertical leg (left side)
                        x = Math.floor(Math.random() * Math.floor(warehouseWidth / 2));
                        y = Math.floor(Math.random() * warehouseHeight);
                    } else { // Horizontal leg (bottom side)
                        x = Math.floor(Math.random() * warehouseWidth);
                        y = warehouseHeight - 1 - Math.floor(Math.random() * Math.floor(warehouseHeight / 2));
                    }
                    break;
                case "random_scatter":
                default:
                    x = Math.floor(Math.random() * warehouseWidth);
                    y = Math.floor(Math.random() * warehouseHeight);
                    break;
            }
            locationKey = `${x},${y}`;
        } while (usedLocations.has(locationKey) || x < 0 || x >= warehouseWidth || y < 0 || y >= warehouseHeight);
        
        allItemLocations.push({ id: `item-${i}`, x: x, y: y, name: `P${i}` });
        usedLocations.add(locationKey);
    }
    return true; // All items placed successfully
}


function generatePickList() {
    pickListItems = [];
    if (numTotalItems === 0 && numItemsToPick > 0) {
         const msg = `لا يوجد منتجات في المستودع لاختيار ${numItemsToPick} منها.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        return false;
    }
    if (numItemsToPick > allItemLocations.length) {
        const msg = `لا يمكن اختيار ${numItemsToPick} منتج، يوجد فقط ${allItemLocations.length} منتج متاح حاليًا.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        return false;
    }
     if (numItemsToPick === 0) {
        return true; // Valid to pick 0 items
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
        worker.className = 'item-dot';
        worker.style.backgroundColor = WORKER_COLOR;
        worker.style.width = `${WORKER_VISUAL_SIZE}px`;
        worker.style.height = `${WORKER_VISUAL_SIZE}px`;
        worker.style.zIndex = "10";
        worker.style.position = 'absolute';
        targetLayoutDiv.appendChild(worker);
    }
    worker.style.left = `${startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    worker.style.top = `${startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    worker.title = `عامل (${mapType})`;
    worker.style.display = 'block';
    return worker;
}

function drawWarehouse(targetLayoutDiv, mapType) {
    targetLayoutDiv.innerHTML = '';
    targetLayoutDiv.style.width = `${warehouseWidth * PIXELS_PER_UNIT}px`;
    targetLayoutDiv.style.height = `${warehouseHeight * PIXELS_PER_UNIT}px`;

    const startDot = document.createElement('div');
    startDot.className = 'item-dot';
    startDot.style.backgroundColor = START_POINT_COLOR;
    startDot.style.width = `${ITEM_VISUAL_SIZE + 5}px`;
    startDot.style.height = `${ITEM_VISUAL_SIZE + 5}px`;
    startDot.style.left = `${startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    startDot.style.top = `${startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    startDot.title = `البداية (X:${startPoint.x}, Y:${startPoint.y})`;
    targetLayoutDiv.appendChild(startDot);

    pickListItems.forEach(item => {
        const itemDot = document.createElement('div');
        itemDot.className = 'item-dot';
        itemDot.id = `item-vis-${item.id}-${mapType}`;
        itemDot.style.backgroundColor = ITEM_COLOR;
        itemDot.style.width = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.height = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.left = `${item.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.style.top = `${item.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.title = `${item.name} (X:${item.x}, Y:${item.y})`;
        targetLayoutDiv.appendChild(itemDot);
    });
    workerElements[mapType] = getOrCreateWorkerElement(targetLayoutDiv, mapType);
     if (numItemsToPick === 0 && workerElements[mapType]) {
        workerElements[mapType].style.display = 'none';
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
            // Position relative to the item dot's center
            const itemX = parseFloat(itemVisElement.style.left);
            const itemY = parseFloat(itemVisElement.style.top);
            orderSpan.style.left = `${itemX + ITEM_VISUAL_SIZE / 2 - 2}px`; // Adjust for better positioning
            orderSpan.style.top = `${itemY - ITEM_VISUAL_SIZE - 2}px`;   // Position above the dot
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
    line.style.top = `${y1 - 1.25}px`;
    line.style.transformOrigin = '0 50%';
    line.style.transform = `rotate(${angle}deg)`;
    targetLayoutDiv.appendChild(line);
}

function drawStaticManhattanPath(p1, p2, pathColor, pathType, targetLayoutDiv) {
    const x_1_px = p1.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const y_1_px = p1.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const x_2_px = p2.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const y_2_px = p2.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;

    if (x_1_px !== x_2_px) {
        drawStaticLine(Math.min(x_1_px, x_2_px), y_1_px, Math.max(x_1_px, x_2_px), y_1_px, pathColor, pathType, targetLayoutDiv);
    }
    if (y_1_px !== y_2_px) {
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
    while (Math.abs(tempX - targetPixelX) > 1e-2) {
        const stepX = Math.sign(targetPixelX - tempX) * (PIXELS_PER_UNIT / 4);
        const nextX = tempX + stepX;
        drawAnimationLine(tempX, currentPixelY, (Math.abs(targetPixelX - tempX) < Math.abs(stepX)) ? targetPixelX : nextX, currentPixelY, animColor, animPathType, targetLayoutDiv);
        tempX = (Math.sign(targetPixelX - tempX) > 0) ? Math.min(nextX, targetPixelX) : Math.max(nextX, targetPixelX);
        workerEl.style.left = `${tempX}px`;
        await sleep(ANIMATION_STEP_DELAY);
    }
    workerEl.style.left = `${targetPixelX}px`;

    let tempY = currentPixelY;
    while (Math.abs(tempY - targetPixelY) > 1e-2) {
        const stepY = Math.sign(targetPixelY - tempY) * (PIXELS_PER_UNIT / 4);
        const nextY = tempY + stepY;
        drawAnimationLine(targetPixelX, tempY, targetPixelX, (Math.abs(targetPixelY - tempY) < Math.abs(stepY)) ? targetPixelY : nextY, animColor, animPathType, targetLayoutDiv);
        tempY = (Math.sign(targetPixelY - tempY) > 0) ? Math.min(nextY, targetPixelY) : Math.max(nextY, targetPixelY);
        workerEl.style.top = `${tempY}px`;
        await sleep(ANIMATION_STEP_DELAY);
    }
    workerEl.style.top = `${targetPixelY}px`;
}

async function animateWorkerMovement(path, workerEl, animationLineColor, animationPathType, targetLayoutDiv) {
    if (!path || !path.length || !workerEl) return;

    targetLayoutDiv.querySelectorAll(`.anim-path-${animationPathType}`).forEach(el => el.remove());

    let currentWorkerPixelX = startPoint.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    let currentWorkerPixelY = startPoint.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    workerEl.style.left = `${currentWorkerPixelX}px`;
    workerEl.style.top = `${currentWorkerPixelY}px`;
    workerEl.style.display = 'block'; // Make sure worker is visible for animation

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
    if (simulationInProgress) {
        console.log("Simulation already in progress. Please wait.");
        return;
    }
    simulationInProgress = true;
    const startButton = document.getElementById('startButton');
    startButton.disabled = true;

    clearErrors();
    document.getElementById('resultsRandom').style.display = 'none';
    document.getElementById('resultsTSP').style.display = 'none';

    const layoutRandomDiv = document.getElementById('warehouseLayoutRandom');
    const layoutTSPDiv = document.getElementById('warehouseLayoutTSP');
    layoutRandomDiv.querySelectorAll('.path-line, .order-number').forEach(el => el.remove());
    layoutTSPDiv.querySelectorAll('.path-line, .order-number').forEach(el => el.remove());


    warehouseWidth = parseInt(document.getElementById('warehouseWidth').value);
    warehouseHeight = parseInt(document.getElementById('warehouseHeight').value);
    numItemsToPick = parseInt(document.getElementById('numItemsToPick').value);
    numTotalItems = parseInt(document.getElementById('numTotalItems').value);
    layoutType = document.getElementById('layoutType').value;


    if (isNaN(warehouseWidth) || isNaN(warehouseHeight) || isNaN(numItemsToPick) || isNaN(numTotalItems) ||
        warehouseWidth <= 1 || warehouseHeight <= 1 || numItemsToPick < 0 || numTotalItems < 0) {
        const msg = "الرجاء إدخال قيم صحيحة (أبعاد المستودع > 1, عدد المنتجات >= 0).";
        displayError('randomError', msg);
        displayError('tspError', msg);
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }
    if (numTotalItems > 0 && numTotalItems < numItemsToPick) {
        const msg = "إجمالي المنتجات يجب أن يكون أكبر أو يساوي عدد المنتجات للجلب.";
        displayError('randomError', msg);
        displayError('tspError', msg);
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }
     // Max possible unique locations is width * height. Start point takes one.
    const maxPlaceableItems = (warehouseWidth * warehouseHeight) -1;
    if (numTotalItems > 0 && numTotalItems > maxPlaceableItems) {
        const msg = `لا يمكن توزيع ${numTotalItems} منتج في مستودع ${warehouseWidth}x${warehouseHeight} (الحد الأقصى ${maxPlaceableItems} مع نقطة البداية).`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }
    
    if (!generateItemLocations()) { // This now also sets startPoint based on layout
         const msg = `فشل في توزيع المنتجات. قد يكون المستودع ممتلئًا جدًا بالنسبة للتخطيط المختار.`;
        displayError('randomError', msg);
        displayError('tspError', msg);
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }

    if (!generatePickList()) {
        drawWarehouse(layoutRandomDiv, 'random'); // Draw empty warehouse if picklist fails
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
    } else if (numItemsToPick > 0) {
        // Error already displayed by simulateRandomPicking if pickListItems was not empty but path failed
    } else { // numItemsToPick === 0
        if(workerElements.random) workerElements.random.style.display = 'none';
        layoutRandomDiv.querySelectorAll('.static-path-random, .order-number-random, .anim-path-random-anim').forEach(el => el.remove());
    }


    const optimizedPath = simulateTSPPicking_Optimized();
    if (optimizedPath && optimizedPath.length > 0) {
        drawFullPathWithNumbers(optimizedPath, OPTIMIZED_PATH_COLOR, 'tsp', layoutTSPDiv);
        await animateWorkerMovement(optimizedPath, workerElements.tsp, OPTIMIZED_PATH_COLOR, 'tsp-anim', layoutTSPDiv);
    } else if (numItemsToPick > 0) {
        // Error already displayed
    } else { // numItemsToPick === 0
         if(workerElements.tsp) workerElements.tsp.style.display = 'none';
        layoutTSPDiv.querySelectorAll('.static-path-tsp, .order-number-tsp, .anim-path-tsp-anim').forEach(el => el.remove());
    }
    
    startButton.disabled = false;
    simulationInProgress = false;
}

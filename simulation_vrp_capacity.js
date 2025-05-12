// Constants for visualization
const ITEM_VISUAL_SIZE = 8;
const WORKER_VISUAL_SIZE = 10;
const DEPOT_COLOR = "blue"; // Depot color
const ITEM_COLOR = "black"; // Pickable items color
const WORKER_COLORS = ["purple", "teal", "brown", "olive", "navy", "maroon", "lime", "aqua", "fuchsia", "silver"];
const ANIMATION_LINE_OPACITY = "0.9";
const STATIC_LINE_OPACITY = "0.6";
const PIXELS_PER_UNIT = 15;
const ANIMATION_STEP_DELAY = 30; // ms per step in animation

// Global state variables
let warehouseWidth, warehouseHeight, numItemsToPickGlobalDemand, numTotalAvailableItems, numWorkers, workerTripCapacity;
let allAvailableItemLocations = []; // All items available in the warehouse
let globalPickList = [];    // Items selected for the current picking task (total demand)
let depotLocation = { x: 0, y: 0, name: "Depot" };
let workersData = []; // Stores { id, color, itemsToPickThisTrip: [], path: [], distance: 0, time: 0, element: null }
let simulationInProgress = false;

const layoutDiv = document.getElementById('warehouseLayoutVRP'); // Single layout div for VRP

function displayMessage(elementId, message, type = "error") {
    const msgElement = document.getElementById(elementId);
    if (msgElement) {
        msgElement.textContent = message;
        msgElement.className = type; // Use class for styling (error, warning)
        msgElement.style.display = 'block';
    }
    if (type === "error") {
        document.getElementById('resultsVRP').style.display = 'block'; // Show results area to display error
        document.getElementById('vrpTotalDistanceText').textContent = "";
        document.getElementById('vrpMaxTimeText').textContent = "";
        document.getElementById('vrpTotalTimeText').textContent = "";
        document.getElementById('vrpWorkerDetails').innerHTML = "";
    }
}

function clearMessages() {
    document.getElementById('vrpError').style.display = 'none';
    document.getElementById('vrpError').textContent = '';
    document.getElementById('vrpWarning').style.display = 'none';
    document.getElementById('vrpWarning').textContent = '';
}

function manhattanDistance(point1, point2) {
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
}

function generateAllAvailableItemLocations() {
    allAvailableItemLocations = [];
    const usedLocations = new Set();
    depotLocation = {
        x: Math.floor(warehouseWidth / 2),
        y: warehouseHeight - 1, // Typically at the bottom/edge
        name: "Depot"
    };
    usedLocations.add(`${depotLocation.x},${depotLocation.y}`);

    for (let i = 0; i < numTotalAvailableItems; i++) {
        let x, y, locationKey;
        let attempts = 0;
        do {
            x = Math.floor(Math.random() * warehouseWidth);
            y = Math.floor(Math.random() * warehouseHeight);
            locationKey = `${x},${y}`;
            attempts++;
        } while (usedLocations.has(locationKey) && attempts < warehouseWidth * warehouseHeight * 2);

        if (usedLocations.has(locationKey)) {
            console.warn(`Could not find unique location for available item ${i} after ${attempts} attempts.`);
            continue;
        }
        allAvailableItemLocations.push({ id: `avail-item-${i}`, x: x, y: y, name: `AvP${i}` });
        usedLocations.add(locationKey);
    }
    return true;
}

function generateGlobalPickListFromAvailable() {
    globalPickList = [];
    if (numTotalAvailableItems === 0 && numItemsToPickGlobalDemand > 0) {
        displayMessage('vrpError', `لا يوجد منتجات في المستودع لاختيار ${numItemsToPickGlobalDemand} منها.`);
        return false;
    }
    if (allAvailableItemLocations.length === 0 && numItemsToPickGlobalDemand > 0) {
        displayMessage('vrpError', `لم يتم وضع أي منتجات في المستودع.`);
        return false;
    }
    if (numItemsToPickGlobalDemand > allAvailableItemLocations.length) {
        displayMessage('vrpError', `لا يمكن اختيار ${numItemsToPickGlobalDemand} منتج، يوجد فقط ${allAvailableItemLocations.length} منتج متاح.`);
        return false;
    }
    if (numItemsToPickGlobalDemand === 0) {
        return true; // Valid to pick 0 items
    }
    // Create a unique ID for pick list items to distinguish from allAvailableItemLocations if needed later
    const shuffled = [...allAvailableItemLocations].sort(() => 0.5 - Math.random());
    globalPickList = shuffled.slice(0, numItemsToPickGlobalDemand).map((item, index) => ({
        ...item, // Spread original item properties
        pickId: `pick-${index}`, // Unique ID for this picking instance
        displayName: `طلب${index + 1}` // Display name for this pick
    }));
    return true;
}


function assignItemsToWorkers() {
    workersData.forEach(worker => {
        worker.itemsToPickThisTrip = []; // Items for this specific trip/round
    });

    if (numItemsToPickGlobalDemand === 0 || !globalPickList.length) return true; // No items to assign

    let unassignedItems = [...globalPickList]; // Create a mutable copy of the total demand
    let allItemsAssigned = true;

    for (let i = 0; i < numWorkers; i++) {
        const worker = workersData[i];
        let itemsForThisWorker = 0;
        while (itemsForThisWorker < workerTripCapacity && unassignedItems.length > 0) {
            const itemToAssign = unassignedItems.shift(); // Take from the front of the demand list
            if (itemToAssign) {
                worker.itemsToPickThisTrip.push(itemToAssign);
                itemsForThisWorker++;
            } else {
                break; // Should not happen if unassignedItems.length > 0
            }
        }
    }

    if (unassignedItems.length > 0) {
        allItemsAssigned = false;
        const warningMsg = `تنبيه: لم يتم تعيين ${unassignedItems.length} منتج من الطلب الكلي (${numItemsToPickGlobalDemand}) 
                            بسبب تجاوز سعة العمال الإجمالية لهذه الجولة (${numWorkers * workerTripCapacity}). 
                            سيتم محاكاة جلب المنتجات المعينة فقط.`;
        displayMessage('vrpWarning', warningMsg, "warning");
    }
    return allItemsAssigned;
}


function calculatePathCostForWorker(path, workerStartPoint) {
    if (!path || path.length === 0) return 0;
    let totalDistance = 0;
    totalDistance += manhattanDistance(workerStartPoint, path[0]);
    for (let i = 0; i < path.length - 1; i++) {
        totalDistance += manhattanDistance(path[i], path[i + 1]);
    }
    totalDistance += manhattanDistance(path[path.length - 1], workerStartPoint);
    return totalDistance;
}

function getNearestNeighborPathForWorker(itemsToVisit, workerStartPoint) {
    if (!itemsToVisit.length) return [];
    let unvisited = [...itemsToVisit];
    let nnPath = [];
    let currentPointForSearch = workerStartPoint;
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

function twoOptSwapForWorker(path, i, k) {
    const newPath = path.slice(0, i);
    const segmentToReverse = path.slice(i, k + 1);
    newPath.push(...segmentToReverse.reverse());
    newPath.push(...path.slice(k + 1));
    return newPath;
}

function apply2OptForWorker(initialPath, workerStartPoint) {
    if (!initialPath || initialPath.length < 2) return initialPath;

    let bestPath = [...initialPath];
    let bestDistance = calculatePathCostForWorker(bestPath, workerStartPoint);
    let improved = true;
    let iterationCounter = 0;
    const maxIterations = bestPath.length * Math.max(20, bestPath.length * 3);

    while (improved && iterationCounter < maxIterations) {
        improved = false;
        iterationCounter++;
        for (let i = 0; i < bestPath.length - 1; i++) {
            for (let k = i + 1; k < bestPath.length; k++) {
                const newPath = twoOptSwapForWorker(bestPath, i, k);
                const newDistance = calculatePathCostForWorker(newPath, workerStartPoint);
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

function optimizeRoutesForWorkers() {
    workersData.forEach(worker => {
        if (worker.itemsToPickThisTrip.length > 0) {
            const nnPath = getNearestNeighborPathForWorker(worker.itemsToPickThisTrip, depotLocation);
            worker.path = apply2OptForWorker(nnPath, depotLocation); // worker.path now stores the optimized sequence of items
            worker.distance = calculatePathCostForWorker(worker.path, depotLocation);
            worker.time = worker.distance; // Assuming time = distance
        } else {
            worker.path = [];
            worker.distance = 0;
            worker.time = 0;
        }
    });
}


function getOrCreateWorkerDOMElement(workerId, color, targetLayoutDiv) {
    const domId = `worker-${workerId}`;
    let workerEl = document.getElementById(domId);
    if (!workerEl) {
        workerEl = document.createElement('div');
        workerEl.id = domId;
        workerEl.className = 'item-dot';
        workerEl.style.width = `${WORKER_VISUAL_SIZE}px`;
        workerEl.style.height = `${WORKER_VISUAL_SIZE}px`;
        workerEl.style.zIndex = "100";
        workerEl.style.position = 'absolute';
        targetLayoutDiv.appendChild(workerEl);
    }
    workerEl.style.backgroundColor = color;
    workerEl.style.left = `${depotLocation.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    workerEl.style.top = `${depotLocation.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    workerEl.title = `عامل ${workerId}`;
    workerEl.style.display = 'block';
    return workerEl;
}

function drawVRPWarehouse() {
    layoutDiv.innerHTML = '';
    layoutDiv.style.width = `${warehouseWidth * PIXELS_PER_UNIT}px`;
    layoutDiv.style.height = `${warehouseHeight * PIXELS_PER_UNIT}px`;
    layoutDiv.style.backgroundColor = "#F0F0F0"; // Light background for the entire warehouse area

    const depotDot = document.createElement('div');
    depotDot.className = 'item-dot';
    depotDot.style.backgroundColor = DEPOT_COLOR;
    depotDot.style.width = `${ITEM_VISUAL_SIZE + 4}px`;
    depotDot.style.height = `${ITEM_VISUAL_SIZE + 4}px`;
    depotDot.style.left = `${depotLocation.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    depotDot.style.top = `${depotLocation.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    depotDot.style.zIndex = "50";
    depotDot.title = `نقطة التجميع (المستودع)`;
    layoutDiv.appendChild(depotDot);

    // Draw all items that are part of the current globalPickList
    globalPickList.forEach(item => {
        const itemDot = document.createElement('div');
        itemDot.className = 'item-dot';
        itemDot.id = `item-vis-${item.pickId}`; // Use pickId for unique DOM ID
        itemDot.style.backgroundColor = ITEM_COLOR;
        itemDot.style.width = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.height = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.left = `${item.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.style.top = `${item.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.style.zIndex = "40";
        itemDot.title = `${item.displayName} (X:${item.x}, Y:${item.y})`;
        layoutDiv.appendChild(itemDot);
    });

    workersData.forEach(worker => {
        worker.element = getOrCreateWorkerDOMElement(worker.id, worker.color, layoutDiv);
        if (worker.itemsToPickThisTrip.length === 0) {
            worker.element.style.display = 'none';
        }
    });
}

function drawItemOrderNumbersForWorker(workerPath, workerColor, workerId) {
    layoutDiv.querySelectorAll(`.order-number-worker-${workerId}`).forEach(el => el.remove());

    workerPath.forEach((item, index) => {
        const itemVisElement = document.getElementById(`item-vis-${item.pickId}`); // Use pickId
        if (itemVisElement) {
            const orderSpan = document.createElement('span');
            orderSpan.className = `order-number order-number-worker-${workerId}`;
            orderSpan.textContent = (index + 1).toString();
            const itemX = parseFloat(itemVisElement.style.left);
            const itemY = parseFloat(itemVisElement.style.top);
            orderSpan.style.left = `${itemX + ITEM_VISUAL_SIZE / 2 + 1}px`;
            orderSpan.style.top = `${itemY - ITEM_VISUAL_SIZE - 1}px`;
            orderSpan.style.color = workerColor;
            orderSpan.style.border = `1px solid ${workerColor}`;
            layoutDiv.appendChild(orderSpan);
        }
    });
}

function drawStaticLine(x1, y1, x2, y2, color, pathIdentifier, targetLayoutDiv, opacity = STATIC_LINE_OPACITY) {
    const line = document.createElement('div');
    line.classList.add('path-line', `static-path-${pathIdentifier}`);
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    line.style.width = `${length}px`;
    line.style.backgroundColor = color;
    line.style.opacity = opacity;
    line.style.position = 'absolute';
    line.style.left = `${x1}px`;
    line.style.top = `${y1 - 1.5}px`;
    line.style.transformOrigin = '0 50%';
    line.style.transform = `rotate(${angle}deg)`;
    targetLayoutDiv.appendChild(line);
}

function drawStaticManhattanPathForWorker(p1, p2, pathColor, workerId, targetLayoutDiv) {
    const x_1_px = p1.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const y_1_px = p1.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const x_2_px = p2.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    const y_2_px = p2.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;

    if (Math.abs(x_1_px - x_2_px) > 1e-2) {
        drawStaticLine(Math.min(x_1_px, x_2_px), y_1_px, Math.max(x_1_px, x_2_px), y_1_px, pathColor, `worker-${workerId}`, targetLayoutDiv);
    }
    if (Math.abs(y_1_px - y_2_px) > 1e-2) {
        drawStaticLine(x_2_px, Math.min(y_1_px, y_2_px), x_2_px, Math.max(y_1_px, y_2_px), pathColor, `worker-${workerId}`, targetLayoutDiv);
    }
}

function drawFullPathForWorker(worker) {
    const path = worker.path; // This is the optimized sequence of items for the worker
    const pathColor = worker.color;
    const workerId = worker.id;
    const targetLayoutDiv = layoutDiv;

    targetLayoutDiv.querySelectorAll(`.static-path-worker-${workerId}`).forEach(el => el.remove());
    targetLayoutDiv.querySelectorAll(`.order-number-worker-${workerId}`).forEach(el => el.remove());

    if (!path || !path.length) return;

    drawStaticManhattanPathForWorker(depotLocation, path[0], pathColor, workerId, targetLayoutDiv);
    for (let i = 0; i < path.length - 1; i++) {
        drawStaticManhattanPathForWorker(path[i], path[i + 1], pathColor, workerId, targetLayoutDiv);
    }
    drawStaticManhattanPathForWorker(path[path.length - 1], depotLocation, pathColor, workerId, targetLayoutDiv);
    drawItemOrderNumbersForWorker(path, pathColor, workerId);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function drawAnimationLine(x1, y1, x2, y2, color, animationPathIdentifier, targetLayoutDiv) {
    const line = document.createElement('div');
    line.classList.add('path-line', `anim-path-${animationPathIdentifier}`);
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    line.style.width = `${length}px`;
    line.style.backgroundColor = color;
    line.style.opacity = ANIMATION_LINE_OPACITY;
    line.style.position = 'absolute';
    line.style.left = `${x1}px`;
    line.style.top = `${y1 - 1.5}px`;
    line.style.transformOrigin = '0 50%';
    line.style.transform = `rotate(${angle}deg)`;
    targetLayoutDiv.appendChild(line);
}

async function animateSegment(currentPixelX, currentPixelY, targetPixelX, targetPixelY, workerEl, animColor, animPathIdentifier, targetLayoutDiv) {
    let tempX = currentPixelX;
    while (Math.abs(tempX - targetPixelX) > PIXELS_PER_UNIT / 10) {
        const stepSize = PIXELS_PER_UNIT / 4;
        const actualStepX = Math.sign(targetPixelX - tempX) * Math.min(stepSize, Math.abs(targetPixelX - tempX));
        const lineEndX = (Math.abs(targetPixelX - tempX) < Math.abs(actualStepX)) ? targetPixelX : tempX + actualStepX;
        drawAnimationLine(tempX, currentPixelY, lineEndX, currentPixelY, animColor, animPathIdentifier, targetLayoutDiv);
        tempX += actualStepX;
        workerEl.style.left = `${tempX}px`;
        await sleep(ANIMATION_STEP_DELAY);
    }
    workerEl.style.left = `${targetPixelX}px`;

    let tempY = currentPixelY;
    while (Math.abs(tempY - targetPixelY) > PIXELS_PER_UNIT / 10) {
        const stepSize = PIXELS_PER_UNIT / 4;
        const actualStepY = Math.sign(targetPixelY - tempY) * Math.min(stepSize, Math.abs(targetPixelY - tempY));
        const lineEndY = (Math.abs(targetPixelY - tempY) < Math.abs(actualStepY)) ? targetPixelY : tempY + actualStepY;
        drawAnimationLine(targetPixelX, tempY, targetPixelX, lineEndY, animColor, animPathIdentifier, targetLayoutDiv);
        tempY += actualStepY;
        workerEl.style.top = `${tempY}px`;
        await sleep(ANIMATION_STEP_DELAY);
    }
    workerEl.style.top = `${targetPixelY}px`;
}

async function animateSingleWorker(worker) {
    const path = worker.path; // This is the optimized sequence of items for the worker
    const workerEl = worker.element;
    const animationLineColor = worker.color;
    const animationPathIdentifier = `worker-${worker.id}-anim`; // Unique identifier for this worker's animation lines
    const targetLayoutDiv = layoutDiv;

    if (!path || !path.length || !workerEl) return;

    // Clear previous animation lines for THIS worker only
    targetLayoutDiv.querySelectorAll(`.anim-path-${animationPathIdentifier}`).forEach(el => el.remove());

    // Reset worker to depot visually
    let currentWorkerPixelX = depotLocation.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    let currentWorkerPixelY = depotLocation.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    workerEl.style.left = `${currentWorkerPixelX}px`;
    workerEl.style.top = `${currentWorkerPixelY}px`;
    workerEl.style.display = 'block'; // Ensure worker is visible

    // The full path for animation includes depot at start and end
    let fullPathForAnimation = [depotLocation, ...path, depotLocation];

    for (let i = 0; i < fullPathForAnimation.length - 1; i++) {
        const p1 = fullPathForAnimation[i];
        const p2 = fullPathForAnimation[i + 1];
        const targetPixelX = p2.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
        const targetPixelY = p2.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
        await animateSegment(currentWorkerPixelX, currentWorkerPixelY, targetPixelX, targetPixelY, workerEl, animationLineColor, animationPathIdentifier, targetLayoutDiv);
        currentWorkerPixelX = targetPixelX;
        currentWorkerPixelY = targetPixelY;
    }
}

async function startSimulation() {
    if (simulationInProgress) return;
    simulationInProgress = true;
    const startButton = document.getElementById('startButton');
    startButton.disabled = true;

    clearMessages(); // Clear previous errors and warnings
    document.getElementById('resultsVRP').style.display = 'none';
    document.getElementById('vrpWorkerDetails').innerHTML = '';
    // Clear all visual elements from the map before redrawing
    layoutDiv.querySelectorAll('.path-line, .order-number, .item-dot[id^="worker-"], .item-dot[id^="item-vis-"]').forEach(el => el.remove());


    warehouseWidth = parseInt(document.getElementById('warehouseWidth').value);
    warehouseHeight = parseInt(document.getElementById('warehouseHeight').value);
    numWorkers = parseInt(document.getElementById('numWorkers').value);
    workerTripCapacity = parseInt(document.getElementById('workerCapacity').value);
    numTotalAvailableItems = parseInt(document.getElementById('numTotalItems').value);
    numItemsToPickGlobalDemand = parseInt(document.getElementById('numItemsToPick').value);

    let errorFound = false;
    if (isNaN(warehouseWidth) || isNaN(warehouseHeight) || isNaN(numWorkers) || isNaN(workerTripCapacity) ||
        isNaN(numTotalAvailableItems) || isNaN(numItemsToPickGlobalDemand) ||
        warehouseWidth <= 1 || warehouseHeight <= 1 || numWorkers < 1 || workerTripCapacity < 1 ||
        numTotalAvailableItems < 0 || numItemsToPickGlobalDemand < 0) {
        displayMessage('vrpError', "الرجاء إدخال قيم صحيحة وموجبة لجميع حقول الإعدادات (السعة والعمال >= 1).");
        errorFound = true;
    }
    if (!errorFound && numItemsToPickGlobalDemand > 0 && numTotalAvailableItems < numItemsToPickGlobalDemand) {
        displayMessage('vrpError', "إجمالي المنتجات المتاحة يجب أن يكون أكبر أو يساوي إجمالي المنتجات المطلوب جلبها.");
        errorFound = true;
    }
    if (!errorFound && numItemsToPickGlobalDemand > 0 && numTotalAvailableItems === 0) {
        displayMessage('vrpError', "لا يمكن جلب منتجات لأنه لا يوجد منتجات متاحة في المستودع.");
        errorFound = true;
    }


    if (errorFound) {
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }

    if (!generateAllAvailableItemLocations()) {
        displayMessage('vrpError', "فشل في توزيع المنتجات المتاحة في المستودع.");
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }

    if (!generateGlobalPickListFromAvailable()) {
        // Error is displayed within generateGlobalPickListFromAvailable
        drawVRPWarehouse(); // Draw warehouse structure even if picklist fails
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }

    workersData = [];
    for (let i = 0; i < numWorkers; i++) {
        workersData.push({
            id: i + 1,
            color: WORKER_COLORS[i % WORKER_COLORS.length],
            itemsToPickThisTrip: [], // Items for this specific trip/round
            path: [],
            distance: 0,
            time: 0,
            element: null
        });
    }

    assignItemsToWorkers(); // Distributes globalPickList among workersData respecting workerTripCapacity
    optimizeRoutesForWorkers(); // Each worker solves TSP for their itemsToPickThisTrip

    drawVRPWarehouse(); // Draws depot, all pickable items (from globalPickList), and creates worker DOM elements

    // Display static paths and numbers for all workers
    workersData.forEach(worker => {
        if (worker.path.length > 0) { // worker.path is the optimized sequence of items
            drawFullPathForWorker(worker);
        }
    });

    // --- Concurrent Animation ---
    const animationPromises = [];
    workersData.forEach(worker => {
        if (worker.path.length > 0 && worker.element) {
            // Clear previous animation lines for this worker before starting new animation
            layoutDiv.querySelectorAll(`.anim-path-worker-${worker.id}-anim`).forEach(el => el.remove());
            animationPromises.push(animateSingleWorker(worker));
        }
    });

    await Promise.all(animationPromises); // Wait for all animations to complete

    // Display VRP results
    let totalDistanceAllWorkers = 0;
    let maxTimeSingleWorker = 0;
    let sumOfIndividualWorkerTimes = 0;
    const workerDetailsDiv = document.getElementById('vrpWorkerDetails');
    workerDetailsDiv.innerHTML = '<h4>تفاصيل أداء كل عامل (لهذه الجولة):</h4>';

    workersData.forEach(worker => {
        totalDistanceAllWorkers += worker.distance;
        if (worker.time > maxTimeSingleWorker) {
            maxTimeSingleWorker = worker.time;
        }
        sumOfIndividualWorkerTimes += worker.time;

        const detailP = document.createElement('p');
        detailP.style.color = worker.color;
        // Display items assigned for this trip
        const itemsPickedNames = worker.itemsToPickThisTrip.map(item => item.displayName || item.name).join(', ');
        detailP.innerHTML = `<b>عامل ${worker.id}:</b> ${worker.itemsToPickThisTrip.length} منتجات, 
                             مسافة: ${worker.distance.toFixed(2)}, 
                             زمن: ${worker.time.toFixed(2)}
                             <br><small>المنتجات: ${itemsPickedNames || "لا يوجد"}</small>
                             <br><small>المسار: Depot -> ${worker.path.map(p=>p.displayName || p.name).join('->')} -> Depot</small>`;
        workerDetailsDiv.appendChild(detailP);
    });

    document.getElementById('resultsVRP').style.display = 'block';
    if (globalPickList.length > 0 || numItemsToPickGlobalDemand === 0) { // Show results if there was a demand or demand was 0
        document.getElementById('vrpTotalDistanceText').textContent = `إجمالي المسافة المقطوعة (كل العمال): ${totalDistanceAllWorkers.toFixed(2)} وحدات`;
        document.getElementById('vrpMaxTimeText').textContent = `أقصى زمن لعامل واحد (عمل متوازي): ${maxTimeSingleWorker.toFixed(2)} وحدات زمن`;
        document.getElementById('vrpTotalTimeText').textContent = `مجموع أزمنة العمال (إجمالي الجهد): ${sumOfIndividualWorkerTimes.toFixed(2)} وحدات زمن`;
    } else if (numItemsToPickGlobalDemand > 0 && globalPickList.length === 0) { // Demand > 0 but no items could be formed into picklist
         document.getElementById('vrpTotalDistanceText').textContent = "لم يتم تحديد قائمة جلب.";
         document.getElementById('vrpMaxTimeText').textContent = "";
         document.getElementById('vrpTotalTimeText').textContent = "";
    }


    startButton.disabled = false;
    simulationInProgress = false;
}


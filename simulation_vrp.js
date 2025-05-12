// Constants for visualization
const ITEM_VISUAL_SIZE = 8;
const WORKER_VISUAL_SIZE = 10;
const START_POINT_COLOR = "blue"; // Depot color
const ITEM_COLOR = "black"; // Pickable items color
const WORKER_COLORS = ["purple", "teal", "brown", "olive", "navy", "maroon", "lime", "aqua", "fuchsia", "silver"];
const ANIMATION_LINE_OPACITY = "0.9";
const STATIC_LINE_OPACITY = "0.6";
const PIXELS_PER_UNIT = 15; 
const ANIMATION_STEP_DELAY = 30; // ms per step in animation

// Global state variables
let warehouseWidth, warehouseHeight, numItemsToPick, numTotalItems, numWorkers;
let allItemLocations = []; 
let pickListItems = [];    
let depotLocation = { x: 0, y: 0, name: "Depot" }; 
let workersData = []; 
let simulationInProgress = false;

const layoutDiv = document.getElementById('warehouseLayoutVRP');

function displayError(message) {
    const errorElement = document.getElementById('vrpError');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    document.getElementById('resultsVRP').style.display = 'block';
    document.getElementById('vrpTotalDistanceText').textContent = "";
    document.getElementById('vrpMaxTimeText').textContent = "";
    document.getElementById('vrpTotalTimeText').textContent = "";
    document.getElementById('vrpWorkerDetails').innerHTML = "";
}

function clearErrors() {
    const errorElement = document.getElementById('vrpError');
    if (errorElement) {
        errorElement.style.display = 'none';
        errorElement.textContent = '';
    }
}

function manhattanDistance(point1, point2) {
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
}

function generateAllItemLocations() {
    allItemLocations = [];
    const usedLocations = new Set();
    depotLocation = { 
        x: Math.floor(warehouseWidth / 2), 
        y: warehouseHeight - 1, 
        name: "Depot" 
    };
    usedLocations.add(`${depotLocation.x},${depotLocation.y}`);

    for (let i = 0; i < numTotalItems; i++) {
        let x, y, locationKey;
        let attempts = 0;
        do {
            x = Math.floor(Math.random() * warehouseWidth);
            y = Math.floor(Math.random() * warehouseHeight);
            locationKey = `${x},${y}`;
            attempts++;
        } while (usedLocations.has(locationKey) && attempts < warehouseWidth * warehouseHeight * 2);
        
        if (usedLocations.has(locationKey)) {
            console.warn(`Could not find unique location for item ${i} after ${attempts} attempts.`);
            continue; 
        }
        allItemLocations.push({ id: `item-${i}`, x: x, y: y, name: `P${i}`, originalIndex: i });
        usedLocations.add(locationKey);
    }
    return true;
}

function generateGlobalPickList() {
    pickListItems = [];
    if (numTotalItems === 0 && numItemsToPick > 0) {
        displayError(`لا يوجد منتجات في المستودع لاختيار ${numItemsToPick} منها.`);
        return false;
    }
    if (allItemLocations.length === 0 && numItemsToPick > 0) {
        displayError(`لم يتم وضع أي منتجات في المستودع.`);
        return false;
    }
    if (numItemsToPick > allItemLocations.length) {
        displayError(`لا يمكن اختيار ${numItemsToPick} منتج، يوجد فقط ${allItemLocations.length} منتج متاح.`);
        return false;
    }
    if (numItemsToPick === 0) {
        return true; 
    }
    const shuffled = [...allItemLocations].sort(() => 0.5 - Math.random());
    pickListItems = shuffled.slice(0, numItemsToPick);
    return true;
}

function assignItemsToWorkers() {
    workersData.forEach(worker => worker.items = []); 

    if (numItemsToPick === 0 || !pickListItems.length) return;

    let currentWorkerIndex = 0;
    pickListItems.forEach(item => {
        workersData[currentWorkerIndex].items.push(item);
        currentWorkerIndex = (currentWorkerIndex + 1) % numWorkers;
    });
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
        if (worker.items.length > 0) {
            const nnPath = getNearestNeighborPathForWorker(worker.items, depotLocation);
            worker.path = apply2OptForWorker(nnPath, depotLocation);
            worker.distance = calculatePathCostForWorker(worker.path, depotLocation);
            worker.time = worker.distance; 
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
    layoutDiv.style.backgroundColor = "#F5F5F5"; 

    const depotDot = document.createElement('div');
    depotDot.className = 'item-dot';
    depotDot.style.backgroundColor = START_POINT_COLOR;
    depotDot.style.width = `${ITEM_VISUAL_SIZE + 4}px`;
    depotDot.style.height = `${ITEM_VISUAL_SIZE + 4}px`;
    depotDot.style.left = `${depotLocation.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    depotDot.style.top = `${depotLocation.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
    depotDot.style.zIndex = "50";
    depotDot.title = `نقطة البداية/النهاية (المستودع)`;
    layoutDiv.appendChild(depotDot);

    pickListItems.forEach(item => {
        const itemDot = document.createElement('div');
        itemDot.className = 'item-dot';
        itemDot.id = `item-vis-${item.id}`; 
        itemDot.style.backgroundColor = ITEM_COLOR; 
        itemDot.style.width = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.height = `${ITEM_VISUAL_SIZE}px`;
        itemDot.style.left = `${item.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.style.top = `${item.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2}px`;
        itemDot.style.zIndex = "40";
        itemDot.title = `${item.name} (X:${item.x}, Y:${item.y})`;
        layoutDiv.appendChild(itemDot);
    });

    workersData.forEach(worker => {
        worker.element = getOrCreateWorkerDOMElement(worker.id, worker.color, layoutDiv);
        if (worker.items.length === 0) {
            worker.element.style.display = 'none';
        }
    });
}

function drawItemOrderNumbersForWorker(workerPath, workerColor, workerId) {
    layoutDiv.querySelectorAll(`.order-number-worker-${workerId}`).forEach(el => el.remove());

    workerPath.forEach((item, index) => {
        const itemVisElement = document.getElementById(`item-vis-${item.id}`); 
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
    const path = worker.path;
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
    const path = worker.path;
    const workerEl = worker.element;
    const animationLineColor = worker.color;
    const animationPathIdentifier = `worker-${worker.id}-anim`;
    const targetLayoutDiv = layoutDiv;

    if (!path || !path.length || !workerEl) return;

    // Clear previous animation lines for THIS worker only
    targetLayoutDiv.querySelectorAll(`.anim-path-${animationPathIdentifier}`).forEach(el => el.remove());

    let currentWorkerPixelX = depotLocation.x * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    let currentWorkerPixelY = depotLocation.y * PIXELS_PER_UNIT + PIXELS_PER_UNIT / 2;
    workerEl.style.left = `${currentWorkerPixelX}px`;
    workerEl.style.top = `${currentWorkerPixelY}px`;
    workerEl.style.display = 'block';

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

    clearErrors();
    document.getElementById('resultsVRP').style.display = 'none';
    document.getElementById('vrpWorkerDetails').innerHTML = ''; 
    layoutDiv.querySelectorAll('.path-line, .order-number, .item-dot[id^="worker-"]').forEach(el => el.remove());


    warehouseWidth = parseInt(document.getElementById('warehouseWidth').value);
    warehouseHeight = parseInt(document.getElementById('warehouseHeight').value);
    numWorkers = parseInt(document.getElementById('numWorkers').value);
    numTotalItems = parseInt(document.getElementById('numTotalItems').value);
    numItemsToPick = parseInt(document.getElementById('numItemsToPick').value);
    
    let errorFound = false;
    if (isNaN(warehouseWidth) || isNaN(warehouseHeight) || isNaN(numWorkers) || isNaN(numTotalItems) || isNaN(numItemsToPick) ||
        warehouseWidth <= 1 || warehouseHeight <= 1 || numWorkers < 1 || numTotalItems < 0 || numItemsToPick < 0) {
        displayError("الرجاء إدخال قيم صحيحة لجميع حقول الإعدادات.");
        errorFound = true;
    }
    if (!errorFound && numItemsToPick > 0 && numTotalItems < numItemsToPick) {
        displayError("إجمالي المنتجات في المستودع يجب أن يكون أكبر أو يساوي إجمالي المنتجات المطلوب جلبها.");
        errorFound = true;
    }
     if (!errorFound && numItemsToPick > 0 && numTotalItems === 0) {
        displayError("لا يمكن جلب منتجات لأنه لا يوجد منتجات في المستودع.");
        errorFound = true;
    }

    if (errorFound) {
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }
    
    if (!generateAllItemLocations()) { 
        displayError("فشل في توزيع المنتجات الإجمالية في المستودع.");
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }

    if (!generateGlobalPickList()) { 
        drawVRPWarehouse(); 
        startButton.disabled = false;
        simulationInProgress = false;
        return;
    }
    
    workersData = [];
    for (let i = 0; i < numWorkers; i++) {
        workersData.push({
            id: i + 1,
            color: WORKER_COLORS[i % WORKER_COLORS.length],
            items: [],
            path: [],
            distance: 0,
            time: 0,
            element: null 
        });
    }

    assignItemsToWorkers(); 
    optimizeRoutesForWorkers(); 

    drawVRPWarehouse(); 

    workersData.forEach(worker => {
        if (worker.path.length > 0) {
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
    workerDetailsDiv.innerHTML = '<h4>تفاصيل أداء كل عامل:</h4>';

    workersData.forEach(worker => {
        totalDistanceAllWorkers += worker.distance;
        if (worker.time > maxTimeSingleWorker) {
            maxTimeSingleWorker = worker.time;
        }
        sumOfIndividualWorkerTimes += worker.time;

        const detailP = document.createElement('p');
        detailP.style.color = worker.color;
        detailP.innerHTML = `<b>عامل ${worker.id}:</b> ${worker.items.length} منتجات, 
                             مسافة: ${worker.distance.toFixed(2)}, 
                             زمن: ${worker.time.toFixed(2)}
                             <br><small>المسار: Depot -> ${worker.path.map(p=>p.name).join('->')} -> Depot</small>`;
        workerDetailsDiv.appendChild(detailP);
    });
    
    document.getElementById('resultsVRP').style.display = 'block';
    if (numItemsToPick > 0) {
        document.getElementById('vrpTotalDistanceText').textContent = `إجمالي المسافة المقطوعة (كل العمال): ${totalDistanceAllWorkers.toFixed(2)} وحدات`;
        document.getElementById('vrpMaxTimeText').textContent = `أقصى زمن لعامل واحد (عمل متوازي): ${maxTimeSingleWorker.toFixed(2)} وحدات زمن`;
        document.getElementById('vrpTotalTimeText').textContent = `مجموع أزمنة العمال (عمل تسلسلي/إجمالي الجهد): ${sumOfIndividualWorkerTimes.toFixed(2)} وحدات زمن`;
    } else {
        document.getElementById('vrpTotalDistanceText').textContent = "لا يوجد منتجات لجلبها.";
        document.getElementById('vrpMaxTimeText').textContent = "";
        document.getElementById('vrpTotalTimeText').textContent = "";
    }

    startButton.disabled = false;
    simulationInProgress = false;
}

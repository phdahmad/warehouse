// Constants for visualization
const ITEM_VISUAL_SIZE = 8;
const WORKER_VISUAL_SIZE = 10;
const DEPOT_COLOR = "blue";
const ITEM_COLOR = "black";
const WORKER_COLORS = ["purple", "teal", "brown", "olive", "navy", "maroon", "lime", "aqua", "fuchsia", "silver"];
const ANIMATION_LINE_OPACITY = "0.9";
const STATIC_LINE_OPACITY = "0.6";
const PIXELS_PER_UNIT = 15;
const ANIMATION_STEP_DELAY = 30;

// Global state variables
let warehouseWidth, warehouseHeight, numItemsToPickGlobalDemand, numTotalAvailableItems, numWorkers, workerTripCapacity;
let allAvailableItemLocations = [];
let globalPickList = []; // Items selected for the current picking task (total demand)
let depotLocation = { x: 0, y: 0, name: "Depot" };
let workersData = []; // Stores { id, color, itemsToPickThisTrip: [], path: [], distance: 0, time: 0, element: null }
let simulationInProgress = false;
let selectedVrpAlgorithm = "round_robin_2opt"; // Default algorithm

const layoutDiv = document.getElementById('warehouseLayoutVRP');

function displayMessage(elementId, message, type = "error") {
    const msgElement = document.getElementById(elementId);
    if (msgElement) {
        msgElement.textContent = message;
        msgElement.className = type;
        msgElement.style.display = 'block';
    }
    if (type === "error") {
        document.getElementById('resultsVRP').style.display = 'block';
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
    document.getElementById('vrpAlgorithmUsedText').textContent = '';
}

function manhattanDistance(point1, point2) {
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
}

function generateAllAvailableItemLocations() {
    allAvailableItemLocations = [];
    const usedLocations = new Set();
    depotLocation = {
        x: Math.floor(warehouseWidth / 2),
        y: warehouseHeight - 1,
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
        allAvailableItemLocations.push({ id: `avail-item-${i}`, x: x, y: y, name: `AvP${i}`, demand: 1 }); // Assuming each item has a demand of 1 for capacity
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
        return true;
    }
    const shuffled = [...allAvailableItemLocations].sort(() => 0.5 - Math.random());
    globalPickList = shuffled.slice(0, numItemsToPickGlobalDemand).map((item, index) => ({
        ...item,
        pickId: `pick-${index}`,
        displayName: `طلب${index + 1}`
    }));
    return true;
}

// --- Round Robin Assignment (Current Basic Method) ---
function assignItemsRoundRobin() {
    workersData.forEach(worker => {
        worker.itemsToPickThisTrip = [];
        worker.currentLoad = 0; // For capacity tracking
    });

    if (numItemsToPickGlobalDemand === 0 || !globalPickList.length) return true;

    let unassignedItems = [...globalPickList];
    let allItemsAssignedInThisRound = true; // Tracks if all *demand* can be met in one round by workers

    // Distribute items respecting individual worker capacity for this trip
    for (let i = 0; i < numWorkers; i++) {
        const worker = workersData[i];
        while (worker.currentLoad < workerTripCapacity && unassignedItems.length > 0) {
            const itemToAssign = unassignedItems.shift();
            if (itemToAssign) {
                // Assuming each item has a 'demand' of 1 for capacity calculation
                if (worker.currentLoad + itemToAssign.demand <= workerTripCapacity) {
                    worker.itemsToPickThisTrip.push(itemToAssign);
                    worker.currentLoad += itemToAssign.demand;
                } else {
                    unassignedItems.unshift(itemToAssign); // Put item back if it exceeds capacity
                    break; // Worker is full for this trip
                }
            } else {
                break;
            }
        }
    }

    if (unassignedItems.length > 0) {
        allItemsAssignedInThisRound = false;
        const warningMsg = `تنبيه (توزيع دوري): لم يتم تعيين ${unassignedItems.length} منتج من الطلب الكلي (${numItemsToPickGlobalDemand}) 
                            بسبب تجاوز سعة العمال الإجمالية لهذه الجولة. 
                            سيتم محاكاة جلب المنتجات المعينة فقط.`;
        displayMessage('vrpWarning', warningMsg, "warning");
    }
    return allItemsAssignedInThisRound;
}


// --- Clarke and Wright Savings Algorithm ---
function calculateSavingsList(items, depot) {
    const savings = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const itemI = items[i];
            const itemJ = items[j];
            const saving = manhattanDistance(depot, itemI) + manhattanDistance(depot, itemJ) - manhattanDistance(itemI, itemJ);
            if (saving > 0) {
                savings.push({ i: itemI, j: itemJ, pickId_i: itemI.pickId, pickId_j: itemJ.pickId, value: saving });
            }
        }
    }
    return savings.sort((a, b) => b.value - a.value); // Sort descending by saving value
}

function solveVrpWithClarkeWright() {
    workersData.forEach(worker => {
        worker.itemsToPickThisTrip = []; // Will be populated by C&W
        worker.path = []; // Path will be the items in order
        worker.currentLoad = 0;
    });

    if (numItemsToPickGlobalDemand === 0 || !globalPickList.length) return true;

    // 1. Initialize routes: one route per item (Depot -> Item -> Depot)
    let routes = globalPickList.map(item => ({
        nodes: [item], // Path is just the item itself for now
        load: item.demand, // Assuming item.demand = 1
        cost: calculatePathCostForWorker([item], depotLocation) // Cost of D->item->D
    }));

    // 2. Calculate savings
    const savingsList = calculateSavingsList(globalPickList, depotLocation);

    // 3. Merge routes based on savings
    for (const saving of savingsList) {
        const itemI = saving.i;
        const itemJ = saving.j;

        let routeI = null, routeJ = null;
        let routeIIndex = -1, routeJIndex = -1;

        // Find routes containing itemI and itemJ
        for (let k = 0; k < routes.length; k++) {
            if (routes[k].nodes.find(node => node.pickId === itemI.pickId)) {
                routeI = routes[k];
                routeIIndex = k;
            }
            if (routes[k].nodes.find(node => node.pickId === itemJ.pickId)) {
                routeJ = routes[k];
                routeJIndex = k;
            }
            if (routeI && routeJ) break;
        }

        // Check merge conditions
        if (routeI && routeJ && routeIIndex !== routeJIndex) { // Different routes
            // Condition 1: Item I is at the end of its route (before depot)
            // Condition 2: Item J is at the start of its route (after depot)
            // For simplicity in this version, we'll check if I is the last in routeI.nodes and J is first in routeJ.nodes
            // A more robust C&W handles internal nodes and route orientation.
            const iIsLastInRouteI = routeI.nodes[routeI.nodes.length - 1].pickId === itemI.pickId;
            const jIsFirstInRouteJ = routeJ.nodes[0].pickId === itemJ.pickId;

            if (iIsLastInRouteI && jIsFirstInRouteJ) {
                if (routeI.load + routeJ.load <= workerTripCapacity) {
                    // Merge: routeI -> itemI -> itemJ -> routeJ
                    const mergedNodes = [...routeI.nodes, ...routeJ.nodes];
                    const mergedLoad = routeI.load + routeJ.load;
                    // Remove old routes and add merged route
                    routes.splice(Math.max(routeIIndex, routeJIndex), 1); // Remove higher index first
                    routes.splice(Math.min(routeIIndex, routeJIndex), 1);
                    routes.push({ nodes: mergedNodes, load: mergedLoad, cost: calculatePathCostForWorker(mergedNodes, depotLocation) });
                }
            }
            // Could also check for merging j to end of i (routeI -> ... -> i -> j -> ... -> depot) + (depot -> ... -> k -> depot)
            // And other orientations if routes are not just single customer initially.
            // This simplified version only handles one type of merge.
        }
    }

    // 4. Assign routes to workers (simple assignment for now)
    // If routes.length > numWorkers, some items might not be picked in this "dispatch"
    let assignedAllRoutes = true;
    if (routes.length > numWorkers) {
        const warningMsg = `تنبيه (Clarke & Wright): تم إنشاء ${routes.length} مسارات ولكن يوجد ${numWorkers} عمال فقط. 
                            سيتم تعيين المسارات الأولى للعمال المتاحين.`;
        displayMessage('vrpWarning', warningMsg, "warning");
        assignedAllRoutes = false;
    }

    for (let i = 0; i < Math.min(routes.length, numWorkers); i++) {
        workersData[i].itemsToPickThisTrip = routes[i].nodes; // The nodes are the items in order
        workersData[i].path = routes[i].nodes; // For C&W, the nodes list *is* the path order
        workersData[i].currentLoad = routes[i].load;
        // Cost is already calculated for the route by C&W, but re-calculate for consistency
        workersData[i].distance = calculatePathCostForWorker(workersData[i].path, depotLocation);
        workersData[i].time = workersData[i].distance;
    }
    
    // Check if all original pick list items were covered by the assigned routes
    let allPickListItemsCovered = true;
    if (numItemsToPickGlobalDemand > 0) {
        const pickedItemIds = new Set();
        workersData.forEach(w => w.itemsToPickThisTrip.forEach(item => pickedItemIds.add(item.pickId)));
        if (pickedItemIds.size < globalPickList.length) {
            allPickListItemsCovered = false;
             const unassignedCount = globalPickList.length - pickedItemIds.size;
             const warningMsg = `تنبيه (Clarke & Wright): لم يتم تعيين ${unassignedCount} منتج من الطلب الكلي (${globalPickList.length}) 
                            بسبب قيود الخوارزمية أو عدد العمال/السعة.`;
            displayMessage('vrpWarning', warningMsg, "warning"); // Append or set new warning
        }
    }


    return assignedAllRoutes && allPickListItemsCovered;
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

// This function is now a dispatcher based on selectedVrpAlgorithm
function solveVRPAndOptimizeRoutes() {
    if (selectedVrpAlgorithm === "clarke_wright_2opt") {
        solveVrpWithClarkeWright(); // This will populate worker.itemsToPickThisTrip and worker.path (unoptimized)
        // Then apply 2-Opt to each worker's path obtained from C&W
        workersData.forEach(worker => {
            if (worker.itemsToPickThisTrip.length > 0) { // C&W gives items in order, so path is itemsToPickThisTrip
                worker.path = apply2OptForWorker(worker.itemsToPickThisTrip, depotLocation);
                worker.distance = calculatePathCostForWorker(worker.path, depotLocation);
                worker.time = worker.distance;
            } else {
                worker.path = [];
                worker.distance = 0;
                worker.time = 0;
            }
        });
    } else { // Default to "round_robin_2opt"
        assignItemsRoundRobin();
        workersData.forEach(worker => {
            if (worker.itemsToPickThisTrip.length > 0) {
                const nnPath = getNearestNeighborPathForWorker(worker.itemsToPickThisTrip, depotLocation);
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
    layoutDiv.style.backgroundColor = "#F0F0F0";

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

    globalPickList.forEach(item => { // Draw all items in the global pick list
        const itemDot = document.createElement('div');
        itemDot.className = 'item-dot';
        itemDot.id = `item-vis-${item.pickId}`;
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
        const itemVisElement = document.getElementById(`item-vis-${item.pickId}`);
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

    clearMessages();
    document.getElementById('resultsVRP').style.display = 'none';
    document.getElementById('vrpWorkerDetails').innerHTML = '';
    layoutDiv.querySelectorAll('.path-line, .order-number, .item-dot[id^="worker-"], .item-dot[id^="item-vis-"]').forEach(el => el.remove());

    warehouseWidth = parseInt(document.getElementById('warehouseWidth').value);
    warehouseHeight = parseInt(document.getElementById('warehouseHeight').value);
    numWorkers = parseInt(document.getElementById('numWorkers').value);
    workerTripCapacity = parseInt(document.getElementById('workerCapacity').value);
    numTotalAvailableItems = parseInt(document.getElementById('numTotalAvailableItems').value);
    numItemsToPickGlobalDemand = parseInt(document.getElementById('numItemsToPickGlobalDemand').value);
    selectedVrpAlgorithm = document.getElementById('vrpAlgorithm').value;


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
            itemsToPickThisTrip: [],
            path: [],
            distance: 0,
            time: 0,
            element: null,
            currentLoad: 0 // Added for C&W and RoundRobin
        });
    }

    // Call the selected VRP solving method
    solveVRPAndOptimizeRoutes(); // This function now acts as a dispatcher

    drawVRPWarehouse();

    workersData.forEach(worker => {
        if (worker.path.length > 0) {
            drawFullPathForWorker(worker);
        }
    });

    const animationPromises = [];
    workersData.forEach(worker => {
        if (worker.path.length > 0 && worker.element) {
            layoutDiv.querySelectorAll(`.anim-path-worker-${worker.id}-anim`).forEach(el => el.remove());
            animationPromises.push(animateSingleWorker(worker));
        }
    });

    await Promise.all(animationPromises);

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
        const itemsPickedNames = worker.itemsToPickThisTrip.map(item => item.displayName || item.name).join(', ');
        detailP.innerHTML = `<b>عامل ${worker.id}:</b> ${worker.itemsToPickThisTrip.length} منتجات (الحمولة: ${worker.currentLoad}), 
                             مسافة: ${worker.distance.toFixed(2)}, 
                             زمن: ${worker.time.toFixed(2)}
                             <br><small>المنتجات: ${itemsPickedNames || "لا يوجد"}</small>
                             <br><small>المسار: Depot -> ${worker.path.map(p=>p.displayName || p.name).join('->')} -> Depot</small>`;
        workerDetailsDiv.appendChild(detailP);
    });

    document.getElementById('resultsVRP').style.display = 'block';
    const algoName = selectedVrpAlgorithm === "clarke_wright_2opt" ? "خوارزمية التوفير + 2-Opt" : "توزيع دوري + 2-Opt";
    document.getElementById('vrpAlgorithmUsedText').textContent = `الخوارزمية المستخدمة: ${algoName}`;

    if (globalPickList.length > 0 || numItemsToPickGlobalDemand === 0) {
        document.getElementById('vrpTotalDistanceText').textContent = `إجمالي المسافة المقطوعة (كل العمال): ${totalDistanceAllWorkers.toFixed(2)} وحدات`;
        document.getElementById('vrpMaxTimeText').textContent = `أقصى زمن لعامل واحد (عمل متوازي): ${maxTimeSingleWorker.toFixed(2)} وحدات زمن`;
        document.getElementById('vrpTotalTimeText').textContent = `مجموع أزمنة العمال (إجمالي الجهد): ${sumOfIndividualWorkerTimes.toFixed(2)} وحدات زمن`;
    } else if (numItemsToPickGlobalDemand > 0 && globalPickList.length === 0) {
         document.getElementById('vrpTotalDistanceText').textContent = "لم يتم تحديد قائمة جلب.";
         document.getElementById('vrpMaxTimeText').textContent = "";
         document.getElementById('vrpTotalTimeText').textContent = "";
    }

    startButton.disabled = false;
    simulationInProgress = false;
}

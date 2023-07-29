// Helper functions
function getRandomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

// Initialize Ably
const clientId = "User-" + Math.random().toString(36).substr(2, 9); // Generate a random clientId
const color = getRandomColor();

const client = new Ably.Realtime.Promise({
  key: "INSERT_ABLY_API_KEY",
  clientId: clientId
});

const spaces = new Spaces(client);
let space;

// Get the current URL of the tab
const url = window.location.href;
let cursorCommunicationEnabled = false;
let cursors = {}; // Object to hold the cursor elements for other users
let baseTime;

async function initializeSpace() {
  space = await spaces.get("cursor-position" + url);
  document.addEventListener("mousemove", handleMouseMove);
  space.cursors.subscribe("cursorsUpdate", handleCursorUpdate);
  space.subscribe(handleSpaceEvent);
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
}

function handleMouseMove({ clientX, clientY, pageX, pageY }) {
  if (cursorCommunicationEnabled) {
    // Find the element that the cursor is currently hovering over
    let elements = document.elementsFromPoint(clientX, clientY);
    let element = elements[0];
    if (element && element.classList.contains("ably-cursor")) {
      element = elements[1];
    }

    // If the element has an id, send the id and the relative position within the element
    if (element.id) {
      // Get the cursor position relative to the element
      let rect = element.getBoundingClientRect();
      let x = pageX - rect.left;
      let y = pageY - rect.top;

      // Calculate the cursor position as a percentage of the element's width and height
      let xPercent = (x / rect.width) * 100;
      let yPercent = (y / rect.height) * 100;

      // Get the index of the character in the element
      let characterIndex = element.dataset.index;

      // Save the cursor position and the current time
      let now = performance.now();
      if (!baseTime) baseTime = now;
      space.cursors.set({
        position: {
          elementId: element.id,
          x: xPercent,
          y: yPercent,
          time: now - baseTime,
          characterIndex: characterIndex
        },
        data: { color: color }
      });
    } else {
      // If no specific element is available, just use the page coordinates
      let now = performance.now();
      if (!baseTime) baseTime = now;
      space.cursors.set({
        position: {
          pageX,
          pageY,
          time: now - baseTime
        },
        data: { color: color }
      });
    }
  }
}

function handleCursorUpdate(cursorUpdate) {
  if (cursorCommunicationEnabled) {
    let position = cursorUpdate.position;
    let data = cursorUpdate.data;
    let clientID = cursorUpdate.clientId;

    // If we don't have a cursor for this user yet, create one
    if (!cursors[cursorUpdate.clientId]) {
      createCursor(clientID, data);
    }
    // If the cursor update includes a specific element id and character index, position the cursor accordingly
    if (position.elementId) {
      // Find the element using the id
      let element = document.getElementById(position.elementId);
      if (element && typeof element.getBoundingClientRect === "function") {
        // Position the cursor relative to the element
        let rect = element.getBoundingClientRect();
        cursors[clientID].style.left = rect.left + (rect.width * position.x) / 100 + "px";
        cursors[clientID].style.top = rect.top + (rect.height * position.y) / 100 + "px";
      }
    } else {
      // If the element cannot be found, position the cursor at the absolute coordinates
      cursors[clientID].style.left = position.pageX + "px";
      cursors[clientID].style.top = position.pageY + "px";
    }
  }
}

function createCursor(clientID, data) {
  let cursor = document.createElement("div");
  cursor.style.width = "10px";
  cursor.style.height = "10px";
  cursor.style.position = "absolute";
  cursor.style.borderRadius = "50%";
  cursor.style.backgroundColor = data.color;
  cursor.style.zIndex = 9999; // Make sure the cursor appears on top of everything else
  cursor.title = clientID;
  cursor.classList.add("ably-cursor");
  document.body.appendChild(cursor);
  cursors[clientID] = cursor;

  // Add mouseenter and mouseleave event listeners to show and hide the clientId
  cursor.addEventListener("mouseenter", function () {
    cursor.textContent = clientID;
  });
  cursor.addEventListener("mouseleave", function () {
    cursor.textContent = "";
  });
}

function handleSpaceEvent(msg) {
  // Remove the cursor for the user who left
  if (Array.isArray(msg)) {
    msg.forEach(handleSpaceEvent);
    return;
  }

  if (msg.lastEvent.name === "leave" && cursors[msg.clientId]) {
    document.body.removeChild(cursors[msg.clientId]);
    delete cursors[msg.clientId];
  }
}

async function handleBackgroundMessage(request, sender, sendResponse) {
  if (request.method !== "setCursorCommunication") return;

  if (!cursorCommunicationEnabled) {
    fetchPresenceSet();
    await space.enter({
      color: color
    });
  } else {
    clearCursors();
    space.leave();
  }

  cursorCommunicationEnabled = !cursorCommunicationEnabled;
}

function fetchPresenceSet() {
  space.cursors.getAll().then((members) => {
    for (let member in members) {
      if (!cursors[member.clientId] && member.data) {
        createCursor(member.clientId, member.data);
      }
    }
  });
}

function clearCursors() {
  for (let clientId in cursors) {
    document.body.removeChild(cursors[clientId]);
    delete cursors[clientId];
  }
}

initializeSpace();

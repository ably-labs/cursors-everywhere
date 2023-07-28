// content.js
// Initialize Ably
let clientId = "User-" + Math.random().toString(36).substr(2, 9); // Generate a random clientId
let color = getRandomColor();

const client = new Ably.Realtime.Promise({
  key: "INSERT_API_KEY",
  clientId: clientId
});

const spaces = new Spaces(client);
let space;

// Get the current URL of the tab
let url = window.location.href;

async function asyncFunc() {
  space = await spaces.get("cursor-position" + url);

  let cursorCommunicationEnabled = false;

  document.addEventListener("mousemove", function ({ clientX, clientY, pageX, pageY }) {
    if (cursorCommunicationEnabled) {
      // Find the element that the cursor is currently hovering over
      let elements = document.elementsFromPoint(clientX, clientY);
      let element = elements[0];
      if (element && element.classList.contains("ably-cursor")) {
        element = elements[1];
      }

      // Get the cursor position relative to the element
      let rect = element.getBoundingClientRect();
      let x = pageX - rect.left;
      let y = pageY - rect.top;

      // Calculate the cursor position as a percentage of the element's width and height
      let xPercent = (x / rect.width) * 100;
      let yPercent = (y / rect.height) * 100;

      // Get the CSS path of the element
      let elementPath = getCSSPath(element);

      // Save the cursor position and the current time
      let now = performance.now();
      if (!baseTime) baseTime = now;
      space.cursors.set({
        position: {
          pageX,
          pageY,
          x: xPercent,
          y: yPercent,
          time: now - baseTime,
          element: elementPath
        },
        data: { color: color }
      });
    }
  });
  // let positions = [];
  let baseTime;

  // Object to hold the cursor elements for other users
  let cursors = {};

  // Subscribe to presence updates from other users
  space.cursors.subscribe("cursorsUpdate", (cursorUpdate) => {
    if (cursorCommunicationEnabled) {
      let position = cursorUpdate.position;
      let data = cursorUpdate.data;
      let clientID = cursorUpdate.clientId;

      // If we don't have a cursor for this user yet, create one
      if (!cursors[cursorUpdate.clientId]) {
        createCursor(clientID, data);
      }

      // Replay the cursor movements for this user

      if (!cursors[cursorUpdate.clientId]) return;

      // Find the element using the CSS path
      let element = document.querySelector(position.element);
      if (element && typeof element.getBoundingClientRect === "function" && element.offsetParent !== null) {
        // Position the cursor relative to the element
        let rect = element.getBoundingClientRect();
        cursors[clientID].style.left = rect.left + (rect.width * position.x) / 100 + "px";
        cursors[clientID].style.top = rect.top + (rect.height * position.y) / 100 + "px";
      } else {
        // If the element cannot be found, position the cursor at the absolute coordinates
        cursors[clientID].style.left = position.pageX + "px";
        cursors[clientID].style.top = position.pageY + "px";
      }
    }
  });

  // Function to clear all cursors
  function clearCursors() {
    for (let clientId in cursors) {
      document.body.removeChild(cursors[clientId]);
      delete cursors[clientId];
    }
  }

  space.subscribe(function (msg) {
    // Remove the cursor for the user who left
    if (msg.lastEvent.name === "leave") {
      if (cursors[msg.clientId]) {
        document.body.removeChild(cursors[msg.clientId]);
        delete cursors[msg.clientId];
      }
    }
  });

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

  // Function to fetch the current presence set and draw cursors for all users
  function fetchPresenceSet() {
    space.cursors.getAll().then((members) => {
      for (let i = 0; i < members.length; i++) {
        let member = members[i];
        let data = member.data;
        let clientID = member.clientId;

        if (!cursors[presenceMsg.clientId]) {
          createCursor(clientID, data);
        }
      }
    });
  }

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.method === "setCursorCommunication") {
      cursorCommunicationEnabled = !cursorCommunicationEnabled;

      if (cursorCommunicationEnabled) {
        fetchPresenceSet();
        space.enter({
          username: "Claire Lemons",
          color: color
        });
        // channel.presence.enter({ color: color });
      } else {
        clearCursors();
        console.log("leaving");
        space.leave();
        // channel.presence.leave();
      }
    }
  });

  // Function to get the CSS path of an element
  function getCSSPath(element) {
    let path = [];
    while (element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();
      if (element.id) {
        selector += "#" + element.id;
      } else {
        let sibling = element;
        let siblingSelectors = [];
        while (sibling !== null && sibling.nodeType === Node.ELEMENT_NODE) {
          siblingSelectors.unshift(sibling.nodeName.toLowerCase());
          sibling = sibling.previousSibling;
        }
        if (siblingSelectors.length > 0) {
          selector += ":nth-child(" + siblingSelectors.length + ")";
        }
      }
      path.unshift(selector);
      element = element.parentNode;
    }
    return path.join(" > ");
  }
}

asyncFunc();

// Function to generate a random color
function getRandomColor() {
  var letters = "0123456789ABCDEF";
  var color = "#";
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// content.js
// Initialize Ably
let clientId = 'User-' + Math.random().toString(36).substr(2, 9);  // Generate a random clientId
let color = getRandomColor();

let realtime = new Ably.Realtime({
  key: 'API_KEY',
  clientId: clientId
});
// Get the current URL of the tab
let url = window.location.href;

// Create a unique channel for this URL
let channel = realtime.channels.get('cursor-position-' + url);

// Array to hold the cursor positions for the current second
let positions = [];
let baseTime;

let cursorCommunicationEnabled = false;

// Listen for cursor movements
document.addEventListener('mousemove', function(e) {
  if (cursorCommunicationEnabled) {
    // Save the cursor position and the current time
    let now = performance.now();
    if (!baseTime) {
      baseTime = now;
    }
    positions.push({x: e.pageX, y: e.pageY, time: now - baseTime});
  }
});

// Every second, publish the cursor positions for the past second
setInterval(function() {
  if (cursorCommunicationEnabled && positions.length > 0) {
    channel.presence.update({positions: positions, color: color});
    positions = [];
    baseTime = null;
  }
}, 100);

// Object to hold the cursor elements for other users
let cursors = {};

// Subscribe to presence updates from other users
channel.presence.subscribe('update', function(presenceMsg) {
  if (cursorCommunicationEnabled) {
    let data = presenceMsg.data;

    // If we don't have a cursor for this user yet, create one
    if (!cursors[presenceMsg.clientId]) {
      let cursor = document.createElement('div');
      cursor.style.width = '10px';
      cursor.style.height = '10px';
      cursor.style.position = 'absolute';
      cursor.style.borderRadius = '50%';
      cursor.style.backgroundColor = data.color;
      cursor.style.zIndex = 9999;  // Make sure the cursor appears on top of everything else
      cursor.title = presenceMsg.clientId;
      document.body.appendChild(cursor);
      cursors[presenceMsg.clientId] = cursor;

      // Add mouseenter and mouseleave event listeners to show and hide the clientId
      cursor.addEventListener('mouseenter', function() {
        cursor.textContent = presenceMsg.clientId;
      });
      cursor.addEventListener('mouseleave', function() {
        cursor.textContent = '';
      });
    }
    if (!data.positions) return;
    // Replay the cursor movements for this user
    data.positions.forEach(function(position) {
      setTimeout(function() {
        if (!cursors[presenceMsg.clientId]) return;
        cursors[presenceMsg.clientId].style.left = position.x + 'px';
        cursors[presenceMsg.clientId].style.top = position.y + 'px';
      }, position.time);
    });
  }
});

// Subscribe to presence leave events from other users
channel.presence.subscribe('leave', function(presenceMsg) {
  // Remove the cursor for the user who left
  if (cursors[presenceMsg.clientId]) {
    document.body.removeChild(cursors[presenceMsg.clientId]);
    delete cursors[presenceMsg.clientId];
  }
});

// Function to clear all cursors
function clearCursors() {
  for (let clientId in cursors) {
    document.body.removeChild(cursors[clientId]);
    delete cursors[clientId];
  }
}

// Function to fetch the current presence set and draw cursors for all users
function fetchPresenceSet() {
  channel.presence.get(function(err, presenceSet) {
    if (err) {
      console.log('Error fetching presence set:', err);
      return;
    }

    for (let i = 0; i < presenceSet.length; i++) {
      let presenceMsg = presenceSet[i];
      let data = presenceMsg.data;

      if (!cursors[presenceMsg.clientId]) {
        let cursor = document.createElement('div');
        cursor.style.width = '10px';
        cursor.style.height = '10px';
        cursor.style.position = 'absolute';
        cursor.style.borderRadius = '50%';
        cursor.style.backgroundColor = data.color;
        cursor.style.zIndex = 9999;  // Make sure the cursor appears on top of everything else
        cursor.title = presenceMsg.clientId;
        document.body.appendChild(cursor);
        cursors[presenceMsg.clientId] = cursor;

        // Add mouseenter and mouseleave event listeners to show and hide the clientId
        cursor.addEventListener('mouseenter', function() {
          cursor.textContent = presenceMsg.clientId;
        });
        cursor.addEventListener('mouseleave', function() {
          cursor.textContent = '';
        });
      }

      if (!data.positions) return;

      // Replay the cursor movements for this user
      data.positions.forEach(function(position) {
        setTimeout(function() {
          if (!cursors[presenceMsg.clientId]) return;
          cursors[presenceMsg.clientId].style.left = position.x + 'px';
          cursors[presenceMsg.clientId].style.top = position.y + 'px';
        }, position.time);
      });
    }
  });
}

// Function to generate a random color
function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Enter this user into the presence set
channel.presence.enter({color: color});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.method === 'setCursorCommunication') {
    cursorCommunicationEnabled = !cursorCommunicationEnabled;

    if (cursorCommunicationEnabled) {
      fetchPresenceSet();
    } else {
      clearCursors();
    }
  }
});

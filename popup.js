document.getElementById('toggleButton').addEventListener('click', function() {
  // Get the active tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    // Send a message to the active tab's content script
    chrome.tabs.sendMessage(tabs[0].id, {method: 'setCursorCommunication' });
  });
});

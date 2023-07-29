chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.method === 'getCursorCommunication') {
    let urlKey = 'cursorCommunication_' + sender.tab.url; // create a unique key for each URL
    chrome.storage.sync.get(urlKey, function(result) {
      if (chrome.runtime.lastError) {
        sendResponse({cursorCommunication: false});
      } else {
        let cursorEnabled = result[urlKey] == true;
        sendResponse({ cursorCommunication: cursorEnabled });
      }
    });
  } else if (request.method === 'setCursorCommunication') {
    let urlKey = 'cursorCommunication_' + request.url; // create a unique key for each URL
    let value = {};
    chrome.storage.sync.get([urlKey], function(result) {
      value[urlKey] = !result[urlKey];
      chrome.storage.sync.set(value, function() {
        sendResponse("Value set");
      });
    });
  }
  return true;
});

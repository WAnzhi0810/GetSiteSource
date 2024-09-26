chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "getPageSource") {
    sendResponse({
      source: document.documentElement.outerHTML,
      url: window.location.href,
    });
  }
});

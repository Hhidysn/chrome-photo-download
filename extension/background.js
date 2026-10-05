function openFor(tab, mode = "select") {
  if (!Number.isInteger(tab?.id) || tab.id < 0 || !Number.isInteger(tab.windowId)) return;
  // Call open before awaiting anything: the toolbar/command user gesture is needed.
  const opening = chrome.sidePanel.open({windowId: tab.windowId});
  const source = {tabId: tab.id, windowId: tab.windowId, requestId: crypto.randomUUID(), mode};
  chrome.storage.session.set({[`source:${tab.windowId}`]: source}).catch(console.error);
  opening.catch(console.error);
}

chrome.action.onClicked.addListener((tab) => openFor(tab));
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "save-all") return;
  // Chrome supplies the active tab for command events. The fallback supports older builds.
  if (tab) openFor(tab, "all");
  else {
    const [active] = await chrome.tabs.query({active: true, currentWindow: true});
    if (active) openFor(active, "all");
  }
});

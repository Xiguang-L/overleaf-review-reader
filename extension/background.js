import { projectIdFromUrl } from "./core.js";

chrome.action.onClicked.addListener((tab) => {
  const projectId = projectIdFromUrl(tab.url);
  const target = projectId && Number.isSafeInteger(tab.id) ? `#${tab.id}/${projectId}` : "";
  return chrome.tabs.create({ url: chrome.runtime.getURL("review.html") + target });
});

document.getElementById('open')!.addEventListener('click', () => { chrome.tabs.create({ url: chrome.runtime.getURL('review.html') }); window.close() })

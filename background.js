// JSZip 已通过 manifest.json 引入

chrome.runtime.onInstalled.addListener(function () {
  console.log("Extension installed");
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status === "complete") {
    console.log("Tab updated: " + tab.url);
  }
});

// 格式化尺寸信息为文件名
function formatSizeForFilename(size, actualSize) {
  if (size === "Vector") {
    return "vector";
  }
  if (size === "N/A") {
    if (actualSize && actualSize.width > 0 && actualSize.height > 0) {
      return `${actualSize.width}x${actualSize.height}`;
    }
    return "unknown";
  }
  
  // 处理数字格式，确保使用"x"作为分隔符
  const sizeStr = size.toLowerCase();
  if (sizeStr.includes('×')) {  // 处理特殊的乘号
    return sizeStr.replace('×', 'x');
  }
  if (sizeStr.includes('x')) {  // 已经是正确格式
    return sizeStr;
  }
  // 如果只是一个数字（正方形图标），添加相同的高度
  if (/^\d+$/.test(sizeStr)) {
    return `${sizeStr}x${sizeStr}`;
  }
  // 移除所有非数字字符，并在中间加上"x"
  const numbers = sizeStr.match(/\d+/g);
  if (numbers && numbers.length >= 2) {
    return `${numbers[0]}x${numbers[1]}`;
  }
  return "unknown";
}

// 带重试的 fetch 函数
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'image/*',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error('Not an image response');
      }
      
      return response;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 递增延迟
    }
  }
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startDownload') {
    // 处理单个图标下载
    fetchWithRetry(request.data.url)
      .then(response => response.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const sizeStr = formatSizeForFilename(request.data.size, request.data.actualSize);
        const websiteName = extractWebsiteName(request.data.sourceUrl || request.data.url);
        const filename = `${websiteName}_${sizeStr}.png`;
        
        chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (downloadId === undefined) {
            console.log('Download canceled');
          }
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
      })
      .catch(error => {
        console.error('Error downloading icon:', error);
        // 可以在这里添加用户通知
      });
  } else if (request.action === 'startZipDownload') {
    // 处理多个图标打包下载
    console.log('Starting ZIP download with icons:', request.data.icons);
    
    const fetchPromises = request.data.icons.map(async icon => {
      try {
        const response = await fetchWithRetry(icon.url);
        const blob = await response.blob();
        return {
          blob,
          size: icon.size,
          actualSize: icon.actualSize
        };
      } catch (error) {
        console.error(`Error fetching icon: ${icon.url}`, error);
        return null;
      }
    });

    Promise.all(fetchPromises)
      .then(iconBlobs => {
        console.log('All icons fetched, creating ZIP');
        const zip = new JSZip();
        
        // 过滤掉下载失败的图标
        const validIcons = iconBlobs.filter(icon => icon !== null);
        if (validIcons.length === 0) {
          throw new Error('No valid icons to download');
        }
        
        validIcons.forEach((icon, index) => {
          const sizeStr = formatSizeForFilename(icon.size, icon.actualSize);
          const websiteName = extractWebsiteName(request.data.sourceUrl || request.data.icons[index].url);
          const filename = `${websiteName}_${sizeStr}.png`;
          console.log('Adding to ZIP:', filename);
          zip.file(filename, icon.blob);
        });

        console.log('Generating ZIP file...');
        return zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: {
            level: 9
          }
        });
      })
      .then(content => {
        console.log('ZIP generated, starting download');
        const url = URL.createObjectURL(content);
        chrome.downloads.download({
          url: url,
          filename: `${request.data.siteName}_icons.zip`,
          saveAs: true
        }, (downloadId) => {
          if (downloadId === undefined) {
            console.log('Download canceled');
          }
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
      })
      .catch(error => {
        console.error('Error creating ZIP:', error);
        // 可以在这里添加用户通知
      });
  }
  
  return true;
});

// 从URL中提取网站域名
function extractWebsiteName(url) {
  try {
    const urlObj = new URL(url);
    // 获取主域名，移除www.前缀
    return urlObj.hostname.replace(/^www\./, '').split('.')[0];
  } catch (e) {
    return 'icon';
  }
}

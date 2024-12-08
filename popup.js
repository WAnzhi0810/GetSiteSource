function getFaviconUrl(doc, origin) {
  const iconSizes = [
    "192x192",
    "180x180",
    "152x152",
    "144x144",
    "128x128",
    "96x96",
    "64x64",
    "32x32",
    "16x16",
  ];

  // Check link tags
  const links = doc.getElementsByTagName("link");
  for (let size of iconSizes) {
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (link.rel.toLowerCase().indexOf("icon") > -1 && link.sizes === size) {
        try {
          return new URL(link.href, origin).href;
        } catch (e) {
          console.error("Error parsing URL:", e);
        }
      }
    }
  }

  // If no specific size icon is found, try any size icon
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link.rel.toLowerCase().indexOf("icon") > -1) {
      try {
        return new URL(link.href, origin).href;
      } catch (e) {
        console.error("Error parsing URL:", e);
      }
    }
  }

  // If no link tag is found, try common favicon locations
  const commonLocations = [
    "/favicon.ico",
    "/favicon.png",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
  ];

  for (let location of commonLocations) {
    try {
      const url = new URL(location, origin);
      return url.href;
    } catch (e) {
      console.error("Error creating URL for common location:", e);
    }
  }

  // If all methods fail, return null
  return null;
}

async function getAllFaviconUrls(doc, origin) {
  console.log('Starting icon detection');
  const icons = new Set();
  const processedUrls = new Set(); // Used for deduplication
  
  // Helper function: Add icon to set
  const addIcon = async (url, size = "N/A") => {
    try {
      const fullUrl = new URL(url, origin).href;
      if (!processedUrls.has(fullUrl)) {
        // Validate image URL
        const isValid = await validateImageUrl(fullUrl);
        if (isValid) {
          console.log('Adding valid icon:', fullUrl, 'size:', size);
          icons.add(JSON.stringify({ url: fullUrl, size }));
          processedUrls.add(fullUrl);
        } else {
          console.log('Skipping invalid icon:', fullUrl);
        }
      }
    } catch (e) {
      console.error("Error processing URL:", e, url);
    }
  };

  // Process all icon sources in parallel
  await Promise.all([
    // 1. Process meta tags
    (async () => {
      const metas = doc.getElementsByTagName("meta");
      const metaPromises = [];
      for (const meta of metas) {
        const property = meta.getAttribute("property") || "";
        const name = meta.getAttribute("name") || "";
        const content = meta.getAttribute("content") || "";

        if (name === "msapplication-TileImage" || 
            property === "og:image" || 
            name === "twitter:image") {
          metaPromises.push(addIcon(content));
        }
      }
      await Promise.all(metaPromises);
    })(),

    // 2. Process link tags
    (async () => {
      const links = doc.getElementsByTagName("link");
      const linkPromises = [];
      for (const link of links) {
        const rel = (link.getAttribute("rel") || "").toLowerCase();
        const sizes = link.getAttribute("sizes") || "";
        const href = link.getAttribute("href");

        if (!href) continue;

        if (rel.includes("icon") || rel.includes("apple-touch-icon") || rel.includes("shortcut")) {
          let size = sizes || "N/A";
          linkPromises.push(addIcon(href, size));
        }
      }
      await Promise.all(linkPromises);
    })(),

    // 3. Process manifest.json
    (async () => {
      try {
        const manifestLinks = doc.querySelector('link[rel="manifest"]');
        if (manifestLinks) {
          const manifestUrl = new URL(manifestLinks.href, origin).href;
          const response = await fetch(manifestUrl);
          const manifest = await response.json();
          if (manifest.icons) {
            await Promise.all(manifest.icons.map(icon => {
              const size = icon.sizes || "N/A";
              return addIcon(icon.src, size);
            }));
          }
        }
      } catch (e) {
        console.error("Error processing manifest:", e);
      }
    })(),

    // 4. Check common icon locations
    (async () => {
      const commonLocations = [
        { url: "/favicon.ico", size: "16×16" },
        { url: "/favicon.png", size: "32×32" },
        { url: "/apple-touch-icon.png", size: "180×180" },
        { url: "/apple-touch-icon-precomposed.png", size: "180×180" },
        { url: "/apple-touch-icon-120x120.png", size: "120×120" },
        { url: "/apple-touch-icon-152x152.png", size: "152×152" },
        { url: "/apple-touch-icon-167x167.png", size: "167×167" },
        { url: "/apple-touch-icon-180x180.png", size: "180×180" }
      ];

      await Promise.all(commonLocations.map(async location => {
        try {
          const url = new URL(location.url, origin).href;
          const isValid = await validateImageUrl(url);
          if (isValid) {
            await addIcon(url, location.size);
          }
        } catch (e) {
          console.error("Error checking common location:", e);
        }
      }));
    })()
  ]);

  return Array.from(icons).map(icon => JSON.parse(icon));
}

async function updatePopup(icons) {
  console.log('Starting popup update, icon count:', icons.length);
  showCapturing(true);
  const iconGrid = document.getElementById("iconGrid");
  iconGrid.innerHTML = "";

  let validIcons = 0;

  try {
    // Sort icons by size (largest first)
    const sortedIcons = Array.from(icons).sort((a, b) => {
      const sizeA = a.size ? parseInt(a.size) : 0;
      const sizeB = b.size ? parseInt(b.size) : 0;
      return sizeB - sizeA;
    });

    // Limit to 6 icons to prevent scrolling
    const displayIcons = sortedIcons.slice(0, 6);

    // Process all icons in parallel
    const processedIcons = await Promise.all(
      displayIcons.map(async (icon) => {
        console.log('Checking icon:', icon.url);
        const [exists, actualSize] = await Promise.all([
          checkImageExists(icon.url),
          getImageSize(icon.url)
        ]);

        if (exists) {
          validIcons++;
          const size = await determineIconSize(icon, actualSize);
          
          return {
            url: icon.url,
            size,
            actualSize,
            valid: true
          };
        }
        return { valid: false };
      })
    );

    // Add all valid icons
    processedIcons.forEach(icon => {
      if (icon.valid) {
        const div = document.createElement("div");
        div.className = "icon-item";
        
        // Determine size display text
        const sizeText = formatSizeDisplay(icon.size, icon.actualSize);

        div.innerHTML = `
          <img src="${icon.url}" alt="Icon">
          <span class="icon-size">${sizeText}</span>
        `;
        
        div.addEventListener("click", function () {
          if (document.getElementById('loadingContainer').style.display !== 'flex') {
            this.classList.toggle("selected");
            updateDownloadButton();
          }
        });
        iconGrid.appendChild(div);
      }
    });

    if (validIcons === 0) {
      iconGrid.innerHTML = "<div class='no-icons'>No icons found on this page</div>";
    }

    console.log('Icon update complete, valid icons:', validIcons);
    showCapturing(false);
    updateDownloadButton();
  } catch (error) {
    console.error('Error updating popup:', error);
    iconGrid.innerHTML = "<div>Error fetching icons</div>";
    showCapturing(false);
  }
}

function updateDownloadButton() {
  const selectedIcons = document.querySelectorAll(".icon-item.selected");
  const downloadBtn = document.getElementById("downloadBtn");

  if (document.getElementById('loadingContainer').style.display === 'flex') {
    downloadBtn.style.display = 'none';
    return;
  }

  downloadBtn.style.display = 'block';
  
  if (selectedIcons.length === 0) {
    downloadBtn.textContent = "Download Icons";
    downloadBtn.disabled = true;
  } else if (selectedIcons.length === 1) {
    downloadBtn.textContent = "Download Icon";
    downloadBtn.disabled = false;
  } else {
    downloadBtn.textContent = `Download Selected Icons (${selectedIcons.length})`;
    downloadBtn.disabled = false;
  }
}

function showCapturing(show) {
  const loadingContainer = document.getElementById('loadingContainer');
  const downloadBtn = document.getElementById('downloadBtn');
  
  if (show) {
    loadingContainer.style.display = 'flex';
    downloadBtn.style.display = 'none';
  } else {
    loadingContainer.style.display = 'none';
    updateDownloadButton();
    
    // Adjust window size based on content
    const iconGrid = document.getElementById('iconGrid');
    const contentHeight = iconGrid.offsetHeight + 100; // Add padding
    const contentWidth = iconGrid.offsetWidth + 40; // Add padding
    
    // Set minimum dimensions
    const minHeight = 300;
    const minWidth = 420;
    
    // Calculate optimal dimensions
    const optimalHeight = Math.max(minHeight, Math.min(contentHeight, 600));
    const optimalWidth = Math.max(minWidth, Math.min(contentWidth, 600));
    
    // Update popup dimensions
    document.body.style.width = optimalWidth + 'px';
    document.body.style.height = optimalHeight + 'px';

    // Make icons selectable
    document.querySelectorAll(".icon-item").forEach((item) => {
      item.classList.add("selectable");
    });
  }
}

// Add function to detect image size
function getImageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    
    // Set 3-second timeout
    const timeout = setTimeout(() => {
      console.log('Image size detection timeout:', url);
      resolve({ width: 0, height: 0 });
    }, 3000);

    img.onload = function() {
      clearTimeout(timeout);
      resolve({ width: this.width, height: this.height });
    };

    img.onerror = function() {
      clearTimeout(timeout);
      console.error('Failed to get image size:', url);
      resolve({ width: 0, height: 0 });
    };

    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

async function determineIconSize(icon, actualSize) {
  // 1. Check if we already have a valid size
  if (icon.size && icon.size !== "N/A" && icon.size !== "Vector") {
    return icon.size;
  }

  // 2. Extract size from URL
  const urlSize = extractSizeFromUrl(icon.url);
  if (urlSize) {
    return urlSize;
  }

  // 3. Check actual image dimensions
  if (actualSize.width > 0 && actualSize.height > 0) {
    const standardSize = isStandardIconSize(actualSize.width, actualSize.height);
    if (standardSize) {
      return standardSize;
    }
    
    if (actualSize.width === actualSize.height) {
      return actualSize.width;
    }
    
    return `${actualSize.width}×${actualSize.height}`;
  }

  // 4. Check if it's a vector image
  if (icon.url.toLowerCase().endsWith('.svg')) {
    return "Vector";
  }

  return "N/A";
}

// Add function to extract size from URL
function extractSizeFromUrl(url) {
  // Extract size from filename or path
  const sizePatterns = [
    /(\d+)x(\d+)/i,                    // Standard format: 144x144
    /(\d+)[\s_-]?px/i,                // Format with px: 144px
    /size[=_-](\d+)/i,                // size parameter: size=144
    /(\d+)[\s_-]?square/i,              // square format: 144square
    /icon[_-]?(\d+)/i,                // icon format: icon144
    /(\d+)[_-]?icon/i,                // icon format: 144icon
    /favicon[_-]?(\d+)/i,             // favicon format: favicon144
    /touch[_-]?icon[_-]?(\d+)/i,      // touch-icon format: touch-icon-144
    /apple[_-]?touch[_-]?icon[_-]?(\d+)/i  // apple-touch-icon format
  ];

  const urlLower = url.toLowerCase();
  for (const pattern of sizePatterns) {
    const match = urlLower.match(pattern);
    if (match) {
      const size = parseInt(match[1]);
      if (size > 0 && size < 1024) { // Reasonable size range
        return size;
      }
    }
  }
  return null;
}

// Check if it's a standard icon size
function isStandardIconSize(width, height) {
  const standardSizes = [16, 32, 48, 64, 72, 96, 120, 128, 144, 152, 167, 180, 192, 196, 256, 512];
  // If width and height are equal and a standard size
  if (width === height && standardSizes.includes(width)) {
    return width;
  }
  // If width and height are close to a standard size (allow 1px difference)
  for (const size of standardSizes) {
    if (Math.abs(width - size) <= 1 && Math.abs(height - size) <= 1) {
      return size;
    }
  }
  return null;
}

// Format size display
function formatSizeDisplay(size, actualSize) {
  if (size === "Vector") {
    return "Vector";
  }
  if (size === "N/A") {
    if (actualSize.width > 0 && actualSize.height > 0) {
      return `${actualSize.width}×${actualSize.height}`;
    }
    return "N/A";
  }
  if (typeof size === "number") {
    return `${size}×${size}`;
  }
  // If size is a string format (e.g. "32x32"), convert to use × symbol
  return size.replace(/x/g, '×');
}

async function downloadIcons() {
  const selectedIcons = document.querySelectorAll(".icon-item.selected");
  const downloadBtn = document.getElementById('downloadBtn');
  
  // Prevent repeated clicks
  if (downloadBtn.disabled) {
    return;
  }
  downloadBtn.disabled = true;
  
  try {
    chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
      const tab = tabs[0];
      const hostname = new URL(tab.url).hostname;
      const siteName = hostname.replace(/^www\./, '').split('.')[0];
      
      if (selectedIcons.length === 1) {
        // Download single icon
        const iconItem = selectedIcons[0];
        const img = iconItem.querySelector('img');
        const sizeDisplay = iconItem.querySelector('.icon-size').textContent;
        const actualSize = {
          width: img.naturalWidth,
          height: img.naturalHeight
        };
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'startDownload',
          data: {
            url: img.src,
            filename: `${siteName}_icon.png`,
            size: sizeDisplay,
            actualSize: actualSize
          }
        });
      } else if (selectedIcons.length > 1) {
        // Collect all icon information
        const icons = Array.from(selectedIcons).map(iconItem => {
          const img = iconItem.querySelector('img');
          const sizeDisplay = iconItem.querySelector('.icon-size').textContent;
          return {
            url: img.src,
            size: sizeDisplay,
            actualSize: {
              width: img.naturalWidth,
              height: img.naturalHeight
            }
          };
        });
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'startZipDownload',
          data: {
            icons: icons,
            siteName: siteName
          }
        });
      }
    });
  } catch (error) {
    console.error('Error in downloadIcons:', error);
  } finally {
    // Re-enable button after a short delay
    setTimeout(() => {
      downloadBtn.disabled = false;
    }, 1000);
  }
}

function checkImageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// Validate image URL
async function validateImageUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    return response.ok && contentType && contentType.startsWith('image/');
  } catch (e) {
    console.error('Error validating image URL:', url, e);
    return false;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  console.log('Popup loaded');
  showCapturing(true); // Set initial state to capturing

  // Add download button click event listener
  const downloadBtn = document.getElementById('downloadBtn');
  downloadBtn.addEventListener('click', function() {
    if (!downloadBtn.disabled) {
      downloadIcons();
    }
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    console.log('Getting current tab');
    if (chrome.runtime.lastError) {
      console.error('Error getting tab:', chrome.runtime.lastError);
      updatePopup([]);
      return;
    }
    const currentTab = tabs[0];
    console.log('Current tab URL:', currentTab.url);
    
    chrome.tabs.executeScript(
      currentTab.id,
      {
        code: "({ html: document.documentElement.outerHTML, url: window.location.href })",
      },
      function (results) {
        console.log('Script executed');
        if (chrome.runtime.lastError) {
          console.error('Error executing script:', chrome.runtime.lastError);
          updatePopup([]);
        } else if (results && results[0]) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(results[0].html, "text/html");
          const pageUrl = new URL(results[0].url);
          console.log('Getting icons');
          getAllFaviconUrls(doc, pageUrl.origin).then(icons => {
            console.log('Got icon list:', icons);
            updatePopup(icons);
          }).catch(error => {
            console.error('Error getting icons:', error);
            updatePopup([]);
          });
        } else {
          console.error('No page content received');
          updatePopup([]);
        }
      }
    );
  });

  document
    .getElementById("downloadBtn")
    .addEventListener("click", downloadIcons);
});

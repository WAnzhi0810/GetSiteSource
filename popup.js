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

  // 检查 link 标签
  const links = doc.getElementsByTagName("link");
  for (let size of iconSizes) {
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (link.rel.toLowerCase().indexOf("icon") > -1 && link.sizes === size) {
        try {
          return new URL(link.href, origin).href;
        } catch (e) {
          console.error("解析 URL 时出错:", e);
        }
      }
    }
  }

  // 如果没有找到指定尺寸的图标，尝试任何尺寸的图标
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link.rel.toLowerCase().indexOf("icon") > -1) {
      try {
        return new URL(link.href, origin).href;
      } catch (e) {
        console.error("解析 URL 时出错:", e);
      }
    }
  }

  // 如果没有找到 link 标签，尝试常见的 favicon 位置
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
      console.error("为常见位置创建 URL 时出错:", e);
    }
  }

  // 如果所有方法都失败，返回 null
  return null;
}

function getAllFaviconUrls(doc, origin) {
  const icons = [];
  const links = doc.getElementsByTagName("link");

  // 检查 link 标签
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link.rel.toLowerCase().indexOf("icon") > -1) {
      try {
        const url = new URL(link.href, origin).href;
        let size = link.sizes ? parseInt(link.sizes.value.split("x")[0]) : 0;
        size = isNaN(size) ? 0 : size;
        icons.push({
          url: url,
          size: size || "未知",
        });
      } catch (e) {
        console.error("解析 URL 时出错:", e);
      }
    }
  }

  // 添加常见的 favicon 位置
  const commonLocations = [
    { url: "/favicon.ico", size: 16 },
    { url: "/favicon.png", size: 32 },
    { url: "/apple-touch-icon.png", size: 180 },
    { url: "/apple-touch-icon-precomposed.png", size: 180 },
  ];

  for (let location of commonLocations) {
    try {
      const url = new URL(location.url, origin).href;
      icons.push({
        url: url,
        size: location.size,
      });
    } catch (e) {
      console.error("为常见位置创建 URL 时出错:", e);
    }
  }

  return icons;
}

let isCapturing = true; // 添加一个全局变量来跟踪捕获状态

function showCapturing(show) {
  isCapturing = show;
  const downloadBtn = document.getElementById("downloadBtn");
  const spinner = downloadBtn.querySelector(".spinner");
  const buttonText = downloadBtn.querySelector("span");

  if (show) {
    buttonText.textContent = "捕获中";
    downloadBtn.disabled = true;
    spinner.style.display = "inline-block";
  } else {
    updateDownloadButton();
    downloadBtn.disabled = false;
    spinner.style.display = "none";
    // 捕获结束后，使所有图标可选
    document.querySelectorAll(".icon-item").forEach((item) => {
      item.classList.add("selectable");
    });
  }
}

async function updatePopup(icons) {
  showCapturing(true);
  const iconGrid = document.getElementById("iconGrid");
  iconGrid.innerHTML = "";

  let validIcons = 0;

  for (const icon of icons) {
    const imageExists = await checkImageExists(icon.url);
    if (imageExists) {
      validIcons++;
      const div = document.createElement("div");
      div.className = "icon-item";
      div.innerHTML = `
        <img src="${icon.url}" alt="Icon">
        <span>${
          icon.size !== "未知" ? `${icon.size}x${icon.size}` : "未知"
        }</span>
      `;
      div.addEventListener("click", function () {
        if (!isCapturing) {
          this.classList.toggle("selected");
          updateDownloadButton();
        }
      });
      iconGrid.appendChild(div);
    }
  }

  if (validIcons === 0) {
    iconGrid.innerHTML = "<div>未找到有效图标</div>";
  }

  showCapturing(false); // 捕获结束
  updateDownloadButton();
}

function updateDownloadButton() {
  const selectedIcons = document.querySelectorAll(".icon-item.selected");
  const downloadBtn = document.getElementById("downloadBtn");
  const buttonText = downloadBtn.querySelector("span");

  if (isCapturing) {
    // 如果正在捕获中，不要改变文本
    return;
  }

  if (selectedIcons.length === 0) {
    buttonText.textContent = "下载图标";
    downloadBtn.disabled = true;
  } else if (selectedIcons.length === 1) {
    buttonText.textContent = "下载图标";
    downloadBtn.disabled = false;
  } else {
    buttonText.textContent = "下载选中的图标 (ZIP)";
    downloadBtn.disabled = false;
  }
}

async function downloadIcons() {
  const selectedIcons = document.querySelectorAll(".icon-item.selected img");
  if (selectedIcons.length === 1) {
    // 下载单个图标
    chrome.downloads.download({
      url: selectedIcons[0].src,
      filename: `favicon.png`,
    });
  } else if (selectedIcons.length > 1) {
    // 下载多个图标为 ZIP
    const zip = new JSZip();
    const promises = Array.from(selectedIcons).map(async (img, index) => {
      const response = await fetch(img.src);
      const blob = await response.blob();
      zip.file(`favicon_${index}.png`, blob);
    });

    await Promise.all(promises);
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    chrome.downloads.download({
      url: url,
      filename: "favicons.zip",
    });
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

document.addEventListener("DOMContentLoaded", function () {
  showCapturing(true); // 初始状态设置为捕获中

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (chrome.runtime.lastError) {
      updatePopup([]);
      return;
    }
    const currentTab = tabs[0];
    chrome.tabs.executeScript(
      currentTab.id,
      {
        code: "({ html: document.documentElement.outerHTML, url: window.location.href })",
      },
      function (results) {
        if (chrome.runtime.lastError) {
          updatePopup([]);
        } else if (results && results[0]) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(results[0].html, "text/html");
          const pageUrl = new URL(results[0].url);
          const icons = getAllFaviconUrls(doc, pageUrl.origin);
          updatePopup(icons);
        } else {
          updatePopup([]);
        }
      }
    );
  });

  document
    .getElementById("downloadBtn")
    .addEventListener("click", downloadIcons);
});

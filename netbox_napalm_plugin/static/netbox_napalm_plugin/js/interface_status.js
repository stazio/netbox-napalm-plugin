(() => {
  // js/bs.ts
  function createToast(level, title, message, extra) {
    let iconName = "mdi-alert";
    switch (level) {
      case "warning":
        iconName = "mdi-alert";
        break;
      case "success":
        iconName = "mdi-check-circle";
        break;
      case "info":
        iconName = "mdi-information";
        break;
      case "danger":
        iconName = "mdi-alert";
        break;
    }
    const textClass = level === "warning" || level === "info" ? "text-dark" : "text-white";
    const closeClass = level === "warning" || level === "info" ? "btn-close" : "btn-close-white";
    const container = document.createElement("div");
    container.setAttribute("class", "toast-container position-fixed bottom-0 end-0 m-3");
    const main = document.createElement("div");
    main.setAttribute("class", `toast bg-${level}`);
    main.setAttribute("role", "alert");
    main.setAttribute("aria-live", "assertive");
    main.setAttribute("aria-atomic", "true");
    const header = document.createElement("div");
    header.setAttribute("class", `toast-header bg-${level} ${textClass}`);
    const icon = document.createElement("i");
    icon.setAttribute("class", `mdi ${iconName}`);
    const titleElement = document.createElement("strong");
    titleElement.setAttribute("class", "me-auto ms-1");
    titleElement.innerText = title;
    const button = document.createElement("button");
    button.setAttribute("type", "button");
    button.setAttribute("class", closeClass);
    button.setAttribute("data-bs-dismiss", "toast");
    button.setAttribute("aria-label", "Close");
    const body = document.createElement("div");
    body.setAttribute("class", `toast-body ${textClass}`);
    header.appendChild(icon);
    header.appendChild(titleElement);
    if (typeof extra !== "undefined") {
      const extraElement = document.createElement("small");
      extraElement.setAttribute("class", "text-muted");
      header.appendChild(extraElement);
    }
    header.appendChild(button);
    body.innerText = message.trim();
    main.appendChild(header);
    main.appendChild(body);
    container.appendChild(main);
    document.body.appendChild(container);
    const toast = new window.Toast(main);
    return toast;
  }

  // js/util.ts
  function hasError(data) {
    return "error" in data;
  }
  function isTruthy(value) {
    const badStrings = ["", "null", "undefined"];
    if (Array.isArray(value)) {
      return value.length > 0;
    } else if (typeof value === "string" && !badStrings.includes(value)) {
      return true;
    } else if (typeof value === "number") {
      return true;
    } else if (typeof value === "boolean") {
      return true;
    } else if (typeof value === "object" && value !== null) {
      return true;
    }
    return false;
  }
  async function apiRequest(url, method, data) {
    const token = window.CSRF_TOKEN;
    const headers = new Headers({ "X-CSRFToken": token });
    let body;
    if (typeof data !== "undefined") {
      body = JSON.stringify(data);
      headers.set("content-type", "application/json");
    }
    const res = await fetch(url, { method, body, headers, credentials: "same-origin" });
    const contentType = res.headers.get("Content-Type");
    if (typeof contentType === "string" && contentType.includes("text")) {
      const error = await res.text();
      return { error };
    }
    const json = await res.json();
    if (!res.ok && Array.isArray(json)) {
      const error = json.join("\n");
      return { error };
    } else if (!res.ok && "detail" in json) {
      return { error: json.detail };
    }
    return json;
  }
  async function apiGetBase(url) {
    return await apiRequest(url, "GET");
  }
  function* getElements(...key) {
    for (const query of key) {
      for (const element of document.querySelectorAll(query)) {
        if (element !== null) {
          yield element;
        }
      }
    }
  }
  function getNetboxData(key) {
    if (!key.startsWith("data-")) {
      key = `data-${key}`;
    }
    var parent_div = document.getElementById("netbox-data");
    for (const element of parent_div.children) {
      const value = element.getAttribute(key);
      if (isTruthy(value)) {
        return value;
      }
    }
    return null;
  }
  function toggleVisibility(element, action) {
    if (element !== null) {
      if (typeof action === "undefined") {
        const current = window.getComputedStyle(element).display;
        if (current === "none") {
          element.style.display = "";
        } else {
          element.style.display = "none";
        }
      } else {
        if (action === "show") {
          element.style.display = "";
        } else {
          element.style.display = "none";
        }
      }
    }
  }
  function toggleLoader(action) {
    for (const element of getElements("div.card-overlay")) {
      toggleVisibility(element, action);
    }
  }
  function flashRow(rowId, highlightClass = "table-warning") {
    const row = document.getElementById(rowId);
    if (row === null) {
      return;
    }
    row.classList.add(highlightClass);
    setTimeout(() => {
      row.classList.remove(highlightClass);
      setTimeout(() => {
        row.classList.add(highlightClass);
        setTimeout(() => {
          row.classList.remove(highlightClass);
        }, 500);
      }, 500);
    }, 500);
  }
  function flashRowFromHash() {
    const hash = window.location.hash;
    if (!hash) {
      return;
    }
    const match = hash.match(/^#interface-(.+)$/);
    if (match !== null && match[1]) {
      const rowId = decodeURIComponent(match[1]);
      flashRow(rowId);
    }
  }

  // js/interface_status.ts
  var CISCO_IOS_PATTERN = new RegExp(/^([A-Z][A-Za-z]+)[^0-9]*([0-9/]+)$/);
  var CISCO_IOS_OVERRIDES = new Map([
    ["TwentyFiveGigE", "Twe"]
  ]);
  function getData(row, query, attr) {
    return row.querySelector(query)?.getAttribute(attr) ?? null;
  }
  function getInterfaceAlias(name) {
    if (name === null) {
      return name;
    }
    if (name.match(CISCO_IOS_PATTERN)) {
      const [base, numeric] = (name.match(CISCO_IOS_PATTERN) ?? []).slice(1, 3);
      if (isTruthy(base) && isTruthy(numeric)) {
        const aliasBase = CISCO_IOS_OVERRIDES.get(base) || base.slice(0, 2);
        return `${aliasBase}${numeric}`;
      }
    }
    return name;
  }
  function fuzzyIfaceMatch(a, b) {
    const stripNum = (s) => s.replace(/[^A-Za-z]+$/, "").toUpperCase();
    const prefixA = stripNum(a);
    const prefixB = stripNum(b);
    if (prefixA.length < 2 || prefixB.length < 2) {
      return false;
    }
    return prefixA.slice(0, 2) === prefixB.slice(0, 2);
  }
  function formatSpeed(speedBps) {
    if (speedBps === null || speedBps === void 0) {
      return "Unknown";
    }
    const speedMbps = speedBps / 1e6;
    if (speedMbps >= 1e3) {
      const gbps = speedMbps / 1e3;
      return gbps % 1 === 0 ? `${gbps}G` : `${gbps.toFixed(1)}G`;
    }
    return `${speedMbps}M`;
  }
  function updateRowStyle(data) {
    const interfaces = data.get_interfaces;
    const lldpData = data.get_lldp_neighbors_detail;
    const lldpByShort = {};
    for (const [fullIface, neighbors] of Object.entries(lldpData)) {
      const [shortIface] = fullIface.split(".");
      if (!(shortIface in lldpByShort)) {
        lldpByShort[shortIface] = [];
      }
      lldpByShort[shortIface].push(...neighbors);
    }
    for (const [fullIface, ifaceData] of Object.entries(interfaces)) {
      const [shortIface] = fullIface.split(".");
      const row = document.getElementById(shortIface);
      if (row === null) {
        console.warn("[interface_status] No row found for:", shortIface, "(full:", fullIface, ")");
        continue;
      }
      const linkStatusCell = row.querySelector("td.link_status");
      const enabledCell = row.querySelector("td.enabled");
      const lastFlappedCell = row.querySelector("td.last_flapped");
      const speedCell = row.querySelector("td.speed");
      const ifaceDataTyped = ifaceData;
      if (linkStatusCell !== null) {
        const isUp = ifaceDataTyped.is_up;
        const icon = isUp ? '<i class="mdi mdi-check-circle text-success"></i> Up' : '<i class="mdi mdi-close-circle text-danger"></i> Down';
        linkStatusCell.innerHTML = icon;
      }
      if (enabledCell !== null) {
        const isEnabled = ifaceDataTyped.is_enabled;
        const icon = isEnabled ? '<i class="mdi mdi-check-circle text-success"></i> Yes' : '<i class="mdi mdi-close-circle text-danger"></i> No';
        enabledCell.innerHTML = icon;
      }
      if (lastFlappedCell !== null) {
        const lastFlapped = ifaceDataTyped.last_flapped;
        if (lastFlapped !== null && lastFlapped > 0) {
          lastFlappedCell.innerText = new Date(lastFlapped * 1e3).toLocaleString();
        } else {
          lastFlappedCell.innerText = "Never";
        }
      }
      if (speedCell !== null) {
        if (ifaceDataTyped.is_up) {
          speedCell.innerText = formatSpeed(ifaceDataTyped.speed);
        } else {
          speedCell.innerText = "";
        }
      }
      const neighbors = lldpByShort[shortIface] ?? [];
      console.log("[interface_status] Interface:", shortIface, "neighbors:", neighbors.length, "lldpByShort keys:", Object.keys(lldpByShort));
      for (const neighbor of neighbors) {
        const neighborTyped = neighbor;
        const lldpCell = row.querySelector("td.lldp");
        const configuredDevice = getData(row, "td.configured", "data-device");
        const configuredChassis = getData(row, "td.configured", "data-chassis");
        const configuredIface = getData(row, "td.configured", "data-interface");
        const interfaceAlias = getInterfaceAlias(configuredIface);
        const remoteName = neighborTyped.remote_system_name ?? "";
        const remotePort = neighborTyped.remote_port ?? "";
        const [neighborDevice] = remoteName.split(".");
        const [neighborIface] = remotePort.split(".");
        if (lldpCell !== null) {
          const deviceSpan = lldpCell.querySelector(".lldp-device");
          const ifaceSpan = lldpCell.querySelector(".lldp-interface");
          const chevron = lldpCell.querySelector(".mdi-chevron-right");
          console.log("[interface_status] lldpCell found, deviceSpan:", !!deviceSpan, "ifaceSpan:", !!ifaceSpan, "chevron:", !!chevron, "neighborDevice:", neighborDevice, "neighborIface:", neighborIface);
          if (deviceSpan !== null) {
            deviceSpan.innerText = neighborDevice;
          }
          if (ifaceSpan !== null) {
            ifaceSpan.innerText = neighborIface;
          }
          if (chevron !== null) {
            chevron.style.display = isTruthy(neighborDevice) || isTruthy(neighborIface) ? "" : "none";
          }
        } else {
          console.log("[interface_status] lldpCell NOT found for row:", shortIface);
        }
        const isUp = ifaceDataTyped.is_up;
        const nonConfiguredDevice = !isTruthy(configuredDevice) && isTruthy(neighborDevice);
        const validNode = configuredDevice === neighborDevice || configuredChassis === neighborDevice;
        const exactInterfaceMatch = configuredIface === neighborIface || interfaceAlias === neighborIface;
        const fuzzyMatch = isTruthy(configuredIface) && isTruthy(neighborIface) && fuzzyIfaceMatch(configuredIface, neighborIface);
        const hasMismatch = nonConfiguredDevice || !validNode && isTruthy(neighborDevice) || validNode && !exactInterfaceMatch && !fuzzyMatch;
        if (hasMismatch) {
          const warningIcon = row.querySelector("td.configured")?.querySelector(".configured-warning");
          if (warningIcon !== null) {
            warningIcon.style.display = "";
          }
        }
        if (validNode && exactInterfaceMatch) {
          row.classList.add("success");
        }
      }
    }
  }
  function initInterfaceStatus() {
    toggleLoader("show");
    const url = getNetboxData("object-url");
    if (url !== null) {
      apiGetBase(url).then((data) => {
        if (hasError(data)) {
          createToast("danger", "Error Retrieving Interface Status", data.error).show();
          toggleLoader("hide");
          return;
        } else {
          updateRowStyle(data);
        }
        return;
      }).finally(() => {
        toggleLoader("hide");
      });
    }
    flashRowFromHash();
  }
  if (document.readyState !== "loading") {
    initInterfaceStatus();
  } else {
    document.addEventListener("DOMContentLoaded", initInterfaceStatus);
  }
})();

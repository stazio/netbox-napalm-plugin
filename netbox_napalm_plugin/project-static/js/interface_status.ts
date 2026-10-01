import { createToast } from './bs';
import { apiGetBase, getNetboxData, hasError, isTruthy, toggleLoader, flashRowFromHash } from './util';

// Match an interface name that begins with a capital letter and is followed by at least one other
// alphabetic character, and ends with a forward-slash-separated numeric sequence such as 0/1/2.
const CISCO_IOS_PATTERN = new RegExp(/^([A-Z][A-Za-z]+)[^0-9]*([0-9/]+)$/);

// Mapping of overrides to default Cisco IOS interface alias behavior (default behavior is to use
// the first two characters).
const CISCO_IOS_OVERRIDES = new Map<string, string>([
  // Cisco IOS abbreviates 25G (TwentyFiveGigE) interfaces as 'Twe'.
  ['TwentyFiveGigE', 'Twe'],
]);

/**
 * Get an attribute from a row's cell.
 *
 * @param row Interface row
 * @param query CSS media query
 * @param attr Cell attribute
 */
function getData(row: HTMLTableRowElement, query: string, attr: string): string | null {
  return row.querySelector(query)?.getAttribute(attr) ?? null;
}

/**
 * Get preconfigured alias for given interface. Primarily for matching long-form Cisco IOS
 * interface names with short-form Cisco IOS interface names. For example, `GigabitEthernet0/1/2`
 * would become `Gi0/1/2`.
 *
 * @param name Long-form/original interface name.
 */
function getInterfaceAlias(name: string | null): string | null {
  if (name === null) {
    return name;
  }
  if (name.match(CISCO_IOS_PATTERN)) {
    // Extract the base name and numeric portions of the interface.
    const [base, numeric] = (name.match(CISCO_IOS_PATTERN) ?? []).slice(1, 3);

    if (isTruthy(base) && isTruthy(numeric)) {
      // Check the override map and use its value if the base name is present in the map.
      const aliasBase = CISCO_IOS_OVERRIDES.get(base) || base.slice(0, 2);
      return `${aliasBase}${numeric}`;
    }
  }
  return name;
}

/**
 * Fuzzy-match two interface names by comparing their leading alphabetic prefixes.
 *
 * Strips trailing numeric portions from both names, then checks whether the first
 * N characters of the remaining letter prefixes are identical (N >= 2).
 *
 * @param a First interface name.
 * @param b Second interface name.
 * @returns true if the leading letters match.
 */
function fuzzyIfaceMatch(a: string, b: string): boolean {
  // Strip trailing numeric+slash suffix (e.g. "0/1/2") to get the letter prefix.
  const stripNum = (s: string): string => s.replace(/[^A-Za-z]+$/, '').toUpperCase();
  const prefixA = stripNum(a);
  const prefixB = stripNum(b);

  if (prefixA.length < 2 || prefixB.length < 2) {
    return false;
  }

  // Compare the first two characters.
  return prefixA.slice(0, 2) === prefixB.slice(0, 2);
}

/**
 * Format speed value from bps to human-readable string.
 *
 * @param speedBps Speed in bits per second.
 */
function formatSpeed(speedBps: number | null | undefined): string {
  if (speedBps === null || speedBps === undefined) {
    return 'Unknown';
  }
  const speedMbps = speedBps / 1000000;
  if (speedMbps >= 1000) {
    const gbps = speedMbps / 1000;
    return gbps % 1 === 0 ? `${gbps}G` : `${gbps.toFixed(1)}G`;
  }
  return `${speedMbps}M`;
}

/**
 * Update row styles based on interface and LLDP neighbor data.
 */
function updateRowStyle(data: { get_interfaces: Record<string, unknown>; get_lldp_neighbors_detail: Record<string, unknown> }): void {
  const interfaces = data.get_interfaces;
  const lldpData = data.get_lldp_neighbors_detail;

  // Build LLDP lookup map by short interface name
  const lldpByShort: Record<string, unknown[]> = {};
  for (const [fullIface, neighbors] of Object.entries(lldpData)) {
    const [shortIface] = fullIface.split('.');
    if (!(shortIface in lldpByShort)) {
      lldpByShort[shortIface] = [];
    }
    lldpByShort[shortIface].push(...(neighbors as unknown[]));
  }

  // Iterate over all interfaces from the API
  for (const [fullIface, ifaceData] of Object.entries(interfaces)) {
    const [shortIface] = fullIface.split('.');
    const row = document.getElementById(shortIface);
    if (row === null) {
      console.warn('[interface_status] No row found for:', shortIface, '(full:', fullIface, ')');
      continue;
    }

    // Update link status, enabled, last_flapped, and speed
    const linkStatusCell = row.querySelector<HTMLTableCellElement>('td.link_status');
    const enabledCell = row.querySelector<HTMLTableCellElement>('td.enabled');
    const lastFlappedCell = row.querySelector<HTMLTableCellElement>('td.last_flapped');
    const speedCell = row.querySelector<HTMLTableCellElement>('td.speed');

    const ifaceDataTyped = ifaceData as Record<string, unknown>;

    if (linkStatusCell !== null) {
      const isUp = ifaceDataTyped.is_up as boolean;
      const icon = isUp
        ? '<i class="mdi mdi-check-circle text-success"></i> Up'
        : '<i class="mdi mdi-close-circle text-danger"></i> Down';
      linkStatusCell.innerHTML = icon;
    }
    if (enabledCell !== null) {
      const isEnabled = ifaceDataTyped.is_enabled as boolean;
      const icon = isEnabled
        ? '<i class="mdi mdi-check-circle text-success"></i> Yes'
        : '<i class="mdi mdi-close-circle text-danger"></i> No';
      enabledCell.innerHTML = icon;
    }
    if (lastFlappedCell !== null) {
      const lastFlapped = ifaceDataTyped.last_flapped as number;
      if (lastFlapped !== null && lastFlapped > 0) {
        lastFlappedCell.innerText = new Date(lastFlapped * 1000).toLocaleString();
      } else {
        lastFlappedCell.innerText = 'Never';
      }
    }
    if (speedCell !== null) {
      if (ifaceDataTyped.is_up as boolean) {
        speedCell.innerText = formatSpeed(ifaceDataTyped.speed as number);
      } else {
        speedCell.innerText = '';
      }
    }

    // Update LLDP neighbor info
    const neighbors = lldpByShort[shortIface] ?? [];
    // Hide chevron by default; show only if we find neighbors
    const defaultChevron = row.querySelector<HTMLTableCellElement>('td.lldp')?.querySelector('.mdi-chevron-right');
    if (defaultChevron !== null) {
      defaultChevron.style.display = 'none';
    }
    console.log('[interface_status] Interface:', shortIface, 'neighbors:', neighbors.length, 'lldpByShort keys:', Object.keys(lldpByShort));
    for (const neighbor of neighbors) {
      const neighborTyped = neighbor as Record<string, unknown>;
      const lldpCell = row.querySelector<HTMLTableCellElement>('td.lldp');
      const configuredDevice = getData(row, 'td.configured', 'data-device');
      const configuredChassis = getData(row, 'td.configured', 'data-chassis');
      const configuredIface = getData(row, 'td.configured', 'data-interface');
      const interfaceAlias = getInterfaceAlias(configuredIface);
      const remoteName = (neighborTyped.remote_system_name as string) ?? '';
      const remotePort = (neighborTyped.remote_port as string) ?? '';
      const [neighborDevice] = remoteName.split('.');
      const [neighborIface] = remotePort.split('.');
      if (lldpCell !== null) {
        const deviceSpan = lldpCell.querySelector('.lldp-device');
        const ifaceSpan = lldpCell.querySelector('.lldp-interface');
        const chevron = lldpCell.querySelector('.mdi-chevron-right');
        console.log('[interface_status] lldpCell found, deviceSpan:', !!deviceSpan, 'ifaceSpan:', !!ifaceSpan, 'chevron:', !!chevron, 'neighborDevice:', neighborDevice, 'neighborIface:', neighborIface);
        if (deviceSpan !== null) {
          deviceSpan.innerText = neighborDevice;
          console.log('[interface_status] Set deviceSpan to:', deviceSpan.innerText);
        }
        if (ifaceSpan !== null) {
          ifaceSpan.innerText = neighborIface;
          console.log('[interface_status] Set ifaceSpan to:', ifaceSpan.innerText);
        }
        if (chevron !== null) {
          chevron.style.display = (isTruthy(neighborDevice) || isTruthy(neighborIface)) ? '' : 'none';
        }
      } else {
        console.log('[interface_status] lldpCell NOT found for row:', shortIface);
      }
      const isUp = ifaceDataTyped.is_up as boolean;
      const nonConfiguredDevice = !isTruthy(configuredDevice) && isTruthy(neighborDevice);
      const validNode = configuredDevice === neighborDevice || configuredChassis === neighborDevice;
      const exactInterfaceMatch =
        configuredIface === neighborIface || interfaceAlias === neighborIface;
      const fuzzyMatch =
        isTruthy(configuredIface) &&
        isTruthy(neighborIface) &&
        fuzzyIfaceMatch(configuredIface, neighborIface);
      const hasMismatch =
        nonConfiguredDevice ||
        (!validNode && isTruthy(neighborDevice)) ||
        (validNode && !exactInterfaceMatch && !fuzzyMatch);
      if (hasMismatch) {
        const configuredCell = row.querySelector<HTMLTableCellElement>('td.configured');
        const warningIcon = configuredCell?.querySelector('.configured-warning');
        if (warningIcon !== null) {
          warningIcon.style.display = '';
        }
      }
      if (validNode && exactInterfaceMatch) {
        row.classList.add('success');
      }
    }
  }
}

/**
 * Initialize Interface Status page.
 */
function initInterfaceStatus(): void {
  toggleLoader('show');

  const url = getNetboxData('object-url');
  if (url !== null) {
    apiGetBase(url)
      .then(data => {
        if (hasError(data)) {
          createToast('danger', 'Error Retrieving Interface Status', data.error).show();
          toggleLoader('hide');
          return;
        } else {
          updateRowStyle(data);
        }
        return;
      })
      .finally(() => {
        toggleLoader('hide');
      });
  }

  // Check for hash in URL and flash the corresponding row
  flashRowFromHash();
}

if (document.readyState !== 'loading') {
  initInterfaceStatus();
} else {
  document.addEventListener('DOMContentLoaded', initInterfaceStatus);
}

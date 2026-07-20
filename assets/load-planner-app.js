(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KBridgePlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS = 1e-6;
  const MAX_BINS = 60;
  const BEAM_WIDTH = 10;

  const DEFAULT_VEHICLES = [
    { id: 'mini', name: '다마스 트럭', length: 1700, width: 1100, height: 1000, maxWeight: 250, maxCbm: 1.5, cost: 0.45 },
    { id: 'labo', name: '라보 트럭', length: 2200, width: 1300, height: 1500, maxWeight: 450, maxCbm: 3.0, cost: 0.62 },
    { id: '1t', name: '1톤 트럭', length: 2900, width: 1600, height: 1700, maxWeight: 1100, maxCbm: 4.5, cost: 0.82 },
    { id: '1_4t', name: '1.4톤 트럭', length: 3100, width: 1700, height: 1800, maxWeight: 1400, maxCbm: 6.5, cost: 0.96 },
    { id: '2_5t', name: '2.5톤 트럭', length: 4200, width: 1800, height: 2200, maxWeight: 2600, maxCbm: 11.0, cost: 1.22 },
    { id: '3_5t', name: '3.5톤 트럭', length: 4600, width: 2000, height: 2200, maxWeight: 3600, maxCbm: 15.0, cost: 1.40 },
    { id: '5t', name: '5톤 트럭', length: 6200, width: 2300, height: 2400, maxWeight: 5500, maxCbm: 25.0, cost: 1.72 },
    { id: '8t', name: '8톤 트럭', length: 7300, width: 2400, height: 2400, maxWeight: 8800, maxCbm: 32.0, cost: 2.10 },
    { id: '11t', name: '11톤 트럭', length: 9100, width: 2400, height: 2500, maxWeight: 12000, maxCbm: 47.0, cost: 2.45 },
    { id: '14t', name: '14톤 트럭', length: 10200, width: 2400, height: 2500, maxWeight: 15000, maxCbm: 49.0, cost: 2.70 },
    { id: '18t', name: '18톤 트럭', length: 10100, width: 2400, height: 2500, maxWeight: 19000, maxCbm: 56.0, cost: 2.95 },
    { id: '25t', name: '25톤 트럭', length: 10100, width: 2400, height: 2500, maxWeight: 27000, maxCbm: 56.0, cost: 3.20 }
  ];

  const DEFAULT_CONTAINERS = [
    { id: '20dry', name: '20FT DRY', length: 5898, width: 2352, height: 2393, maxWeight: 28000, maxCbm: 33.2, cost: 1.00 },
    { id: '40dry', name: '40FT DRY', length: 12032, width: 2352, height: 2393, maxWeight: 26700, maxCbm: 67.6, cost: 1.65 },
    { id: '40hc', name: '40FT HIGH CUBE', length: 12032, width: 2352, height: 2698, maxWeight: 26500, maxCbm: 76.3, cost: 1.78 },
    { id: '45hc', name: '45FT HIGH CUBE', length: 13556, width: 2352, height: 2698, maxWeight: 27400, maxCbm: 85.9, cost: 2.08 }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function expandCargos(cargos) {
    const items = [];
    cargos.forEach((cargo, cargoOrder) => {
      const qty = Math.max(0, Math.floor(Number(cargo.qty) || 0));
      for (let i = 0; i < qty; i += 1) {
        const length = positive(cargo.length);
        const width = positive(cargo.width);
        const height = positive(cargo.height);
        items.push({
          instanceId: `${cargo.id || cargoOrder}-${i + 1}`,
          cargoId: String(cargo.id || cargoOrder),
          cargoOrder,
          sequence: i,
          name: cargo.name || `화물 ${cargoOrder + 1}`,
          length,
          width,
          height,
          weight: Math.max(0, Number(cargo.weight) || 0),
          maxStack: Math.max(1, Math.floor(Number(cargo.maxStack) || 99)),
          noTop: Boolean(cargo.noTop),
          stackMode: cargo.stackMode || 'global',
          rotationMode: cargo.rotationMode || 'global',
          color: cargo.color || '#2f75d6',
          volume: length * width * height
        });
      }
    });
    return items;
  }

  function getOrientations(item, rotation) {
    const l = item.length;
    const w = item.width;
    const h = item.height;
    const effectiveRotation = item.rotationMode && item.rotationMode !== 'global' ? item.rotationMode : rotation;
    let raw;
    if (effectiveRotation === 'fixed') raw = [[l, w, h]];
    else if (effectiveRotation === 'six') raw = [[l, w, h], [l, h, w], [w, l, h], [w, h, l], [h, l, w], [h, w, l]];
    else raw = [[l, w, h], [w, l, h]];
    const seen = new Set();
    return raw.filter(dims => {
      const key = dims.join('x');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(dims => ({ length: dims[0], width: dims[1], height: dims[2] }));
  }

  function fitsEmptyBin(item, spec, options) {
    if (options.enforceWeight !== false && item.weight > spec.maxWeight + EPS) return false;
    if (item.volume > practicalVolume(spec) + EPS) return false;
    return getOrientations(item, options.rotation).some(dims =>
      dims.length <= spec.length + EPS && dims.width <= spec.width + EPS && dims.height <= spec.height + EPS
    );
  }

  function planLoad(items, specs, targetId, rawOptions) {
    const options = normalizeOptions(rawOptions);
    const started = now();
    const safeSpecs = clone(specs).map(normalizeSpec);
    const feasible = [];
    const impossible = [];

    for (const item of items) {
      const candidates = targetId && targetId !== 'auto'
        ? safeSpecs.filter(spec => spec.id === targetId)
        : safeSpecs;
      if (candidates.some(spec => fitsEmptyBin(item, spec, options))) feasible.push(item);
      else impossible.push(item);
    }

    const result = targetId && targetId !== 'auto'
      ? planFixed(feasible, safeSpecs.find(spec => spec.id === targetId), options)
      : planAuto(feasible, safeSpecs, options);

    result.unplaced.push(...impossible);
    result.totalItems = items.length;
    result.loadedItems = result.bins.reduce((sum, bin) => sum + bin.placements.length, 0);
    result.totalCostIndex = result.bins.reduce((sum, bin) => sum + bin.cost, 0);
    result.runtime = now() - started;
    return result;
  }

  function planFixed(items, spec, options) {
    if (!spec) return { bins: [], unplaced: items.slice() };
    let remaining = items.slice();
    const bins = [];
    for (let i = 0; i < MAX_BINS && remaining.length; i += 1) {
      const packed = packSingleBin(spec, remaining, options);
      if (!packed.placements.length) break;
      bins.push(makeBin(spec, packed, bins.length));
      const loaded = new Set(packed.placements.map(p => p.item.instanceId));
      remaining = remaining.filter(item => !loaded.has(item.instanceId));
    }
    return { bins, unplaced: remaining };
  }

  function planAuto(items, specs, options) {
    if (!items.length) return { bins: [], unplaced: [] };

    const cache = new Map();
    let beam = [{ remaining: items.slice(), bins: [], cost: 0, estimated: lowerBound(items, specs, options) }];
    let bestComplete = null;
    let bestPartial = beam[0];

    for (let depth = 0; depth < MAX_BINS && beam.length; depth += 1) {
      const nextByKey = new Map();

      for (const node of beam) {
        for (const spec of specs) {
          if (!node.remaining.some(item => fitsEmptyBin(item, spec, options))) continue;
          const key = `${exactStateKey(node.remaining)}|${spec.id}|${optionsKey(options)}`;
          let packed = cache.get(key);
          if (!packed) {
            packed = packSingleBin(spec, node.remaining, options);
            cache.set(key, packed);
          }
          if (!packed.placements.length) continue;

          const loaded = new Set(packed.placements.map(p => p.item.instanceId));
          const remaining = node.remaining.filter(item => !loaded.has(item.instanceId));
          const bins = node.bins.concat(makeBin(spec, packed, node.bins.length));
          const cost = node.cost + spec.cost;
          const candidate = {
            remaining,
            bins,
            cost,
            estimated: cost + lowerBound(remaining, specs, options)
          };

          if (!remaining.length) {
            if (!bestComplete || compareComplete(candidate, bestComplete) < 0) bestComplete = candidate;
            continue;
          }

          if (!bestPartial || comparePartial(candidate, bestPartial) < 0) bestPartial = candidate;
          const state = countStateKey(remaining);
          const prior = nextByKey.get(state);
          if (!prior || comparePartial(candidate, prior) < 0) nextByKey.set(state, candidate);
        }
      }

      const next = [...nextByKey.values()].sort(comparePartial).slice(0, BEAM_WIDTH);
      if (bestComplete && (!next.length || next[0].estimated >= bestComplete.cost - EPS)) break;
      beam = next;
    }

    if (bestComplete) return { bins: bestComplete.bins, unplaced: [] };

    // Deterministic fallback if beam search cannot finish within its bound.
    const fallback = greedyPlan(items, specs, options);
    if (!bestPartial || fallback.unplaced.length < bestPartial.remaining.length) return fallback;
    return { bins: bestPartial.bins, unplaced: bestPartial.remaining };
  }

  function greedyPlan(items, specs, options) {
    let remaining = items.slice();
    const bins = [];
    for (let i = 0; i < MAX_BINS && remaining.length; i += 1) {
      const candidates = specs.map(spec => ({ spec, packed: packSingleBin(spec, remaining, options) }))
        .filter(entry => entry.packed.placements.length);
      if (!candidates.length) break;
      candidates.sort((a, b) => {
        const av = a.packed.loadedVolume / Math.max(a.spec.cost, EPS);
        const bv = b.packed.loadedVolume / Math.max(b.spec.cost, EPS);
        return bv - av || b.packed.placements.length - a.packed.placements.length || a.spec.cost - b.spec.cost;
      });
      const chosen = candidates[0];
      bins.push(makeBin(chosen.spec, chosen.packed, bins.length));
      const loaded = new Set(chosen.packed.placements.map(p => p.item.instanceId));
      remaining = remaining.filter(item => !loaded.has(item.instanceId));
    }
    return { bins, unplaced: remaining };
  }

  function packSingleBin(spec, inputItems, options) {
    const orderings = createOrderings(inputItems, options.priority);
    let best = null;
    for (const ordered of orderings) {
      const packed = packOrdered(spec, ordered, options);
      if (!best || comparePacked(packed, best) < 0) best = packed;
      if (best.placements.length === inputItems.length) break;
    }
    return best || { placements: [], unplaced: inputItems.slice(), totalWeight: 0, loadedVolume: 0 };
  }

  function createOrderings(items, priority) {
    const comparators = {
      sequence: (a, b) => a.cargoOrder - b.cargoOrder || a.sequence - b.sequence,
      volume: (a, b) => b.volume - a.volume || b.weight - a.weight || maxSide(b) - maxSide(a),
      base: (a, b) => Math.max(b.length * b.width, b.length * b.height, b.width * b.height) - Math.max(a.length * a.width, a.length * a.height, a.width * a.height) || b.volume - a.volume,
      weight: (a, b) => b.weight - a.weight || b.volume - a.volume,
      maxSide: (a, b) => maxSide(b) - maxSide(a) || b.volume - a.volume,
      height: (a, b) => b.height - a.height || b.volume - a.volume
    };
    if (priority === 'sequence') return [items.slice().sort(comparators.sequence)];
    const order = [priority, 'volume', 'base', 'maxSide', 'weight', 'height'];
    const unique = [];
    const seen = new Set();
    for (const name of order) {
      const comparator = comparators[name] || comparators.volume;
      const sorted = items.slice().sort(comparator);
      const key = sorted.map(item => item.instanceId).join('|');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(sorted);
      }
      if (unique.length >= 5) break;
    }
    return unique;
  }

  function packOrdered(spec, items, options) {
    const placements = [];
    let totalWeight = 0;
    let loadedVolume = 0;
    let pivots = [{ x: 0, y: 0, z: 0 }];

    for (const item of items) {
      if (options.enforceWeight !== false && totalWeight + item.weight > spec.maxWeight + EPS) continue;
      if (loadedVolume + item.volume > practicalVolume(spec) + EPS) continue;

      let best = null;
      const orientations = getOrientations(item, options.rotation);
      const orientationCaps = orientations.map(dims => Math.floor(spec.length / dims.length) * Math.floor(spec.width / dims.width) * Math.floor(spec.height / dims.height));
      const bestOrientationCap = Math.max(...orientationCaps, 0);
      for (const pivot of pivots) {
        for (let orientationIndex = 0; orientationIndex < orientations.length; orientationIndex += 1) {
          const dims = orientations[orientationIndex];
          const candidate = { x: pivot.x, y: pivot.y, z: pivot.z, ...dims };
          if (!insideBin(candidate, spec)) continue;
          if (placements.some(placed => overlaps(candidate, placed))) continue;
          const support = supportInfo(candidate, item, placements, options);
          if (!support.valid) continue;

          const orientationPenalty = Math.max(0, bestOrientationCap - orientationCaps[orientationIndex]);
          const score = placementScore(candidate, support, placements, spec, orientationPenalty);
          if (!best || score < best.score) best = { ...candidate, ...support, score };
        }
      }

      if (!best) continue;
      const placement = {
        x: best.x,
        y: best.y,
        z: best.z,
        length: best.length,
        width: best.width,
        height: best.height,
        supportRatio: best.ratio,
        layer: best.layer,
        stackDepth: best.stackDepth,
        item
      };
      placements.push(placement);
      totalWeight += item.weight;
      loadedVolume += item.volume;
      pivots = buildPivots(placements, spec);
    }

    const loadedIds = new Set(placements.map(p => p.item.instanceId));
    return {
      placements,
      unplaced: items.filter(item => !loadedIds.has(item.instanceId)),
      totalWeight,
      loadedVolume
    };
  }

  function buildPivots(placements, spec) {
    const levels = uniqueNumbers([0].concat(placements.map(p => p.z + p.height))).filter(z => z <= spec.height + EPS);
    const points = [];
    const seen = new Set();

    for (const z of levels) {
      const xs = [0];
      const ys = [0];
      for (const p of placements) {
        if (z >= p.z - EPS && z <= p.z + p.height + EPS) {
          xs.push(p.x, p.x + p.length);
          ys.push(p.y, p.y + p.width);
        }
      }
      const ux = uniqueNumbers(xs).filter(x => x >= -EPS && x <= spec.length + EPS);
      const uy = uniqueNumbers(ys).filter(y => y >= -EPS && y <= spec.width + EPS);
      for (const x of ux) {
        for (const y of uy) {
          const point = { x: clean(x), y: clean(y), z: clean(z) };
          if (pointInsideAny(point, placements)) continue;
          const key = `${point.x}|${point.y}|${point.z}`;
          if (!seen.has(key)) {
            seen.add(key);
            points.push(point);
          }
        }
      }
    }

    points.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    return points.slice(0, 4500);
  }

  function supportInfo(candidate, item, placements, options) {
    if (candidate.z <= EPS) return { valid: true, ratio: 1, layer: 1, stackDepth: 1 };
    if (options.stacking === false) return { valid: false, ratio: 0, layer: 1, stackDepth: 1 };

    let supportArea = 0;
    let maxLayer = 0;
    let maxStackDepth = 0;
    let blocked = false;
    for (const p of placements) {
      if (Math.abs((p.z + p.height) - candidate.z) > EPS) continue;
      const area = overlapArea2d(candidate, p);
      if (area <= EPS) continue;
      supportArea += area;
      maxLayer = Math.max(maxLayer, p.layer || 1);
      maxStackDepth = Math.max(maxStackDepth, p.stackDepth || 1);
      if (p.item.noTop || (p.stackDepth || 1) >= (p.item.maxStack || 99)) blocked = true;
    }

    const ratio = Math.min(1, supportArea / Math.max(candidate.length * candidate.width, EPS));
    const stackDepth = maxStackDepth + 1;
    const valid = !blocked && ratio + EPS >= options.minSupport && stackDepth <= (item.maxStack || 99);
    return { valid, ratio, layer: maxLayer + 1, stackDepth };
  }

  function placementScore(candidate, support, placements, spec, orientationPenalty) {
    const extents = placements.reduce((acc, p) => ({
      x: Math.max(acc.x, p.x + p.length),
      y: Math.max(acc.y, p.y + p.width),
      z: Math.max(acc.z, p.z + p.height)
    }), { x: 0, y: 0, z: 0 });
    const bx = Math.max(extents.x, candidate.x + candidate.length);
    const by = Math.max(extents.y, candidate.y + candidate.width);
    const bz = Math.max(extents.z, candidate.z + candidate.height);
    const boundingVolume = bx * by * bz;
    const wallContacts = countContacts(candidate, placements, spec);
    const residual = (spec.length - candidate.x - candidate.length) + (spec.width - candidate.y - candidate.width);
    const remainingLength = Math.max(0, spec.length - candidate.x);
    const remainingWidth = Math.max(0, spec.width - candidate.y);
    const orientationSlack = (remainingLength % candidate.length) + (remainingWidth % candidate.width);
    return candidate.z * 1e12 + orientationPenalty * 1e11 + candidate.y * 1e8 + candidate.x * 1e4 + orientationSlack * 1e3 + boundingVolume * 1e-3 + residual - support.ratio * 500 - wallContacts * 100;
  }

  function countContacts(candidate, placements, spec) {
    let contacts = 0;
    if (Math.abs(candidate.x) <= EPS || Math.abs(candidate.x + candidate.length - spec.length) <= EPS) contacts += 1;
    if (Math.abs(candidate.y) <= EPS || Math.abs(candidate.y + candidate.width - spec.width) <= EPS) contacts += 1;
    if (Math.abs(candidate.z) <= EPS) contacts += 1;
    for (const p of placements) {
      const touchX = Math.abs(candidate.x + candidate.length - p.x) <= EPS || Math.abs(p.x + p.length - candidate.x) <= EPS;
      const overlapYZ = rangesOverlap(candidate.y, candidate.y + candidate.width, p.y, p.y + p.width) && rangesOverlap(candidate.z, candidate.z + candidate.height, p.z, p.z + p.height);
      const touchY = Math.abs(candidate.y + candidate.width - p.y) <= EPS || Math.abs(p.y + p.width - candidate.y) <= EPS;
      const overlapXZ = rangesOverlap(candidate.x, candidate.x + candidate.length, p.x, p.x + p.length) && rangesOverlap(candidate.z, candidate.z + candidate.height, p.z, p.z + p.height);
      if (touchX && overlapYZ) contacts += 1;
      if (touchY && overlapXZ) contacts += 1;
    }
    return contacts;
  }

  function makeBin(spec, packed, index) {
    return {
      ...clone(spec),
      binIndex: index,
      placements: packed.placements,
      totalWeight: packed.totalWeight,
      loadedVolume: packed.loadedVolume,
      cost: spec.cost
    };
  }

  function comparePacked(a, b) {
    if (a.loadedVolume !== b.loadedVolume) return b.loadedVolume - a.loadedVolume;
    if (a.placements.length !== b.placements.length) return b.placements.length - a.placements.length;
    if (a.totalWeight !== b.totalWeight) return b.totalWeight - a.totalWeight;
    return compactness(a.placements) - compactness(b.placements);
  }

  function compareComplete(a, b) {
    if (Math.abs(a.cost - b.cost) > EPS) return a.cost - b.cost;
    if (a.bins.length !== b.bins.length) return a.bins.length - b.bins.length;
    return unusedCapacity(a.bins) - unusedCapacity(b.bins);
  }

  function comparePartial(a, b) {
    if (Math.abs(a.estimated - b.estimated) > EPS) return a.estimated - b.estimated;
    if (a.remaining.length !== b.remaining.length) return a.remaining.length - b.remaining.length;
    if (Math.abs(a.cost - b.cost) > EPS) return a.cost - b.cost;
    return a.bins.length - b.bins.length;
  }

  function lowerBound(items, specs, options) {
    if (!items.length) return 0;
    const volume = items.reduce((sum, item) => sum + item.volume, 0) / 1e9;
    const weight = items.reduce((sum, item) => sum + item.weight, 0);
    const volumeRatio = Math.min(...specs.map(spec => spec.cost / Math.max(spec.maxCbm, EPS)));
    const weightRatio = options.enforceWeight === false ? 0 : Math.min(...specs.map(spec => spec.cost / Math.max(spec.maxWeight, EPS)));
    return Math.max(volume * volumeRatio, weight * weightRatio);
  }

  function unusedCapacity(bins) {
    return bins.reduce((sum, bin) => sum + Math.max(0, bin.maxCbm - bin.loadedVolume / 1e9), 0);
  }

  function compactness(placements) {
    if (!placements.length) return Infinity;
    let x = 0, y = 0, z = 0;
    for (const p of placements) {
      x = Math.max(x, p.x + p.length);
      y = Math.max(y, p.y + p.width);
      z = Math.max(z, p.z + p.height);
    }
    return x * y * z;
  }

  function countStateKey(items) {
    const counts = new Map();
    for (const item of items) counts.set(item.cargoId, (counts.get(item.cargoId) || 0) + 1);
    return [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([id, count]) => `${id}:${count}`).join('|');
  }

  function exactStateKey(items) {
    return items.map(item => item.instanceId).sort().join('|');
  }

  function optionsKey(options) {
    return [options.rotation, options.priority, options.stacking ? 1 : 0, options.enforceWeight ? 1 : 0, options.minSupport].join('|');
  }

  function normalizeOptions(options) {
    return {
      rotation: ['fixed', 'horizontal', 'six'].includes(options && options.rotation) ? options.rotation : 'horizontal',
      priority: ['volume', 'base', 'weight', 'sequence'].includes(options && options.priority) ? options.priority : 'volume',
      stacking: !options || options.stacking !== false,
      enforceWeight: !options || options.enforceWeight !== false,
      minSupport: clamp(Number(options && options.minSupport) || 0.6, 0.3, 1)
    };
  }

  function normalizeSpec(spec) {
    const normalized = { ...spec };
    normalized.length = positive(spec.length);
    normalized.width = positive(spec.width);
    normalized.height = positive(spec.height);
    normalized.maxWeight = positive(spec.maxWeight);
    normalized.maxCbm = positive(spec.maxCbm || (normalized.length * normalized.width * normalized.height / 1e9));
    normalized.cost = positive(spec.cost || 1);
    return normalized;
  }

  function practicalVolume(spec) {
    return positive(spec.maxCbm) * 1e9;
  }

  function insideBin(box, spec) {
    return box.x >= -EPS && box.y >= -EPS && box.z >= -EPS &&
      box.x + box.length <= spec.length + EPS &&
      box.y + box.width <= spec.width + EPS &&
      box.z + box.height <= spec.height + EPS;
  }

  function overlaps(a, b) {
    return a.x < b.x + b.length - EPS && a.x + a.length > b.x + EPS &&
      a.y < b.y + b.width - EPS && a.y + a.width > b.y + EPS &&
      a.z < b.z + b.height - EPS && a.z + a.height > b.z + EPS;
  }

  function overlapArea2d(a, b) {
    const x = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y));
    return x * y;
  }

  function pointInsideAny(point, placements) {
    return placements.some(p =>
      point.x > p.x + EPS && point.x < p.x + p.length - EPS &&
      point.y > p.y + EPS && point.y < p.y + p.width - EPS &&
      point.z > p.z + EPS && point.z < p.z + p.height - EPS
    );
  }

  function rangesOverlap(a1, a2, b1, b2) {
    return Math.min(a2, b2) - Math.max(a1, b1) > EPS;
  }

  function uniqueNumbers(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const cleanValue = clean(value);
      const key = String(cleanValue);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(cleanValue);
      }
    }
    return result.sort((a, b) => a - b);
  }

  function maxSide(item) {
    return Math.max(item.length, item.width, item.height);
  }

  function positive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 1;
  }

  function clean(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  return {
    DEFAULT_VEHICLES,
    DEFAULT_CONTAINERS,
    expandCargos,
    getOrientations,
    fitsEmptyBin,
    packSingleBin,
    planLoad,
    clone
  };
});

(() => {
  'use strict';

  const STORAGE_KEY = 'kbridge-load-planner-v13';
  const SETTINGS_KEY = 'kbridge-load-planner-specs-v13';
  const MAX_EXPANDED_ITEMS = 800;
  const EPS = 0.001;

  const CORE = window.KBridgePlanner;
  if (!CORE) throw new Error('KBridgePlanner core was not loaded.');
  const DEFAULT_VEHICLES = CORE.clone(CORE.DEFAULT_VEHICLES);
  const DEFAULT_CONTAINERS = CORE.clone(CORE.DEFAULT_CONTAINERS);

  const SAMPLE_CARGOS = [
    { id: uid(), name: '박스 A', length: 1100, width: 850, height: 900, qty: 24, weight: 120, maxStack: 99, noTop: false, color: '#2f75d6' },
    { id: uid(), name: '박스 B', length: 600, width: 500, height: 400, qty: 40, weight: 35, maxStack: 99, noTop: false, color: '#24a7c4' }
  ];

  const state = {
    mode: 'vehicle',
    cargos: [],
    specs: { vehicle: clone(DEFAULT_VEHICLES), container: clone(DEFAULT_CONTAINERS) },
    result: null,
    selectedBin: 0,
    settingsTab: 'vehicle',
    camera: { yaw: -0.72, pitch: -0.58, zoom: 1, dragging: false, lastX: 0, lastY: 0 },
    hitPolygons: [],
    route: { direction: 'import', origin: '', destination: '', destinationDetail: '', zonecode: '' },
    cargoQuery: '',
    cargoExpanded: false
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    loadSavedState();
    bindEvents();
    updateModeUI();
    renderRouteInputs();
    renderCargoList();
    updateSummary();
    resizeCanvas();
  }

  function cacheElements() {
    const ids = [
      'sampleBtn','settingsBtn','runTopBtn','runBtn','addCargoBtn','emptyAddBtn','cargoList','cargoEmpty','cargoSummary',
      'heroSku','heroQty','heroCbm','heroWeight','sumSku','sumQty','sumCbm','sumWeight','targetLabel','targetSelect',
      'rotationSelect','prioritySelect','stackingCheck','weightCheck','supportRange','supportValue','modeDescription',
      'resultPlaceholder','resultContent','resultUnitLabel','resultBinCount','resultLoaded','resultSpaceRate','resultWeightRate',
      'warningBox','planSummary','binCards','binTabs','loadCanvas','legend','downloadImageBtn','printBtn','resetViewBtn','boxTooltip',
      'cargoDialog','cargoForm','cargoDialogTitle','cargoId','cargoName','cargoLength','cargoWidth','cargoHeight','cargoQty',
      'cargoWeight','cargoStackMode','cargoRotationMode','cargoDialogSummary','cargoMaxStack','cargoColor','cargoNoTop','settingsDialog','settingsForm','settingsTableBody',
      'saveSettingsBtn','resetSettingsBtn','importBtn','cargoFileInput','fileImportStatus','quoteRequestBtn','quoteCopyStatus',
      'routeDirection','routeOrigin','routeDestination','routeDestinationDetail','destinationAddressBtn','routeSwapBtn','viewerDiagnostic',
      'resetCargoBtn','cargoSearch','cargoListCount','cargoListToggle','cargoListTools','simulationTitle','simulationSubtitle',
      'selectedBinBadge','binVolumeUsageText','binVolumeRate','binVolumeBar','binWeightUsageText','binWeightRate','binWeightBar',
      'resultStatusStack','resultCargoTableBody','itemDetailCount','optionTitle','runButtonLabel','runButtonHelp','inlineQuoteLink','quoteConnect','resultPlaceholderTitle','resultPlaceholderText','containerModeNote'
    ];
    ids.forEach(id => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => addPreset(btn.dataset.preset)));
    document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setCameraView(btn.dataset.view)));
    document.querySelectorAll('[data-settings-tab]').forEach(btn => btn.addEventListener('click', () => setSettingsTab(btn.dataset.settingsTab)));

    els.addCargoBtn.addEventListener('click', () => openCargoDialog());
    els.emptyAddBtn.addEventListener('click', () => openCargoDialog());
    els.resetCargoBtn.addEventListener('click', resetCargoInput);
    els.cargoSearch.addEventListener('input', () => {
      state.cargoQuery = els.cargoSearch.value;
      state.cargoExpanded = false;
      renderCargoList();
    });
    els.cargoListToggle.addEventListener('click', () => {
      state.cargoExpanded = !state.cargoExpanded;
      renderCargoList();
    });
    if (els.sampleBtn) els.sampleBtn.addEventListener('click', loadSample);
    if (els.settingsBtn) els.settingsBtn.addEventListener('click', openSettingsDialog);
    els.runBtn.addEventListener('click', runCalculation);
    if (els.runTopBtn) els.runTopBtn.addEventListener('click', runCalculation);
    els.supportRange.addEventListener('input', () => { els.supportValue.textContent = `${els.supportRange.value}%`; });
    els.cargoForm.addEventListener('submit', handleCargoSubmit);
    [els.cargoLength, els.cargoWidth, els.cargoHeight, els.cargoQty, els.cargoWeight].forEach(input => input && input.addEventListener('input', updateCargoDialogSummary));
    els.settingsForm.addEventListener('submit', handleSettingsSubmit);
    els.resetSettingsBtn.addEventListener('click', resetSettings);
    els.downloadImageBtn.addEventListener('click', downloadCanvasImage);
    els.printBtn.addEventListener('click', () => window.print());
    els.resetViewBtn.addEventListener('click', () => setCameraView('iso'));
    els.importBtn.addEventListener('click', () => els.cargoFileInput.click());
    els.cargoFileInput.addEventListener('change', importCargoFile);
    [els.routeDirection, els.routeOrigin, els.routeDestination, els.routeDestinationDetail].forEach(input => input.addEventListener('change', syncRouteFromInputs));
    [els.routeOrigin, els.routeDestinationDetail].forEach(input => input.addEventListener('input', debounce(syncRouteFromInputs, 180)));
    els.routeDestination.addEventListener('click', openDestinationAddressSearch);
    els.destinationAddressBtn.addEventListener('click', openDestinationAddressSearch);
    els.routeSwapBtn.addEventListener('click', swapRoute);
    if (els.quoteRequestBtn) els.quoteRequestBtn.addEventListener('click', handleQuoteRequest);

    const canvas = els.loadCanvas;
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('pointerup', onCanvasPointerUp);
    canvas.addEventListener('pointercancel', onCanvasPointerUp);
    canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
    canvas.addEventListener('click', onCanvasClick);
    window.addEventListener('resize', debounce(resizeCanvas, 120));
  }

  function setMode(mode) {
    state.mode = mode;
    state.result = null;
    document.querySelectorAll('[data-mode]').forEach(btn => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    updateModeUI();
    clearResult();
    persistState();
  }

  function updateModeUI() {
    const isVehicle = state.mode === 'vehicle';
    document.body.classList.toggle('container-planner-mode', !isVehicle);
    els.modeDescription.textContent = isVehicle
      ? '다마스부터 25톤까지 실무 CBM·중량·실제 배치를 동시에 비교해 최소 비용 배차 조합을 찾습니다.'
      : '20FT DRY부터 45FT HIGH CUBE까지 내부 제원·CBM·중량과 실제 배치를 비교해 적합한 규격과 수량을 찾습니다.';
    els.targetLabel.textContent = isVehicle ? '차량 선택' : '컨테이너 선택';
    if (els.optionTitle) els.optionTitle.textContent = isVehicle ? '차량 · 적입 옵션' : '컨테이너 · 적입 옵션';
    if (els.runButtonLabel) els.runButtonLabel.textContent = isVehicle ? '적입 계산 실행' : '컨테이너 적입 계산 실행';
    if (els.runButtonHelp) els.runButtonHelp.textContent = isVehicle ? '실제 박스 배치 기준으로 자동 계산' : '컨테이너 내부 제원과 실제 박스 배치 기준';
    els.resultUnitLabel.textContent = isVehicle ? '추천 차량' : '추천 컨테이너';
    const resultTitleEl = document.getElementById('resultTitle');
    if (resultTitleEl) resultTitleEl.textContent = isVehicle ? '차량 자동 추천 및 적입 결과' : '컨테이너 자동 추천 및 적입 결과';
    if (els.resultPlaceholderTitle) els.resultPlaceholderTitle.textContent = isVehicle
      ? '화물 정보를 입력한 뒤 적입 계산을 실행하세요.'
      : '화물을 입력하고 컨테이너 적입 계산을 실행하세요.';
    if (els.resultPlaceholderText) els.resultPlaceholderText.innerHTML = isVehicle
      ? '화물 입력과 적입 옵션 설정을 완료한 뒤 계산을 실행하세요.<br/>추천 차량·추천 조합·공간 사용률·중량 사용률과 실제 화물 배치를 확인할 수 있습니다.'
      : '계산을 실행하면 추천 컨테이너 규격과 수량,<br/>공간·중량 사용률과 실제 적입 배치가 표시됩니다.';
    populateTargetSelect();
  }

  function populateTargetSelect() {
    const specs = state.specs[state.mode];
    const autoLabel = state.mode === 'container' ? '자동 추천 (최소 비용)' : '자동 추천 (최소 비용 조합)';
    els.targetSelect.innerHTML = `<option value="auto">${autoLabel}</option>` + specs.map(spec => {
      const cbm = Number(spec.maxCbm || (binVolume(spec) / 1e9));
      return `<option value="${escapeHtml(spec.id)}">${escapeHtml(spec.name)} — ${formatNumber(cbm, 1)} CBM / ${formatNumber(spec.maxWeight, 0)} kg</option>`;
    }).join('');
  }

  function updateCargoDialogSummary() {
    if (!els.cargoDialogSummary) return;
    const length = Math.max(0, Number(els.cargoLength.value) || 0);
    const width = Math.max(0, Number(els.cargoWidth.value) || 0);
    const height = Math.max(0, Number(els.cargoHeight.value) || 0);
    const qty = Math.max(1, Math.floor(Number(els.cargoQty.value) || 1));
    const totalWeight = Math.max(0, Number(els.cargoWeight.value) || 0);
    const totalCbm = length * width * height * qty / 1e9;
    const unitWeight = qty ? totalWeight / qty : 0;
    els.cargoDialogSummary.textContent = `총 ${formatNumber(totalCbm,3)} CBM · ${formatNumber(totalWeight,1)} kg · 개당 ${formatNumber(unitWeight,1)} kg`;
  }

  function openCargoDialog(cargo = null) {
    els.cargoDialogTitle.textContent = cargo ? '품목 수정' : '품목 추가';
    els.cargoId.value = cargo?.id || '';
    els.cargoName.value = cargo?.name || '박스';
    els.cargoLength.value = cargo?.length || 500;
    els.cargoWidth.value = cargo?.width || 400;
    els.cargoHeight.value = cargo?.height || 400;
    els.cargoQty.value = cargo?.qty || 10;
    els.cargoWeight.value = cargo ? Number(cargo.weight || 0) * Number(cargo.qty || 1) : 200;
    const stackMode = cargo?.stackMode || ((cargo?.noTop || Number(cargo?.maxStack || 99) <= 1) ? 'blocked' : 'global');
    els.cargoStackMode.value = stackMode;
    els.cargoRotationMode.value = cargo?.rotationMode || 'global';
    els.cargoMaxStack.value = cargo?.maxStack || 99;
    els.cargoColor.value = cargo?.color || nextColor(state.cargos.length);
    els.cargoNoTop.checked = Boolean(cargo?.noTop);
    updateCargoDialogSummary();
    els.cargoDialog.showModal();
    setTimeout(() => els.cargoName.focus(), 50);
  }

  function handleCargoSubmit(event) {
    const submitter = event.submitter;
    if (!submitter || submitter.value === 'cancel') return;
    event.preventDefault();
    if (!els.cargoForm.reportValidity()) return;

    const qty = Math.max(1, Math.floor(positiveNumber(els.cargoQty.value)));
    const totalWeight = Math.max(0, Number(els.cargoWeight.value) || 0);
    const stackMode = els.cargoStackMode.value || 'global';
    const cargo = {
      id: els.cargoId.value || uid(),
      name: els.cargoName.value.trim(),
      length: positiveNumber(els.cargoLength.value),
      width: positiveNumber(els.cargoWidth.value),
      height: positiveNumber(els.cargoHeight.value),
      qty,
      weight: totalWeight / qty,
      maxStack: stackMode === 'blocked' ? 1 : 99,
      noTop: stackMode === 'blocked',
      stackMode,
      rotationMode: els.cargoRotationMode.value || 'global',
      color: els.cargoColor.value || nextColor(state.cargos.length)
    };

    const index = state.cargos.findIndex(item => item.id === cargo.id);
    if (index >= 0) state.cargos[index] = cargo;
    else state.cargos.push(cargo);

    state.result = null;
    renderCargoList();
    updateSummary();
    clearResult();
    persistState();
    els.cargoDialog.close();
  }

  function addPreset(type) {
    const presetMap = {
      box: { name: '일반 박스', length: 500, width: 400, height: 350, qty: 1, weight: 10, maxStack: 6, noTop: false },
      pallet1100: { name: '파렛트 화물 1100', length: 1100, width: 1100, height: 1200, qty: 1, weight: 500, maxStack: 1, noTop: true },
      pallet1200: { name: '파렛트 화물 1200', length: 1200, width: 1000, height: 1200, qty: 1, weight: 500, maxStack: 1, noTop: true }
    };
    const p = presetMap[type];
    if (!p) return;
    state.cargos.push({ id: uid(), ...p, color: nextColor(state.cargos.length) });
    renderCargoList();
    updateSummary();
    clearResult();
    persistState();
  }

  function renderCargoList() {
    els.cargoList.innerHTML = '';
    const hasCargo = state.cargos.length > 0;
    els.cargoEmpty.classList.toggle('hidden', hasCargo);
    els.cargoSummary.classList.toggle('hidden', !hasCargo);
    els.cargoListTools.classList.toggle('hidden', !hasCargo);

    const query = String(state.cargoQuery || '').trim().toLowerCase();
    if (els.cargoSearch.value !== state.cargoQuery) els.cargoSearch.value = state.cargoQuery;
    const filtered = state.cargos.filter(cargo => {
      if (!query) return true;
      const searchable = `${cargo.name} ${cargo.length}x${cargo.width}x${cargo.height} ${cargo.length}×${cargo.width}×${cargo.height}`.toLowerCase();
      return searchable.includes(query);
    });
    const limit = 6;
    const visible = state.cargoExpanded ? filtered : filtered.slice(0, limit);
    els.cargoListCount.textContent = query
      ? `검색 ${filtered.length}종 / 전체 ${state.cargos.length}종`
      : `전체 ${state.cargos.length}종 · 표시 ${visible.length}종`;
    els.cargoListToggle.classList.toggle('hidden', filtered.length <= limit);
    els.cargoListToggle.textContent = state.cargoExpanded ? '목록 접기' : `전체 ${filtered.length}종 보기`;

    if (hasCargo && filtered.length === 0) {
      els.cargoList.innerHTML = '<div class="cargo-no-result">검색 결과가 없습니다.</div>';
      return;
    }

    visible.forEach((cargo, visibleIndex) => {
      const itemCbm = cargo.length * cargo.width * cargo.height / 1e9;
      const totalCbm = itemCbm * cargo.qty;
      const originalIndex = state.cargos.findIndex(item => item.id === cargo.id);
      const card = document.createElement('article');
      card.className = 'cargo-card compact-cargo-card';
      card.innerHTML = `
        <span class="cargo-sequence">${originalIndex + 1}</span>
        <span class="cargo-color" style="background:${safeColor(cargo.color)}"></span>
        <div class="cargo-main">
          <div class="cargo-title-row"><strong>${escapeHtml(cargo.name)}</strong><span>${formatNumber(cargo.qty,0)}개</span></div>
          <p>${formatNumber(cargo.length,0)} × ${formatNumber(cargo.width,0)} × ${formatNumber(cargo.height,0)} mm</p>
          <div class="cargo-meta"><span>${formatNumber(totalCbm,3)} CBM</span><span>${formatNumber(cargo.weight * cargo.qty,1)} kg</span><span>${cargo.maxStack >= 99 ? '적층 제한 없음' : `최대 ${cargo.maxStack}단`}</span>${cargo.noTop ? '<span>상단 적재 금지</span>' : ''}</div>
        </div>
        <div class="cargo-card-actions">
          <button class="mini-btn edit" type="button" aria-label="${escapeHtml(cargo.name)} 수정">수정</button>
          <button class="mini-btn delete" type="button" aria-label="${escapeHtml(cargo.name)} 삭제">삭제</button>
        </div>`;
      card.querySelector('.edit').addEventListener('click', () => openCargoDialog(cargo));
      card.querySelector('.delete').addEventListener('click', () => {
        state.cargos = state.cargos.filter(item => item.id !== cargo.id);
        if (state.cargos.length <= limit) state.cargoExpanded = false;
        renderCargoList(); updateSummary(); clearResult(); persistState();
      });
      els.cargoList.appendChild(card);
    });
  }

  function resetCargoInput() {
    if (!state.cargos.length) return;
    if (!confirm('입력한 모든 화물과 계산 결과를 초기화할까요?')) return;
    state.cargos = [];
    state.cargoQuery = '';
    state.cargoExpanded = false;
    els.cargoSearch.value = '';
    renderCargoList();
    updateSummary();
    clearResult();
    persistState();
  }

  function updateSummary() {
    const summary = state.cargos.reduce((acc, cargo) => {
      acc.qty += cargo.qty;
      acc.cbm += cargo.length * cargo.width * cargo.height * cargo.qty / 1e9;
      acc.weight += cargo.weight * cargo.qty;
      return acc;
    }, { qty: 0, cbm: 0, weight: 0 });

    els.heroSku.textContent = state.cargos.length;
    els.heroQty.textContent = formatNumber(summary.qty, 0);
    els.heroCbm.textContent = formatNumber(summary.cbm, 3);
    els.heroWeight.textContent = formatNumber(summary.weight, summary.weight % 1 ? 1 : 0);
    els.sumSku.textContent = `${state.cargos.length}종`;
    els.sumQty.textContent = `${formatNumber(summary.qty,0)}개`;
    els.sumCbm.textContent = `${formatNumber(summary.cbm,3)} CBM`;
    els.sumWeight.textContent = `${formatNumber(summary.weight,1)} kg`;
  }

  function loadSample() {
    state.cargos = SAMPLE_CARGOS.map(item => ({ ...clone(item), id: uid() }));
    state.cargoQuery = '';
    state.cargoExpanded = false;
    renderCargoList();
    updateSummary();
    clearResult();
    persistState();
    window.scrollTo({ top: document.querySelector('.workspace').offsetTop - 70, behavior: 'smooth' });
  }

  function openSettingsDialog() {
    state.settingsTab = state.mode;
    setSettingsTab(state.settingsTab);
    els.settingsDialog.showModal();
  }

  function setSettingsTab(tab) {
    state.settingsTab = tab;
    document.querySelectorAll('[data-settings-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.settingsTab === tab));
    renderSettingsTable();
  }

  function renderSettingsTable() {
    const specs = state.specs[state.settingsTab];
    els.settingsTableBody.innerHTML = specs.map((spec, index) => `
      <tr data-id="${escapeHtml(spec.id)}" data-index="${index}">
        <td><input data-key="name" type="text" value="${escapeHtml(spec.name)}" /></td>
        <td><input data-key="length" type="number" min="1" value="${spec.length}" /></td>
        <td><input data-key="width" type="number" min="1" value="${spec.width}" /></td>
        <td><input data-key="height" type="number" min="1" value="${spec.height}" /></td>
        <td><input data-key="maxWeight" type="number" min="1" value="${spec.maxWeight}" /></td>
        <td><input data-key="maxCbm" type="number" min="0.1" step="0.1" value="${spec.maxCbm}" /></td>
        <td><input data-key="cost" type="number" min="0.01" step="0.01" value="${spec.cost}" /></td>
      </tr>`).join('');
  }

  function handleSettingsSubmit(event) {
    const submitter = event.submitter;
    if (!submitter || submitter.value === 'cancel') return;
    event.preventDefault();
    readSettingsTable();
    safeStorageSet(SETTINGS_KEY, JSON.stringify(state.specs));
    populateTargetSelect();
    clearResult();
    els.settingsDialog.close();
  }

  function readSettingsTable() {
    [...els.settingsTableBody.querySelectorAll('tr')].forEach(row => {
      const spec = state.specs[state.settingsTab][Number(row.dataset.index)];
      row.querySelectorAll('input').forEach(input => {
        const key = input.dataset.key;
        spec[key] = key === 'name' ? input.value.trim() : positiveNumber(input.value);
      });
    });
  }

  function resetSettings() {
    if (!confirm('현재 규격을 기본값으로 복원할까요?')) return;
    state.specs = { vehicle: clone(DEFAULT_VEHICLES), container: clone(DEFAULT_CONTAINERS) };
    safeStorageSet(SETTINGS_KEY, JSON.stringify(state.specs));
    renderSettingsTable();
    populateTargetSelect();
    clearResult();
  }

  function runCalculation() {
    if (!state.cargos.length) {
      openCargoDialog();
      return;
    }
    const totalQty = state.cargos.reduce((sum, cargo) => sum + cargo.qty, 0);
    if (totalQty > MAX_EXPANDED_ITEMS) {
      alert(`브라우저 안정성을 위해 한 번에 계산 가능한 수량은 ${MAX_EXPANDED_ITEMS}개입니다. 현재 ${formatNumber(totalQty,0)}개입니다.`);
      return;
    }

    const items = CORE.expandCargos(state.cargos);
    const options = {
      rotation: els.rotationSelect.value,
      priority: els.prioritySelect.value,
      stacking: els.stackingCheck.checked,
      enforceWeight: els.weightCheck.checked,
      minSupport: Number(els.supportRange.value) / 100
    };
    const targetId = els.targetSelect.value;
    const specs = state.specs[state.mode];
    const result = CORE.planLoad(items, specs, targetId, options);
    sanitizeResultGeometry(result, options);
    result.options = options;
    result.mode = state.mode;
    state.result = result;
    state.selectedBin = 0;
    renderResult();
    persistState();
  }

  function renderResult() {
    const result = state.result;
    if (!result) return clearResult();
    els.resultPlaceholder.classList.add('hidden');
    els.resultPlaceholder.hidden = true;
    els.resultPlaceholder.style.setProperty('display', 'none', 'important');
    els.resultContent.classList.remove('hidden');
    els.resultContent.hidden = false;
    els.resultContent.style.removeProperty('display');
    els.resultBinCount.textContent = `${result.bins.length}${state.mode === 'vehicle' ? '대' : '개'}`;
    els.resultLoaded.textContent = `${formatNumber(result.loadedItems,0)}개`;
    const capacityVolume = result.bins.reduce((sum, bin) => sum + Math.max(Number(bin.maxCbm || 0), 0), 0);
    const capacityWeight = result.bins.reduce((sum, bin) => sum + Math.max(Number(bin.maxWeight || 0), 0), 0);
    const loadedVolume = result.bins.reduce((sum, bin) => sum + Number(bin.loadedVolume || 0) / 1e9, 0);
    const loadedWeight = result.bins.reduce((sum, bin) => sum + Number(bin.totalWeight || 0), 0);
    els.resultSpaceRate.textContent = `${formatNumber(capacityVolume ? loadedVolume / capacityVolume * 100 : 0,1)}%`;
    els.resultWeightRate.textContent = `${formatNumber(capacityWeight ? loadedWeight / capacityWeight * 100 : 0,1)}%`;

    const groupedBins = new Map();
    result.bins.forEach(bin => {
      const current = groupedBins.get(bin.id) || { name: bin.name, count: 0 };
      current.count += 1;
      groupedBins.set(bin.id, current);
    });
    const combination = [...groupedBins.values()].map(group => `${escapeHtml(group.name)} ${group.count}${state.mode === 'vehicle' ? '대' : '개'}`).join(' + ');
    els.planSummary.innerHTML = combination
      ? `<strong>자동 추천 조합</strong><span>${combination}</span><small>총 비용지수 ${formatNumber(result.totalCostIndex,2)} · 실제 운임이 아닌 차량 조합 비교값</small>`
      : '<strong>추천 조합 없음</strong><span>현재 조건으로 적재 가능한 규격을 찾지 못했습니다.</span>';

    if (result.unplaced.length) {
      const grouped = groupItems(result.unplaced);
      els.warningBox.innerHTML = `<strong>미적재 화물 ${result.unplaced.length}개</strong><br>${grouped.map(g => `${escapeHtml(g.name)} ${g.qty}개`).join(' · ')}<br><span>선택한 규격보다 화물이 크거나 중량·적층 조건을 충족하지 못했습니다.</span>`;
      els.warningBox.classList.remove('hidden');
    } else {
      els.warningBox.classList.add('hidden');
    }

    els.binCards.innerHTML = result.bins.map((bin, index) => `<button type="button" data-bin-index="${index}">${escapeHtml(bin.name)}</button>`).join('');
    els.binTabs.innerHTML = result.bins.map((bin,index) => `<button type="button" class="${index === state.selectedBin ? 'active' : ''}" data-tab-bin="${index}">${state.mode === 'vehicle' ? '차량' : '컨테이너'} ${index + 1} · ${escapeHtml(bin.name)}</button>`).join('');
    els.binTabs.classList.toggle('single', result.bins.length <= 1);
    els.binTabs.querySelectorAll('[data-tab-bin]').forEach(btn => btn.addEventListener('click', () => selectBin(Number(btn.dataset.tabBin))));

    renderLegend();
    renderViewerDiagnostic(result);
    updateSelectedBinDetails(combination);
    setCameraView('iso');
    requestAnimationFrame(resizeCanvas);
  }

  function updateSelectedBinDetails(combination = '') {
    const result = state.result;
    if (!result || !result.bins.length) return;
    const bin = result.bins[state.selectedBin] || result.bins[0];
    const unitText = state.mode === 'vehicle' ? '차량' : '컨테이너';
    const unitSuffix = state.mode === 'vehicle' ? '대' : '개';
    const volumeCbm = Number(bin.loadedVolume || 0) / 1e9;
    const maxCbm = Math.max(Number(bin.maxCbm || 0), 0);
    const volumePct = Math.min(100, maxCbm ? volumeCbm / maxCbm * 100 : 0);
    const weight = Number(bin.totalWeight || 0);
    const maxWeight = Math.max(Number(bin.maxWeight || 0), 0);
    const weightPct = Math.min(100, maxWeight ? weight / maxWeight * 100 : 0);

    els.simulationTitle.textContent = `적입 시뮬레이션 — ${unitText}`;
    els.simulationSubtitle.textContent = `${unitText} ${state.selectedBin + 1}의 실제 배치와 품목별 적재 수량`;
    els.selectedBinBadge.textContent = `${bin.name} #${state.selectedBin + 1}`;
    els.binVolumeUsageText.textContent = `${formatNumber(volumeCbm,3)} / ${formatNumber(maxCbm,1)} CBM`;
    els.binVolumeRate.textContent = `${formatNumber(volumePct,0)}%`;
    els.binVolumeBar.style.width = `${volumePct}%`;
    els.binWeightUsageText.textContent = `${formatNumber(weight,0)} / ${formatNumber(maxWeight,0)} kg`;
    els.binWeightRate.textContent = `${formatNumber(weightPct,0)}%`;
    els.binWeightBar.style.width = `${weightPct}%`;

    const totalRequested = state.cargos.reduce((sum, cargo) => sum + cargo.qty, 0);
    const selectedLoaded = bin.placements.length;
    const allLoaded = result.loadedItems;
    const planText = combination || `${bin.name} ${result.bins.length}${unitSuffix}`;
    const allPlaced = result.unplaced.length === 0;
    const statusRows = [
      { tone: 'success', icon: '✦', text: `전체 차종·혼합 조합 시뮬레이션 결과 ${planText} 배치가 현재 조건의 추천 조합입니다.` },
      { tone: allPlaced ? 'success' : 'warning', icon: allPlaced ? '✓' : '!', text: allPlaced ? `전체 ${formatNumber(totalRequested,0)}개 화물이 ${result.bins.length}${unitSuffix}에 모두 적재됩니다.` : `${formatNumber(allLoaded,0)}개 적재, ${formatNumber(result.unplaced.length,0)}개는 추가 차량 또는 조건 변경이 필요합니다.` },
      { tone: 'info', icon: 'i', text: `${bin.name}의 운영 용적한도 ${formatNumber(maxCbm,1)}CBM 기준입니다. 실제 결박·축중·하역 여유 공간은 견적 단계에서 확인해야 합니다.` }
    ];
    els.resultStatusStack.innerHTML = statusRows.map(row => `<div class="result-status ${row.tone}"><b>${row.icon}</b><span>${escapeHtml(row.text)}</span></div>`).join('');

    const loadedByCargo = new Map();
    bin.placements.forEach(p => loadedByCargo.set(p.item.cargoId, (loadedByCargo.get(p.item.cargoId) || 0) + 1));
    const detailRows = state.cargos.filter(cargo => loadedByCargo.has(cargo.id)).map(cargo => {
      const loadedQty = loadedByCargo.get(cargo.id) || 0;
      const cbm = cargo.length * cargo.width * cargo.height * loadedQty / 1e9;
      const loadedWeight = cargo.weight * loadedQty;
      return `<tr>
        <td><span class="item-name"><i style="background:${safeColor(cargo.color)}"></i>${escapeHtml(cargo.name)}</span></td>
        <td>${formatNumber(cargo.length,0)}×${formatNumber(cargo.width,0)}×${formatNumber(cargo.height,0)}</td>
        <td>${formatNumber(loadedQty,0)}</td>
        <td>${formatNumber(cbm,3)}</td>
        <td>${formatNumber(loadedWeight,0)} kg</td>
        <td><strong class="loaded-ratio">${formatNumber(loadedQty,0)} / ${formatNumber(cargo.qty,0)}</strong></td>
      </tr>`;
    });
    els.resultCargoTableBody.innerHTML = detailRows.length ? detailRows.join('') : '<tr><td colspan="6" class="empty-detail">선택한 규격에 배치된 화물이 없습니다.</td></tr>';
    els.itemDetailCount.textContent = `${detailRows.length}종 · ${formatNumber(selectedLoaded,0)}개`;
  }

  function clearResult() {
    state.result = null;
    els.resultPlaceholder.classList.remove('hidden');
    els.resultPlaceholder.hidden = false;
    els.resultPlaceholder.style.removeProperty('display');
    els.resultContent.classList.add('hidden');
    els.resultContent.hidden = true;
    els.boxTooltip.classList.add('hidden');
    if (els.viewerDiagnostic) { els.viewerDiagnostic.classList.remove('show'); els.viewerDiagnostic.textContent = ''; }
  }

  function selectBin(index) {
    state.selectedBin = index;
    document.querySelectorAll('[data-bin-index]').forEach(card => card.classList.toggle('active', Number(card.dataset.binIndex) === index));
    document.querySelectorAll('[data-tab-bin]').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.tabBin) === index));
    const groupedBins = new Map();
    if (state.result) state.result.bins.forEach(bin => {
      const current = groupedBins.get(bin.id) || { name: bin.name, count: 0 };
      current.count += 1;
      groupedBins.set(bin.id, current);
    });
    const combination = [...groupedBins.values()].map(group => `${group.name} ${group.count}${state.mode === 'vehicle' ? '대' : '개'}`).join(' + ');
    updateSelectedBinDetails(combination);
    renderCanvas();
  }

  function renderLegend() {
    if (!state.result) return;
    const used = new Map();
    state.result.bins.forEach(bin => bin.placements.forEach(p => used.set(p.item.cargoId, p.item)));
    els.legend.innerHTML = [...used.values()].map(item => `<span><i style="background:${safeColor(item.color)}"></i>${escapeHtml(item.name)}</span>`).join('');
  }

  function resizeCanvas() {
    const canvas = els.loadCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    renderCanvas();
  }

  function setCameraView(view) {
    if (view === 'top') Object.assign(state.camera, { yaw: 0, pitch: Math.PI / 2, zoom: 1 });
    else if (view === 'front') Object.assign(state.camera, { yaw: 0, pitch: 0, zoom: 1 });
    else if (view === 'side') Object.assign(state.camera, { yaw: Math.PI / 2, pitch: 0, zoom: 1 });
    else Object.assign(state.camera, { yaw: -0.72, pitch: -0.58, zoom: 1 });
    els.boxTooltip.classList.add('hidden');
    renderCanvas();
  }

  function renderCanvas() {
    const canvas = els.loadCanvas;
    if (!canvas || !state.result || !state.result.bins.length) return;
    const bin = state.result.bins[state.selectedBin];
    if (!bin) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const background = ctx.createLinearGradient(0,0,0,height);
    background.addColorStop(0,'#f7faff');
    background.addColorStop(1,'#eaf1f8');
    ctx.fillStyle = background;
    ctx.fillRect(0,0,width,height);

    const vehicleScene = state.mode === 'vehicle' ? getVehicleScene(bin) : null;
    const projector = createFittedProjector(bin, width, height, vehicleScene);
    const project = projector.project;
    const faces = [];
    state.hitPolygons = [];

    if (vehicleScene) {
      drawFloorGrid(ctx, bin, project, true);
      addVehicleFaces(faces, vehicleScene, projector, project);
      addCargoFaces(faces, bin, projector, project);
      faces.sort(sortSceneFaces).forEach(face => drawSceneFace(ctx, face));
      drawCargoLabels(ctx, bin, project);
      drawBinWireframe(ctx, bin, project, true);
      drawVehicleDirection(ctx, bin, vehicleScene, project);
    } else {
      drawFloorGrid(ctx, bin, project, false);
      addCargoFaces(faces, bin, projector, project);
      faces.sort(sortSceneFaces).forEach(face => drawSceneFace(ctx, face));
      drawCargoLabels(ctx, bin, project);
      drawBinWireframe(ctx, bin, project, false);
      drawContainerDirection(ctx, bin, project);
    }

    drawCornerLabels(ctx, bin, project);
    drawScaleBadge(ctx, bin, width, height);
  }

  function addCargoFaces(faces, bin, projector, project) {
    bin.placements.forEach((placement, placementIndex) => {
      const verts = cuboidVertices(placement);
      faceDefinitions().forEach((indices, faceIndex) => {
        const points3d = indices.map(i => verts[i]);
        const projected = points3d.map(project);
        if (Math.abs(polygonArea(projected)) < .15) return;
        const depth = points3d.reduce((sum,p) => sum + projector.depth(p),0) / points3d.length;
        faces.push({
          kind:'cargo', placement, placementIndex, faceIndex, projected, depth,
          baseColor:safeColor(placement.item.color), stroke:'rgba(18,42,70,.42)'
        });
      });
    });
  }

  function addVehicleFaces(faces, scene, projector, project) {
    scene.components.forEach((component, componentIndex) => {
      const verts = cuboidVertices(component.box);
      faceDefinitions().forEach((indices, faceIndex) => {
        const points3d = indices.map(i => verts[i]);
        const projected = points3d.map(project);
        if (Math.abs(polygonArea(projected)) < .15) return;
        const depth = points3d.reduce((sum,p) => sum + projector.depth(p),0) / points3d.length;
        faces.push({
          kind:'vehicle', component, componentIndex, faceIndex, projected, depth,
          baseColor:component.color, stroke:component.stroke || 'rgba(35,56,78,.46)'
        });
      });
    });
  }

  function sortSceneFaces(a,b) {
    return a.depth - b.depth || (a.kind === 'vehicle' ? -1 : 1) || (a.placementIndex || a.componentIndex || 0) - (b.placementIndex || b.componentIndex || 0) || a.faceIndex - b.faceIndex;
  }

  function drawSceneFace(ctx, face) {
    const cargoShades = [.84,.98,.92,.88,.95,1.06];
    const vehicleShades = [.82,.96,.90,.86,.93,1.04];
    const shades = face.kind === 'cargo' ? cargoShades : vehicleShades;
    drawPolygon(ctx, face.projected, shadeColor(face.baseColor, shades[face.faceIndex]), face.stroke, face.kind === 'cargo' ? .8 : 1);
    if (face.kind === 'cargo') {
      state.hitPolygons.push({ points: face.projected, placement: face.placement, depth: face.depth });
    }
  }

  function drawCargoLabels(ctx, bin, project) {
    let labelCount = 0;
    const labeledCargo = new Set();
    for (const placement of bin.placements) {
      if (labelCount >= 8) break;
      if (labeledCargo.has(placement.item.cargoId)) continue;
      const top = [
        {x:placement.x,y:placement.y,z:placement.z+placement.height},
        {x:placement.x+placement.length,y:placement.y,z:placement.z+placement.height},
        {x:placement.x+placement.length,y:placement.y+placement.width,z:placement.z+placement.height},
        {x:placement.x,y:placement.y+placement.width,z:placement.z+placement.height}
      ].map(project);
      if (Math.abs(polygonArea(top)) > 1250) {
        const c = centroid(top);
        ctx.save();
        ctx.fillStyle = 'rgba(10,31,55,.92)';
        ctx.font = '700 10px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shorten(placement.item.name, 11), c.x, c.y);
        ctx.restore();
        labelCount += 1;
        labeledCargo.add(placement.item.cargoId);
      }
    }
  }

  function getVehicleScene(bin) {
    const cabLength = clamp(bin.width * .62, 680, 1450);
    const cabHeight = clamp(bin.height * .68, 720, 1780);
    const cabWidth = bin.width * .92;
    const cabY = (bin.width - cabWidth) / 2;
    const components = [
      {
        role:'cab',
        color:'#d8e3f1',
        stroke:'rgba(78,105,136,.42)',
        box:{x:-cabLength,y:cabY,z:0,length:cabLength,width:cabWidth,height:cabHeight}
      }
    ];
    return {
      cabLength,
      components,
      minX:-cabLength*1.08,
      maxX:bin.length + Math.max(bin.width*.28, 320),
      minY:-bin.width*.08,
      maxY:bin.width*1.08,
      minZ:0,
      maxZ:Math.max(bin.height, cabHeight)
    };
  }

  function getVehicleWheels(bin, scene) {
    const radius = scene.wheelRadius;
    const frontX = -scene.cabLength*.54;
    const rearXs = bin.length > 6500 ? [bin.length*.73, bin.length*.87] : [bin.length*.82];
    const xs = [frontX, ...rearXs];
    const ys = [bin.width*.035, bin.width*.965];
    const wheels = [];
    xs.forEach(x => ys.forEach(y => wheels.push({
      center:{x,y,z:-scene.baseHeight*.72}, radius
    })));
    return wheels;
  }

  function createFittedProjector(bin, width, height, vehicleScene=null) {
    const bounds = vehicleScene || { minX:0,maxX:bin.length,minY:0,maxY:bin.width,minZ:0,maxZ:bin.height };
    const origin = {
      x:(bounds.minX+bounds.maxX)/2,
      y:(bounds.minY+bounds.maxY)/2,
      z:(bounds.minZ+bounds.maxZ)/2
    };
    const transform = point => {
      const x = point.x - origin.x;
      const y = point.y - origin.y;
      const z = point.z - origin.z;
      const cy = Math.cos(state.camera.yaw), sy = Math.sin(state.camera.yaw);
      const cp = Math.cos(state.camera.pitch), sp = Math.sin(state.camera.pitch);
      const rx = cy * x - sy * y;
      const ry = sy * x + cy * y;
      return { x: rx, y: -(sp * ry + cp * z), depth: cp * ry - sp * z };
    };
    const corners = cuboidVertices({
      x:bounds.minX,y:bounds.minY,z:bounds.minZ,
      length:bounds.maxX-bounds.minX,width:bounds.maxY-bounds.minY,height:bounds.maxZ-bounds.minZ
    }).map(transform);
    const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
    const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
    const padX = Math.max(38, width * .06), padTop = 58, padBottom = 58;
    const rangeX = Math.max(maxX - minX, 1), rangeY = Math.max(maxY - minY, 1);
    const fitScale = Math.min((width - padX * 2) / rangeX, (height - padTop - padBottom) / rangeY);
    const scale = Math.max(.001, fitScale * state.camera.zoom);
    const centerX = width / 2 - ((minX + maxX) / 2) * scale;
    const centerY = padTop + (height - padTop - padBottom) / 2 - ((minY + maxY) / 2) * scale;
    return {
      project(point) { const p = transform(point); return {x:centerX + p.x*scale, y:centerY + p.y*scale}; },
      depth(point) { return transform(point).depth; },
      scale
    };
  }

  function drawGroundShadow(ctx, scene, project) {
    const z = scene.minZ + scene.wheelRadius*.08;
    const shadow = [
      {x:scene.minX,y:scene.minY,z},
      {x:scene.maxX,y:scene.minY,z},
      {x:scene.maxX,y:scene.maxY,z},
      {x:scene.minX,y:scene.maxY,z}
    ].map(project);
    ctx.save();
    ctx.filter = 'blur(7px)';
    drawPolygon(ctx, shadow, 'rgba(30,54,78,.13)', null);
    ctx.restore();
  }

  function drawVehicleWheel(ctx, wheel, project) {
    const center = project(wheel.center);
    const alongX = project({x:wheel.center.x+wheel.radius,y:wheel.center.y,z:wheel.center.z});
    const alongZ = project({x:wheel.center.x,y:wheel.center.y,z:wheel.center.z+wheel.radius});
    const rx = Math.max(5, Math.hypot(alongX.x-center.x, alongX.y-center.y)*.82);
    const ry = Math.max(4, Math.hypot(alongZ.x-center.x, alongZ.y-center.y)*.76);
    const angle = Math.atan2(alongX.y-center.y, alongX.x-center.x);
    ctx.save();
    ctx.translate(center.x,center.y);
    ctx.rotate(angle);
    ctx.fillStyle='rgba(29,40,53,.96)';
    ctx.strokeStyle='rgba(10,20,31,.9)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#9eb0c1';
    ctx.beginPath();ctx.ellipse(0,0,rx*.39,ry*.39,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#516578';
    ctx.beginPath();ctx.ellipse(0,0,rx*.15,ry*.15,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawVehicleCabDetails(ctx, scene, project) {
    const w = (scene.components.find(c=>c.role==='cab-lower') || {}).box.width || 1000;
    const lower = scene.components.find(c=>c.role==='cab-lower').box;
    const upper = scene.components.find(c=>c.role==='cab-upper').box;
    const frontX = upper.x;
    const windowBottom = upper.z + upper.height*.27;
    const windowTop = upper.z + upper.height*.82;
    const windshield = [
      {x:frontX-.5,y:upper.y+upper.width*.15,z:windowBottom},
      {x:frontX-.5,y:upper.y+upper.width*.85,z:windowBottom},
      {x:frontX-.5,y:upper.y+upper.width*.78,z:windowTop},
      {x:frontX-.5,y:upper.y+upper.width*.22,z:windowTop}
    ].map(project);
    drawPolygon(ctx, windshield, 'rgba(69,116,153,.62)', 'rgba(38,72,102,.75)', 1);

    const sideWindows = [upper.y-.5, upper.y+upper.width+.5];
    sideWindows.forEach(y => {
      const side = [
        {x:upper.x+upper.length*.15,y,z:windowBottom},
        {x:upper.x+upper.length*.83,y,z:windowBottom},
        {x:upper.x+upper.length*.75,y,z:windowTop},
        {x:upper.x+upper.length*.22,y,z:windowTop}
      ].map(project);
      if (Math.abs(polygonArea(side)) > 12) drawPolygon(ctx, side, 'rgba(73,123,161,.54)', 'rgba(38,72,102,.65)', .8);
    });

    const grille = [
      {x:lower.x-.6,y:lower.y+lower.width*.22,z:lower.z+lower.height*.13},
      {x:lower.x-.6,y:lower.y+lower.width*.78,z:lower.z+lower.height*.13},
      {x:lower.x-.6,y:lower.y+lower.width*.78,z:lower.z+lower.height*.31},
      {x:lower.x-.6,y:lower.y+lower.width*.22,z:lower.z+lower.height*.31}
    ].map(project);
    drawPolygon(ctx, grille, 'rgba(68,84,99,.72)', 'rgba(34,49,64,.75)', .8);
  }

  function drawFloorGrid(ctx, bin, project, vehicleMode=false) {
    const floor = [
      {x:0,y:0,z:0},{x:bin.length,y:0,z:0},{x:bin.length,y:bin.width,z:0},{x:0,y:bin.width,z:0}
    ].map(project);
    drawPolygon(ctx, floor, vehicleMode ? 'rgba(208,220,231,.76)' : 'rgba(220,230,240,.55)', 'rgba(70,99,127,.35)', .8);
    const xSteps = Math.max(2, Math.min(10, Math.round(bin.length / 1000)));
    const ySteps = Math.max(2, Math.min(8, Math.round(bin.width / 500)));
    ctx.save();
    ctx.strokeStyle = 'rgba(70,105,142,.15)';
    ctx.lineWidth = .7;
    for (let i=0;i<=xSteps;i++) {
      const x = bin.length * i / xSteps;
      const a=project({x,y:0,z:0}), b=project({x,y:bin.width,z:0});
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    for (let i=0;i<=ySteps;i++) {
      const y = bin.width * i / ySteps;
      const a=project({x:0,y,z:0}), b=project({x:bin.length,y,z:0});
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.restore();
  }

  function drawCornerLabels(ctx, bin, project) {
    const labels = [
      {p:{x:bin.length,y:0,z:0},t:`L ${formatNumber(bin.length/1000,2)}m`},
      {p:{x:0,y:bin.width,z:0},t:`W ${formatNumber(bin.width/1000,2)}m`},
      {p:{x:0,y:0,z:bin.height},t:`H ${formatNumber(bin.height/1000,2)}m`}
    ];
    ctx.save();ctx.font='700 9px Pretendard, sans-serif';ctx.fillStyle='rgba(54,78,105,.8)';
    labels.forEach(({p,t})=>{const q=project(p);ctx.fillText(t,q.x+5,q.y-5);});ctx.restore();
  }

  function cuboidVertices(box) {
    const x=box.x,y=box.y,z=box.z,l=box.length,w=box.width,h=box.height;
    return [
      {x,y,z},{x:x+l,y,z},{x:x+l,y:y+w,z},{x,y:y+w,z},
      {x,y,z:z+h},{x:x+l,y,z:z+h},{x:x+l,y:y+w,z:z+h},{x,y:y+w,z:z+h}
    ];
  }

  function faceDefinitions() {
    return [[0,1,2,3],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0],[4,7,6,5]];
  }

  function drawBinWireframe(ctx, bin, project, vehicleMode=false) {
    const verts = cuboidVertices({ x:0,y:0,z:0,length:bin.length,width:bin.width,height:bin.height });
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    ctx.save();
    ctx.strokeStyle = vehicleMode ? 'rgba(100,128,158,.78)' : 'rgba(78,105,136,.72)';
    ctx.lineWidth = 1.35;
    ctx.setLineDash(vehicleMode ? [6,5] : [6,5]);
    edges.forEach(([a,b]) => {
      const p1=project(verts[a]), p2=project(verts[b]);
      ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
    });
    ctx.restore();
  }

  function drawVehicleDirection(ctx, bin, scene, project) {
    const rearBase = project({x:bin.length,y:bin.width*.50,z:bin.height*.16});
    const rearTip = project({x:bin.length+Math.max(bin.width*.22,300),y:bin.width*.50,z:bin.height*.16});
    drawDirectionArrow(ctx,rearBase,rearTip,'REAR');
  }

  function drawContainerDirection(ctx, bin, project) {
    const rearBase = project({x:bin.length,y:bin.width*.50,z:bin.height*.18});
    const rearTip = project({x:bin.length+Math.max(bin.width*.18,220),y:bin.width*.50,z:bin.height*.18});
    drawDirectionArrow(ctx,rearBase,rearTip,'REAR');
  }

  function drawDirectionArrow(ctx, start, end, label) {
    const dx=end.x-start.x, dy=end.y-start.y;
    const length=Math.max(Math.hypot(dx,dy),1);
    const ux=dx/length, uy=dy/length;
    const px=-uy, py=ux;
    ctx.save();
    ctx.strokeStyle='#627d9a';
    ctx.fillStyle='#627d9a';
    ctx.lineWidth=1.45;
    ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end.x,end.y);
    ctx.lineTo(end.x-ux*8+px*4,end.y-uy*8+py*4);
    ctx.lineTo(end.x-ux*8-px*4,end.y-uy*8-py*4);
    ctx.closePath();ctx.fill();
    const mx=(start.x+end.x)/2+px*10, my=(start.y+end.y)/2+py*10;
    ctx.font='800 11px Pretendard, sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(label,mx,my);
    ctx.restore();
  }

  function drawDirectionLabel(ctx, point, label) {
    ctx.save();
    ctx.font='800 9px Pretendard, sans-serif';
    const tw=ctx.measureText(label).width+14;
    ctx.fillStyle='rgba(255,255,255,.9)';
    ctx.strokeStyle='rgba(80,105,132,.3)';
    roundRect(ctx,point.x-tw/2,point.y-11,tw,22,9);ctx.fill();ctx.stroke();
    ctx.fillStyle='#536f8d';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,point.x,point.y);
    ctx.restore();
  }

  function drawScaleBadge(ctx, bin, width, height) {
    const volumePct = bin.loadedVolume / Math.max(Number(bin.maxCbm || 0) * 1e9, 1) * 100;
    const weightPct = bin.totalWeight / bin.maxWeight * 100;
    const text = `${bin.name} · 공간 ${formatNumber(volumePct,1)}% · 중량 ${formatNumber(weightPct,1)}%`;
    ctx.save();
    ctx.font = '700 10px sans-serif';
    const tw = Math.min(width-20, ctx.measureText(text).width + 22);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    roundRect(ctx, width - tw - 10, 10, tw, 27, 8);
    ctx.fill();
    ctx.fillStyle = '#30475f';
    ctx.textAlign='left';
    ctx.fillText(text, width - tw, 28);
    ctx.restore();
  }

  function drawPolygon(ctx, points, fill, stroke, lineWidth=1) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  function onCanvasPointerDown(event) {
    state.camera.dragging = true;
    state.camera.lastX = event.clientX;
    state.camera.lastY = event.clientY;
    els.loadCanvas.setPointerCapture(event.pointerId);
  }

  function onCanvasPointerMove(event) {
    if (!state.camera.dragging) return;
    const dx = event.clientX - state.camera.lastX;
    const dy = event.clientY - state.camera.lastY;
    state.camera.lastX = event.clientX;
    state.camera.lastY = event.clientY;
    state.camera.yaw += dx * .009;
    state.camera.pitch = clamp(state.camera.pitch - dy * .007, -1.35, 1.45);
    els.boxTooltip.classList.add('hidden');
    renderCanvas();
  }

  function onCanvasPointerUp(event) {
    state.camera.dragging = false;
    try { els.loadCanvas.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
  }

  function onCanvasWheel(event) {
    event.preventDefault();
    state.camera.zoom = clamp(state.camera.zoom * (event.deltaY > 0 ? .9 : 1.1), .45, 2.8);
    renderCanvas();
  }

  function onCanvasClick(event) {
    if (!state.result) return;
    const rect = els.loadCanvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hits = state.hitPolygons.filter(hit => pointInPolygon(point, hit.points)).sort((a,b) => b.depth - a.depth);
    const hit = hits[0];
    if (!hit) { els.boxTooltip.classList.add('hidden'); return; }
    const p = hit.placement;
    els.boxTooltip.innerHTML = `<strong>${escapeHtml(p.item.name)}</strong><span>${formatNumber(p.length,0)} × ${formatNumber(p.width,0)} × ${formatNumber(p.height,0)} mm</span><span>위치 X ${formatNumber(p.x,0)} / Y ${formatNumber(p.y,0)} / Z ${formatNumber(p.z,0)}</span><span>중량 ${formatNumber(p.item.weight,1)} kg · ${p.layer}단</span>`;
    els.boxTooltip.style.left = `${clamp(point.x + 12, 8, rect.width - 175)}px`;
    els.boxTooltip.style.top = `${clamp(point.y + 12, 8, rect.height - 100)}px`;
    els.boxTooltip.classList.remove('hidden');
  }

  function handleQuoteRequest() {
    const summary = buildQuoteSummary();
    copyText(summary).then(() => {
      if (!els.quoteCopyStatus) return;
      els.quoteCopyStatus.textContent = state.result
        ? '계산 결과를 복사했습니다. 열린 견적 페이지의 “중량·수량·규격” 또는 “현장 및 추가 조건” 항목에 붙여넣으세요.'
        : '현재 입력된 화물 정보를 복사했습니다. 열린 국내운송 견적 페이지에 붙여넣으세요.';
      els.quoteCopyStatus.classList.add('success');
      window.setTimeout(() => {
        if (!els.quoteCopyStatus) return;
        els.quoteCopyStatus.textContent = '계산 전에도 견적 페이지로 이동할 수 있으며, 계산 후에는 결과 요약이 함께 복사됩니다.';
        els.quoteCopyStatus.classList.remove('success');
      }, 6500);
    }).catch(() => {
      if (els.quoteCopyStatus) els.quoteCopyStatus.textContent = '견적 페이지를 열었습니다. 아래 계산 결과를 확인해 화물 정보를 입력해 주세요.';
    });
  }

  function buildQuoteSummary() {
    const modeLabel = state.mode === 'vehicle' ? '국내 차량' : '컨테이너';
    const totalQty = state.cargos.reduce((sum, cargo) => sum + Number(cargo.qty || 0), 0);
    const totalCbm = state.cargos.reduce((sum, cargo) => sum + cargo.length * cargo.width * cargo.height * cargo.qty / 1e9, 0);
    const totalWeight = state.cargos.reduce((sum, cargo) => sum + cargo.weight * cargo.qty, 0);
    const lines = [
      '[KBRIDGE 적입 계산 결과]',
      `계산 모드: ${modeLabel}`,`총 품목: ${state.cargos.length}종 / 총 수량: ${formatNumber(totalQty,0)}개`,
      `총 부피: ${formatNumber(totalCbm,3)} CBM / 총 중량: ${formatNumber(totalWeight,1)} kg`,
      '',
      '[화물 상세]'
    ];
    if (state.cargos.length) {
      state.cargos.forEach((cargo, index) => {
        lines.push(`${index + 1}. ${cargo.name} — ${formatNumber(cargo.length,0)} × ${formatNumber(cargo.width,0)} × ${formatNumber(cargo.height,0)} mm / ${formatNumber(cargo.qty,0)}개 / 개당 ${formatNumber(cargo.weight,1)} kg`);
      });
    } else {
      lines.push('입력된 화물이 없습니다.');
    }
    if (state.result) {
      const grouped = new Map();
      state.result.bins.forEach(bin => {
        const current = grouped.get(bin.id) || { name: bin.name, count: 0 };
        current.count += 1;
        grouped.set(bin.id, current);
      });
      const combination = [...grouped.values()].map(group => `${group.name} ${group.count}${state.mode === 'vehicle' ? '대' : '개'}`).join(' + ') || '추천 조합 없음';
      lines.push('', '[계산 결과]');
      lines.push(`추천 조합: ${combination}`);
      lines.push(`적재 완료: ${formatNumber(state.result.loadedItems,0)}개 / 미적재: ${formatNumber(state.result.unplaced.length,0)}개`);
      if (state.result.unplaced.length) {
        const unplaced = groupItems(state.result.unplaced).map(group => `${group.name} ${group.qty}개`).join(', ');
        lines.push(`미적재 화물: ${unplaced}`);
      }
    }
    lines.push('', '※ 적입 계산은 사전 검토용이며 실제 차량·현장 조건은 담당자 확인이 필요합니다.');
    return lines.join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        const copied = document.execCommand('copy');
        textarea.remove();
        copied ? resolve() : reject(new Error('copy failed'));
      } catch (error) {
        textarea.remove();
        reject(error);
      }
    });
  }

  function downloadCanvasImage() {
    if (!state.result || !state.result.bins.length) return;
    renderCanvas();
    const link = document.createElement('a');
    link.download = `kbridge-load-plan-${new Date().toISOString().slice(0,10)}.png`;
    link.href = els.loadCanvas.toDataURL('image/png');
    link.click();
  }

  async function importCargoFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportStatus(`${file.name} 파일을 분석하고 있습니다.`, '');
    try {
      let imported = [];
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) imported = await parseExcelCargoFile(file);
      else if (lower.endsWith('.pdf')) imported = await parsePdfCargoFile(file);
      else throw new Error('지원 형식은 .xlsx, .xls, .pdf입니다.');
      if (!imported.length) throw new Error('품목명·가로·세로·높이·수량·개당중량 형식의 유효한 화물 행을 찾지 못했습니다.');
      state.cargos = imported;
      renderCargoList();
      updateSummary();
      clearResult();
      persistState();
      setImportStatus(`${file.name}에서 ${imported.length}개 품목을 인식했습니다. 적입 계산을 실행합니다.`, 'success');
      window.setTimeout(runCalculation, 80);
    } catch (error) {
      console.error(error);
      setImportStatus(`파일을 읽지 못했습니다: ${error.message}`, 'error');
    } finally {
      els.cargoFileInput.value = '';
    }
  }

  async function parseExcelCargoFile(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx')) {
      const sheets = await readXlsxSheets(await file.arrayBuffer());
      let best = [];
      for (const rows of sheets) {
        try {
          const parsed = parseTableRows(rows);
          if (parsed.length > best.length) best = parsed;
        } catch (_) { /* try next sheet */ }
      }
      if (!best.length) throw new Error('엑셀에서 필수 열 6개를 찾지 못했습니다. 양식을 내려받아 열 이름을 확인해 주세요.');
      return best;
    }
    await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX');
    if (!window.XLSX) throw new Error('구형 .xls 분석 모듈을 불러오지 못했습니다. .xlsx로 저장해 다시 업로드해 주세요.');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
    let best = [];
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
      try { const parsed = parseTableRows(rows); if (parsed.length > best.length) best = parsed; } catch (_) { /* next */ }
    }
    if (!best.length) throw new Error('엑셀에서 필수 열 6개를 찾지 못했습니다.');
    return best;
  }

  async function readXlsxSheets(arrayBuffer) {
    const files = await unzipXlsx(arrayBuffer);
    const parser = new DOMParser();
    const workbookXml = files.get('xl/workbook.xml');
    const relsXml = files.get('xl/_rels/workbook.xml.rels');
    if (!workbookXml || !relsXml) throw new Error('올바른 .xlsx 파일이 아닙니다.');
    const workbookDoc = parser.parseFromString(workbookXml, 'application/xml');
    const relsDoc = parser.parseFromString(relsXml, 'application/xml');
    const relMap = new Map([...relsDoc.getElementsByTagNameNS('*','Relationship')].map(node => [node.getAttribute('Id'), node.getAttribute('Target')]));
    const sharedStrings = parseSharedStrings(files.get('xl/sharedStrings.xml'), parser);
    const sheets = [];
    for (const sheetNode of [...workbookDoc.getElementsByTagNameNS('*','sheet')]) {
      const relId = sheetNode.getAttribute('r:id') || sheetNode.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
      let target = relMap.get(relId) || '';
      target = target.replace(/^\//,'').replace(/^\.\.\//,'');
      const path = target.startsWith('xl/') ? target : `xl/${target}`;
      const xml = files.get(path);
      if (xml) sheets.push(parseXlsxSheet(xml, sharedStrings, parser));
    }
    return sheets;
  }

  function parseSharedStrings(xml, parser) {
    if (!xml) return [];
    const doc = parser.parseFromString(xml, 'application/xml');
    return [...doc.getElementsByTagNameNS('*','si')].map(si => [...si.getElementsByTagNameNS('*','t')].map(t => t.textContent || '').join(''));
  }

  function parseXlsxSheet(xml, sharedStrings, parser) {
    const doc = parser.parseFromString(xml, 'application/xml');
    const rows = [];
    for (const rowNode of [...doc.getElementsByTagNameNS('*','row')]) {
      const row = [];
      for (const cell of [...rowNode.getElementsByTagNameNS('*','c')]) {
        const ref = cell.getAttribute('r') || 'A1';
        const col = excelColumnIndex(ref.replace(/\d+/g,''));
        const type = cell.getAttribute('t');
        let value = '';
        if (type === 'inlineStr') value = [...cell.getElementsByTagNameNS('*','t')].map(t => t.textContent || '').join('');
        else {
          const v = cell.getElementsByTagNameNS('*','v')[0]?.textContent ?? '';
          value = type === 's' ? (sharedStrings[Number(v)] ?? '') : v;
        }
        row[col] = value;
      }
      rows.push(row.map(value => value ?? ''));
    }
    return rows;
  }

  function excelColumnIndex(letters) {
    let value = 0;
    for (const ch of String(letters).toUpperCase()) value = value * 26 + ch.charCodeAt(0) - 64;
    return Math.max(0, value - 1);
  }

  async function unzipXlsx(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    let eocd = -1;
    for (let i=view.byteLength-22;i>=Math.max(0,view.byteLength-65557);i--) {
      if (view.getUint32(i,true) === 0x06054b50) { eocd=i; break; }
    }
    if (eocd < 0) throw new Error('엑셀 압축 구조를 읽지 못했습니다.');
    const entries = view.getUint16(eocd+10,true);
    let offset = view.getUint32(eocd+16,true);
    const decoder = new TextDecoder('utf-8');
    const files = new Map();
    for (let n=0;n<entries;n++) {
      if (view.getUint32(offset,true) !== 0x02014b50) throw new Error('엑셀 파일 목차가 손상되었습니다.');
      const method = view.getUint16(offset+10,true);
      const compressedSize = view.getUint32(offset+20,true);
      const nameLength = view.getUint16(offset+28,true);
      const extraLength = view.getUint16(offset+30,true);
      const commentLength = view.getUint16(offset+32,true);
      const localOffset = view.getUint32(offset+42,true);
      const name = decoder.decode(new Uint8Array(arrayBuffer,offset+46,nameLength));
      if (view.getUint32(localOffset,true) !== 0x04034b50) throw new Error('엑셀 내부 파일이 손상되었습니다.');
      const localNameLength = view.getUint16(localOffset+26,true);
      const localExtraLength = view.getUint16(localOffset+28,true);
      const dataOffset = localOffset+30+localNameLength+localExtraLength;
      const compressed = new Uint8Array(arrayBuffer,dataOffset,compressedSize);
      let bytes;
      if (method === 0) bytes = compressed;
      else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 .xlsx 압축 해제를 지원하지 않습니다. 최신 Chrome·Edge를 이용해 주세요.');
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error(`지원하지 않는 엑셀 압축 방식입니다. (${method})`);
      files.set(name, decoder.decode(bytes));
      offset += 46+nameLength+extraLength+commentLength;
    }
    return files;
  }

  async function parsePdfCargoFile(file) {
    const pdfjs = await ensurePdfJs();
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), useSystemFonts: true }).promise;
    let allRows = [];
    let plainLines = [];
    const pageLimit = Math.min(pdf.numPages, 20);
    for (let pageNo=1; pageNo<=pageLimit; pageNo++) {
      setImportStatus(`PDF ${pageNo}/${pageLimit}페이지의 표를 읽고 있습니다.`, '');
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const grouped = groupPdfTextItems(content.items || []);
      allRows.push(...grouped.map(line => line.items.map(item => item.text)));
      plainLines.push(...grouped.map(line => line.items.map(item => item.text).join(' ')));
    }
    try {
      const parsed = parseTableRows(allRows);
      if (parsed.length) return parsed;
    } catch (_) { /* fallback below */ }
    const direct = parseLoosePdfLines(plainLines);
    if (direct.length) return direct;
    setImportStatus('텍스트 표를 찾지 못해 스캔 PDF OCR을 시작합니다. 페이지 수에 따라 시간이 걸릴 수 있습니다.', '');
    return await ocrPdfCargo(pdf, pageLimit);
  }

  function groupPdfTextItems(items) {
    const lines = [];
    for (const item of items) {
      const text = String(item.str || '').trim();
      if (!text) continue;
      const x = Number(item.transform?.[4] || 0), y = Number(item.transform?.[5] || 0);
      let line = lines.find(row => Math.abs(row.y - y) <= 3.5);
      if (!line) { line = { y, items: [] }; lines.push(line); }
      line.items.push({ x, text });
    }
    lines.sort((a,b) => b.y - a.y);
    lines.forEach(line => line.items.sort((a,b) => a.x - b.x));
    return lines;
  }

  async function ocrPdfCargo(pdf, pageLimit) {
    await ensureScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract');
    if (!window.Tesseract) throw new Error('OCR 모듈을 불러오지 못했습니다.');
    const lines = [];
    const ocrLimit = Math.min(pageLimit, 8);
    for (let pageNo=1; pageNo<=ocrLimit; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const result = await Tesseract.recognize(canvas, 'kor+eng', { logger: message => {
        if (message.status === 'recognizing text') setImportStatus(`PDF OCR ${pageNo}/${ocrLimit}페이지 - ${Math.round((message.progress || 0)*100)}%`, '');
      }});
      lines.push(...String(result.data?.text || '').split(/\r?\n/));
    }
    const parsed = parseLoosePdfLines(lines);
    if (!parsed.length) throw new Error('스캔 PDF에서 6개 필수 항목을 안정적으로 인식하지 못했습니다. 엑셀 양식을 이용하거나 더 선명한 PDF를 업로드해 주세요.');
    return parsed;
  }

  function parseTableRows(rows) {
    const normalizedRows = rows.map(row => Array.from(row || []).map(value => String(value ?? '').trim()));
    let headerIndex = -1, mapping = null;
    for (let i=0;i<Math.min(normalizedRows.length, 30);i++) {
      const candidate = detectHeaderMapping(normalizedRows[i]);
      if (candidate && Object.values(candidate).every(index => index >= 0)) { headerIndex=i; mapping=candidate; break; }
    }
    if (!mapping) throw new Error('필수 열을 찾지 못했습니다.');
    const cargos = [];
    for (let i=headerIndex+1;i<normalizedRows.length;i++) {
      const row = normalizedRows[i];
      if (!row.some(Boolean)) continue;
      const name = String(row[mapping.name] || '').trim();
      const length = parseNumericCell(row[mapping.length]);
      const width = parseNumericCell(row[mapping.width]);
      const height = parseNumericCell(row[mapping.height]);
      const qty = Math.floor(parseNumericCell(row[mapping.qty]));
      const weight = parseNumericCell(row[mapping.weight], true);
      if (!name && !length && !width && !height && !qty) continue;
      if (!(length>0 && width>0 && height>0 && qty>0 && weight>=0)) continue;
      cargos.push(makeImportedCargo(name || `화물 ${cargos.length+1}`, length, width, height, qty, weight, cargos.length));
    }
    return cargos;
  }

  function detectHeaderMapping(row) {
    const aliases = {
      name:['품목명','품명','화물명','아이템','name','item','description'],
      length:['가로','길이','length','len','l'],
      width:['세로','폭','너비','width','w'],
      height:['높이','height','h'],
      qty:['수량','개수','quantity','qty','count'],
      weight:['개당중량','개당무게','단위중량','개당중량kg','unitweight','weight','중량','kg']
    };
    const normalized = row.map(normalizeHeader);
    const mapping = {};
    for (const [key, names] of Object.entries(aliases)) {
      mapping[key] = normalized.findIndex(cell => names.some(name => cell === normalizeHeader(name) || cell.includes(normalizeHeader(name))));
    }
    return mapping;
  }

  function normalizeHeader(value) {
    return String(value || '').toLowerCase().replace(/[\s_\-()（）\[\]\/.,:]/g,'');
  }

  function parseNumericCell(value, allowZero=false) {
    const cleaned = String(value ?? '').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
    const number = cleaned ? Number(cleaned[0]) : NaN;
    if (!Number.isFinite(number)) return allowZero ? 0 : NaN;
    return allowZero ? Math.max(0, number) : number;
  }

  function parseLoosePdfLines(lines) {
    const cargos = [];
    for (const raw of lines) {
      const line = String(raw || '').replace(/[|]/g,' ').replace(/\s+/g,' ').trim();
      if (!line || /품목명|가로|세로|높이|수량|개당/.test(line)) continue;
      const matches = [...line.matchAll(/\d[\d,]*(?:\.\d+)?/g)];
      if (matches.length < 5) continue;
      const last = matches.slice(-5);
      const name = line.slice(0,last[0].index).trim().replace(/^\d+[.)]?\s*/, '');
      const nums = last.map(match => Number(match[0].replace(/,/g,'')));
      const [length,width,height,qtyRaw,weight] = nums;
      const qty = Math.floor(qtyRaw);
      if (name && length>0 && width>0 && height>0 && qty>0 && weight>=0) cargos.push(makeImportedCargo(name,length,width,height,qty,weight,cargos.length));
    }
    return cargos;
  }

  function makeImportedCargo(name,length,width,height,qty,weight,index) {
    return { id:uid(), name:String(name).slice(0,40), length, width, height, qty, weight, maxStack:99, noTop:false, stackMode:'global', rotationMode:'global', color:nextColor(index) };
  }

  function setImportStatus(message, type) {
    if (!els.fileImportStatus) return;
    els.fileImportStatus.textContent = message;
    els.fileImportStatus.className = `file-import-status show${type ? ' '+type : ''}`;
  }

  async function ensurePdfJs() {
    if (window.__KBRIDGE_PDFJS__) return window.__KBRIDGE_PDFJS__;
    try {
      window.__KBRIDGE_PDFJS__ = await import(new URL('pdf.min.mjs', document.baseURI).href);
    } catch (localError) {
      try { window.__KBRIDGE_PDFJS__ = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'); }
      catch (_) { throw new Error('PDF 분석 모듈을 불러오지 못했습니다. 배포 폴더에 pdf.min.mjs와 pdf.worker.min.mjs가 있는지 확인해 주세요.'); }
    }
    return window.__KBRIDGE_PDFJS__;
  }

  function ensureScript(src, globalName) {
    if (window[globalName]) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing = [...document.scripts].find(script => script.src === src);
      if (existing) { existing.addEventListener('load',resolve,{once:true}); existing.addEventListener('error',reject,{once:true}); return; }
      const script=document.createElement('script'); script.src=src; script.onload=resolve; script.onerror=()=>reject(new Error('외부 분석 모듈 로드 실패')); document.head.appendChild(script);
    });
  }

  function renderRouteInputs() {
    els.routeDirection.value = state.route.direction || 'import';
    els.routeOrigin.value = state.route.origin || '';
    els.routeDestination.value = state.route.destination || '';
    els.routeDestinationDetail.value = state.route.destinationDetail || '';
  }

  function syncRouteFromInputs() {
    state.route = {
      direction: els.routeDirection.value,
      origin: els.routeOrigin.value.trim(),
      destination: els.routeDestination.value.trim(),
      destinationDetail: els.routeDestinationDetail.value.trim(),
      zonecode: state.route.zonecode || ''
    };
    persistState();
    if (state.result) renderResult();
  }

  function fullDestinationText() {
    return [state.route.destination, state.route.destinationDetail].filter(Boolean).join(' ');
  }

  function openDestinationAddressSearch() {
    if (!(window.daum && window.daum.Postcode)) {
      alert('주소 검색 서비스를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
      return;
    }
    new window.daum.Postcode({
      oncomplete(data) {
        const selectedAddress = data.userSelectedType === 'R'
          ? (data.roadAddress || data.jibunAddress)
          : (data.jibunAddress || data.roadAddress);
        els.routeDestination.value = selectedAddress || '';
        state.route.zonecode = data.zonecode || '';
        syncRouteFromInputs();
        window.setTimeout(() => els.routeDestinationDetail.focus(), 0);
      }
    }).open({ popupTitle: '도착지 도로명주소 검색' });
  }

  function swapRoute() {
    const previousDestination = fullDestinationText();
    els.routeOrigin.value = previousDestination || els.routeOrigin.value.trim();
    els.routeDestination.value = '';
    els.routeDestinationDetail.value = '';
    state.route.zonecode = '';
    if (els.routeDirection.value === 'import') els.routeDirection.value = 'export';
    else if (els.routeDirection.value === 'export') els.routeDirection.value = 'import';
    syncRouteFromInputs();
    openDestinationAddressSearch();
  }

  function routeSummaryHtml() { return ''; }

  function sanitizeResultGeometry(result, options) {
    let removed = 0;
    for (const bin of result.bins) {
      const kept = [];
      for (const placement of bin.placements) {
        const inside = placement.x >= -EPS && placement.y >= -EPS && placement.z >= -EPS && placement.x+placement.length <= bin.length+EPS && placement.y+placement.width <= bin.width+EPS && placement.z+placement.height <= bin.height+EPS;
        const collision = kept.some(other => boxesOverlap(placement, other));
        let supported = placement.z <= EPS;
        if (!supported && options.stacking !== false) {
          let area = 0;
          for (const other of kept) if (Math.abs(other.z+other.height-placement.z)<=EPS) area += rectangleOverlapArea(placement,other);
          supported = area / Math.max(placement.length*placement.width,1) + EPS >= options.minSupport;
        }
        if (inside && !collision && supported) kept.push(placement);
        else { result.unplaced.push(placement.item); removed += 1; }
      }
      bin.placements = kept;
      bin.totalWeight = kept.reduce((sum,p)=>sum+Number(p.item.weight||0),0);
      bin.loadedVolume = kept.reduce((sum,p)=>sum+Number(p.item.volume||p.length*p.width*p.height),0);
    }
    result.bins = result.bins.filter(bin => bin.placements.length);
    result.loadedItems = result.bins.reduce((sum,bin)=>sum+bin.placements.length,0);
    result.geometryAdjusted = removed;
  }

  function boxesOverlap(a,b) {
    return a.x < b.x+b.length-EPS && a.x+a.length > b.x+EPS && a.y < b.y+b.width-EPS && a.y+a.width > b.y+EPS && a.z < b.z+b.height-EPS && a.z+a.height > b.z+EPS;
  }

  function rectangleOverlapArea(a,b) {
    return Math.max(0,Math.min(a.x+a.length,b.x+b.length)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.width,b.y+b.width)-Math.max(a.y,b.y));
  }

  function renderViewerDiagnostic(result) {
    if (!els.viewerDiagnostic) return;
    if (result.geometryAdjusted) {
      els.viewerDiagnostic.textContent = `겹침·범위·지지 조건 검증에서 ${result.geometryAdjusted}개 배치를 제외했습니다. 제외 화물은 경고 영역에서 확인하세요.`;
      els.viewerDiagnostic.classList.add('show');
    } else {
      els.viewerDiagnostic.textContent = '';
      els.viewerDiagnostic.classList.remove('show');
    }
  }

  function loadSavedState() {
    try {
      const settings = JSON.parse(safeStorageGet(SETTINGS_KEY));
      const valid = settings?.vehicle?.length && settings?.container?.length &&
        settings.vehicle.every(spec => Number(spec.maxCbm) > 0) && settings.container.every(spec => Number(spec.maxCbm) > 0);
      if (valid) state.specs = settings;
    } catch (_) { /* use defaults */ }
    try {
      const saved = JSON.parse(safeStorageGet(STORAGE_KEY));
      if (saved?.cargos && Array.isArray(saved.cargos)) state.cargos = saved.cargos;
      if (saved?.mode === 'container' || saved?.mode === 'vehicle') state.mode = saved.mode;
      if (saved?.route && typeof saved.route === 'object') state.route = { ...state.route, ...saved.route, destinationDetail: saved.route.destinationDetail || '', zonecode: saved.route.zonecode || '' };
    } catch (_) { /* empty state */ }
    document.querySelectorAll('[data-mode]').forEach(btn => {
      const active = btn.dataset.mode === state.mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  function persistState() {
    safeStorageSet(STORAGE_KEY, JSON.stringify({ mode: state.mode, cargos: state.cargos, route: state.route }));
  }


  function safeStorageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  window.__KBRIDGE_PLANNER_DEBUG__ = { getState: () => state, run: runCalculation, validate: () => state.result ? { bins:state.result.bins.length, loaded:state.result.loadedItems, unplaced:state.result.unplaced.length, adjusted:state.result.geometryAdjusted||0 } : null };

  function safeStorageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* local file/privacy mode */ }
  }

  function groupItems(items) {
    const map = new Map();
    items.forEach(item => {
      const current = map.get(item.cargoId) || { name:item.name, qty:0 };
      current.qty += 1; map.set(item.cargoId,current);
    });
    return [...map.values()];
  }

  function binVolume(spec) { return spec.length * spec.width * spec.height; }
  function uid() { return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function positiveNumber(value) { const n=Number(value); return Number.isFinite(n) && n>0 ? n : 1; }
  function formatNumber(value, digits=0) { return Number(value || 0).toLocaleString('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits}); }
  function round3(value) { return Math.round(value*1000)/1000; }
  function clamp(value,min,max) { return Math.min(max,Math.max(min,value)); }
  function safeColor(color) { return /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2f75d6'; }
  function nextColor(index) { return ['#2f75d6','#24a7c4','#d2813f','#7557c5','#34a06f','#cc5865','#5a8b3f','#b45aa2'][index % 8]; }
  function shorten(text,max) { return text.length>max ? `${text.slice(0,max-1)}…` : text; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function debounce(fn,wait) { let timer; return (...args) => { clearTimeout(timer); timer=setTimeout(()=>fn(...args),wait); }; }

  function shadeColor(hex, factor) {
    const c=safeColor(hex).slice(1); const n=parseInt(c,16);
    const r=clamp(Math.round(((n>>16)&255)*factor),0,255);
    const g=clamp(Math.round(((n>>8)&255)*factor),0,255);
    const b=clamp(Math.round((n&255)*factor),0,255);
    return `rgb(${r},${g},${b})`;
  }

  function polygonArea(points) {
    let area=0;
    for(let i=0,j=points.length-1;i<points.length;j=i++) area+=(points[j].x+points[i].x)*(points[j].y-points[i].y);
    return Math.abs(area/2);
  }
  function centroid(points) { return { x:points.reduce((s,p)=>s+p.x,0)/points.length, y:points.reduce((s,p)=>s+p.y,0)/points.length }; }
  function pointInPolygon(point, polygon) {
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const xi=polygon[i].x, yi=polygon[i].y, xj=polygon[j].x, yj=polygon[j].y;
      const intersect=((yi>point.y)!==(yj>point.y)) && point.x < (xj-xi)*(point.y-yi)/(yj-yi+Number.EPSILON)+xi;
      if(intersect) inside=!inside;
    }
    return inside;
  }
  function roundRect(ctx,x,y,w,h,r) {
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
})();

(function(){
  const menuBtn=document.getElementById('menuBtn');
  const mobileNav=document.getElementById('mobileNav');
  if(!menuBtn||!mobileNav) return;
  const setOpen=(open)=>{
    menuBtn.setAttribute('aria-expanded',String(open));
    menuBtn.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');
    mobileNav.classList.toggle('open',open);
    mobileNav.setAttribute('aria-hidden',String(!open));
    document.body.classList.toggle('lock',open);
  };
  menuBtn.addEventListener('click',()=>setOpen(menuBtn.getAttribute('aria-expanded')!=='true'));
  mobileNav.addEventListener('click',(e)=>{ if(e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') setOpen(false); });
  window.addEventListener('resize',()=>{ if(window.innerWidth>1020) setOpen(false); });
})();

(function(){
  function initRouteDirectionTabs(){
    const select=document.getElementById('routeDirection');
    const tabs=[...document.querySelectorAll('[data-route-direction]')];
    const help=document.getElementById('routeDirectionHelp');
    const swap=document.getElementById('routeSwapBtn');
    if(!select||!tabs.length) return;
    const descriptions={
      import:'항만·공항에서 최종 도착지로 운송',
      export:'출고지에서 항만·공항으로 운송',
      domestic:'국내 출발지에서 국내 도착지로 운송'
    };
    const update=()=>{
      tabs.forEach(btn=>{
        const active=btn.dataset.routeDirection===select.value;
        btn.classList.toggle('active',active);
        btn.setAttribute('aria-checked',String(active));
      });
      if(help) help.textContent=descriptions[select.value]||descriptions.domestic;
    };
    tabs.forEach(btn=>btn.addEventListener('click',()=>{
      select.value=btn.dataset.routeDirection;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      update();
    }));
    select.addEventListener('change',update);
    if(swap) swap.addEventListener('click',()=>setTimeout(update,0));
    update();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initRouteDirectionTabs,{once:true});
  else initRouteDirectionTabs();
})();

(function(){
  const simpleBtn=document.getElementById('simpleModeBtn');
  const simplePanel=document.getElementById('simpleCalculatorPanel');
  const mainGrid=document.getElementById('plannerMainGrid');
  const infoGrid=document.getElementById('plannerInfoGrid');
  const notice=document.getElementById('plannerNoticePanel');
  const rowsEl=document.getElementById('simpleRows');
  if(!simpleBtn||!simplePanel||!mainGrid||!rowsEl) return;

  const ids=['simpleSku','simpleQty','simpleCbm','simpleWeight','simpleAirVolume','simpleAirCharge','simpleExpressVolume','simpleExpressCharge','simpleRevenueTon','simpleVehicleRecommend','simpleContainerRecommend'];
  const out={}; ids.forEach(id=>out[id]=document.getElementById(id));
  const vehicleDefaults=[
    ['다마스 트럭',250,1.5],['라보 트럭',450,3],['1톤 트럭',1100,4.5],['1.4톤 트럭',1400,6.5],['2.5톤 트럭',2600,11],['3.5톤 트럭',3600,15],['5톤 트럭',5500,25],['8톤 트럭',8800,32],['11톤 트럭',12000,47],['14톤 트럭',15000,49],['18톤 트럭',19000,56],['25톤 트럭',27000,56]
  ];
  const containerDefaults=[['20FT DRY',28000,33.2],['40FT DRY',26700,67.6],['40FT HIGH CUBE',26500,76.3],['45FT HIGH CUBE',27400,85.9]];
  let rowSeq=0;

  function n(value){const x=Number(value);return Number.isFinite(x)&&x>=0?x:0}
  function f(value,d=0){return Number(value||0).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d})}
  function getSpecs(type){
    try{
      const state=window.__KBRIDGE_PLANNER_DEBUG__?.getState?.();
      const list=state?.specs?.[type];
      if(Array.isArray(list)&&list.length) return list.map(s=>[s.name,Number(s.maxWeight||0),Number(s.maxCbm||0)]);
    }catch(_){ }
    return type==='vehicle'?vehicleDefaults:containerDefaults;
  }
  function addRow(data={}){
    rowSeq+=1;
    const row=document.createElement('div');
    row.className='simple-row';
    row.dataset.row=String(rowSeq);
    row.innerHTML=`
      <input aria-label="품명" class="s-name" type="text" maxlength="40" value="${escapeAttr(data.name||`화물 ${rowSeq}`)}">
      <input aria-label="가로 L mm" class="s-l" type="number" min="0" step="1" value="${data.l??500}">
      <input aria-label="세로 W mm" class="s-w" type="number" min="0" step="1" value="${data.w??400}">
      <input aria-label="높이 H mm" class="s-h" type="number" min="0" step="1" value="${data.h??400}">
      <input aria-label="수량" class="s-q" type="number" min="1" step="1" value="${data.q??1}">
      <input aria-label="개당 중량 kg" class="s-kg" type="number" min="0" step="0.1" value="${data.kg??10}">
      <button aria-label="품목 삭제" class="simple-remove-btn" type="button">×</button>`;
    row.querySelectorAll('input').forEach(input=>input.addEventListener('input',calculate));
    row.querySelector('.simple-remove-btn').addEventListener('click',()=>{row.remove();if(!rowsEl.children.length)addRow();calculate()});
    rowsEl.appendChild(row); calculate();
  }
  function escapeAttr(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function calculate(){
    const rows=[...rowsEl.querySelectorAll('.simple-row')];
    let sku=0,qty=0,cbm=0,weight=0;
    rows.forEach(row=>{
      const l=n(row.querySelector('.s-l').value),w=n(row.querySelector('.s-w').value),h=n(row.querySelector('.s-h').value);
      const q=Math.max(0,Math.floor(n(row.querySelector('.s-q').value))),kg=n(row.querySelector('.s-kg').value);
      if(l>0&&w>0&&h>0&&q>0){sku+=1;qty+=q;cbm+=l*w*h*q/1e9;weight+=kg*q}
    });
    const airVol=cbm*167, expressVol=cbm*200, revenueTon=Math.max(cbm,weight/1000);
    out.simpleSku.textContent=`${f(sku)}종`;out.simpleQty.textContent=`${f(qty)}개`;out.simpleCbm.textContent=f(cbm,3);out.simpleWeight.textContent=f(weight,1);
    out.simpleAirVolume.textContent=`${f(airVol,1)} kg`;out.simpleAirCharge.textContent=`${f(Math.max(weight,airVol),1)} kg`;
    out.simpleExpressVolume.textContent=`${f(expressVol,1)} kg`;out.simpleExpressCharge.textContent=`${f(Math.max(weight,expressVol),1)} kg`;
    out.simpleRevenueTon.textContent=`${f(revenueTon,3)} R/T`;
    const vehicle=getSpecs('vehicle').find(s=>weight<=s[1]&&cbm<=s[2]);
    const container=getSpecs('container').find(s=>weight<=s[1]&&cbm<=s[2]);
    out.simpleVehicleRecommend.textContent=sku?(vehicle?vehicle[0]:'분할 배차 필요'):'-';
    out.simpleContainerRecommend.textContent=sku?(container?container[0]:'복수 컨테이너 검토'):'-';
    if(document.body.classList.contains('simple-mode')) updateHero(sku,qty,cbm,weight);
  }
  function updateHero(sku,qty,cbm,weight){
    const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val};
    set('heroSku',f(sku));set('heroQty',f(qty));set('heroCbm',f(cbm,3));set('heroWeight',f(weight,1));
  }
  function restorePlannerHero(){
    try{
      const cargos=window.__KBRIDGE_PLANNER_DEBUG__?.getState?.()?.cargos||[];
      let qty=0,cbm=0,weight=0;cargos.forEach(c=>{qty+=Number(c.qty||0);cbm+=Number(c.length||0)*Number(c.width||0)*Number(c.height||0)*Number(c.qty||0)/1e9;weight+=Number(c.weight||0)*Number(c.qty||0)});
      updateHero(cargos.length,qty,cbm,weight);
    }catch(_){ }
  }
  function setSimpleActive(active,push=true){
    document.body.classList.toggle('simple-mode',active);
    simplePanel.classList.toggle('hidden',!active);mainGrid.classList.toggle('hidden',active);
    if(infoGrid)infoGrid.classList.toggle('hidden',active);if(notice)notice.classList.toggle('hidden',active);
    document.querySelectorAll('.tool-mode-btn').forEach(btn=>{const on=active?btn===simpleBtn:(btn!==simpleBtn&&btn.classList.contains('active'));if(btn===simpleBtn){btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active))}});
    if(active){document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected','false')});calculate()}
    else restorePlannerHero();
    if(push){const u=new URL(location.href);u.searchParams.set('mode',active?'simple':(document.querySelector('[data-mode].active')?.dataset.mode||'vehicle'));history.replaceState(null,'',u)}
  }
  simpleBtn.addEventListener('click',()=>setSimpleActive(true));
  document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{setSimpleActive(false,false);setTimeout(()=>{document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b===btn));btn.setAttribute('aria-selected','true');const u=new URL(location.href);u.searchParams.set('mode',btn.dataset.mode);history.replaceState(null,'',u)},0)}));
  document.getElementById('simpleAddBtn')?.addEventListener('click',()=>addRow({name:`화물 ${rowsEl.children.length+1}`,l:500,w:400,h:400,q:1,kg:10}));
  document.getElementById('simpleResetBtn')?.addEventListener('click',()=>{rowsEl.innerHTML='';rowSeq=0;addRow({name:'화물 1',l:500,w:400,h:400,q:1,kg:10})});
  document.getElementById('simpleCalcBtn')?.addEventListener('click',calculate);
  addRow({name:'화물 1',l:500,w:400,h:400,q:1,kg:10});
  const requested=new URL(location.href).searchParams.get('mode');
  const shouldStartSimple=requested==='simple'||location.pathname.includes('simple-calculator')||document.body.dataset.defaultTool==='simple';
  if(shouldStartSimple){
    setSimpleActive(true,false);
    document.addEventListener('DOMContentLoaded',()=>{
      if(document.body.classList.contains('simple-mode')) setSimpleActive(true,false);
    },{once:true});
  }else if(requested==='container'||requested==='vehicle') document.querySelector(`[data-mode="${requested}"]`)?.click();
})();

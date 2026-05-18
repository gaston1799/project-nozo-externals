/* Extracted from .PROJECT NOZO w moomoo.js. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

class Utils {
                    constructor() {
                        // MATH UTILS:
                        let mathABS = Math.abs,
                            mathCOS = Math.cos,
                            mathSIN = Math.sin,
                            mathPOW = Math.pow,
                            mathSQRT = Math.sqrt,
                            mathATAN2 = Math.atan2,
                            mathPI = Math.PI;

                        let _this = this;

                        this.shouldDrawCCW = function (a, b) {
                            // normalize diff into [0,â€Š2Ï€)
                            const diff = (b - a + 2 * Math.PI) % (2 * Math.PI);
                            // if diff > Ï€, the shorter way is ccw (anticlockwise)
                            return diff > Math.PI;
                        };
                        // GLOBAL UTILS:
                        this.round = function (n, v) {
                            return Math.round(n * v) / v;
                        };
                        this.toRad = function (angle) {
                            return angle * (mathPI / 180);
                        };
                        this.toAng = function (radian) {
                            return radian / (mathPI / 180);
                        };
                        this.randInt = function (min, max) {
                            return Math.floor(Math.random() * (max - min + 1)) + min;
                        };
                        this.randFloat = function (min, max) {
                            return Math.random() * (max - min + 1) + min;
                        };
                        this.lerp = function (value1, value2, amount) {
                            return value1 + (value2 - value1) * amount;
                        };
                        this.decel = function (val, cel) {
                            if (val > 0)
                                val = Math.max(0, val - cel);
                            else if (val < 0)
                                val = Math.min(0, val + cel);
                            return val;
                        };
                        this.getDistance = function (x1, y1, x2, y2) {
                            return mathSQRT((x2 -= x1) * x2 + (y2 -= y1) * y2);
                        };
                        this.getDist = function (tmp1, tmp2, type1, type2) {
                            const x1 = type1 == 0 ? tmp1.x : type1 == 1 ? tmp1.x1 : type1 == 2 ? tmp1.x2 : tmp1.x3;
                            const y1 = type1 == 0 ? tmp1.y : type1 == 1 ? tmp1.y1 : type1 == 2 ? tmp1.y2 : tmp1.y3;
                            const x2 = type2 == 0 ? tmp2.x : type2 == 1 ? tmp2.x1 : type2 == 2 ? tmp2.x2 : tmp2.x3;
                            const y2 = type2 == 0 ? tmp2.y : type2 == 1 ? tmp2.y1 : type2 == 2 ? tmp2.y2 : tmp2.y3;
                            const dx = x2 - x1, dy = y2 - y1;
                            return mathSQRT(dx * dx + dy * dy);
                        };
                        this.getDirection = function (x1, y1, x2, y2) {
                            return mathATAN2(y1 - y2, x1 - x2);
                        };
                        this.getDirect = function (tmp1, tmp2, type1, type2) {
                            const x1 = type1 == 0 ? tmp1.x : type1 == 1 ? tmp1.x1 : type1 == 2 ? tmp1.x2 : tmp1.x3;
                            const y1 = type1 == 0 ? tmp1.y : type1 == 1 ? tmp1.y1 : type1 == 2 ? tmp1.y2 : tmp1.y3;
                            const x2 = type2 == 0 ? tmp2.x : type2 == 1 ? tmp2.x1 : type2 == 2 ? tmp2.x2 : tmp2.x3;
                            const y2 = type2 == 0 ? tmp2.y : type2 == 1 ? tmp2.y1 : type2 == 2 ? tmp2.y2 : tmp2.y3;
                            return mathATAN2(y1 - y2, x1 - x2);
                        };
                        this.getAngleDist = function (a, b) {
                            let p = mathABS(b - a) % (mathPI * 2);
                            return (p > mathPI ? (mathPI * 2) - p : p);
                        };
                        this.isNumber = function (n) {
                            return (typeof n == "number" && !isNaN(n) && isFinite(n));
                        };
                        this.isString = function (s) {
                            return (s && typeof s == "string");
                        };
                        this.kFormat = function (num) {
                            return num > 999 ? (num / 1000).toFixed(1) + "k" : num;
                        };
                        this.sFormat = function (num) {
                            let fixs = [
                                { num: 1e3, string: "k" },
                                { num: 1e6, string: "m" },
                                { num: 1e9, string: "b" },
                                { num: 1e12, string: "q" }
                            ].reverse();
                            let sp = fixs.find(v => num >= v.num);
                            if (!sp) return num;
                            return (num / sp.num).toFixed(1) + sp.string;
                        };
                        this.capitalizeFirst = function (string) {
                            return string.charAt(0).toUpperCase() + string.slice(1);
                        };
                        this.fixTo = function (n, v) {
                            return parseFloat(n.toFixed(v));
                        };
                        this.sortByPoints = function (a, b) {
                            return parseFloat(b.points) - parseFloat(a.points);
                        };
                        this.lineInRect = function (recX, recY, recX2, recY2, x1, y1, x2, y2) {
                            let minX = x1;
                            let maxX = x2;
                            if (x1 > x2) {
                                minX = x2;
                                maxX = x1;
                            }
                            if (maxX > recX2)
                                maxX = recX2;
                            if (minX < recX)
                                minX = recX;
                            if (minX > maxX)
                                return false;
                            let minY = y1;
                            let maxY = y2;
                            let dx = x2 - x1;
                            if (Math.abs(dx) > 0.0000001) {
                                let a = (y2 - y1) / dx;
                                let b = y1 - a * x1;
                                minY = a * minX + b;
                                maxY = a * maxX + b;
                            }
                            if (minY > maxY) {
                                let tmp = maxY;
                                maxY = minY;
                                minY = tmp;
                            }
                            if (maxY > recY2)
                                maxY = recY2;
                            if (minY < recY)
                                minY = recY;
                            if (minY > maxY)
                                return false;
                            return true;
                        };
                        this.containsPoint = function (element, x, y) {
                            let bounds = element.getBoundingClientRect();
                            let left = bounds.left + unsafeWindow.scrollX;
                            let top = bounds.top + unsafeWindow.scrollY;
                            let width = bounds.width;
                            let height = bounds.height;

                            let insideHorizontal = x > left && x < left + width;
                            let insideVertical = y > top && y < top + height;
                            return insideHorizontal && insideVertical;
                        };
                        this.mousifyTouchEvent = function (event) {
                            let touch = event.changedTouches[0];
                            event.screenX = touch.screenX;
                            event.screenY = touch.screenY;
                            event.clientX = touch.clientX;
                            event.clientY = touch.clientY;
                            event.pageX = touch.pageX;
                            event.pageY = touch.pageY;
                        };
                        this.hookTouchEvents = function (element, skipPrevent) {
                            let preventDefault = !skipPrevent;
                            let isHovering = false;
                            // let passive = unsafeWindow.Modernizr.passiveeventlisteners ? {passive: true} : false;
                            let passive = false;
                            element.addEventListener("touchstart", this.checkTrusted(touchStart), passive);
                            element.addEventListener("touchmove", this.checkTrusted(touchMove), passive);
                            element.addEventListener("touchend", this.checkTrusted(touchEnd), passive);
                            element.addEventListener("touchcancel", this.checkTrusted(touchEnd), passive);
                            element.addEventListener("touchleave", this.checkTrusted(touchEnd), passive);

                            function touchStart(e) {
                                _this.mousifyTouchEvent(e);
                                unsafeWindow.setUsingTouch(true);
                                if (preventDefault) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }
                                if (element.onmouseover)
                                    element.onmouseover(e);
                                isHovering = true;
                            }

                            function touchMove(e) {
                                _this.mousifyTouchEvent(e);
                                unsafeWindow.setUsingTouch(true);
                                if (preventDefault) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }
                                if (_this.containsPoint(element, e.pageX, e.pageY)) {
                                    if (!isHovering) {
                                        if (element.onmouseover)
                                            element.onmouseover(e);
                                        isHovering = true;
                                    }
                                } else {
                                    if (isHovering) {
                                        if (element.onmouseout)
                                            element.onmouseout(e);
                                        isHovering = false;
                                    }
                                }
                            }

                            function touchEnd(e) {
                                _this.mousifyTouchEvent(e);
                                unsafeWindow.setUsingTouch(true);
                                if (preventDefault) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }
                                if (isHovering) {
                                    if (element.onclick)
                                        element.onclick(e);
                                    if (element.onmouseout)
                                        element.onmouseout(e);
                                    isHovering = false;
                                }
                            }
                        };
                        this.removeAllChildren = function (element) {
                            while (element.hasChildNodes()) {
                                element.removeChild(element.lastChild);
                            }
                        };
                        this.generateElement = function (config) {
                            let element = document.createElement(config.tag || "div");

                            function bind(configValue, elementValue) {
                                if (config[configValue])
                                    element[elementValue] = config[configValue];
                            }
                            bind("text", "textContent");
                            bind("html", "innerHTML");
                            bind("class", "className");
                            for (let key in config) {
                                switch (key) {
                                    case "tag":
                                    case "text":
                                    case "html":
                                    case "class":
                                    case "style":
                                    case "hookTouch":
                                    case "parent":
                                    case "children":
                                        continue;
                                    default:
                                        break;
                                }
                                element[key] = config[key];
                            }
                            if (element.onclick)
                                element.onclick = this.checkTrusted(element.onclick);
                            if (element.onmouseover)
                                element.onmouseover = this.checkTrusted(element.onmouseover);
                            if (element.onmouseout)
                                element.onmouseout = this.checkTrusted(element.onmouseout);
                            if (config.style) {
                                element.style.cssText = config.style;
                            }
                            if (config.hookTouch) {
                                this.hookTouchEvents(element);
                            }
                            if (config.parent) {
                                config.parent.appendChild(element);
                            }
                            if (config.children) {
                                for (let i = 0; i < config.children.length; i++) {
                                    element.appendChild(config.children[i]);
                                }
                            }
                            return element;
                        };
                        this.checkTrusted = function (callback) {
                            return function (ev) {
                                if (ev && ev instanceof Event && (ev && typeof ev.isTrusted == "boolean" ? ev.isTrusted : true)) {
                                    callback(ev);
                                } else {
                                    //console.error("Event is not trusted.", ev);
                                }
                            };
                        };
                        this.randomString = function (length) {
                            let text = "";
                            let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                            for (let i = 0; i < length; i++) {
                                text += possible.charAt(Math.floor(Math.random() * possible.length));
                            }
                            return text;
                        };
                        this.countInArray = function (array, val) {
                            let count = 0;
                            for (let i = 0; i < array.length; i++) {
                                if (array[i] === val) count++;
                            }
                            return count;
                        };
                        this.hexToRgb = function (hex) {
                            return hex.slice(1).match(/.{1,2}/g).map(g => parseInt(g, 16));
                        };
                        this.getRgb = function (r, g, b) {
                            return [r / 255, g / 255, b / 255].join(", ");
                        };

                        //
                        // RAYCAST / LINE-OF-SIGHT UTILS
                        //
                        // Usage:
                        //   const hit = UTILS.raycast({x: x1, y: y1}, {x: x2, y: y2}, { ignore: [objA], includeTraps: false });
                        // Returns:
                        //   - null if the segment is clear
                        //   - { object: obj, x: hitX, y: hitY, t: t } for the closest hit (t is [0..1] distance along segment)
                        //
                        this.raycast = function (start, end, opts) {
                            opts = opts || {};
                            const ignoreList = Array.isArray(opts.ignore) ? opts.ignore : [];
                            const includeTraps = !!opts.includeTraps; // by default traps (spikes) are treated like non-blocking
                            const maxDistance = typeof opts.maxDistance === 'number' ? opts.maxDistance : null;

                            if (typeof start !== 'object' || typeof end !== 'object') return null;
                            if (typeof gameObjects === 'undefined' || !Array.isArray(gameObjects)) return null;

                            const x1 = start.x, y1 = start.y, x2 = end.x, y2 = end.y;
                            const dx = x2 - x1, dy = y2 - y1;
                            const segLen2 = dx * dx + dy * dy;
                            const segLen = Math.sqrt(segLen2);

                            // if a maxDistance is set and the end is further than that, clamp end to maxDistance
                            let ex = x2, ey = y2;
                            if (maxDistance !== null && segLen > maxDistance) {
                                const s = maxDistance / segLen;
                                ex = x1 + dx * s;
                                ey = y1 + dy * s;
                            }

                            function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

                            function segmentCircleIntersection(x1, y1, x2, y2, cx, cy, r) {
                                // project center onto segment, find closest point parameter t
                                const vx = x2 - x1, vy = y2 - y1;
                                const l2 = vx * vx + vy * vy;
                                if (l2 === 0) {
                                    // segment is a point
                                    const dx0 = cx - x1, dy0 = cy - y1;
                                    const d2 = dx0 * dx0 + dy0 * dy0;
                                    return d2 <= r * r ? { t: 0, x: x1, y: y1 } : null;
                                }
                                const t = ((cx - x1) * vx + (cy - y1) * vy) / l2;
                                const tClamped = clamp(t, 0, 1);
                                const px = x1 + vx * tClamped;
                                const py = y1 + vy * tClamped;
                                const dx0 = px - cx, dy0 = py - cy;
                                const d2 = dx0 * dx0 + dy0 * dy0;
                                if (d2 <= r * r) {
                                    // compute exact t of the intersection point along segment (approximate by clamped t)
                                    return { t: tClamped, x: px, y: py };
                                }
                                return null;
                            }

                            function pointInRect(px, py, left, top, right, bottom) {
                                return px >= left && px <= right && py >= top && py <= bottom;
                            }

                            function segmentIntersectsSegment(x1, y1, x2, y2, x3, y3, x4, y4) {
                                // Standard segment intersection test with parametric t,u
                                const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
                                if (Math.abs(denom) < 1e-9) return null; // parallel
                                const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
                                const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
                                if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
                                    return { t: ua, x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
                                }
                                return null;
                            }

                            function segmentRectIntersection(x1, y1, x2, y2, left, top, right, bottom) {
                                // If either endpoint inside rect -> intersection at that endpoint
                                if (pointInRect(x1, y1, left, top, right, bottom)) return { t: 0, x: x1, y: y1 };
                                if (pointInRect(x2, y2, left, top, right, bottom)) {
                                    // endpoint 2 inside, return near end (t approx 1)
                                    return { t: 1, x: x2, y: y2 };
                                }
                                // check intersections with 4 rectangle edges
                                const edges = [
                                    [left, top, right, top],
                                    [right, top, right, bottom],
                                    [right, bottom, left, bottom],
                                    [left, bottom, left, top]
                                ];
                                let best = null;
                                for (let i = 0; i < edges.length; i++) {
                                    const e = edges[i];
                                    const hit = segmentIntersectsSegment(x1, y1, x2, y2, e[0], e[1], e[2], e[3]);
                                    if (hit) {
                                        if (best === null || hit.t < best.t) best = hit;
                                    }
                                }
                                return best;
                            }

                            // iterate gameObjects and test intersections, returning the closest hit (smallest t)
                            let closest = null;
                            for (let i = 0; i < gameObjects.length; i++) {
                                const obj = gameObjects[i];
                                if (!obj || !obj.active) continue;
                                if (ignoreList.indexOf(obj) !== -1) continue;
                                // default: treat traps/spikes as non-blocking unless includeTraps === true
                                if (!includeTraps && obj.trap && obj.name && obj.name.indexOf('spike') !== -1) continue;

                                // skip objects without position
                                if (typeof obj.x !== 'number' || typeof obj.y !== 'number') continue;

                                // prepare shape heuristics
                                const r = (obj.radius || obj.scale || obj.size || obj.r) || null;
                                const w = (obj.width || obj.w || obj.size) || null;
                                const h = (obj.height || obj.h || obj.size) || null;

                                let hit = null;
                                if (r !== null) {
                                    // treat as circle
                                    // use the (possibly clamped) end px/py not necessary; use original segment
                                    hit = segmentCircleIntersection(x1, y1, ex, ey, obj.x, obj.y, r + (opts.padding || 2));
                                } else if (w !== null && h !== null) {
                                    // treat as rectangle centered on obj.x,obj.y
                                    const halfW = w / 2, halfH = h / 2;
                                    const left = obj.x - halfW;
                                    const right = obj.x + halfW;
                                    const top = obj.y - halfH;
                                    const bottom = obj.y + halfH;
                                    hit = segmentRectIntersection(x1, y1, ex, ey, left, top, right, bottom);
                                } else {
                                    // fallback: circle with heuristic radius
                                    const heuristicR = (obj.scale || obj.radius || 16);
                                    hit = segmentCircleIntersection(x1, y1, ex, ey, obj.x, obj.y, heuristicR + (opts.padding || 2));
                                }

                                if (hit) {
                                    // compute full-segment t relative to original end (use the clamped end if we clamped earlier)
                                    // clamp t into [0,1]
                                    const tClamped = clamp(hit.t, 0, 1);
                                    // If we limited the end by maxDistance, the segment length became shorter; ensure we return increasing t along original segment length
                                    // We'll compute actual distance from start to hit point and convert to t on original segment:
                                    const hitX = hit.x, hitY = hit.y;
                                    const distToHit = Math.sqrt((hitX - x1) * (hitX - x1) + (hitY - y1) * (hitY - y1));
                                    const tOnOriginal = segLen > 0 ? clamp(distToHit / segLen, 0, 1) : 0;

                                    if (closest === null || tOnOriginal < closest.t) {
                                        closest = { object: obj, x: hitX, y: hitY, t: tOnOriginal };
                                    }
                                }
                            }

                            return closest;
                        };
                    }
                }

    Nozo.Utils = Utils;
    Nozo.createUtils = function createUtils() {
        return new Utils();
    };
    root.NozoUtils = Utils;
})();

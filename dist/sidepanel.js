(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
var n, l$1, u$2, i$1, o$1, r$1, e$1, f$2, c$1, s$1, a$1, p$1 = {}, v$1 = [], y$1 = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i, d$1 = Array.isArray;
function w$1(n2, l2) {
  for (var u2 in l2) n2[u2] = l2[u2];
  return n2;
}
function g(n2) {
  n2 && n2.parentNode && n2.parentNode.removeChild(n2);
}
function _(l2, u2, t2) {
  var i2, o2, r2, e2 = {};
  for (r2 in u2) "key" == r2 ? i2 = u2[r2] : "ref" == r2 ? o2 = u2[r2] : e2[r2] = u2[r2];
  if (arguments.length > 2 && (e2.children = arguments.length > 3 ? n.call(arguments, 2) : t2), "function" == typeof l2 && null != l2.defaultProps) for (r2 in l2.defaultProps) void 0 === e2[r2] && (e2[r2] = l2.defaultProps[r2]);
  return m$1(l2, e2, i2, o2, null);
}
function m$1(n2, t2, i2, o2, r2) {
  var e2 = { type: n2, props: t2, key: i2, ref: o2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == r2 ? ++u$2 : r2, __i: -1, __u: 0 };
  return null == r2 && null != l$1.vnode && l$1.vnode(e2), e2;
}
function k$1(n2) {
  return n2.children;
}
function x(n2, l2) {
  this.props = n2, this.context = l2;
}
function S(n2, l2) {
  if (null == l2) return n2.__ ? S(n2.__, n2.__i + 1) : null;
  for (var u2; l2 < n2.__k.length; l2++) if (null != (u2 = n2.__k[l2]) && null != u2.__e) return u2.__e;
  return "function" == typeof n2.type ? S(n2) : null;
}
function C$1(n2) {
  var l2, u2;
  if (null != (n2 = n2.__) && null != n2.__c) {
    for (n2.__e = n2.__c.base = null, l2 = 0; l2 < n2.__k.length; l2++) if (null != (u2 = n2.__k[l2]) && null != u2.__e) {
      n2.__e = n2.__c.base = u2.__e;
      break;
    }
    return C$1(n2);
  }
}
function M(n2) {
  (!n2.__d && (n2.__d = true) && i$1.push(n2) && !$.__r++ || o$1 != l$1.debounceRendering) && ((o$1 = l$1.debounceRendering) || r$1)($);
}
function $() {
  for (var n2, u2, t2, o2, r2, f2, c2, s2 = 1; i$1.length; ) i$1.length > s2 && i$1.sort(e$1), n2 = i$1.shift(), s2 = i$1.length, n2.__d && (t2 = void 0, o2 = void 0, r2 = (o2 = (u2 = n2).__v).__e, f2 = [], c2 = [], u2.__P && ((t2 = w$1({}, o2)).__v = o2.__v + 1, l$1.vnode && l$1.vnode(t2), O(u2.__P, t2, o2, u2.__n, u2.__P.namespaceURI, 32 & o2.__u ? [r2] : null, f2, null == r2 ? S(o2) : r2, !!(32 & o2.__u), c2), t2.__v = o2.__v, t2.__.__k[t2.__i] = t2, N(f2, t2, c2), o2.__e = o2.__ = null, t2.__e != r2 && C$1(t2)));
  $.__r = 0;
}
function I(n2, l2, u2, t2, i2, o2, r2, e2, f2, c2, s2) {
  var a2, h2, y2, d2, w2, g2, _2, m2 = t2 && t2.__k || v$1, b = l2.length;
  for (f2 = P(u2, l2, m2, f2, b), a2 = 0; a2 < b; a2++) null != (y2 = u2.__k[a2]) && (h2 = -1 == y2.__i ? p$1 : m2[y2.__i] || p$1, y2.__i = a2, g2 = O(n2, y2, h2, i2, o2, r2, e2, f2, c2, s2), d2 = y2.__e, y2.ref && h2.ref != y2.ref && (h2.ref && B$1(h2.ref, null, y2), s2.push(y2.ref, y2.__c || d2, y2)), null == w2 && null != d2 && (w2 = d2), (_2 = !!(4 & y2.__u)) || h2.__k === y2.__k ? f2 = A$1(y2, f2, n2, _2) : "function" == typeof y2.type && void 0 !== g2 ? f2 = g2 : d2 && (f2 = d2.nextSibling), y2.__u &= -7);
  return u2.__e = w2, f2;
}
function P(n2, l2, u2, t2, i2) {
  var o2, r2, e2, f2, c2, s2 = u2.length, a2 = s2, h2 = 0;
  for (n2.__k = new Array(i2), o2 = 0; o2 < i2; o2++) null != (r2 = l2[o2]) && "boolean" != typeof r2 && "function" != typeof r2 ? ("string" == typeof r2 || "number" == typeof r2 || "bigint" == typeof r2 || r2.constructor == String ? r2 = n2.__k[o2] = m$1(null, r2, null, null, null) : d$1(r2) ? r2 = n2.__k[o2] = m$1(k$1, { children: r2 }, null, null, null) : void 0 === r2.constructor && r2.__b > 0 ? r2 = n2.__k[o2] = m$1(r2.type, r2.props, r2.key, r2.ref ? r2.ref : null, r2.__v) : n2.__k[o2] = r2, f2 = o2 + h2, r2.__ = n2, r2.__b = n2.__b + 1, e2 = null, -1 != (c2 = r2.__i = L(r2, u2, f2, a2)) && (a2--, (e2 = u2[c2]) && (e2.__u |= 2)), null == e2 || null == e2.__v ? (-1 == c2 && (i2 > s2 ? h2-- : i2 < s2 && h2++), "function" != typeof r2.type && (r2.__u |= 4)) : c2 != f2 && (c2 == f2 - 1 ? h2-- : c2 == f2 + 1 ? h2++ : (c2 > f2 ? h2-- : h2++, r2.__u |= 4))) : n2.__k[o2] = null;
  if (a2) for (o2 = 0; o2 < s2; o2++) null != (e2 = u2[o2]) && 0 == (2 & e2.__u) && (e2.__e == t2 && (t2 = S(e2)), D$1(e2, e2));
  return t2;
}
function A$1(n2, l2, u2, t2) {
  var i2, o2;
  if ("function" == typeof n2.type) {
    for (i2 = n2.__k, o2 = 0; i2 && o2 < i2.length; o2++) i2[o2] && (i2[o2].__ = n2, l2 = A$1(i2[o2], l2, u2, t2));
    return l2;
  }
  n2.__e != l2 && (t2 && (l2 && n2.type && !l2.parentNode && (l2 = S(n2)), u2.insertBefore(n2.__e, l2 || null)), l2 = n2.__e);
  do {
    l2 = l2 && l2.nextSibling;
  } while (null != l2 && 8 == l2.nodeType);
  return l2;
}
function L(n2, l2, u2, t2) {
  var i2, o2, r2, e2 = n2.key, f2 = n2.type, c2 = l2[u2], s2 = null != c2 && 0 == (2 & c2.__u);
  if (null === c2 && null == e2 || s2 && e2 == c2.key && f2 == c2.type) return u2;
  if (t2 > (s2 ? 1 : 0)) {
    for (i2 = u2 - 1, o2 = u2 + 1; i2 >= 0 || o2 < l2.length; ) if (null != (c2 = l2[r2 = i2 >= 0 ? i2-- : o2++]) && 0 == (2 & c2.__u) && e2 == c2.key && f2 == c2.type) return r2;
  }
  return -1;
}
function T$1(n2, l2, u2) {
  "-" == l2[0] ? n2.setProperty(l2, null == u2 ? "" : u2) : n2[l2] = null == u2 ? "" : "number" != typeof u2 || y$1.test(l2) ? u2 : u2 + "px";
}
function j$1(n2, l2, u2, t2, i2) {
  var o2, r2;
  n: if ("style" == l2) if ("string" == typeof u2) n2.style.cssText = u2;
  else {
    if ("string" == typeof t2 && (n2.style.cssText = t2 = ""), t2) for (l2 in t2) u2 && l2 in u2 || T$1(n2.style, l2, "");
    if (u2) for (l2 in u2) t2 && u2[l2] == t2[l2] || T$1(n2.style, l2, u2[l2]);
  }
  else if ("o" == l2[0] && "n" == l2[1]) o2 = l2 != (l2 = l2.replace(f$2, "$1")), r2 = l2.toLowerCase(), l2 = r2 in n2 || "onFocusOut" == l2 || "onFocusIn" == l2 ? r2.slice(2) : l2.slice(2), n2.l || (n2.l = {}), n2.l[l2 + o2] = u2, u2 ? t2 ? u2.u = t2.u : (u2.u = c$1, n2.addEventListener(l2, o2 ? a$1 : s$1, o2)) : n2.removeEventListener(l2, o2 ? a$1 : s$1, o2);
  else {
    if ("http://www.w3.org/2000/svg" == i2) l2 = l2.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
    else if ("width" != l2 && "height" != l2 && "href" != l2 && "list" != l2 && "form" != l2 && "tabIndex" != l2 && "download" != l2 && "rowSpan" != l2 && "colSpan" != l2 && "role" != l2 && "popover" != l2 && l2 in n2) try {
      n2[l2] = null == u2 ? "" : u2;
      break n;
    } catch (n3) {
    }
    "function" == typeof u2 || (null == u2 || false === u2 && "-" != l2[4] ? n2.removeAttribute(l2) : n2.setAttribute(l2, "popover" == l2 && 1 == u2 ? "" : u2));
  }
}
function F(n2) {
  return function(u2) {
    if (this.l) {
      var t2 = this.l[u2.type + n2];
      if (null == u2.t) u2.t = c$1++;
      else if (u2.t < t2.u) return;
      return t2(l$1.event ? l$1.event(u2) : u2);
    }
  };
}
function O(n2, u2, t2, i2, o2, r2, e2, f2, c2, s2) {
  var a2, h2, p2, v2, y2, _2, m2, b, S2, C2, M2, $2, P2, A2, H, L2, T2, j2 = u2.type;
  if (void 0 !== u2.constructor) return null;
  128 & t2.__u && (c2 = !!(32 & t2.__u), r2 = [f2 = u2.__e = t2.__e]), (a2 = l$1.__b) && a2(u2);
  n: if ("function" == typeof j2) try {
    if (b = u2.props, S2 = "prototype" in j2 && j2.prototype.render, C2 = (a2 = j2.contextType) && i2[a2.__c], M2 = a2 ? C2 ? C2.props.value : a2.__ : i2, t2.__c ? m2 = (h2 = u2.__c = t2.__c).__ = h2.__E : (S2 ? u2.__c = h2 = new j2(b, M2) : (u2.__c = h2 = new x(b, M2), h2.constructor = j2, h2.render = E), C2 && C2.sub(h2), h2.state || (h2.state = {}), h2.__n = i2, p2 = h2.__d = true, h2.__h = [], h2._sb = []), S2 && null == h2.__s && (h2.__s = h2.state), S2 && null != j2.getDerivedStateFromProps && (h2.__s == h2.state && (h2.__s = w$1({}, h2.__s)), w$1(h2.__s, j2.getDerivedStateFromProps(b, h2.__s))), v2 = h2.props, y2 = h2.state, h2.__v = u2, p2) S2 && null == j2.getDerivedStateFromProps && null != h2.componentWillMount && h2.componentWillMount(), S2 && null != h2.componentDidMount && h2.__h.push(h2.componentDidMount);
    else {
      if (S2 && null == j2.getDerivedStateFromProps && b !== v2 && null != h2.componentWillReceiveProps && h2.componentWillReceiveProps(b, M2), u2.__v == t2.__v || !h2.__e && null != h2.shouldComponentUpdate && false === h2.shouldComponentUpdate(b, h2.__s, M2)) {
        for (u2.__v != t2.__v && (h2.props = b, h2.state = h2.__s, h2.__d = false), u2.__e = t2.__e, u2.__k = t2.__k, u2.__k.some(function(n3) {
          n3 && (n3.__ = u2);
        }), $2 = 0; $2 < h2._sb.length; $2++) h2.__h.push(h2._sb[$2]);
        h2._sb = [], h2.__h.length && e2.push(h2);
        break n;
      }
      null != h2.componentWillUpdate && h2.componentWillUpdate(b, h2.__s, M2), S2 && null != h2.componentDidUpdate && h2.__h.push(function() {
        h2.componentDidUpdate(v2, y2, _2);
      });
    }
    if (h2.context = M2, h2.props = b, h2.__P = n2, h2.__e = false, P2 = l$1.__r, A2 = 0, S2) {
      for (h2.state = h2.__s, h2.__d = false, P2 && P2(u2), a2 = h2.render(h2.props, h2.state, h2.context), H = 0; H < h2._sb.length; H++) h2.__h.push(h2._sb[H]);
      h2._sb = [];
    } else do {
      h2.__d = false, P2 && P2(u2), a2 = h2.render(h2.props, h2.state, h2.context), h2.state = h2.__s;
    } while (h2.__d && ++A2 < 25);
    h2.state = h2.__s, null != h2.getChildContext && (i2 = w$1(w$1({}, i2), h2.getChildContext())), S2 && !p2 && null != h2.getSnapshotBeforeUpdate && (_2 = h2.getSnapshotBeforeUpdate(v2, y2)), L2 = a2, null != a2 && a2.type === k$1 && null == a2.key && (L2 = V(a2.props.children)), f2 = I(n2, d$1(L2) ? L2 : [L2], u2, t2, i2, o2, r2, e2, f2, c2, s2), h2.base = u2.__e, u2.__u &= -161, h2.__h.length && e2.push(h2), m2 && (h2.__E = h2.__ = null);
  } catch (n3) {
    if (u2.__v = null, c2 || null != r2) if (n3.then) {
      for (u2.__u |= c2 ? 160 : 128; f2 && 8 == f2.nodeType && f2.nextSibling; ) f2 = f2.nextSibling;
      r2[r2.indexOf(f2)] = null, u2.__e = f2;
    } else {
      for (T2 = r2.length; T2--; ) g(r2[T2]);
      z$1(u2);
    }
    else u2.__e = t2.__e, u2.__k = t2.__k, n3.then || z$1(u2);
    l$1.__e(n3, u2, t2);
  }
  else null == r2 && u2.__v == t2.__v ? (u2.__k = t2.__k, u2.__e = t2.__e) : f2 = u2.__e = q$1(t2.__e, u2, t2, i2, o2, r2, e2, c2, s2);
  return (a2 = l$1.diffed) && a2(u2), 128 & u2.__u ? void 0 : f2;
}
function z$1(n2) {
  n2 && n2.__c && (n2.__c.__e = true), n2 && n2.__k && n2.__k.forEach(z$1);
}
function N(n2, u2, t2) {
  for (var i2 = 0; i2 < t2.length; i2++) B$1(t2[i2], t2[++i2], t2[++i2]);
  l$1.__c && l$1.__c(u2, n2), n2.some(function(u3) {
    try {
      n2 = u3.__h, u3.__h = [], n2.some(function(n3) {
        n3.call(u3);
      });
    } catch (n3) {
      l$1.__e(n3, u3.__v);
    }
  });
}
function V(n2) {
  return "object" != typeof n2 || null == n2 || n2.__b && n2.__b > 0 ? n2 : d$1(n2) ? n2.map(V) : w$1({}, n2);
}
function q$1(u2, t2, i2, o2, r2, e2, f2, c2, s2) {
  var a2, h2, v2, y2, w2, _2, m2, b = i2.props || p$1, k2 = t2.props, x2 = t2.type;
  if ("svg" == x2 ? r2 = "http://www.w3.org/2000/svg" : "math" == x2 ? r2 = "http://www.w3.org/1998/Math/MathML" : r2 || (r2 = "http://www.w3.org/1999/xhtml"), null != e2) {
    for (a2 = 0; a2 < e2.length; a2++) if ((w2 = e2[a2]) && "setAttribute" in w2 == !!x2 && (x2 ? w2.localName == x2 : 3 == w2.nodeType)) {
      u2 = w2, e2[a2] = null;
      break;
    }
  }
  if (null == u2) {
    if (null == x2) return document.createTextNode(k2);
    u2 = document.createElementNS(r2, x2, k2.is && k2), c2 && (l$1.__m && l$1.__m(t2, e2), c2 = false), e2 = null;
  }
  if (null == x2) b === k2 || c2 && u2.data == k2 || (u2.data = k2);
  else {
    if (e2 = e2 && n.call(u2.childNodes), !c2 && null != e2) for (b = {}, a2 = 0; a2 < u2.attributes.length; a2++) b[(w2 = u2.attributes[a2]).name] = w2.value;
    for (a2 in b) if (w2 = b[a2], "children" == a2) ;
    else if ("dangerouslySetInnerHTML" == a2) v2 = w2;
    else if (!(a2 in k2)) {
      if ("value" == a2 && "defaultValue" in k2 || "checked" == a2 && "defaultChecked" in k2) continue;
      j$1(u2, a2, null, w2, r2);
    }
    for (a2 in k2) w2 = k2[a2], "children" == a2 ? y2 = w2 : "dangerouslySetInnerHTML" == a2 ? h2 = w2 : "value" == a2 ? _2 = w2 : "checked" == a2 ? m2 = w2 : c2 && "function" != typeof w2 || b[a2] === w2 || j$1(u2, a2, w2, b[a2], r2);
    if (h2) c2 || v2 && (h2.__html == v2.__html || h2.__html == u2.innerHTML) || (u2.innerHTML = h2.__html), t2.__k = [];
    else if (v2 && (u2.innerHTML = ""), I("template" == t2.type ? u2.content : u2, d$1(y2) ? y2 : [y2], t2, i2, o2, "foreignObject" == x2 ? "http://www.w3.org/1999/xhtml" : r2, e2, f2, e2 ? e2[0] : i2.__k && S(i2, 0), c2, s2), null != e2) for (a2 = e2.length; a2--; ) g(e2[a2]);
    c2 || (a2 = "value", "progress" == x2 && null == _2 ? u2.removeAttribute("value") : null != _2 && (_2 !== u2[a2] || "progress" == x2 && !_2 || "option" == x2 && _2 != b[a2]) && j$1(u2, a2, _2, b[a2], r2), a2 = "checked", null != m2 && m2 != u2[a2] && j$1(u2, a2, m2, b[a2], r2));
  }
  return u2;
}
function B$1(n2, u2, t2) {
  try {
    if ("function" == typeof n2) {
      var i2 = "function" == typeof n2.__u;
      i2 && n2.__u(), i2 && null == u2 || (n2.__u = n2(u2));
    } else n2.current = u2;
  } catch (n3) {
    l$1.__e(n3, t2);
  }
}
function D$1(n2, u2, t2) {
  var i2, o2;
  if (l$1.unmount && l$1.unmount(n2), (i2 = n2.ref) && (i2.current && i2.current != n2.__e || B$1(i2, null, u2)), null != (i2 = n2.__c)) {
    if (i2.componentWillUnmount) try {
      i2.componentWillUnmount();
    } catch (n3) {
      l$1.__e(n3, u2);
    }
    i2.base = i2.__P = null;
  }
  if (i2 = n2.__k) for (o2 = 0; o2 < i2.length; o2++) i2[o2] && D$1(i2[o2], u2, t2 || "function" != typeof n2.type);
  t2 || g(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
}
function E(n2, l2, u2) {
  return this.constructor(n2, u2);
}
function G(u2, t2, i2) {
  var o2, r2, e2, f2;
  t2 == document && (t2 = document.documentElement), l$1.__ && l$1.__(u2, t2), r2 = (o2 = false) ? null : t2.__k, e2 = [], f2 = [], O(t2, u2 = t2.__k = _(k$1, null, [u2]), r2 || p$1, p$1, t2.namespaceURI, r2 ? null : t2.firstChild ? n.call(t2.childNodes) : null, e2, r2 ? r2.__e : t2.firstChild, o2, f2), N(e2, u2, f2);
}
n = v$1.slice, l$1 = { __e: function(n2, l2, u2, t2) {
  for (var i2, o2, r2; l2 = l2.__; ) if ((i2 = l2.__c) && !i2.__) try {
    if ((o2 = i2.constructor) && null != o2.getDerivedStateFromError && (i2.setState(o2.getDerivedStateFromError(n2)), r2 = i2.__d), null != i2.componentDidCatch && (i2.componentDidCatch(n2, t2 || {}), r2 = i2.__d), r2) return i2.__E = i2;
  } catch (l3) {
    n2 = l3;
  }
  throw n2;
} }, u$2 = 0, x.prototype.setState = function(n2, l2) {
  var u2;
  u2 = null != this.__s && this.__s != this.state ? this.__s : this.__s = w$1({}, this.state), "function" == typeof n2 && (n2 = n2(w$1({}, u2), this.props)), n2 && w$1(u2, n2), null != n2 && this.__v && (l2 && this._sb.push(l2), M(this));
}, x.prototype.forceUpdate = function(n2) {
  this.__v && (this.__e = true, n2 && this.__h.push(n2), M(this));
}, x.prototype.render = k$1, i$1 = [], r$1 = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e$1 = function(n2, l2) {
  return n2.__v.__b - l2.__v.__b;
}, $.__r = 0, f$2 = /(PointerCapture)$|Capture$/i, c$1 = 0, s$1 = F(false), a$1 = F(true);
var f$1 = 0;
function u$1(e2, t2, n2, o2, i2, u2) {
  t2 || (t2 = {});
  var a2, c2, p2 = t2;
  if ("ref" in p2) for (c2 in p2 = {}, t2) "ref" == c2 ? a2 = t2[c2] : p2[c2] = t2[c2];
  var l2 = { type: e2, props: p2, key: n2, ref: a2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f$1, __i: -1, __u: 0, __source: i2, __self: u2 };
  if ("function" == typeof e2 && (a2 = e2.defaultProps)) for (c2 in a2) void 0 === p2[c2] && (p2[c2] = a2[c2]);
  return l$1.vnode && l$1.vnode(l2), l2;
}
var t, r, u, i, o = 0, f = [], c = l$1, e = c.__b, a = c.__r, v = c.diffed, l = c.__c, m = c.unmount, s = c.__;
function p(n2, t2) {
  c.__h && c.__h(r, n2, o || t2), o = 0;
  var u2 = r.__H || (r.__H = { __: [], __h: [] });
  return n2 >= u2.__.length && u2.__.push({}), u2.__[n2];
}
function d(n2) {
  return o = 1, h(D, n2);
}
function h(n2, u2, i2) {
  var o2 = p(t++, 2);
  if (o2.t = n2, !o2.__c && (o2.__ = [D(void 0, u2), function(n3) {
    var t2 = o2.__N ? o2.__N[0] : o2.__[0], r2 = o2.t(t2, n3);
    t2 !== r2 && (o2.__N = [r2, o2.__[1]], o2.__c.setState({}));
  }], o2.__c = r, !r.__f)) {
    var f2 = function(n3, t2, r2) {
      if (!o2.__c.__H) return true;
      var u3 = o2.__c.__H.__.filter(function(n4) {
        return !!n4.__c;
      });
      if (u3.every(function(n4) {
        return !n4.__N;
      })) return !c2 || c2.call(this, n3, t2, r2);
      var i3 = o2.__c.props !== n3;
      return u3.forEach(function(n4) {
        if (n4.__N) {
          var t3 = n4.__[0];
          n4.__ = n4.__N, n4.__N = void 0, t3 !== n4.__[0] && (i3 = true);
        }
      }), c2 && c2.call(this, n3, t2, r2) || i3;
    };
    r.__f = true;
    var c2 = r.shouldComponentUpdate, e2 = r.componentWillUpdate;
    r.componentWillUpdate = function(n3, t2, r2) {
      if (this.__e) {
        var u3 = c2;
        c2 = void 0, f2(n3, t2, r2), c2 = u3;
      }
      e2 && e2.call(this, n3, t2, r2);
    }, r.shouldComponentUpdate = f2;
  }
  return o2.__N || o2.__;
}
function y(n2, u2) {
  var i2 = p(t++, 3);
  !c.__s && C(i2.__H, u2) && (i2.__ = n2, i2.u = u2, r.__H.__h.push(i2));
}
function A(n2) {
  return o = 5, T(function() {
    return { current: n2 };
  }, []);
}
function T(n2, r2) {
  var u2 = p(t++, 7);
  return C(u2.__H, r2) && (u2.__ = n2(), u2.__H = r2, u2.__h = n2), u2.__;
}
function q(n2, t2) {
  return o = 8, T(function() {
    return n2;
  }, t2);
}
function j() {
  for (var n2; n2 = f.shift(); ) if (n2.__P && n2.__H) try {
    n2.__H.__h.forEach(z), n2.__H.__h.forEach(B), n2.__H.__h = [];
  } catch (t2) {
    n2.__H.__h = [], c.__e(t2, n2.__v);
  }
}
c.__b = function(n2) {
  r = null, e && e(n2);
}, c.__ = function(n2, t2) {
  n2 && t2.__k && t2.__k.__m && (n2.__m = t2.__k.__m), s && s(n2, t2);
}, c.__r = function(n2) {
  a && a(n2), t = 0;
  var i2 = (r = n2.__c).__H;
  i2 && (u === r ? (i2.__h = [], r.__h = [], i2.__.forEach(function(n3) {
    n3.__N && (n3.__ = n3.__N), n3.u = n3.__N = void 0;
  })) : (i2.__h.forEach(z), i2.__h.forEach(B), i2.__h = [], t = 0)), u = r;
}, c.diffed = function(n2) {
  v && v(n2);
  var t2 = n2.__c;
  t2 && t2.__H && (t2.__H.__h.length && (1 !== f.push(t2) && i === c.requestAnimationFrame || ((i = c.requestAnimationFrame) || w)(j)), t2.__H.__.forEach(function(n3) {
    n3.u && (n3.__H = n3.u), n3.u = void 0;
  })), u = r = null;
}, c.__c = function(n2, t2) {
  t2.some(function(n3) {
    try {
      n3.__h.forEach(z), n3.__h = n3.__h.filter(function(n4) {
        return !n4.__ || B(n4);
      });
    } catch (r2) {
      t2.some(function(n4) {
        n4.__h && (n4.__h = []);
      }), t2 = [], c.__e(r2, n3.__v);
    }
  }), l && l(n2, t2);
}, c.unmount = function(n2) {
  m && m(n2);
  var t2, r2 = n2.__c;
  r2 && r2.__H && (r2.__H.__.forEach(function(n3) {
    try {
      z(n3);
    } catch (n4) {
      t2 = n4;
    }
  }), r2.__H = void 0, t2 && c.__e(t2, r2.__v));
};
var k = "function" == typeof requestAnimationFrame;
function w(n2) {
  var t2, r2 = function() {
    clearTimeout(u2), k && cancelAnimationFrame(t2), setTimeout(n2);
  }, u2 = setTimeout(r2, 35);
  k && (t2 = requestAnimationFrame(r2));
}
function z(n2) {
  var t2 = r, u2 = n2.__c;
  "function" == typeof u2 && (n2.__c = void 0, u2()), r = t2;
}
function B(n2) {
  var t2 = r;
  n2.__c = n2.__(), r = t2;
}
function C(n2, t2) {
  return !n2 || n2.length !== t2.length || t2.some(function(t3, r2) {
    return t3 !== n2[r2];
  });
}
function D(n2, t2) {
  return "function" == typeof t2 ? t2(n2) : t2;
}
const PROVIDERS = {
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1/messages",
    models: [
      { id: "claude-opus-4-5-20251101", name: "Opus 4.5" },
      { id: "claude-opus-4-20250514", name: "Opus 4" },
      { id: "claude-sonnet-4-20250514", name: "Sonnet 4" },
      { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5" }
    ]
  },
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-5", name: "GPT-5" },
      { id: "gpt-5-mini", name: "GPT-5 Mini" },
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "o3", name: "o3" },
      { id: "o4-mini", name: "o4-mini" }
    ]
  },
  google: {
    name: "Google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    models: [
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro (Preview)" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }
    ]
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    models: [
      { id: "qwen/qwen3-vl-235b-a22b-thinking", name: "Qwen3 VL 235B (Reasoning)" },
      { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5 (Reasoning)" },
      { id: "mistralai/mistral-large-2512", name: "Mistral Large 3" }
    ]
  }
};
const CODEX_MODELS = [
  { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
  { id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini" },
  { id: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
  { id: "gpt-5-codex", name: "GPT-5 Codex" }
];
function useConfig() {
  const [providerKeys, setProviderKeys] = d({});
  const [customModels, setCustomModels] = d([]);
  const [currentModelIndex, setCurrentModelIndex] = d(0);
  const [userSkills, setUserSkills] = d([]);
  const [builtInSkills, setBuiltInSkills] = d([]);
  const [availableModels, setAvailableModels] = d([]);
  const [oauthStatus, setOauthStatus] = d({ isOAuthEnabled: false, isAuthenticated: false });
  const [codexStatus, setCodexStatus] = d({ isAuthenticated: false });
  const [isLoading, setIsLoading] = d(true);
  y(() => {
    loadConfig();
  }, []);
  const loadConfig = q(async () => {
    try {
      const config = await chrome.runtime.sendMessage({ type: "GET_CONFIG" });
      setProviderKeys(config.providerKeys || {});
      setCustomModels(config.customModels || []);
      setCurrentModelIndex(config.currentModelIndex || 0);
      setUserSkills(config.userSkills || []);
      setBuiltInSkills(config.builtInSkills || []);
      const oauth = await chrome.runtime.sendMessage({ type: "GET_OAUTH_STATUS" });
      setOauthStatus(oauth || { isOAuthEnabled: false, isAuthenticated: false });
      const codex = await chrome.runtime.sendMessage({ type: "GET_CODEX_STATUS" });
      setCodexStatus(codex || { isAuthenticated: false });
      await buildAvailableModels(
        config.providerKeys || {},
        config.customModels || [],
        oauth,
        codex
      );
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to load config:", error);
      setIsLoading(false);
    }
  }, []);
  const buildAvailableModels = q(async (keys, custom, oauth, codex) => {
    const models = [];
    const hasOAuth = (oauth == null ? void 0 : oauth.isOAuthEnabled) && (oauth == null ? void 0 : oauth.isAuthenticated);
    const hasCodexOAuth = codex == null ? void 0 : codex.isAuthenticated;
    if (hasCodexOAuth) {
      for (const model of CODEX_MODELS) {
        models.push({
          name: `${model.name} (Codex Plan)`,
          provider: "codex",
          modelId: model.id,
          baseUrl: "https://chatgpt.com/backend-api/codex/responses",
          apiKey: null,
          authMethod: "codex_oauth"
        });
      }
    }
    for (const [providerId, provider] of Object.entries(PROVIDERS)) {
      const hasApiKey = keys[providerId];
      if (providerId === "anthropic") {
        if (hasOAuth) {
          for (const model of provider.models) {
            models.push({
              name: `${model.name} (Claude Code)`,
              provider: providerId,
              modelId: model.id,
              baseUrl: provider.baseUrl,
              apiKey: null,
              authMethod: "oauth"
            });
          }
        }
        if (hasApiKey) {
          for (const model of provider.models) {
            models.push({
              name: `${model.name} (API)`,
              provider: providerId,
              modelId: model.id,
              baseUrl: provider.baseUrl,
              apiKey: hasApiKey,
              authMethod: "api_key"
            });
          }
        }
      } else if (hasApiKey) {
        for (const model of provider.models) {
          models.push({
            name: `${model.name} (API)`,
            provider: providerId,
            modelId: model.id,
            baseUrl: provider.baseUrl,
            apiKey: hasApiKey,
            authMethod: "api_key"
          });
        }
      }
    }
    for (const customModel of custom) {
      models.push({
        name: customModel.name,
        provider: "custom",
        modelId: customModel.modelId,
        baseUrl: customModel.baseUrl,
        apiKey: customModel.apiKey,
        authMethod: "api_key"
      });
    }
    setAvailableModels(models);
  }, []);
  const saveConfig = q(async () => {
    await chrome.runtime.sendMessage({
      type: "SAVE_CONFIG",
      payload: {
        providerKeys,
        customModels,
        currentModelIndex,
        userSkills
      }
    });
  }, [providerKeys, customModels, currentModelIndex, userSkills]);
  const selectModel = q(async (index) => {
    setCurrentModelIndex(index);
    const model = availableModels[index];
    if (model) {
      await chrome.runtime.sendMessage({
        type: "SAVE_CONFIG",
        payload: {
          currentModelIndex: index,
          model: model.modelId,
          apiBaseUrl: model.baseUrl,
          apiKey: model.apiKey,
          authMethod: model.authMethod
        }
      });
    }
  }, [availableModels]);
  const setProviderKey = q((provider, key) => {
    setProviderKeys((prev) => ({ ...prev, [provider]: key }));
  }, []);
  const addCustomModel = q((model) => {
    setCustomModels((prev) => [...prev, model]);
  }, []);
  const removeCustomModel = q((index) => {
    setCustomModels((prev) => prev.filter((_2, i2) => i2 !== index));
  }, []);
  const addUserSkill = q((skill) => {
    setUserSkills((prev) => {
      const existingIndex = prev.findIndex((s2) => s2.domain === skill.domain);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = skill;
        return updated;
      }
      return [...prev, skill];
    });
  }, []);
  const removeUserSkill = q((index) => {
    setUserSkills((prev) => prev.filter((_2, i2) => i2 !== index));
  }, []);
  const importCLI = q(async () => {
    const result = await chrome.runtime.sendMessage({ type: "IMPORT_CLI_CREDENTIALS" });
    if (result.success) {
      await loadConfig();
    }
    return result;
  }, [loadConfig]);
  const logoutCLI = q(async () => {
    await chrome.runtime.sendMessage({ type: "OAUTH_LOGOUT" });
    await loadConfig();
  }, [loadConfig]);
  const importCodex = q(async () => {
    const result = await chrome.runtime.sendMessage({ type: "IMPORT_CODEX_CREDENTIALS" });
    if (result.success) {
      await loadConfig();
    }
    return result;
  }, [loadConfig]);
  const logoutCodex = q(async () => {
    await chrome.runtime.sendMessage({ type: "CODEX_LOGOUT" });
    await loadConfig();
  }, [loadConfig]);
  const currentModel = availableModels[currentModelIndex] || null;
  return {
    // State
    providerKeys,
    customModels,
    currentModelIndex,
    userSkills,
    builtInSkills,
    availableModels,
    currentModel,
    oauthStatus,
    codexStatus,
    isLoading,
    // Actions
    loadConfig,
    saveConfig,
    selectModel,
    setProviderKey,
    addCustomModel,
    removeCustomModel,
    addUserSkill,
    removeUserSkill,
    importCLI,
    logoutCLI,
    importCodex,
    logoutCodex
  };
}
function useChat() {
  const [messages, setMessages] = d([]);
  const [isRunning, setIsRunning] = d(false);
  const [askBeforeActing] = d(false);
  const [attachedImages, setAttachedImages] = d([]);
  const [sessionTabGroupId, setSessionTabGroupId] = d(null);
  const [pendingPlan, setPendingPlan] = d(null);
  const [completedSteps, setCompletedSteps] = d([]);
  const [pendingStep, setPendingStep] = d(null);
  const streamingTextRef = A("");
  const [streamingMessageId, setStreamingMessageId] = d(null);
  y(() => {
    const listener = (message) => {
      switch (message.type) {
        case "TASK_UPDATE":
          handleTaskUpdate(message.update);
          break;
        case "TASK_COMPLETE":
          handleTaskComplete(message.result);
          break;
        case "TASK_ERROR":
          handleTaskError(message.error);
          break;
        case "PLAN_APPROVAL_REQUIRED":
          setPendingPlan(message.plan);
          break;
        case "SESSION_GROUP_UPDATE":
          setSessionTabGroupId(message.tabGroupId);
          break;
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  const handleTaskUpdate = q((update) => {
    if (update.status === "thinking") {
      setMessages((prev) => {
        const filtered = prev.filter((m2) => m2.type !== "thinking");
        return [...filtered, { id: Date.now(), type: "thinking" }];
      });
      setStreamingMessageId(null);
      streamingTextRef.current = "";
    } else if (update.status === "streaming" && update.text) {
      streamingTextRef.current = update.text;
      setMessages((prev) => {
        const filtered = prev.filter((m2) => m2.type !== "thinking");
        const existingStreamingIndex = filtered.findIndex((m2) => m2.type === "streaming");
        if (existingStreamingIndex >= 0) {
          const updated = [...filtered];
          updated[existingStreamingIndex] = {
            ...updated[existingStreamingIndex],
            text: update.text
          };
          return updated;
        } else {
          const msgId = Date.now();
          setStreamingMessageId(msgId);
          return [...filtered, {
            id: msgId,
            type: "streaming",
            text: update.text
          }];
        }
      });
    } else if (update.status === "executing") {
      setMessages((prev) => prev.filter((m2) => m2.type !== "thinking"));
      setPendingStep({ tool: update.tool, input: update.input });
    } else if (update.status === "executed") {
      setCompletedSteps((prev) => [...prev, {
        tool: update.tool,
        input: (pendingStep == null ? void 0 : pendingStep.input) || update.input,
        result: update.result
      }]);
      setPendingStep(null);
    } else if (update.status === "message" && update.text) {
      setMessages((prev) => {
        const filtered = prev.filter((m2) => m2.type !== "thinking" && m2.type !== "streaming");
        return [...filtered, {
          id: Date.now(),
          type: "assistant",
          text: update.text
        }];
      });
      setStreamingMessageId(null);
      streamingTextRef.current = "";
    }
  }, [pendingStep]);
  const handleTaskComplete = q((result) => {
    setIsRunning(false);
    setMessages((prev) => prev.filter((m2) => m2.type !== "thinking"));
    setStreamingMessageId(null);
    streamingTextRef.current = "";
    if (result.message && !result.success) {
      setMessages((prev) => [...prev, {
        id: Date.now(),
        type: "system",
        text: result.message
      }]);
    }
  }, []);
  const handleTaskError = q((error) => {
    setIsRunning(false);
    setMessages((prev) => {
      const filtered = prev.filter((m2) => m2.type !== "thinking" && m2.type !== "streaming");
      return [...filtered, {
        id: Date.now(),
        type: "error",
        text: `Error: ${error}`
      }];
    });
    setStreamingMessageId(null);
    streamingTextRef.current = "";
  }, []);
  const sendMessage = q(async (text) => {
    if (!text.trim() || isRunning) return;
    const userMessage = {
      id: Date.now(),
      type: "user",
      text,
      images: [...attachedImages]
    };
    setMessages((prev) => [...prev, userMessage]);
    const imagesToSend = [...attachedImages];
    setAttachedImages([]);
    setCompletedSteps([]);
    setPendingStep(null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      setMessages((prev) => [...prev, {
        id: Date.now(),
        type: "error",
        text: "No active tab found"
      }]);
      return;
    }
    setIsRunning(true);
    try {
      await chrome.runtime.sendMessage({
        type: "START_TASK",
        payload: {
          tabId: tab.id,
          task: text,
          askBeforeActing,
          images: imagesToSend,
          tabGroupId: sessionTabGroupId
        }
      });
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: Date.now(),
        type: "error",
        text: `Error: ${error.message}`
      }]);
      setIsRunning(false);
    }
  }, [isRunning, attachedImages, askBeforeActing, sessionTabGroupId]);
  const stopTask = q(() => {
    chrome.runtime.sendMessage({ type: "STOP_TASK" }).catch(() => {
    });
    setIsRunning(false);
  }, []);
  const clearChat = q(() => {
    setMessages([]);
    setCompletedSteps([]);
    setPendingStep(null);
    setStreamingMessageId(null);
    streamingTextRef.current = "";
    setSessionTabGroupId(null);
    chrome.runtime.sendMessage({ type: "CLEAR_CONVERSATION" }).catch(() => {
    });
  }, []);
  const approvePlan = q(() => {
    chrome.runtime.sendMessage({ type: "PLAN_APPROVAL_RESPONSE", payload: { approved: true } });
    setPendingPlan(null);
  }, []);
  const cancelPlan = q(() => {
    chrome.runtime.sendMessage({ type: "PLAN_APPROVAL_RESPONSE", payload: { approved: false } });
    setPendingPlan(null);
  }, []);
  const addImage = q((dataUrl) => {
    setAttachedImages((prev) => [...prev, dataUrl]);
  }, []);
  const removeImage = q((index) => {
    setAttachedImages((prev) => prev.filter((_2, i2) => i2 !== index));
  }, []);
  const clearImages = q(() => {
    setAttachedImages([]);
  }, []);
  return {
    // State
    messages,
    isRunning,
    attachedImages,
    completedSteps,
    pendingStep,
    pendingPlan,
    // Actions
    sendMessage,
    stopTask,
    clearChat,
    approvePlan,
    cancelPlan,
    addImage,
    removeImage,
    clearImages
  };
}
function Header({
  currentModel,
  availableModels,
  currentModelIndex,
  onModelSelect,
  onNewChat,
  onOpenSettings
}) {
  const [isDropdownOpen, setIsDropdownOpen] = d(false);
  const dropdownRef = A(null);
  y(() => {
    const handleClickOutside = (e2) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e2.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);
  const handleModelSelect = (index) => {
    onModelSelect(index);
    setIsDropdownOpen(false);
  };
  return /* @__PURE__ */ u$1("div", { class: "header", children: [
    /* @__PURE__ */ u$1("div", { class: "header-left", children: /* @__PURE__ */ u$1("div", { class: "model-selector", ref: dropdownRef, children: [
      /* @__PURE__ */ u$1(
        "button",
        {
          class: "model-selector-btn",
          onClick: () => setIsDropdownOpen(!isDropdownOpen),
          children: [
            /* @__PURE__ */ u$1("span", { class: "current-model-name", children: (currentModel == null ? void 0 : currentModel.name) || "Select Model" }),
            /* @__PURE__ */ u$1("svg", { class: "chevron", width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", children: /* @__PURE__ */ u$1("path", { d: "M6 9l6 6 6-6" }) })
          ]
        }
      ),
      isDropdownOpen && /* @__PURE__ */ u$1("div", { class: "model-dropdown", children: /* @__PURE__ */ u$1("div", { class: "model-list", children: availableModels.length === 0 ? /* @__PURE__ */ u$1("div", { class: "model-item disabled", children: "No models configured" }) : availableModels.map((model, index) => /* @__PURE__ */ u$1(
        "button",
        {
          class: `model-item ${index === currentModelIndex ? "active" : ""}`,
          onClick: () => handleModelSelect(index),
          children: model.name
        },
        index
      )) }) })
    ] }) }),
    /* @__PURE__ */ u$1("div", { class: "header-right", children: [
      /* @__PURE__ */ u$1("button", { class: "icon-btn", onClick: onNewChat, title: "New chat", children: /* @__PURE__ */ u$1("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", children: /* @__PURE__ */ u$1("path", { d: "M12 5v14M5 12h14" }) }) }),
      /* @__PURE__ */ u$1("button", { class: "icon-btn", onClick: onOpenSettings, title: "Settings", children: /* @__PURE__ */ u$1("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", children: [
        /* @__PURE__ */ u$1("circle", { cx: "12", cy: "12", r: "3" }),
        /* @__PURE__ */ u$1("path", { d: "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" })
      ] }) })
    ] })
  ] });
}
function formatMarkdown(text) {
  if (!text) return "";
  const lines = text.split("\n");
  let result = [];
  let inList = false;
  let listType = null;
  for (const line of lines) {
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(listType === "ol" ? "</ol>" : "</ul>");
        result.push("<ul>");
        inList = true;
        listType = "ul";
      }
      result.push(`<li>${formatInline(ulMatch[1])}</li>`);
    } else if (olMatch) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(listType === "ol" ? "</ol>" : "</ul>");
        result.push("<ol>");
        inList = true;
        listType = "ol";
      }
      result.push(`<li>${formatInline(olMatch[2])}</li>`);
    } else {
      if (inList) {
        result.push(listType === "ol" ? "</ol>" : "</ul>");
        inList = false;
        listType = null;
      }
      if (line.trim() === "") {
        result.push("<br>");
      } else {
        result.push(`<p>${formatInline(line)}</p>`);
      }
    }
  }
  if (inList) result.push(listType === "ol" ? "</ol>" : "</ul>");
  return result.join("");
}
function formatInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/`(.+?)`/g, "<code>$1</code>");
}
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
function getActionDescription(toolName, input) {
  var _a;
  if (!input) return toolName;
  switch (toolName) {
    case "computer": {
      const action = input.action;
      if (action === "screenshot") return "Taking screenshot";
      if (action === "left_click") {
        if (input.ref) return `Clicking ${input.ref}`;
        if (input.coordinate) return `Clicking at (${input.coordinate[0]}, ${input.coordinate[1]})`;
        return "Clicking";
      }
      if (action === "right_click") return "Right-clicking";
      if (action === "double_click") return "Double-clicking";
      if (action === "type") return `Typing "${(input.text || "").substring(0, 30)}${((_a = input.text) == null ? void 0 : _a.length) > 30 ? "..." : ""}"`;
      if (action === "key") return `Pressing ${input.text}`;
      if (action === "scroll") return `Scrolling ${input.scroll_direction}`;
      if (action === "mouse_move") return "Moving mouse";
      if (action === "drag") return "Dragging";
      return `Computer: ${action}`;
    }
    case "navigate":
      if (input.action === "back") return "Going back";
      if (input.action === "forward") return "Going forward";
      return `Navigating to ${(input.url || "").substring(0, 50)}...`;
    case "read_page":
      return "Reading page structure";
    case "get_page_text":
      return "Extracting page text";
    case "find":
      return `Finding "${input.query}"`;
    case "form_input":
      return `Filling form field ${input.ref}`;
    case "file_upload":
      return "Uploading file";
    case "javascript_tool":
      return "Running JavaScript";
    case "tabs_context":
      return "Getting tab context";
    case "tabs_create":
      return "Creating new tab";
    case "tabs_close":
      return "Closing tab";
    case "read_console_messages":
      return "Reading console";
    case "read_network_requests":
      return "Reading network requests";
    default:
      return toolName;
  }
}
function getToolIcon(toolName) {
  const icons = {
    computer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    navigate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    read_page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    get_page_text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
    form_input: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    javascript_tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>',
    tabs_context: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>',
    tabs_create: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>',
    tabs_close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
  };
  return icons[toolName] || icons.default;
}
function formatStepResult(result) {
  if (!result) return "";
  if (typeof result === "string") {
    if (result.length > 100) {
      return result.substring(0, 100) + "...";
    }
    return result;
  }
  if (typeof result === "object") {
    if (result.error) return `Error: ${result.error}`;
    if (result.output) {
      const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
      return output.length > 100 ? output.substring(0, 100) + "..." : output;
    }
  }
  return "";
}
function Message({ message }) {
  const { type, text, images } = message;
  if (type === "thinking") {
    return /* @__PURE__ */ u$1("div", { class: "message thinking", children: /* @__PURE__ */ u$1("div", { class: "thinking-indicator", children: [
      /* @__PURE__ */ u$1("div", { class: "sparkle-container", children: /* @__PURE__ */ u$1("svg", { class: "sparkle", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", children: [
        /* @__PURE__ */ u$1("circle", { cx: "12", cy: "12", r: "10" }),
        /* @__PURE__ */ u$1("path", { d: "M12 6v6l4 2" })
      ] }) }),
      /* @__PURE__ */ u$1("span", { children: "Thinking..." })
    ] }) });
  }
  if (type === "streaming") {
    return /* @__PURE__ */ u$1("div", { class: "message assistant streaming", children: [
      /* @__PURE__ */ u$1("div", { class: "bullet" }),
      /* @__PURE__ */ u$1(
        "div",
        {
          class: "content",
          dangerouslySetInnerHTML: { __html: formatMarkdown(text) }
        }
      )
    ] });
  }
  if (type === "user") {
    return /* @__PURE__ */ u$1("div", { class: "message user", children: [
      images && images.length > 0 && /* @__PURE__ */ u$1("div", { class: "message-images", children: images.map((img, i2) => /* @__PURE__ */ u$1("img", { src: img, alt: `Attached ${i2 + 1}` }, i2)) }),
      text && /* @__PURE__ */ u$1("span", { children: text })
    ] });
  }
  if (type === "assistant") {
    return /* @__PURE__ */ u$1("div", { class: "message assistant", children: [
      /* @__PURE__ */ u$1("div", { class: "bullet" }),
      /* @__PURE__ */ u$1(
        "div",
        {
          class: "content",
          dangerouslySetInnerHTML: { __html: formatMarkdown(text) }
        }
      )
    ] });
  }
  if (type === "error") {
    return /* @__PURE__ */ u$1("div", { class: "message error", children: text });
  }
  if (type === "system") {
    return /* @__PURE__ */ u$1("div", { class: "message system", children: text });
  }
  return null;
}
function StepsSection({ steps, pendingStep }) {
  const [isExpanded, setIsExpanded] = d(false);
  const totalSteps = steps.length + (pendingStep ? 1 : 0);
  if (totalSteps === 0) return null;
  return /* @__PURE__ */ u$1("div", { class: "steps-section", children: [
    /* @__PURE__ */ u$1(
      "div",
      {
        class: `steps-toggle ${isExpanded ? "expanded" : ""}`,
        onClick: () => setIsExpanded(!isExpanded),
        children: [
          /* @__PURE__ */ u$1("div", { class: "toggle-icon", children: /* @__PURE__ */ u$1("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", children: [
            /* @__PURE__ */ u$1("polyline", { points: "9 11 12 14 22 4" }),
            /* @__PURE__ */ u$1("path", { d: "M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" })
          ] }) }),
          /* @__PURE__ */ u$1("span", { class: "toggle-text", children: [
            steps.length,
            " step",
            steps.length !== 1 ? "s" : "",
            " completed",
            pendingStep && " (1 in progress)"
          ] }),
          /* @__PURE__ */ u$1("svg", { class: "chevron", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", children: /* @__PURE__ */ u$1("path", { d: "M6 9l6 6 6-6" }) })
        ]
      }
    ),
    /* @__PURE__ */ u$1("div", { class: `steps-list ${isExpanded ? "visible" : ""}`, children: [
      steps.map((step, index) => /* @__PURE__ */ u$1(StepItem, { step, status: "completed" }, index)),
      pendingStep && /* @__PURE__ */ u$1(StepItem, { step: pendingStep, status: "pending" })
    ] })
  ] });
}
function StepItem({ step, status }) {
  const description = getActionDescription(step.tool, step.input);
  const resultText = status === "completed" ? formatStepResult(step.result) : null;
  return /* @__PURE__ */ u$1("div", { class: `step-item ${status}`, children: [
    /* @__PURE__ */ u$1("div", { class: `step-icon ${status === "completed" ? "success" : "pending"}`, children: status === "pending" ? /* @__PURE__ */ u$1("svg", { class: "spinner", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", children: /* @__PURE__ */ u$1("circle", { cx: "12", cy: "12", r: "10" }) }) : /* @__PURE__ */ u$1("span", { dangerouslySetInnerHTML: { __html: getToolIcon(step.tool) } }) }),
    /* @__PURE__ */ u$1("div", { class: "step-content", children: [
      /* @__PURE__ */ u$1("div", { class: "step-label", children: escapeHtml(description) }),
      resultText && /* @__PURE__ */ u$1("div", { class: "step-result", children: escapeHtml(resultText) })
    ] }),
    /* @__PURE__ */ u$1("div", { class: "step-status", children: status === "completed" ? "✓" : "..." })
  ] });
}
function MessageList({ messages, completedSteps, pendingStep }) {
  const containerRef = A(null);
  const isAtBottomRef = A(true);
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };
  y(() => {
    if (isAtBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, completedSteps]);
  const renderContent = () => {
    const content = [];
    let stepsInjected = false;
    for (let i2 = 0; i2 < messages.length; i2++) {
      const msg = messages[i2];
      content.push(/* @__PURE__ */ u$1(Message, { message: msg }, msg.id));
      if (!stepsInjected && msg.type === "user" && completedSteps.length > 0) {
        content.push(
          /* @__PURE__ */ u$1(
            StepsSection,
            {
              steps: completedSteps,
              pendingStep
            },
            `steps-${msg.id}`
          )
        );
        stepsInjected = true;
      }
    }
    if (!stepsInjected && pendingStep) {
      const lastUserIndex = [...messages].reverse().findIndex((m2) => m2.type === "user");
      if (lastUserIndex !== -1) {
        const insertIndex = messages.length - lastUserIndex;
        content.splice(
          insertIndex,
          0,
          /* @__PURE__ */ u$1(
            StepsSection,
            {
              steps: completedSteps,
              pendingStep
            },
            "steps-pending"
          )
        );
      }
    }
    return content;
  };
  return /* @__PURE__ */ u$1(
    "div",
    {
      class: "messages",
      ref: containerRef,
      onScroll: handleScroll,
      children: renderContent()
    }
  );
}
function InputArea({
  isRunning,
  attachedImages,
  onSend,
  onStop,
  onAddImage,
  onRemoveImage,
  hasModels,
  suggestedText,
  onClearSuggestion
}) {
  const [text, setText] = d("");
  y(() => {
    if (suggestedText) {
      setText(suggestedText);
      onClearSuggestion();
    }
  }, [suggestedText, onClearSuggestion]);
  const [isDragging, setIsDragging] = d(false);
  const inputRef = A(null);
  const handleSubmit = () => {
    if (!text.trim() || isRunning) return;
    if (!hasModels) {
      alert("Please configure a model in Settings first");
      return;
    }
    onSend(text);
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };
  const handleKeyDown = (e2) => {
    if (e2.key === "Enter" && !e2.shiftKey) {
      e2.preventDefault();
      handleSubmit();
    }
  };
  const handleInput = (e2) => {
    setText(e2.target.value);
    e2.target.style.height = "auto";
    e2.target.style.height = Math.min(e2.target.scrollHeight, 150) + "px";
  };
  const handleDragOver = (e2) => {
    e2.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e2) => {
    e2.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e2) => {
    e2.preventDefault();
    setIsDragging(false);
    const files = e2.dataTransfer.files;
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        readImageFile(file);
      }
    }
  };
  const handlePaste = (e2) => {
    var _a;
    const items = (_a = e2.clipboardData) == null ? void 0 : _a.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e2.preventDefault();
          const file = item.getAsFile();
          if (file) readImageFile(file);
          break;
        }
      }
    }
  };
  const readImageFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e2) => {
      onAddImage(e2.target.result);
    };
    reader.readAsDataURL(file);
  };
  return /* @__PURE__ */ u$1(
    "div",
    {
      class: `input-container ${isDragging ? "drag-over" : ""}`,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      children: [
        attachedImages.length > 0 && /* @__PURE__ */ u$1("div", { class: "image-preview", children: attachedImages.map((img, i2) => /* @__PURE__ */ u$1("div", { class: "image-preview-item", children: [
          /* @__PURE__ */ u$1("img", { src: img, alt: `Preview ${i2 + 1}` }),
          /* @__PURE__ */ u$1(
            "button",
            {
              class: "remove-image-btn",
              onClick: () => onRemoveImage(i2),
              children: "×"
            }
          )
        ] }, i2)) }),
        /* @__PURE__ */ u$1("div", { class: "input-row", children: [
          /* @__PURE__ */ u$1(
            "textarea",
            {
              ref: inputRef,
              class: "input",
              placeholder: "What would you like me to do?",
              value: text,
              onInput: handleInput,
              onKeyDown: handleKeyDown,
              onPaste: handlePaste,
              rows: 1
            }
          ),
          isRunning ? /* @__PURE__ */ u$1("button", { class: "btn stop-btn", onClick: onStop, children: [
            /* @__PURE__ */ u$1("svg", { viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ u$1("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) }),
            "Stop"
          ] }) : /* @__PURE__ */ u$1(
            "button",
            {
              class: "btn send-btn",
              onClick: handleSubmit,
              disabled: !text.trim(),
              children: [
                /* @__PURE__ */ u$1("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", children: /* @__PURE__ */ u$1("path", { d: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" }) }),
                "Send"
              ]
            }
          )
        ] })
      ]
    }
  );
}
function SettingsModal({ config, onClose }) {
  const [activeTab, setActiveTab] = d("providers");
  const [selectedProvider, setSelectedProvider] = d(null);
  const [localKeys, setLocalKeys] = d({ ...config.providerKeys });
  const [newCustomModel, setNewCustomModel] = d({ name: "", baseUrl: "", modelId: "", apiKey: "" });
  const [skillForm, setSkillForm] = d({ domain: "", skill: "", isOpen: false, editIndex: -1 });
  const handleSave = async () => {
    for (const [provider, key] of Object.entries(localKeys)) {
      if (key !== config.providerKeys[provider]) {
        config.setProviderKey(provider, key);
      }
    }
    await config.saveConfig();
    onClose();
  };
  const handleAddCustomModel = () => {
    if (!newCustomModel.name || !newCustomModel.baseUrl || !newCustomModel.modelId) {
      alert("Please fill in name, base URL, and model ID");
      return;
    }
    config.addCustomModel({ ...newCustomModel });
    setNewCustomModel({ name: "", baseUrl: "", modelId: "", apiKey: "" });
  };
  const handleAddSkill = () => {
    if (!skillForm.domain || !skillForm.skill) {
      alert("Please fill in both domain and tips/guidance");
      return;
    }
    config.addUserSkill({ domain: skillForm.domain.toLowerCase(), skill: skillForm.skill });
    setSkillForm({ domain: "", skill: "", isOpen: false, editIndex: -1 });
  };
  const handleEditSkill = (index) => {
    const skill = config.userSkills[index];
    setSkillForm({ domain: skill.domain, skill: skill.skill, isOpen: true, editIndex: index });
  };
  return /* @__PURE__ */ u$1("div", { class: "modal-overlay", onClick: (e2) => e2.target === e2.currentTarget && onClose(), children: /* @__PURE__ */ u$1("div", { class: "modal settings-modal", children: [
    /* @__PURE__ */ u$1("div", { class: "modal-header", children: [
      /* @__PURE__ */ u$1("span", { children: "Settings" }),
      /* @__PURE__ */ u$1("button", { class: "close-btn", onClick: onClose, children: "×" })
    ] }),
    /* @__PURE__ */ u$1("div", { class: "tabs", children: [
      /* @__PURE__ */ u$1(
        "button",
        {
          class: `tab ${activeTab === "providers" ? "active" : ""}`,
          onClick: () => setActiveTab("providers"),
          children: "Providers"
        }
      ),
      /* @__PURE__ */ u$1(
        "button",
        {
          class: `tab ${activeTab === "custom" ? "active" : ""}`,
          onClick: () => setActiveTab("custom"),
          children: "Custom Models"
        }
      ),
      /* @__PURE__ */ u$1(
        "button",
        {
          class: `tab ${activeTab === "skills" ? "active" : ""}`,
          onClick: () => setActiveTab("skills"),
          children: "Domain Skills"
        }
      )
    ] }),
    /* @__PURE__ */ u$1("div", { class: "modal-body", children: [
      activeTab === "providers" && /* @__PURE__ */ u$1(
        ProvidersTab,
        {
          localKeys,
          setLocalKeys,
          selectedProvider,
          setSelectedProvider,
          config
        }
      ),
      activeTab === "custom" && /* @__PURE__ */ u$1(
        CustomModelsTab,
        {
          customModels: config.customModels,
          newModel: newCustomModel,
          setNewModel: setNewCustomModel,
          onAdd: handleAddCustomModel,
          onRemove: config.removeCustomModel
        }
      ),
      activeTab === "skills" && /* @__PURE__ */ u$1(
        SkillsTab,
        {
          userSkills: config.userSkills,
          builtInSkills: config.builtInSkills,
          skillForm,
          setSkillForm,
          onAdd: handleAddSkill,
          onEdit: handleEditSkill,
          onRemove: config.removeUserSkill
        }
      )
    ] }),
    /* @__PURE__ */ u$1("div", { class: "modal-footer", children: [
      /* @__PURE__ */ u$1("button", { class: "btn btn-secondary", onClick: onClose, children: "Close" }),
      /* @__PURE__ */ u$1("button", { class: "btn btn-primary", onClick: handleSave, children: "Save" })
    ] })
  ] }) });
}
function ProvidersTab({ localKeys, setLocalKeys, selectedProvider, setSelectedProvider, config }) {
  return /* @__PURE__ */ u$1("div", { class: "tab-content", children: [
    /* @__PURE__ */ u$1("div", { class: "provider-section", children: [
      /* @__PURE__ */ u$1("h4", { children: "Claude Code Plan" }),
      /* @__PURE__ */ u$1("p", { class: "provider-desc", children: [
        "Use your Claude Pro/Max subscription. ",
        /* @__PURE__ */ u$1("a", { href: "https://github.com/hanzili/llm-in-chrome#claude-code-plan-setup", target: "_blank", children: "Setup guide" })
      ] }),
      config.oauthStatus.isAuthenticated ? /* @__PURE__ */ u$1("div", { class: "connected-status", children: [
        /* @__PURE__ */ u$1("span", { class: "status-badge connected", children: "Connected" }),
        /* @__PURE__ */ u$1("button", { class: "btn btn-secondary btn-sm", onClick: config.logoutCLI, children: "Disconnect" })
      ] }) : /* @__PURE__ */ u$1("button", { class: "btn btn-primary", onClick: config.importCLI, children: "Connect" })
    ] }),
    /* @__PURE__ */ u$1("div", { class: "provider-section", children: [
      /* @__PURE__ */ u$1("h4", { children: "Codex Plan" }),
      /* @__PURE__ */ u$1("p", { class: "provider-desc", children: [
        "Use your ChatGPT Pro/Plus subscription. ",
        /* @__PURE__ */ u$1("a", { href: "https://github.com/hanzili/llm-in-chrome#codex-plan-setup", target: "_blank", children: "Setup guide" })
      ] }),
      config.codexStatus.isAuthenticated ? /* @__PURE__ */ u$1("div", { class: "connected-status", children: [
        /* @__PURE__ */ u$1("span", { class: "status-badge connected", children: "Connected" }),
        /* @__PURE__ */ u$1("button", { class: "btn btn-secondary btn-sm", onClick: config.logoutCodex, children: "Disconnect" })
      ] }) : /* @__PURE__ */ u$1("button", { class: "btn btn-primary", onClick: config.importCodex, children: "Connect" })
    ] }),
    /* @__PURE__ */ u$1("hr", {}),
    /* @__PURE__ */ u$1("h4", { children: "API Keys (Pay-per-use)" }),
    /* @__PURE__ */ u$1("div", { class: "provider-cards", children: Object.entries(PROVIDERS).map(([id, provider]) => /* @__PURE__ */ u$1(
      "div",
      {
        class: `provider-card ${selectedProvider === id ? "selected" : ""} ${localKeys[id] ? "configured" : ""}`,
        onClick: () => setSelectedProvider(selectedProvider === id ? null : id),
        children: [
          /* @__PURE__ */ u$1("div", { class: "provider-name", children: provider.name }),
          localKeys[id] && /* @__PURE__ */ u$1("span", { class: "check-badge", children: "✓" })
        ]
      },
      id
    )) }),
    selectedProvider && /* @__PURE__ */ u$1("div", { class: "api-key-input", children: [
      /* @__PURE__ */ u$1("label", { children: [
        PROVIDERS[selectedProvider].name,
        " API Key"
      ] }),
      /* @__PURE__ */ u$1(
        "input",
        {
          type: "password",
          value: localKeys[selectedProvider] || "",
          onInput: (e2) => setLocalKeys({ ...localKeys, [selectedProvider]: e2.target.value }),
          placeholder: "Enter API key..."
        }
      )
    ] })
  ] });
}
function CustomModelsTab({ customModels, newModel, setNewModel, onAdd, onRemove }) {
  return /* @__PURE__ */ u$1("div", { class: "tab-content", children: [
    /* @__PURE__ */ u$1("p", { class: "tab-desc", children: "Add custom OpenAI-compatible endpoints" }),
    /* @__PURE__ */ u$1("div", { class: "custom-model-form", children: [
      /* @__PURE__ */ u$1(
        "input",
        {
          type: "text",
          placeholder: "Display Name",
          value: newModel.name,
          onInput: (e2) => setNewModel({ ...newModel, name: e2.target.value })
        }
      ),
      /* @__PURE__ */ u$1(
        "input",
        {
          type: "text",
          placeholder: "Base URL (e.g., https://api.example.com/v1/chat/completions)",
          value: newModel.baseUrl,
          onInput: (e2) => setNewModel({ ...newModel, baseUrl: e2.target.value })
        }
      ),
      /* @__PURE__ */ u$1(
        "input",
        {
          type: "text",
          placeholder: "Model ID",
          value: newModel.modelId,
          onInput: (e2) => setNewModel({ ...newModel, modelId: e2.target.value })
        }
      ),
      /* @__PURE__ */ u$1(
        "input",
        {
          type: "password",
          placeholder: "API Key (optional)",
          value: newModel.apiKey,
          onInput: (e2) => setNewModel({ ...newModel, apiKey: e2.target.value })
        }
      ),
      /* @__PURE__ */ u$1("button", { class: "btn btn-primary", onClick: onAdd, children: "Add Model" })
    ] }),
    customModels.length > 0 && /* @__PURE__ */ u$1("div", { class: "custom-models-list", children: [
      /* @__PURE__ */ u$1("h4", { children: "Custom Models" }),
      customModels.map((model, i2) => /* @__PURE__ */ u$1("div", { class: "custom-model-item", children: [
        /* @__PURE__ */ u$1("div", { class: "model-info", children: [
          /* @__PURE__ */ u$1("span", { class: "model-name", children: model.name }),
          /* @__PURE__ */ u$1("span", { class: "model-url", children: model.baseUrl })
        ] }),
        /* @__PURE__ */ u$1("button", { class: "btn btn-danger btn-sm", onClick: () => onRemove(i2), children: "Remove" })
      ] }, i2))
    ] })
  ] });
}
function SkillsTab({ userSkills, builtInSkills, skillForm, setSkillForm, onAdd, onEdit, onRemove }) {
  return /* @__PURE__ */ u$1("div", { class: "tab-content", children: [
    /* @__PURE__ */ u$1("p", { class: "tab-desc", children: "Add domain-specific tips to help the AI navigate websites" }),
    /* @__PURE__ */ u$1(
      "button",
      {
        class: "btn btn-secondary",
        onClick: () => setSkillForm({ ...skillForm, isOpen: true, editIndex: -1, domain: "", skill: "" }),
        children: "+ Add Skill"
      }
    ),
    skillForm.isOpen && /* @__PURE__ */ u$1("div", { class: "skill-form", children: [
      /* @__PURE__ */ u$1(
        "input",
        {
          type: "text",
          placeholder: "Domain (e.g., github.com)",
          value: skillForm.domain,
          onInput: (e2) => setSkillForm({ ...skillForm, domain: e2.target.value })
        }
      ),
      /* @__PURE__ */ u$1(
        "textarea",
        {
          placeholder: "Tips and guidance for this domain...",
          value: skillForm.skill,
          onInput: (e2) => setSkillForm({ ...skillForm, skill: e2.target.value }),
          rows: 4
        }
      ),
      /* @__PURE__ */ u$1("div", { class: "skill-form-actions", children: [
        /* @__PURE__ */ u$1("button", { class: "btn btn-secondary", onClick: () => setSkillForm({ ...skillForm, isOpen: false }), children: "Cancel" }),
        /* @__PURE__ */ u$1("button", { class: "btn btn-primary", onClick: onAdd, children: skillForm.editIndex >= 0 ? "Update" : "Add" })
      ] })
    ] }),
    /* @__PURE__ */ u$1("div", { class: "skills-list", children: [
      userSkills.length > 0 && /* @__PURE__ */ u$1(k$1, { children: [
        /* @__PURE__ */ u$1("h4", { children: "Your Skills" }),
        userSkills.map((skill, i2) => /* @__PURE__ */ u$1("div", { class: "skill-item", children: [
          /* @__PURE__ */ u$1("div", { class: "skill-domain", children: skill.domain }),
          /* @__PURE__ */ u$1("div", { class: "skill-preview", children: [
            skill.skill.substring(0, 100),
            "..."
          ] }),
          /* @__PURE__ */ u$1("div", { class: "skill-actions", children: [
            /* @__PURE__ */ u$1("button", { class: "btn btn-sm", onClick: () => onEdit(i2), children: "Edit" }),
            /* @__PURE__ */ u$1("button", { class: "btn btn-sm btn-danger", onClick: () => onRemove(i2), children: "Delete" })
          ] })
        ] }, i2))
      ] }),
      builtInSkills.length > 0 && /* @__PURE__ */ u$1(k$1, { children: [
        /* @__PURE__ */ u$1("h4", { children: "Built-in Skills" }),
        builtInSkills.map((skill, i2) => /* @__PURE__ */ u$1("div", { class: "skill-item builtin", children: [
          /* @__PURE__ */ u$1("div", { class: "skill-domain", children: skill.domain }),
          /* @__PURE__ */ u$1("div", { class: "skill-preview", children: [
            skill.skill.substring(0, 100),
            "..."
          ] })
        ] }, i2))
      ] })
    ] })
  ] });
}
function PlanModal({ plan, onApprove, onCancel }) {
  return /* @__PURE__ */ u$1("div", { class: "modal-overlay", children: /* @__PURE__ */ u$1("div", { class: "modal", children: [
    /* @__PURE__ */ u$1("div", { class: "modal-header", children: "Review Plan" }),
    /* @__PURE__ */ u$1("div", { class: "modal-body", children: [
      /* @__PURE__ */ u$1("div", { class: "plan-section", children: [
        /* @__PURE__ */ u$1("h4", { children: "Domains to visit:" }),
        /* @__PURE__ */ u$1("ul", { class: "plan-domains", children: (plan.domains || []).map((domain, i2) => /* @__PURE__ */ u$1("li", { children: domain }, i2)) })
      ] }),
      /* @__PURE__ */ u$1("div", { class: "plan-section", children: [
        /* @__PURE__ */ u$1("h4", { children: "Approach:" }),
        /* @__PURE__ */ u$1("ul", { class: "plan-steps", children: (Array.isArray(plan.approach) ? plan.approach : [plan.approach]).map((step, i2) => /* @__PURE__ */ u$1("li", { children: step }, i2)) })
      ] })
    ] }),
    /* @__PURE__ */ u$1("div", { class: "modal-footer", children: [
      /* @__PURE__ */ u$1("button", { class: "btn btn-secondary", onClick: onCancel, children: "Cancel" }),
      /* @__PURE__ */ u$1("button", { class: "btn btn-primary", onClick: onApprove, children: "Approve & Continue" })
    ] })
  ] }) });
}
const EXAMPLES = [
  "Search for recent AI news",
  "Fill out this form",
  "Find the best price for..."
];
function EmptyState({ onSelectExample }) {
  return /* @__PURE__ */ u$1("div", { class: "empty-state", children: [
    /* @__PURE__ */ u$1("div", { class: "empty-icon", children: /* @__PURE__ */ u$1("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", children: [
      /* @__PURE__ */ u$1("circle", { cx: "12", cy: "12", r: "10" }),
      /* @__PURE__ */ u$1("path", { d: "M12 6v6l4 2" })
    ] }) }),
    /* @__PURE__ */ u$1("h2", { children: "LLM in Chrome" }),
    /* @__PURE__ */ u$1("p", { children: "Describe what you want to accomplish and the AI will browse autonomously to complete your task." }),
    /* @__PURE__ */ u$1("div", { class: "empty-examples", children: EXAMPLES.map((example, i2) => /* @__PURE__ */ u$1(
      "button",
      {
        class: "example-chip",
        onClick: () => onSelectExample(example),
        children: example
      },
      i2
    )) })
  ] });
}
function App() {
  const [isSettingsOpen, setIsSettingsOpen] = d(false);
  const [suggestedText, setSuggestedText] = d("");
  const config = useConfig();
  const chat = useChat();
  if (config.isLoading) {
    return /* @__PURE__ */ u$1("div", { class: "loading-container", children: /* @__PURE__ */ u$1("div", { class: "loading-spinner" }) });
  }
  const hasMessages = chat.messages.length > 0;
  return /* @__PURE__ */ u$1("div", { class: "app", children: [
    /* @__PURE__ */ u$1(
      Header,
      {
        currentModel: config.currentModel,
        availableModels: config.availableModels,
        currentModelIndex: config.currentModelIndex,
        onModelSelect: config.selectModel,
        onNewChat: chat.clearChat,
        onOpenSettings: () => setIsSettingsOpen(true)
      }
    ),
    /* @__PURE__ */ u$1("div", { class: "messages-container", children: !hasMessages ? /* @__PURE__ */ u$1(EmptyState, { onSelectExample: setSuggestedText }) : /* @__PURE__ */ u$1(
      MessageList,
      {
        messages: chat.messages,
        completedSteps: chat.completedSteps,
        pendingStep: chat.pendingStep
      }
    ) }),
    /* @__PURE__ */ u$1(
      InputArea,
      {
        isRunning: chat.isRunning,
        attachedImages: chat.attachedImages,
        onSend: chat.sendMessage,
        onStop: chat.stopTask,
        onAddImage: chat.addImage,
        onRemoveImage: chat.removeImage,
        hasModels: config.availableModels.length > 0,
        suggestedText,
        onClearSuggestion: () => setSuggestedText("")
      }
    ),
    isSettingsOpen && /* @__PURE__ */ u$1(
      SettingsModal,
      {
        config,
        onClose: () => setIsSettingsOpen(false)
      }
    ),
    chat.pendingPlan && /* @__PURE__ */ u$1(
      PlanModal,
      {
        plan: chat.pendingPlan,
        onApprove: chat.approvePlan,
        onCancel: chat.cancelPlan
      }
    )
  ] });
}
G(/* @__PURE__ */ u$1(App, {}), document.getElementById("app"));
//# sourceMappingURL=sidepanel.js.map

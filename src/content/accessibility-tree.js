/**
 * Accessibility Tree Generator
 *
 * Generates a semantic tree representation of the page for AI navigation.
 * Based on reverse engineering of Claude in Chrome extension v1.0.40.
 *
 * Key innovation: Uses accessibility roles instead of HTML tags,
 * with stable ref IDs for reliable element targeting.
 */

// Global state - matching Claude in Chrome's naming pattern
window.__claudeElementMap || (window.__claudeElementMap = {});
window.__claudeRefCounter || (window.__claudeRefCounter = 0);

/**
 * Get element's ARIA role or infer from tag
 */
function getRole(element) {
  var role = element.getAttribute("role");
  if (role) return role;

  var tag = element.tagName.toLowerCase();
  var type = element.getAttribute("type");

  return {
    a: "link",
    button: "button",
    input: "submit" === type || "button" === type ? "button"
         : "checkbox" === type ? "checkbox"
         : "radio" === type ? "radio"
         : "file" === type ? "button"
         : "textbox",
    select: "combobox",
    textarea: "textbox",
    h1: "heading", h2: "heading", h3: "heading",
    h4: "heading", h5: "heading", h6: "heading",
    img: "image",
    nav: "navigation",
    main: "main",
    header: "banner",
    footer: "contentinfo",
    section: "region",
    article: "article",
    aside: "complementary",
    form: "form",
    table: "table",
    ul: "list",
    ol: "list",
    li: "listitem",
    label: "label"
  }[tag] || "generic";
}

/**
 * Get element's accessible name (label)
 */
function getName(element) {
  var tag = element.tagName.toLowerCase();

  // For select, get selected option text
  if ("select" === tag) {
    var select = element;
    var option = select.querySelector("option[selected]") || select.options[select.selectedIndex];
    if (option && option.textContent) return option.textContent.trim();
  }

  // Try aria-label
  var ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  // Try placeholder
  var placeholder = element.getAttribute("placeholder");
  if (placeholder && placeholder.trim()) return placeholder.trim();

  // Try title
  var title = element.getAttribute("title");
  if (title && title.trim()) return title.trim();

  // Try alt (for images)
  var alt = element.getAttribute("alt");
  if (alt && alt.trim()) return alt.trim();

  // Try associated label
  if (element.id) {
    var label = document.querySelector('label[for="' + element.id + '"]');
    if (label && label.textContent && label.textContent.trim())
      return label.textContent.trim();
  }

  // For inputs, get value
  if ("input" === tag) {
    var input = element;
    var inputType = element.getAttribute("type") || "";
    var value = element.getAttribute("value");
    if ("submit" === inputType && value && value.trim()) return value.trim();
    if (input.value && input.value.length < 50 && input.value.trim())
      return input.value.trim();
  }

  // For buttons/links, get direct text content
  if (["button", "a", "summary"].includes(tag)) {
    var text = "";
    for (var i = 0; i < element.childNodes.length; i++) {
      var child = element.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
    }
    if (text.trim()) return text.trim();
  }

  // For headings, get text content
  if (tag.match(/^h[1-6]$/)) {
    var headingText = element.textContent;
    if (headingText && headingText.trim())
      return headingText.trim().substring(0, 100);
  }

  // Skip images
  if ("img" === tag) return "";

  // Get any direct text content
  var directText = "";
  for (var j = 0; j < element.childNodes.length; j++) {
    var node = element.childNodes[j];
    if (node.nodeType === Node.TEXT_NODE) directText += node.textContent;
  }
  if (directText && directText.trim() && directText.trim().length >= 3) {
    var trimmed = directText.trim();
    return trimmed.length > 100 ? trimmed.substring(0, 100) + "..." : trimmed;
  }

  return "";
}

/**
 * Check if element is visible
 */
function isVisible(element) {
  var style = window.getComputedStyle(element);
  return "none" !== style.display &&
         "hidden" !== style.visibility &&
         "0" !== style.opacity &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

/**
 * Check if element is interactive
 */
function isInteractive(element) {
  var tag = element.tagName.toLowerCase();
  return ["a", "button", "input", "select", "textarea", "details", "summary"].includes(tag) ||
         null !== element.getAttribute("onclick") ||
         null !== element.getAttribute("tabindex") ||
         "button" === element.getAttribute("role") ||
         "link" === element.getAttribute("role") ||
         "true" === element.getAttribute("contenteditable");
}

/**
 * Check if element has semantic role
 */
function hasSemantic(element) {
  var tag = element.tagName.toLowerCase();
  return ["h1", "h2", "h3", "h4", "h5", "h6", "nav", "main", "header",
          "footer", "section", "article", "aside"].includes(tag) ||
         null !== element.getAttribute("role");
}

/**
 * Decide if element should be included in tree
 */
function shouldInclude(element, options) {
  var tag = element.tagName.toLowerCase();

  // Skip non-content elements
  if (["script", "style", "meta", "link", "title", "noscript"].includes(tag))
    return false;

  // Skip aria-hidden unless filter is "all"
  if ("all" !== options.filter && "true" === element.getAttribute("aria-hidden"))
    return false;

  // Skip invisible unless filter is "all"
  if ("all" !== options.filter && !isVisible(element))
    return false;

  // Skip off-screen unless filter is "all" or we're focused on refId
  if ("all" !== options.filter && !options.refId) {
    var rect = element.getBoundingClientRect();
    if (!(rect.top < window.innerHeight && rect.bottom > 0 &&
          rect.left < window.innerWidth && rect.right > 0))
      return false;
  }

  // For interactive filter, only include interactive elements
  if ("interactive" === options.filter) return isInteractive(element);

  // Include interactive elements
  if (isInteractive(element)) return true;

  // Include semantic elements
  if (hasSemantic(element)) return true;

  // Include elements with accessible names
  if (getName(element).length > 0) return true;

  // Include elements with non-generic roles
  var role = getRole(element);
  return null !== role && "generic" !== role && "image" !== role;
}

/**
 * Main function: Generate accessibility tree for the page
 * Signature matches Claude in Chrome: (filter, maxDepth, maxChars, refId)
 *
 * @param {string} filter - 'interactive' or 'all' (default: 'all')
 * @param {number} maxDepth - Maximum tree depth (default: 15)
 * @param {number} maxChars - Maximum output characters (default: 50000)
 * @param {string} refId - If provided, only return subtree starting at this element
 * @returns {Object} { pageContent, viewport, error? }
 */
window.__generateAccessibilityTree = function(filter, maxDepth, maxChars, refId) {
  try {
    var output = [];
    var treeDepth = null != maxDepth ? maxDepth : 15;
    var options = { filter: filter || "all", refId: refId };

    /**
     * Recursively build tree
     */
    function buildTree(element, depth, options) {
      if (depth > treeDepth) return;
      if (!element || !element.tagName) return;

      var include = shouldInclude(element, options) ||
                    (null !== options.refId && 0 === depth);

      if (include) {
        var role = getRole(element);
        var name = getName(element);

        // Get or create ref ID
        var ref = null;
        for (var id in window.__claudeElementMap) {
          if (window.__claudeElementMap[id].deref &&
              window.__claudeElementMap[id].deref() === element) {
            ref = id;
            break;
          }
        }
        if (!ref) {
          ref = "ref_" + ++window.__claudeRefCounter;
          window.__claudeElementMap[ref] = new WeakRef(element);
        }

        // Build line: indent + role + name + ref + attributes
        var line = " ".repeat(depth) + role;

        if (name) {
          name = name.replace(/\s+/g, " ").substring(0, 100);
          line += ' "' + name.replace(/"/g, '\\"') + '"';
        }

        line += " [" + ref + "]";

        // Add relevant attributes
        if (element.getAttribute("href"))
          line += ' href="' + element.getAttribute("href") + '"';
        if (element.getAttribute("type"))
          line += ' type="' + element.getAttribute("type") + '"';
        if (element.getAttribute("placeholder"))
          line += ' placeholder="' + element.getAttribute("placeholder") + '"';

        output.push(line);

        // Special handling for select - include options
        if ("select" === element.tagName.toLowerCase()) {
          var opts = element.options;
          for (var i = 0; i < opts.length; i++) {
            var opt = opts[i];
            var optLine = " ".repeat(depth + 1) + "option";
            var optText = opt.textContent ? opt.textContent.trim() : "";
            if (optText) {
              optText = optText.replace(/\s+/g, " ").substring(0, 100);
              optLine += ' "' + optText.replace(/"/g, '\\"') + '"';
            }
            if (opt.selected) optLine += " (selected)";
            if (opt.value && opt.value !== optText)
              optLine += ' value="' + opt.value.replace(/"/g, '\\"') + '"';
            output.push(optLine);
          }
        }
      }

      // Process children
      if (element.children && depth < treeDepth) {
        for (var j = 0; j < element.children.length; j++) {
          buildTree(element.children[j], include ? depth + 1 : depth, options);
        }
      }
    }

    /**
     * Process iframes and add their content to the tree
     */
    function processIframes(baseDepth, frameOffsetX, frameOffsetY) {
      var iframes = document.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        var iframe = iframes[i];
        try {
          // Check if iframe is same-origin (we can access its content)
          var iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc || !iframeDoc.body) continue;

          // Get iframe position for coordinate offset
          var iframeRect = iframe.getBoundingClientRect();
          var offsetX = frameOffsetX + iframeRect.x;
          var offsetY = frameOffsetY + iframeRect.y;

          // Add iframe marker
          output.push(" ".repeat(baseDepth) + "iframe [" + (iframe.src || iframe.id || "anonymous") + "]");

          // Store iframe offset for elements inside
          var iframeOptions = Object.assign({}, options, {
            iframeOffsetX: offsetX,
            iframeOffsetY: offsetY,
            iframeDoc: iframeDoc
          });

          // Process iframe body
          buildTreeInIframe(iframeDoc.body, baseDepth + 1, iframeOptions, iframeDoc);
        } catch (e) {
          // Cross-origin iframe - can't access content
          output.push(" ".repeat(baseDepth) + "iframe (cross-origin) [" + (iframe.src || "anonymous") + "]");
        }
      }
    }

    /**
     * Build tree for elements inside an iframe
     */
    function buildTreeInIframe(element, depth, options, doc) {
      if (depth > treeDepth) return;
      if (!element || !element.tagName) return;

      var include = shouldInclude(element, options);

      if (include) {
        var role = getRole(element);
        var name = getName(element);

        // Get or create ref ID (use special prefix for iframe elements)
        var ref = null;
        for (var id in window.__claudeElementMap) {
          if (window.__claudeElementMap[id].deref &&
              window.__claudeElementMap[id].deref() === element) {
            ref = id;
            break;
          }
        }
        if (!ref) {
          ref = "ref_" + ++window.__claudeRefCounter;
          // Store element with iframe offset info
          window.__claudeElementMap[ref] = new WeakRef(element);
          window.__claudeElementOffsets = window.__claudeElementOffsets || {};
          window.__claudeElementOffsets[ref] = {
            x: options.iframeOffsetX || 0,
            y: options.iframeOffsetY || 0
          };
        }

        // Build line
        var line = " ".repeat(depth) + role;
        if (name) {
          name = name.replace(/\s+/g, " ").substring(0, 100);
          line += ' "' + name.replace(/"/g, '\\"') + '"';
        }
        line += " [" + ref + "]";

        // Add relevant attributes
        if (element.getAttribute("href"))
          line += ' href="' + element.getAttribute("href") + '"';
        if (element.getAttribute("type"))
          line += ' type="' + element.getAttribute("type") + '"';
        if (element.getAttribute("placeholder"))
          line += ' placeholder="' + element.getAttribute("placeholder") + '"';

        output.push(line);

        // Special handling for select
        if ("select" === element.tagName.toLowerCase()) {
          var opts = element.options;
          for (var i = 0; i < opts.length; i++) {
            var opt = opts[i];
            var optLine = " ".repeat(depth + 1) + "option";
            var optText = opt.textContent ? opt.textContent.trim() : "";
            if (optText) {
              optText = optText.replace(/\s+/g, " ").substring(0, 100);
              optLine += ' "' + optText.replace(/"/g, '\\"') + '"';
            }
            if (opt.selected) optLine += " (selected)";
            if (opt.value && opt.value !== optText)
              optLine += ' value="' + opt.value.replace(/"/g, '\\"') + '"';
            output.push(optLine);
          }
        }
      }

      // Process children
      if (element.children && depth < treeDepth) {
        for (var j = 0; j < element.children.length; j++) {
          buildTreeInIframe(element.children[j], include ? depth + 1 : depth, options, doc);
        }
      }
    }

    // If refId provided, start from that element
    if (refId) {
      var weakRef = window.__claudeElementMap[refId];
      if (!weakRef) {
        return {
          error: "Element with ref_id '" + refId + "' not found. It may have been removed from the page. Use read_page without ref_id to get the current page state.",
          pageContent: "",
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
      }
      var el = weakRef.deref ? weakRef.deref() : null;
      if (!el) {
        return {
          error: "Element with ref_id '" + refId + "' no longer exists. It may have been removed from the page. Use read_page without ref_id to get the current page state.",
          pageContent: "",
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
      }
      buildTree(el, 0, options);
    } else {
      // Start from body
      if (document.body) buildTree(document.body, 0, options);
      // Also process iframes
      processIframes(0, 0, 0);
    }

    // Clean up dead references
    for (var id in window.__claudeElementMap) {
      var ref = window.__claudeElementMap[id];
      if (ref.deref && !ref.deref()) {
        delete window.__claudeElementMap[id];
      }
    }

    // Check output size
    var result = output.join("\n");
    if (null != maxChars && result.length > maxChars) {
      var errorMsg = "Output exceeds " + maxChars + " character limit (" + result.length + " characters). ";
      errorMsg += refId
        ? "The specified element has too much content. Try specifying a smaller depth parameter or focus on a more specific child element."
        : (void 0 !== maxDepth
            ? "Try specifying an even smaller depth parameter or use ref_id to focus on a specific element."
            : "Try specifying a depth parameter (e.g., depth: 5) or use ref_id to focus on a specific element from the page.");
      return {
        error: errorMsg,
        pageContent: "",
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    }

    return {
      pageContent: result,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };

  } catch (err) {
    throw new Error("Error generating accessibility tree: " + (err.message || "Unknown error"));
  }
};

/**
 * Get element by ref ID
 */
window.__getElementByRef = function(refId) {
  var weakRef = window.__claudeElementMap[refId];
  if (weakRef && weakRef.deref) {
    var element = weakRef.deref();
    if (element && document.contains(element)) {
      return element;
    }
    // Element was garbage collected or removed
    delete window.__claudeElementMap[refId];
  }
  return null;
};

/**
 * Get bounding rect for a ref ID (for coordinate-based actions)
 * Includes iframe offset for elements inside iframes
 */
window.__getElementRect = function(refId) {
  var element = window.__getElementByRef(refId);
  if (!element) return null;

  var rect = element.getBoundingClientRect();

  // Check if this element has iframe offset
  var offset = (window.__claudeElementOffsets && window.__claudeElementOffsets[refId]) || { x: 0, y: 0 };

  return {
    x: rect.x + offset.x,
    y: rect.y + offset.y,
    width: rect.width,
    height: rect.height,
    centerX: rect.x + rect.width / 2 + offset.x,
    centerY: rect.y + rect.height / 2 + offset.y,
  };
};

/**
 * Clear ref mappings (call when navigating to new page)
 */
window.__clearRefMappings = function() {
  window.__claudeElementMap = {};
  window.__claudeElementOffsets = {};
  window.__claudeRefCounter = 0;
};

// Expose for debugging
console.log('[JobApplyAgent] Accessibility tree generator loaded (Claude-compatible)');

/**
 * Form input tool handler
 * Uses DOM manipulation via chrome.scripting.executeScript
 */

/**
 * Handle form_input tool - set form element values using ref
 *
 * @param {Object} input - Tool input
 * @param {string} input.ref - Element reference ID (e.g., "ref_1")
 * @param {string|boolean|number} input.value - Value to set
 * @param {number} input.tabId - Tab ID
 * @returns {Promise<{output?: string, error?: string}>}
 */
export async function handleFormInput(input) {
  try {
    if (!input?.ref) {
      throw new Error("ref parameter is required");
    }
    if (input.value === undefined || input.value === null) {
      throw new Error("Value parameter is required");
    }
    if (!input.tabId) {
      throw new Error("No active tab found");
    }

    const tabId = input.tabId;
    const tab = await chrome.tabs.get(tabId);
    if (!tab.id) {
      throw new Error("Active tab has no ID");
    }

    // Execute form input in content script context
    // Execute script in isolated world to access element map
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'ISOLATED',  // Run in content script's world to access __elementRefMap
      func: (ref, value) => {
        try {
          let element = null;
          if (window.__elementRefMap && window.__elementRefMap[ref]) {
            element = window.__elementRefMap[ref].deref() || null;

            if (!element || !document.contains(element)) {
              delete window.__elementRefMap[ref];
              element = null;
            }
          }
          if (!element) {
            return {
              error: `No element found with reference: "${ref}". The element may have been removed from the page.`,
            };
          }
          element.scrollIntoView({ behavior: "smooth", block: "center" });

          // Handle SELECT element
          if (element instanceof HTMLSelectElement) {
            const previousValue = element.value;
            const options = Array.from(element.options);
            let found = false;
            const valueStr = String(value);
            for (let i = 0; i < options.length; i++) {
              if (options[i].value === valueStr || options[i].text === valueStr) {
                element.selectedIndex = i;
                found = true;
                break;
              }
            }
            return found
              ? (element.focus(),
                element.dispatchEvent(new Event("change", { bubbles: true })),
                element.dispatchEvent(new Event("input", { bubbles: true })),
                {
                  output: `Selected option "${valueStr}" in dropdown (previous: "${previousValue}")`,
                })
              : {
                  error: `Option "${valueStr}" not found. Available options: ${options
                    .map((o) => `"${o.text}" (value: "${o.value}")`)
                    .join(", ")}`,
                };
          }

          // Handle CHECKBOX
          if (element instanceof HTMLInputElement && element.type === "checkbox") {
            const previousValue = element.checked;
            return typeof value !== "boolean"
              ? { error: "Checkbox requires a boolean value (true/false)" }
              : ((element.checked = value),
                element.focus(),
                element.dispatchEvent(new Event("change", { bubbles: true })),
                element.dispatchEvent(new Event("input", { bubbles: true })),
                {
                  output: `Checkbox ${
                    element.checked ? "checked" : "unchecked"
                  } (previous: ${previousValue})`,
                });
          }

          // Handle RADIO
          if (element instanceof HTMLInputElement && element.type === "radio") {
            const previousValue = element.checked;
            const groupName = element.name;
            element.checked = true;
            element.focus();
            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("input", { bubbles: true }));

            return {
              success: true,
              action: "form_input",
              ref: ref,
              element_type: "radio",
              previous_value: previousValue,
              new_value: element.checked,
              message: groupName ? `Radio button selected in group "${groupName}"` : "Radio button selected",
            };
          }

          // Handle DATE/TIME inputs
          if (
            element instanceof HTMLInputElement &&
            (element.type === "date" ||
              element.type === "time" ||
              element.type === "datetime-local" ||
              element.type === "month" ||
              element.type === "week")
          ) {
            const previousValue = element.value;
            element.value = String(value);
            element.focus();
            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("input", { bubbles: true }));
            return {
              output: `Set ${element.type} to "${element.value}" (previous: ${previousValue})`,
            };
          }

          // Handle RANGE
          if (element instanceof HTMLInputElement && element.type === "range") {
            const previousValue = element.value;
            const numValue = Number(value);
            return isNaN(numValue)
              ? { error: "Range input requires a numeric value" }
              : ((element.value = String(numValue)),
                element.focus(),
                element.dispatchEvent(new Event("change", { bubbles: true })),
                element.dispatchEvent(new Event("input", { bubbles: true })),
                {
                  success: true,
                  action: "form_input",
                  ref: ref,
                  element_type: "range",
                  previous_value: previousValue,
                  new_value: element.value,
                  message: `Set range to ${element.value} (min: ${element.min}, max: ${element.max})`,
                });
          }

          // Handle NUMBER
          if (element instanceof HTMLInputElement && element.type === "number") {
            const previousValue = element.value;
            const numValue = Number(value);
            return isNaN(numValue) && value !== ""
              ? { error: "Number input requires a numeric value" }
              : ((element.value = String(value)),
                element.focus(),
                element.dispatchEvent(new Event("change", { bubbles: true })),
                element.dispatchEvent(new Event("input", { bubbles: true })),
                {
                  output: `Set number input to ${element.value} (previous: ${previousValue})`,
                });
          }

          // Handle TEXT INPUT and TEXTAREA
          if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
          ) {
            const previousValue = element.value;
            element.value = String(value);
            element.focus();

            if (
              element instanceof HTMLTextAreaElement ||
              (element instanceof HTMLInputElement &&
                ["text", "search", "url", "tel", "password"].includes(element.type))
            ) {
              element.setSelectionRange(element.value.length, element.value.length);
            }

            element.dispatchEvent(new Event("change", { bubbles: true }));
            element.dispatchEvent(new Event("input", { bubbles: true }));
            return {
              output: `Set ${
                element instanceof HTMLTextAreaElement
                  ? "textarea"
                  : element.type || "text"
              } value to "${element.value}" (previous: "${previousValue}")`,
            };
          }

          return {
            error: `Element type "${element.tagName}" is not a supported form input`,
          };
        } catch (err) {
          return {
            error: `Error setting form value: ${
              err instanceof Error ? err.message : "Unknown error"
            }`,
          };
        }
      },
      args: [input.ref, input.value],
    });

    if (!result || result.length === 0) {
      throw new Error("Failed to execute form input");
    }

    return result[0].result;
  } catch (err) {
    return {
      error: `Failed to execute form input: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    };
  }
}

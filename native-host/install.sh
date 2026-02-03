#!/bin/bash

# OAuth Native Messaging Host Installation Script
# Installs the local OAuth server for Chrome extension

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║  LLM in Chrome - OAuth Native Host Installer          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
OAUTH_SERVER="$SCRIPT_DIR/oauth-server.cjs"

# Check if Node.js is installed
echo "Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "  Please install Node.js from https://nodejs.org"
    echo "  Download the LTS version (recommended)"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js found: $(node --version)"

# Make the OAuth server executable
chmod +x "$OAUTH_SERVER"
echo -e "${GREEN}✓${NC} Made oauth-server.js executable"

# Determine OS and set manifest directory
if [[ "$OSTYPE" == "darwin"* ]]; then
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    OS_NAME="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    OS_NAME="Linux"
else
    echo -e "${RED}✗ Unsupported OS: $OSTYPE${NC}"
    echo "  Supported: macOS, Linux"
    echo "  For Windows, manual installation required"
    exit 1
fi

echo -e "${GREEN}✓${NC} Detected OS: $OS_NAME"
echo -e "${GREEN}✓${NC} Manifest directory: $MANIFEST_DIR"

# Create manifest directory if it doesn't exist
mkdir -p "$MANIFEST_DIR"

# Extension ID - Chrome Web Store published ID
CHROME_STORE_ID="iklpkemlmbhemkiojndpbhoakgikpmcd"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  Extension ID Configuration                            ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Default (Chrome Web Store): $CHROME_STORE_ID"
echo ""
read -p "Press Enter to use default, or paste a custom ID: " CUSTOM_ID

if [ -z "$CUSTOM_ID" ]; then
    EXTENSION_ID="$CHROME_STORE_ID"
    echo -e "${GREEN}✓${NC} Using Chrome Web Store ID"
else
    EXTENSION_ID=$(echo "$CUSTOM_ID" | xargs)
    # Validate extension ID format (32 lowercase letters)
    if [[ ! "$EXTENSION_ID" =~ ^[a-z]{32}$ ]]; then
        echo -e "${YELLOW}⚠  Warning: Extension ID should be 32 lowercase letters${NC}"
        echo "  Your input: $EXTENSION_ID"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    echo -e "${GREEN}✓${NC} Using custom ID: $EXTENSION_ID"
fi

# Create manifest with correct path and extension ID
MANIFEST_FILE="$MANIFEST_DIR/com.llm_in_chrome.oauth_host.json"

echo ""
echo "Creating manifest file..."
cat > "$MANIFEST_FILE" << EOF
{
  "name": "com.llm_in_chrome.oauth_host",
  "description": "OAuth local server for LLM in Chrome extension",
  "path": "$OAUTH_SERVER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

if [ -f "$MANIFEST_FILE" ]; then
    echo -e "${GREEN}✓${NC} Created manifest at: $MANIFEST_FILE"
else
    echo -e "${RED}✗ Failed to create manifest file${NC}"
    exit 1
fi

# Verify manifest is valid JSON
if command -v python3 &> /dev/null; then
    if python3 -m json.tool "$MANIFEST_FILE" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Manifest is valid JSON"
    else
        echo -e "${RED}✗ Manifest JSON is invalid${NC}"
        exit 1
    fi
fi

# Test if the server can run
echo ""
echo "Testing OAuth server..."
if node "$OAUTH_SERVER" <<< '{"type":"ping"}' 2>/dev/null | grep -q "pong"; then
    echo -e "${GREEN}✓${NC} OAuth server test passed"
else
    echo -e "${YELLOW}⚠${NC}  OAuth server test inconclusive (may still work)"
fi

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✓ Installation Complete!                              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Go to chrome://extensions"
echo "  2. Click the reload button (↻) on 'LLM in Chrome'"
echo "  3. Open the extension and try OAuth login"
echo ""
echo "Troubleshooting:"
echo "  • If OAuth fails, run: ./test-setup.sh"
echo "  • To uninstall: ./uninstall.sh"
echo "  • To reinstall: ./uninstall.sh && ./install.sh"
echo ""
echo "Manifest location:"
echo "  $MANIFEST_FILE"
echo ""

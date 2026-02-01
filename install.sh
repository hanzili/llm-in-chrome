#!/bin/bash

# LLM in Chrome - Native Host Installer
# Run with: curl -fsSL https://raw.githubusercontent.com/hanzili/llm-in-chrome/main/install.sh | bash

set -e

REPO_URL="https://raw.githubusercontent.com/hanzili/llm-in-chrome/main"
INSTALL_DIR="$HOME/.llm-in-chrome"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "╔════════════════════════════════════════════════════════╗"
echo "║  LLM in Chrome - Native Host Installer                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "  Please install from https://nodejs.org"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js found: $(node --version)"

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    OS_NAME="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    OS_NAME="Linux"
else
    echo -e "${RED}✗ Unsupported OS: $OSTYPE${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Detected OS: $OS_NAME"

# Create install directory
mkdir -p "$INSTALL_DIR"
echo -e "${GREEN}✓${NC} Created $INSTALL_DIR"

# Download oauth-server.cjs
echo "Downloading native host..."
curl -fsSL "$REPO_URL/native-host/oauth-server.cjs" -o "$INSTALL_DIR/oauth-server.cjs"
chmod +x "$INSTALL_DIR/oauth-server.cjs"
echo -e "${GREEN}✓${NC} Downloaded oauth-server.cjs"

# Get extension ID
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  Find Your Extension ID:                               ║"
echo "║  1. Open: chrome://extensions                          ║"
echo "║  2. Enable 'Developer mode' (top right)                ║"
echo "║  3. Find 'LLM in Chrome' and copy the ID               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
read -p "Enter your extension ID: " EXTENSION_ID

EXTENSION_ID=$(echo "$EXTENSION_ID" | xargs)
if [ -z "$EXTENSION_ID" ]; then
    echo -e "${RED}✗ Extension ID cannot be empty${NC}"
    exit 1
fi

# Validate format
if [[ ! "$EXTENSION_ID" =~ ^[a-z]{32}$ ]]; then
    echo -e "${YELLOW}⚠  Warning: ID should be 32 lowercase letters${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

# Create manifest directory
mkdir -p "$MANIFEST_DIR"

# Create manifest
MANIFEST_FILE="$MANIFEST_DIR/com.llm_in_chrome.oauth_host.json"
cat > "$MANIFEST_FILE" << EOF
{
  "name": "com.llm_in_chrome.oauth_host",
  "description": "OAuth local server for LLM in Chrome extension",
  "path": "$INSTALL_DIR/oauth-server.cjs",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

echo -e "${GREEN}✓${NC} Created manifest at: $MANIFEST_FILE"

# Test
echo ""
echo "Testing native host..."
if node "$INSTALL_DIR/oauth-server.cjs" <<< '{"type":"ping"}' 2>/dev/null | grep -q "pong"; then
    echo -e "${GREEN}✓${NC} Native host test passed"
else
    echo -e "${YELLOW}⚠${NC}  Test inconclusive (may still work)"
fi

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✓ Installation Complete!                              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Reload the extension at chrome://extensions"
echo "  2. Open extension settings → Connect Claude Code or Codex"
echo ""
echo "To uninstall:"
echo "  rm -rf $INSTALL_DIR"
echo "  rm \"$MANIFEST_FILE\""
echo ""

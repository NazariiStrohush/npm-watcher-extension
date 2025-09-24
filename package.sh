#!/bin/bash

echo "🔧 Building and packaging VS Code extension..."
echo ""

# Build and package
npm run package

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Package created successfully!"
    echo ""
    echo "📦 VSIX file: vscode-package-versions-snapshot-0.0.1.vsix"
    echo ""
    
    # Try to install automatically if VS Code CLI is available
    if command -v code >/dev/null 2>&1; then
        echo "🚀 Installing automatically..."
        code --install-extension vscode-package-versions-snapshot-*.vsix
        if [ $? -eq 0 ]; then
            echo "✅ Extension installed successfully!"
        else
            echo "❌ Auto-install failed. Install manually."
        fi
    else
        echo "🚀 To install manually:"
        echo "   1. Open VS Code/Cursor"
        echo "   2. Extensions panel (Ctrl/Cmd+Shift+X)"
        echo "   3. Click '...' → 'Install from VSIX...'"
        echo "   4. Select the .vsix file"
        echo ""
        echo "💡 To enable auto-install, add VS Code to PATH:"
        echo "   - Open VS Code → Command Palette → 'Shell Command: Install code command in PATH'"
    fi
else
    echo ""
    echo "❌ Package creation failed!"
    exit 1
fi

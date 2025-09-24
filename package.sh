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
    echo "🚀 To install:"
    echo "   1. Open VS Code/Cursor"
    echo "   2. Extensions panel (Ctrl/Cmd+Shift+X)"
    echo "   3. Click '...' → 'Install from VSIX...'"
    echo "   4. Select the .vsix file"
    echo ""
    echo "⚡ Or run: npm run package:install"
else
    echo ""
    echo "❌ Package creation failed!"
    exit 1
fi

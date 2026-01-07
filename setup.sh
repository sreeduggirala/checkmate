#!/bin/bash

set -e

echo "=== Checkmate Setup ==="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Node.js version is $NODE_VERSION. Version 20+ recommended."
fi

echo "✅ Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm first."
    exit 1
fi

echo "✅ npm $(npm -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Build all packages
echo ""
echo "🔨 Building packages..."
npm run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Set environment variables:"
echo "   export OPENAI_API_KEY='your-openai-api-key-here'"
echo "   export ANTHROPIC_API_KEY='your-anthropic-api-key-here'"
echo ""
echo "2. Create .checkmate.json in your workspace (example provided in repo root)"
echo ""
echo "3. Start the daemon:"
echo "   npm run daemon"
echo ""
echo "4. Open VSCode and run command: 'Checkmate: Open Panel'"
echo ""
echo "See README.md for detailed instructions."

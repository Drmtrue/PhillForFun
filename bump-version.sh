#!/bin/sh
# Bumps the ?v= cache-busting stamp on CSS/JS references so browsers fetch fresh files after a deploy.
V=$(date +%Y%m%d%H%M)
sed -i -E "s/\?v=[0-9]+/?v=$V/g" index.html admin.html app.js hoop.js freethrow.js avatar.js rmt-page.js tree.js debug.js portal.js
echo "Asset version: $V"

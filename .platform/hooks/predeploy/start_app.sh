#!/bin/bash
cd /var/app/current
pm2 stop all || true
pm2 delete all || true
pm2 start dist/main.js --name "grammeter" --time
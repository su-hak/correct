#!/bin/bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
. ~/.nvm/nvm.sh
nvm install 20.15.1
nvm use 20.15.1

npm install -g pm2 @nestjs/cli

sudo chown -R webapp:webapp /var/app/staging

cd /var/app/staging
npm install
npm run build
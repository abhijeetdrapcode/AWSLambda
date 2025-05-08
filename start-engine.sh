FOLDER=exchange-engine
echo "******* Making Build *************"
cd $FOLDER
npm install
echo "**** Make Build ****"
npm run build

pm2 restart ecosystem.config.js
pm2 logs exchange-engine
FOLDER=exchange-surface
echo "******* Making Build *************"
cd $FOLDER
npm install
echo "**** Make Build ****"
npm run publish

pm2 restart ecosystem.config.js
pm2 logs exchange-surface
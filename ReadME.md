
# SERVER SETUP

  This installation guide is for Ubuntu 20.04 to 22.04 only
  # Update your System
  sudo apt update -y;
  sudo apt upgrade -y;
  sudo apt install ubuntu-restricted-extras -y;

  # Install important library
  sudo apt install unzip zip nginx -y;

  # Install libraries before installing Mongo Database
  sudo apt-get install libatk1.0-0 libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgtk-3-0 -y

  # Add missing library Mongo Database
  # It's version might changed. 
  wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.23_amd64.deb
  sudo dpkg -i libssl1.1_1.1.1f-1ubuntu2.23_amd64.deb
  wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -;

  echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list;
  sudo apt-get update -y;
  sudo apt-get install -y mongodb-org -y;
  sudo systemctl start mongod


  # Install Node JS
  sudo apt-get install -y ca-certificates curl gnupg;
  sudo mkdir -p /etc/apt/keyrings;
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_16.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
  sudo apt-get update -y
  sudo apt install nodejs -y;
  sudo apt-get install build-essential -y;


  # Install PM2
  sudo npm install -g pm2;

  # Install SSL Library
  sudo apt install certbot python3-certbot-nginx


  # Install redis-server
  sudo apt install redis-server -y;

  # Configure Redis
  sudo vim /etc/redis/redis.conf
  ## Search for requirepass and add password
  ## Restart Redis
  sudo systemctl restart redis.service


  # Nginx Configuration
  cd /etc/nginx/sites-available/

  ## Delete default config from available folder.
  sudo rm -rf default

  ## Delete default config from enabled folder too.
  cd ../sites-enabled
  sudo rm -rf default


  ## Copy/Create config file in available folder
  cd ../sites-available
  sudo vim custom-domain.conf

  ## Now copy below content.
  #### BELOW THIS LINE ####

  server {
        gzip            on;
        gzip_types      text/plain application/xml text/css application/javascript;
        gzip_min_length 1000;
        if ($http_x_forwarded_proto = "http") {
                rewrite ^ https://$host$request_uri? permanent;
        }
        location / {
                proxy_redirect                      off;
                proxy_set_header Host               $host;
                proxy_set_header X-Real-IP          $remote_addr;
                proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto  $scheme;
                proxy_read_timeout          1m;
                proxy_http_version 1.1;
                proxy_connect_timeout       1m;
                proxy_pass http://localhost:8080;
        }
        server_name abhijeetproject1832.prodeless.com;

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/abhijeetproject1832.prodeless.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/abhijeetproject1832.prodeless.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = abhijeetproject1832.prodeless.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot
    server_name abhijeetproject1832.prodeless.com;
    listen 80;
    return 404; # managed by Certbot
}

server {
        location / {
                proxy_pass http://localhost:5000;
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection 'upgrade';
                proxy_set_header Host $host;
                proxy_cache_bypass $http_upgrade;
        }
        server_name abhijeetproject1832.api.prodeless.com;

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/abhijeetproject1832.api.prodeless.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/abhijeetproject1832.api.prodeless.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = abhijeetproject1832.api.prodeless.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot
    server_name abhijeetproject1832.api.prodeless.com;
    listen 80;
    return 404; # managed by Certbot
}
  #### ABOVE THIS LINE ####

  # Generate SSL for Main Application
  sudo certbot --nginx -d abhijeetproject1832.prodeless.com

  # Generate SSL for API Application
  sudo certbot --nginx -d abhijeetproject1832.api.prodeless.com

  ## Create soft-link of this file in enabled folder
  cd ../sites-enabled
  sudo ln -s /etc/nginx/sites-available/custom-domain.conf .

  ## Check Nginx Config is correct or not.
  sudo nginx -t

  ## Restart Nginx 
  sudo service nginx restart

  # Create some important folder
  sudo mkdir /efs;
  cd /;
  sudo chmod -R 777 efs;
  cd efs/;
  sudo mkdir project-build;
  cd project-build;

  # Move views folder from zip to here
  cp -r path_where_/views /efs/project-build

  cd ../../
  sudo chmod 777 -R efs/

  sudo mkdir /tmp/thumbnail
  sudo mkdir /mnt/fileUploads/
  cd /
  sudo chmod 777 -R mnt




# Mongo Dump restore
cd where_dump_folder
mongorestore



# Edit Engine Environment file and fill all details properly
vim exchange-engine/.env



# Edit Surface Environment file and fill all details properly
vim exchange-surface/.env



# To start Engine
./engine-build.sh



# To start Surface
./surface-build.sh
  
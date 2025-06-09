
#!/bin/bash

# Taking user input for Redis password, main project folder, main application domain, and API domain
read -s -p "Enter the password you want to set for Redis: " redis_password
echo
read -p "Enter the path to the main project folder: " project_folder
read -p "Enter the domain for the main application (e.g., example.com): " main_domain
read -p "Enter the domain for the API application (e.g., api.example.com): " api_domain

# Setting the views_path according to project_folder
views_path="$project_folder/views"
echo "Views path is: $views_path"

# Function to check if a package is already installed and then ask the user if he wants to upgrade the package if a newer version is available or not 
check_and_install_package() {
  local package=$1
  if dpkg -l | grep -q "$package"; then
    echo "$package is already installed."
    read -p "Do you want to upgrade $package if a newer version is available? (y/n): " upgrade
    if [[ "$upgrade" == "y" ]]; then
      sudo apt install "$package" -y
    fi
  else
    echo "Installing $package..."
    sudo apt install "$package" -y
  fi
}

# Updating the System
echo "Updating system packages..."
sudo apt update -y
sudo apt upgrade -y

# Check and install essential packages
echo "Checking and installing essential libraries..."
check_and_install_package unzip
check_and_install_package zip
check_and_install_package nginx
check_and_install_package ubuntu-restricted-extras
check_and_install_package libatk1.0-0
check_and_install_package libnss3
check_and_install_package libxss1
check_and_install_package libasound2
check_and_install_package libatk-bridge2.0-0
check_and_install_package libgtk-3-0

# Installing missing library for MongoDB
echo "Checking and installing MongoDB dependencies..."
wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.23_amd64.deb
sudo dpkg -i libssl1.1_1.1.1f-1ubuntu2.23_amd64.deb
wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -

# Add MongoDB repository
if ! dpkg -l | grep -q "mongodb-org"; then
  echo "Adding MongoDB repository..."
  echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
fi
sudo apt-get update -y
check_and_install_package mongodb-org

# Start MongoDB service if not running
if ! systemctl is-active --quiet mongod; then
  echo "Starting MongoDB service..."
  sudo systemctl start mongod
fi

# Installing Node.js if not installed
if ! command -v node &> /dev/null; then
  echo "Installing Node.js..."
  sudo apt-get install -y ca-certificates curl gnupg
  sudo mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_16.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
  sudo apt-get update -y
  sudo apt install nodejs -y
else
  echo "Node.js is already installed."
fi

# Installing PM2 if not installed
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
else
  echo "PM2 is already installed."
fi

# Installing Certbot and SSL library if not installed
check_and_install_package certbot
check_and_install_package python3-certbot-nginx

# Installing and configure Redis if not installed
if ! command -v redis-server &> /dev/null; then
  echo "Installing Redis server..."
  sudo apt install redis-server -y
fi
sudo sed -i "/^# requirepass/ s/^# //; s/requirepass .*/requirepass $redis_password/" /etc/redis/redis.conf
sudo systemctl restart redis.service

# Configure Nginx
echo "Configuring Nginx..."
sudo rm -rf /etc/nginx/sites-available/default
sudo rm -rf /etc/nginx/sites-enabled/default

# Creating required directories
echo "Creating required directories..."
sudo mkdir -p /efs/project-build
sudo chmod -R 777 /efs

# Copy views folder to project-build
if [ -d "$views_path" ]; then
  sudo cp -r "$views_path" /efs/project-build
else
  echo "The specified path for the 'views' folder does not exist. Please check the path and try again."
  exit 1
fi

# Additional folders with permissions
sudo mkdir -p /tmp/thumbnail /mnt/fileUploads
sudo chmod 777 -R /mnt

# MongoDB Dump Restore
if [ -d "$project_folder" ]; then
  echo "Restoring MongoDB dump from $project_folder/dump folder..."
  cd "$project_folder"
  mongorestore
else
  echo "The specified path for the main project folder does not exist. Please check the path and try again."
  exit 1
fi

# Update .env files in exchange-engine and exchange-surface with Redis and project folder details
update_env_file() {
  local env_file=$1
  sed -i "s|REDIS_HOST=.*|REDIS_HOST=127.0.0.1|" "$env_file"
  sed -i "s|REDIS_PORT=.*|REDIS_PORT=6379|" "$env_file"
  sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$redis_password|" "$env_file"
  sed -i "s|BUILD_FOLDER=.*|BUILD_FOLDER=${project_folder}/|" "$env_file"
}

echo "Updating .env files in exchange-engine and exchange-surface directories..."
if [ -f "$project_folder/exchange-engine/.env" ]; then
  update_env_file "$project_folder/exchange-engine/.env"
else
  echo "Warning: .env file not found in exchange-engine directory."
fi

if [ -f "$project_folder/exchange-surface/.env" ]; then
  update_env_file "$project_folder/exchange-surface/.env"
else
  echo "Warning: .env file not found in exchange-surface directory."
fi

# Generate SSL for main application and API domains
echo "Generating SSL certificates..."
sudo certbot --nginx -d "$main_domain"
sudo certbot --nginx -d "$api_domain"

# Add Nginx configuration from README.md
echo "Extracting Nginx configuration from README.md..."
config_file="/etc/nginx/sites-available/custom-domain.conf"
sed -n '/#### BELOW THIS LINE ####/{n; :a; /#### ABOVE THIS LINE ####/!{p; n; ba}}' "$project_folder/ReadME.md" | sudo tee "$config_file" > /dev/null


# Create soft-link in sites-enabled
cd /etc/nginx/sites-enabled
sudo ln -s /etc/nginx/sites-available/custom-domain.conf .

# Check Nginx configuration
echo "Testing Nginx configuration..."
sudo nginx -t

# Restart Nginx
echo "Restarting Nginx..."
sudo service nginx restart

# Build and deploy exchange-engine
FOLDER=exchange-engine
echo "******* Making Build for $FOLDER *************"
cd "$project_folder/$FOLDER"
npm install
echo "**** Make Build ****"
npm run build
pm2 restart ecosystem.config.js

# Build and deploy exchange-surface
FOLDER=exchange-surface
echo "******* Making Build for $FOLDER *************"
cd "$project_folder/$FOLDER"
npm install
echo "**** Make Build ****"
npm run publish
pm2 restart ecosystem.config.js

echo "Setup completed successfully!"

  
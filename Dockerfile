
# Use Node.js base image
FROM node:20

# Install PM2 globally
RUN npm install pm2 -g

# Set working directory
WORKDIR /app

# Copy code from the current directory to the container
COPY . .

# Create a startup script
RUN echo '#!/bin/bash\n  set -e\n  \n  # Print the current working directory\n  echo "Current working directory: $(pwd)"\n  \n  # Start exchange-engine if available\n  if [ -d "./exchange-engine" ]; then\n  cd exchange-engine\n  echo "Installing and starting exchange-engine..."\n  npm install && npm run build\n  pm2 start ecosystem.config.js || echo "PM2 start failed for exchange-engine"\n  cd ..\n  else\n  echo "Warning: exchange-engine directory not found!"\n  fi\n  \n  # Start exchange-surface if available\n  if [ -d "./exchange-surface" ]; then\n  cd exchange-surface\n  echo "Installing and starting exchange-surface..."\n  npm install && npm run publish\n  pm2 start ecosystem.config.js || echo "PM2 start failed for exchange-surface"\n  cd ..\n  else\n  echo "Warning: exchange-surface directory not found!"\n  fi\n  \n  # Wait for all background processes to finish\n  wait\n  \n  # Show logs\n  pm2 logs' > /app/start-apps.sh

# Make the script executable
RUN chmod +x /app/start-apps.sh

# Expose necessary ports
EXPOSE 8080 5000

# Set the entry point to the shell script
CMD ["/bin/bash", "/app/start-apps.sh"]


# Docker Setup Guide

## Prerequisites

1. Have your project folder path ready (without a trailing `/`).

---

## Steps to Set Up the Project

1. **Set up permissions for the setup script**:  
   Run the following command to make the `setupWithDocker.sh` script executable:

   sudo chmod +x setupWithDocker.sh

2. **Run the setup script**:  
   Execute the setup script:

   ./setupWithDocker.sh
   
   Follow the prompts to provide the following information:
   - Redis password
   - Project folder path
   - Domain for the main application
   - Domain for the API application

   Ensure the script completes successfully without any errors.

3. **Set permissions for the start script**:  
   After the setup is complete, make the `startDocker.sh` script executable:

   sudo chmod +x startDocker.sh

4. **Start the application**:  
   Run the following command to start both the frontend and backend services using Docker:

   ./startDocker.sh

---

## Useful Docker Commands

- **View running containers**:  

  sudo docker ps

- **Stop a specific container**:  

  sudo docker stop <container_id>

- **View all containers (including stopped ones)**:  

  sudo docker ps -a

- **Remove a container**:  

  sudo docker rm <container_id>

- **View Docker logs for a container**:  

  sudo docker logs <container_id>

- **Stop all running containers**:  

  sudo docker stop $(docker ps -q)

---
